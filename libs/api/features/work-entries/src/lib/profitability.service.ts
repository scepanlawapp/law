import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  ClientReference,
  ProfitabilityReport,
  ProfitabilityRow,
  UserReference,
  WorkspaceRole,
} from "@law/api-interfaces";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ZERO = new Prisma.Decimal(0);

function parseDate(value: string, name: string): Date {
  const date = DATE_PATTERN.test(value ?? "")
    ? new Date(`${value}T00:00:00.000Z`)
    : null;
  if (
    !date ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException(
      `${name} must be a date in YYYY-MM-DD format`,
    );
  }
  return date;
}

function money(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
}

interface RateStep {
  effectiveFrom: Date;
  hourlyValue: Prisma.Decimal;
}

/** Minutes and the value of the ones that have a rate. */
class Valuation {
  minutes = 0;
  unknownMinutes = 0;
  value = ZERO;

  add(minutes: number, hourlyValue: Prisma.Decimal | null): void {
    this.minutes += minutes;
    if (hourlyValue === null) this.unknownMinutes += minutes;
    else this.value = this.value.add(hourlyValue.mul(minutes).div(60));
  }

  /** Null when there is time but none of it could be priced. */
  formatted(): string | null {
    return this.minutes > 0 && this.unknownMinutes === this.minutes
      ? null
      : money(this.value);
  }
}

interface ClientAccumulator {
  time: Valuation;
  writtenOff: Valuation;
  unbilled: Valuation;
  revenue: Map<string, Prisma.Decimal>;
}

/**
 * Per-client revenue against the internal value of the time spent, so
 * partners can spot retainer clients that cost more than they pay.
 */
@Injectable()
export class ProfitabilityService {
  constructor(private readonly db: PlatformPrismaService) {}

  private get context() {
    return WorkspaceContextService.required;
  }

  private get workspaceId() {
    return this.context.workspaceId;
  }

  async report(
    fromInput: string,
    toInput: string,
  ): Promise<ProfitabilityReport> {
    const role = this.context.role;
    if (role !== WorkspaceRole.OWNER && role !== WorkspaceRole.ADMIN) {
      throw new ForbiddenException(
        "Only owners and admins can see profitability",
      );
    }
    const from = parseDate(fromInput, "from");
    const to = parseDate(toInput, "to");
    if (from > to) {
      throw new BadRequestException("from must not be after to");
    }

    const config = await this.db.workspaceConfig.findUnique({
      where: { workspaceId: this.workspaceId },
      select: { internalCurrency: true, targetHourlyRate: true },
    });
    const internalCurrency = config?.internalCurrency ?? "RSD";

    const [entries, statements] = await Promise.all([
      this.db.workEntry.findMany({
        where: {
          workspaceId: this.workspaceId,
          status: { in: ["CONFIRMED", "BILLED", "WRITTEN_OFF"] },
          workDate: { gte: from, lte: to },
        },
        select: {
          userId: true,
          clientId: true,
          minutes: true,
          workDate: true,
          status: true,
          invoiceLineId: true,
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.db.invoice.findMany({
        where: {
          workspaceId: this.workspaceId,
          status: "SENT",
          dateOfTurnover: { gte: from, lte: to },
        },
        select: {
          clientId: true,
          currency: true,
          lines: {
            where: { status: { not: "CANCELLED" } },
            select: { netAmount: true },
          },
        },
      }),
    ]);

    const rates = await this.ratesByUser(
      [
        ...new Set(
          entries
            .map((entry) => entry.userId)
            .filter((id): id is string => id !== null),
        ),
      ],
      to,
    );

    const accumulators = new Map<string, ClientAccumulator>();
    const accumulatorFor = (clientId: string): ClientAccumulator => {
      let accumulator = accumulators.get(clientId);
      if (!accumulator) {
        accumulator = {
          time: new Valuation(),
          writtenOff: new Valuation(),
          unbilled: new Valuation(),
          revenue: new Map(),
        };
        accumulators.set(clientId, accumulator);
      }
      return accumulator;
    };

    const people = new Map<
      string,
      { user: UserReference; loggedMinutes: number; billedMinutes: number }
    >();
    for (const entry of entries) {
      const minutes = entry.minutes ?? 0;
      const hourlyValue = this.rateOn(
        entry.userId ? rates.get(entry.userId) : undefined,
        entry.workDate,
      );
      const accumulator = entry.clientId
        ? accumulatorFor(entry.clientId)
        : null;
      if (entry.status === "WRITTEN_OFF") {
        accumulator?.writtenOff.add(minutes, hourlyValue);
        continue;
      }
      accumulator?.time.add(minutes, hourlyValue);
      if (entry.status === "CONFIRMED" && entry.invoiceLineId === null) {
        accumulator?.unbilled.add(minutes, hourlyValue);
      }
      if (!entry.userId || !entry.user) continue;
      let person = people.get(entry.userId);
      if (!person) {
        person = {
          user: {
            id: entry.user.id,
            displayName:
              [entry.user.firstName, entry.user.lastName]
                .filter(Boolean)
                .join(" ") || entry.user.email,
            email: entry.user.email,
          },
          loggedMinutes: 0,
          billedMinutes: 0,
        };
        people.set(entry.userId, person);
      }
      person.loggedMinutes += minutes;
      if (entry.status === "BILLED") person.billedMinutes += minutes;
    }

    for (const invoice of statements) {
      const net = invoice.lines.reduce(
        (sum, line) => sum.add(line.netAmount),
        ZERO,
      );
      const accumulator = accumulatorFor(invoice.clientId);
      accumulator.revenue.set(
        invoice.currency,
        (accumulator.revenue.get(invoice.currency) ?? ZERO).add(net),
      );
    }

    const clients = await this.db.client.findMany({
      where: {
        workspaceId: this.workspaceId,
        id: { in: [...accumulators.keys()] },
      },
    });
    const rows: ProfitabilityRow[] = [];
    for (const client of clients) {
      const accumulator = accumulators.get(client.id);
      if (!accumulator) continue;
      rows.push(this.row(client, accumulator, internalCurrency));
    }
    rows.sort(compareRows);

    return {
      from: fromInput,
      to: toInput,
      internalCurrency,
      targetHourlyRate: config?.targetHourlyRate
        ? config.targetHourlyRate.toFixed(2)
        : null,
      rows,
      byPerson: [...people.values()]
        .filter((person) => person.loggedMinutes > 0)
        .sort((a, b) =>
          a.user.displayName.localeCompare(b.user.displayName, "sr-Latn"),
        ),
    };
  }

  private row(
    client: ClientReference,
    accumulator: ClientAccumulator,
    internalCurrency: string,
  ): ProfitabilityRow {
    const revenue = [...accumulator.revenue.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, net]) => ({ currency, net: money(net) }));
    const comparable = revenue.every(
      (entry) => entry.currency === internalCurrency,
    );
    const minutes = accumulator.time.minutes;
    const internalRevenue = accumulator.revenue.get(internalCurrency);
    return {
      client: {
        id: client.id,
        clientNumber: client.clientNumber,
        type: client.type,
        displayName: client.displayName,
        status: client.status,
      },
      minutes,
      revenue,
      timeValue: accumulator.time.formatted(),
      unknownValueMinutes: accumulator.time.unknownMinutes,
      effectiveHourlyRate:
        comparable && revenue.length > 0 && minutes > 0 && internalRevenue
          ? money(internalRevenue.mul(60).div(minutes))
          : null,
      comparable,
      writtenOffValue: accumulator.writtenOff.formatted(),
      unbilledValue: accumulator.unbilled.formatted(),
    };
  }

  private async ratesByUser(
    userIds: string[],
    to: Date,
  ): Promise<Map<string, RateStep[]>> {
    const byUser = new Map<string, RateStep[]>();
    if (userIds.length === 0) return byUser;
    const rows = await this.db.userRate.findMany({
      where: {
        workspaceId: this.workspaceId,
        userId: { in: userIds },
        effectiveFrom: { lte: to },
      },
      orderBy: { effectiveFrom: "asc" },
      select: { userId: true, effectiveFrom: true, hourlyValue: true },
    });
    for (const row of rows) {
      const steps = byUser.get(row.userId) ?? [];
      steps.push({
        effectiveFrom: row.effectiveFrom,
        hourlyValue: row.hourlyValue,
      });
      byUser.set(row.userId, steps);
    }
    return byUser;
  }

  /** The latest rate whose effectiveFrom is on or before the work date. */
  private rateOn(
    steps: RateStep[] | undefined,
    workDate: Date,
  ): Prisma.Decimal | null {
    let chosen: RateStep | null = null;
    for (const step of steps ?? []) {
      if (step.effectiveFrom <= workDate) chosen = step;
    }
    return chosen?.hourlyValue ?? null;
  }
}

function compareRows(a: ProfitabilityRow, b: ProfitabilityRow): number {
  if (a.effectiveHourlyRate !== null && b.effectiveHourlyRate !== null) {
    const diff = new Prisma.Decimal(a.effectiveHourlyRate).comparedTo(
      b.effectiveHourlyRate,
    );
    if (diff !== 0) return diff;
  } else if (a.effectiveHourlyRate !== null) {
    return -1;
  } else if (b.effectiveHourlyRate !== null) {
    return 1;
  }
  return a.client.displayName.localeCompare(b.client.displayName, "sr-Latn");
}
