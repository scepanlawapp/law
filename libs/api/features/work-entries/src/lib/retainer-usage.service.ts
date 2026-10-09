import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  OnModuleInit,
} from "@nestjs/common";
import { NotificationType, Prisma } from "@prisma/client";
import {
  ClientReference,
  RetainerUsage,
  WorkspaceRole,
} from "@law/api-interfaces";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";
import {
  buildNotificationContent,
  NotificationsService,
} from "@law/notifications";
import { BillingSetupService } from "./billing-setup.service";
import { prorate } from "./retainer-allocation";
import { activeAgreementOn, AgreementTerms } from "./treatment";
import { WorkEntriesService } from "./work-entries.service";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const COUNTED_STATUSES = ["CONFIRMED", "BILLED"] as const;

function monthOf(workDate: Date): string {
  return workDate.toISOString().slice(0, 7);
}

function monthBounds(month: string): { start: Date; end: Date } {
  if (!MONTH_PATTERN.test(month)) {
    throw new BadRequestException("month must be in YYYY-MM format");
  }
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 0)),
  };
}

/**
 * Retainer consumption for a month and the 80% / 100% alerts that go with it.
 * The cap is the agreement's included minutes prorated to its active days.
 */
@Injectable()
export class RetainerUsageService implements OnModuleInit {
  constructor(
    private readonly db: PlatformPrismaService,
    private readonly billingSetup: BillingSetupService,
    private readonly notifications: NotificationsService,
    private readonly workEntries: WorkEntriesService,
  ) {}

  private get workspaceId() {
    return WorkspaceContextService.required.workspaceId;
  }

  /** Alerts run whenever a work entry becomes CONFIRMED. */
  onModuleInit(): void {
    this.workEntries.afterConfirmed = (entry) => {
      if (!entry.client) return Promise.resolve();
      return this.checkThresholds({
        clientId: entry.client.id,
        workDate: new Date(entry.workDate),
      });
    };
  }

  async usage(clientId: string, month: string): Promise<RetainerUsage | null> {
    const { start, end } = monthBounds(month);
    const client = await this.db.client.findFirst({
      where: { id: clientId, workspaceId: this.workspaceId },
    });
    if (!client) return null;

    const agreements = await this.billingSetup.agreementsForClient(clientId);
    const agreement = this.agreementForMonth(agreements, month);
    const proration = agreement ? prorate(agreement, month) : null;
    if (!agreement || !proration) return null;

    const entries = await this.countedEntries(clientId, start, end, [
      "RETAINER",
      "HOURLY",
      "AT",
    ]);
    let coveredMinutes = 0;
    let outOfScopeMinutes = 0;
    for (const entry of entries) {
      if (activeAgreementOn(agreements, entry.workDate)?.id !== agreement.id) {
        continue;
      }
      if (entry.treatment === "RETAINER") coveredMinutes += entry.minutes;
      else outOfScopeMinutes += entry.minutes;
    }

    const config = await this.db.workspaceConfig.findUnique({
      where: { workspaceId: this.workspaceId },
      select: { targetHourlyRate: true },
    });
    const clientReference: ClientReference = {
      id: client.id,
      clientNumber: client.clientNumber,
      type: client.type,
      displayName: client.displayName,
      status: client.status,
    };
    return {
      client: clientReference,
      agreementId: agreement.id,
      month,
      currency: agreement.currency,
      fee: proration.fee.toFixed(2),
      includedMinutes: proration.includedMinutes,
      coveredMinutes,
      outOfScopeMinutes,
      effectiveHourlyRate:
        coveredMinutes > 0
          ? proration.fee
              .mul(60)
              .div(coveredMinutes)
              .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
              .toFixed(2)
          : null,
      targetHourlyRate: config?.targetHourlyRate
        ? config.targetHourlyRate.toFixed(2)
        : null,
    };
  }

  async listUsage(month: string): Promise<RetainerUsage[]> {
    const { start, end } = monthBounds(month);
    const rows = await this.db.retainerAgreement.findMany({
      where: {
        workspaceId: this.workspaceId,
        active: true,
        validFrom: { lte: end },
        OR: [{ validTo: null }, { validTo: { gte: start } }],
      },
      select: { clientId: true },
      distinct: ["clientId"],
    });
    const usages: RetainerUsage[] = [];
    for (const { clientId } of rows) {
      const usage = await this.usage(clientId, month);
      if (usage) usages.push(usage);
    }
    return usages.sort((a, b) =>
      a.client.displayName.localeCompare(b.client.displayName, "sr-Latn"),
    );
  }

  /**
   * Usage as the signed-in user may see it: owners and admins see every
   * client, a lawyer only the clients they are responsible for.
   */
  async usageForViewer(
    clientId: string,
    month: string,
  ): Promise<RetainerUsage | null> {
    const { role, userId } = WorkspaceContextService.required;
    if (role === WorkspaceRole.LAWYER) {
      const owned = await this.db.client.findFirst({
        where: {
          id: clientId,
          workspaceId: this.workspaceId,
          responsibleUserId: userId,
        },
        select: { id: true },
      });
      if (!owned) {
        throw new ForbiddenException("You are not responsible for this client");
      }
    } else if (role !== WorkspaceRole.OWNER && role !== WorkspaceRole.ADMIN) {
      throw new ForbiddenException("Not allowed to view retainer usage");
    }
    return this.usage(clientId, month);
  }

  async listUsageForViewer(month: string): Promise<RetainerUsage[]> {
    const { role, userId } = WorkspaceContextService.required;
    if (role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN) {
      return this.listUsage(month);
    }
    if (role !== WorkspaceRole.LAWYER) {
      throw new ForbiddenException("Not allowed to view retainer usage");
    }
    const usages = await this.listUsage(month);
    const owned = await this.db.client.findMany({
      where: { workspaceId: this.workspaceId, responsibleUserId: userId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((client) => client.id));
    return usages.filter((usage) => ownedIds.has(usage.client.id));
  }

  /**
   * Notifies once per agreement and month when covered minutes reach 80% and
   * again at 100% of the prorated cap. Uncapped agreements never alert.
   */
  async checkThresholds(entry: {
    clientId: string;
    workDate: Date;
  }): Promise<void> {
    const agreements = await this.billingSetup.agreementsForClient(
      entry.clientId,
    );
    const agreement = activeAgreementOn(agreements, entry.workDate);
    if (!agreement) return;
    const month = monthOf(entry.workDate);
    const cap = prorate(agreement, month)?.includedMinutes ?? null;
    if (cap === null || cap <= 0) return;

    const { start, end } = monthBounds(month);
    const entries = await this.countedEntries(entry.clientId, start, end, [
      "RETAINER",
    ]);
    const covered = entries
      .filter(
        (row) =>
          activeAgreementOn(agreements, row.workDate)?.id === agreement.id,
      )
      .reduce((sum, row) => sum + row.minutes, 0);

    let level: "80" | "100" | null = null;
    if (covered >= cap) level = "100";
    else if (covered * 100 >= cap * 80) level = "80";
    if (!level) return;

    const client = await this.db.client.findFirst({
      where: { id: entry.clientId, workspaceId: this.workspaceId },
      select: { id: true, displayName: true, responsibleUserId: true },
    });
    if (!client) return;
    const recipients = await this.recipients(client.responsibleUserId);

    const type: NotificationType =
      level === "100" ? "RETAINER_USAGE_100" : "RETAINER_USAGE_80";
    const content = buildNotificationContent(type, {
      title: `${client.displayName}: ${covered} od ${cap} min`,
      clientId: client.id,
      clientName: client.displayName,
    });
    await Promise.all(
      recipients.map((userId) =>
        this.notifications.create({
          workspaceId: this.workspaceId,
          userId,
          type,
          ...content,
          dedupeKey: `retainer:${agreement.id}:${month}:${level}`,
        }),
      ),
    );
  }

  /** The agreement in force latest within the month, if any overlaps it. */
  private agreementForMonth(
    agreements: AgreementTerms[],
    month: string,
  ): AgreementTerms | null {
    let chosen: AgreementTerms | null = null;
    for (const agreement of agreements) {
      if (!prorate(agreement, month)) continue;
      if (!chosen || agreement.validFrom > chosen.validFrom) chosen = agreement;
    }
    return chosen;
  }

  private async countedEntries(
    clientId: string,
    start: Date,
    end: Date,
    treatments: ("RETAINER" | "HOURLY" | "AT")[],
  ): Promise<
    {
      workDate: Date;
      minutes: number;
      treatment: (typeof treatments)[number];
    }[]
  > {
    const rows = await this.db.workEntry.findMany({
      where: {
        workspaceId: this.workspaceId,
        clientId,
        status: { in: [...COUNTED_STATUSES] },
        treatment: { in: treatments },
        workDate: { gte: start, lte: end },
      },
      select: { workDate: true, minutes: true, treatment: true },
    });
    return rows.flatMap((row) =>
      row.minutes === null
        ? []
        : [
            {
              workDate: row.workDate,
              minutes: row.minutes,
              treatment: row.treatment as (typeof treatments)[number],
            },
          ],
    );
  }

  private async recipients(
    responsibleUserId: string | null,
  ): Promise<string[]> {
    if (responsibleUserId) return [responsibleUserId];
    const owners = await this.db.workspaceMember.findMany({
      where: {
        workspaceId: this.workspaceId,
        role: "OWNER",
        status: "ACTIVE",
      },
      select: { userId: true },
    });
    return owners.map((owner) => owner.userId);
  }
}
