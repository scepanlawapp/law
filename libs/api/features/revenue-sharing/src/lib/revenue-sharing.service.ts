import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { toLatin } from "@law/transliteration";
import { Prisma } from "@prisma/client";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";
import {
  defaultRevenueConfiguration,
  RevenueConfiguration,
  RevenueHistoryEntry,
  RevenuePreviewRequest,
  RevenuePublishRequest,
  RevenueReferences,
  RevenueSettingsResponse,
  RevenueSpecialRule,
} from "@law/api-interfaces";
import {
  dateSchema,
  parseRevenue,
  previewSchema,
  publishSchema,
  revenueError,
  validateConfiguration,
} from "./revenue-sharing.validation";
import { previewRevenue } from "./revenue-sharing.preview";

const precedingDate = (value: string) =>
  new Date(new Date(value).getTime() - 86400000).toISOString().slice(0, 10);
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const revenueToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

@Injectable()
export class RevenueSharingService {
  constructor(private readonly db: PlatformPrismaService) {}
  private context() {
    const context = WorkspaceContextService.required;
    if (context.role !== "OWNER" && context.role !== "ADMIN")
      throw new ForbiddenException({ code: "revenue.FORBIDDEN" });
    return context;
  }
  async get(): Promise<RevenueSettingsResponse> {
    const { workspaceId } = this.context();
    const latest = await this.db.revenueSharingVersion.findFirst({
      where: { workspaceId },
      orderBy: { version: "desc" },
    });
    return latest
      ? {
          version: latest.version,
          effectiveFrom: latest.effectiveFrom.toISOString().slice(0, 10),
          configuration:
            latest.configuration as unknown as RevenueConfiguration,
        }
      : {
          version: 0,
          effectiveFrom: null,
          configuration: defaultRevenueConfiguration(),
        };
  }
  async history(): Promise<RevenueHistoryEntry[]> {
    const { workspaceId } = this.context();
    const rows = await this.db.revenueSharingVersion.findMany({
      where: { workspaceId },
      orderBy: { version: "desc" },
      include: {
        author: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
      configuration: row.configuration as unknown as RevenueConfiguration,
      createdAt: row.createdAt.toISOString(),
      changedBy:
        [row.author.firstName, row.author.lastName].filter(Boolean).join(" ") ||
        row.author.email,
      reason: row.reason,
    }));
  }
  async references(): Promise<RevenueReferences> {
    const { workspaceId } = this.context();
    const [members, clients, cases, events, historical] = await Promise.all([
      this.db.workspaceMember.findMany({
        where: { workspaceId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              status: true,
            },
          },
        },
      }),
      this.db.client.findMany({
        where: { workspaceId },
        select: { id: true, displayName: true },
        orderBy: { displayName: "asc" },
      }),
      this.db.case.findMany({
        where: { workspaceId },
        select: { id: true, name: true, caseNumber: true },
        orderBy: { caseNumber: "asc" },
      }),
      this.db.event.findMany({
        where: { workspaceId },
        select: { id: true, title: true },
        orderBy: { title: "asc" },
      }),
      this.db.revenueSharingAgreement.findMany({
        where: { workspaceId },
        distinct: ["memberId"],
        select: { memberId: true },
      }),
    ]);
    const formerIds = historical
      .map((a) => a.memberId)
      .filter((id) => !members.some((m) => m.userId === id));
    const former = formerIds.length
      ? await this.db.user.findMany({
          where: { id: { in: formerIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const name = (u: {
      firstName: string | null;
      lastName: string | null;
      email: string;
    }) => [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
    return {
      members: [
        ...members.map((m) => ({
          id: m.userId,
          name: name(m.user),
          role: m.role,
          status:
            m.status === "ACTIVE" && m.user.status === "ACTIVE"
              ? "ACTIVE"
              : m.status === "INVITED"
                ? "INVITED"
                : "FORMER",
        })),
        ...former.map((u) => ({
          id: u.id,
          name: name(u),
          role: "FORMER",
          status: "FORMER",
        })),
      ],
      clients: clients.map((c) => ({ id: c.id, name: c.displayName })),
      cases: cases.map((c) => ({
        id: c.id,
        name: `${c.caseNumber} — ${c.name}`,
      })),
      events: events.map((e) => ({ id: e.id, name: e.title })),
    };
  }
  private async validateReferences(
    db: Prisma.TransactionClient,
    workspaceId: string,
    c: RevenueConfiguration,
    extraMembers: string[] = [],
    extraScopes: Pick<RevenueSpecialRule, "scopeType" | "scopeId">[] = [],
    preservedRules: RevenueSpecialRule[] = [],
  ): Promise<void> {
    const memberIds = [
      ...new Set([
        ...c.agreements.map((a) => a.memberId),
        ...c.specialRules.map((r) => r.memberId),
        ...extraMembers,
      ]),
    ];
    if (memberIds.length) {
      const [members, historical] = await Promise.all([
        db.workspaceMember.findMany({
          where: { workspaceId, userId: { in: memberIds } },
          select: { userId: true },
        }),
        db.revenueSharingAgreement.findMany({
          where: { workspaceId, memberId: { in: memberIds } },
          select: { memberId: true },
          distinct: ["memberId"],
        }),
      ]);
      const allowed = new Set([
        ...members.map((m) => m.userId),
        ...historical.map((a) => a.memberId),
      ]);
      if (memberIds.some((id) => !allowed.has(id)))
        revenueError("REFERENCE_NOT_FOUND");
    }
    for (const scopeType of ["CLIENT", "CASE", "WORK_EVENT"] as const) {
      const ids = [
        ...new Set(
          [
            ...c.specialRules.filter(
              (r) =>
                r.active ||
                !preservedRules.some(
                  (old) =>
                    old.id === r.id &&
                    old.scopeType === r.scopeType &&
                    old.scopeId === r.scopeId,
                ),
            ),
            ...extraScopes,
          ]
            .filter((r) => r.scopeType === scopeType)
            .map((r) => r.scopeId)
            .filter((id): id is string => id !== null),
        ),
      ];
      if (!ids.length) continue;
      const where = { workspaceId, id: { in: ids } };
      const count =
        scopeType === "CLIENT"
          ? await db.client.count({ where })
          : scopeType === "CASE"
            ? await db.case.count({ where })
            : await db.event.count({ where });
      if (count !== ids.length) revenueError("REFERENCE_NOT_FOUND");
    }
  }
  async publish(input: unknown): Promise<RevenueSettingsResponse> {
    const { workspaceId, userId } = this.context();
    const body = parseRevenue(publishSchema, input) as RevenuePublishRequest;
    body.reason = toLatin(body.reason);
    body.configuration.agreements.forEach(
      (a) => (a.description = toLatin(a.description)),
    );
    body.configuration.specialRules.forEach(
      (r) => (r.description = toLatin(r.description)),
    );
    validateConfiguration(body.configuration);
    if (body.effectiveFrom < revenueToday())
      revenueError("BACKDATED_PUBLICATION");
    try {
      return await this.db.$transaction(
        async (db) => {
          const latest = await db.revenueSharingVersion.findFirst({
            where: { workspaceId },
            orderBy: { version: "desc" },
          });
          if ((latest?.version ?? 0) !== body.expectedVersion)
            throw new ConflictException({ code: "revenue.VERSION_CONFLICT" });
          if (
            latest &&
            body.effectiveFrom < latest.effectiveFrom.toISOString().slice(0, 10)
          )
            revenueError("PUBLICATION_ORDER");
          if (latest)
            this.validateHistory(
              latest.configuration as unknown as RevenueConfiguration,
              body.configuration,
              body.effectiveFrom,
              body.reason,
            );
          await this.validateReferences(
            db,
            workspaceId,
            body.configuration,
            [],
            [],
            (
              latest?.configuration as unknown as
                | RevenueConfiguration
                | undefined
            )?.specialRules ?? [],
          );
          await db.revenueSharingSettings.upsert({
            where: { workspaceId },
            create: { workspaceId },
            update: {},
          });
          const changed = await db.revenueSharingSettings.updateMany({
            where: { workspaceId, currentVersion: body.expectedVersion },
            data: { currentVersion: { increment: 1 } },
          });
          if (changed.count !== 1)
            throw new ConflictException({ code: "revenue.VERSION_CONFLICT" });
          const version = body.expectedVersion + 1;
          const row = await db.revenueSharingVersion.create({
            data: {
              workspaceId,
              version,
              effectiveFrom: new Date(body.effectiveFrom),
              configuration: json(body.configuration),
              createdBy: userId,
              reason: body.reason,
              agreements: {
                create: body.configuration.agreements.map((a) => ({
                  workspaceId,
                  agreementId: a.id,
                  memberId: a.memberId,
                  effectiveFrom: new Date(a.effectiveFrom),
                  effectiveTo: a.effectiveTo ? new Date(a.effectiveTo) : null,
                  terms: json(a),
                })),
              },
              rules: {
                create: body.configuration.specialRules.map((r) => ({
                  workspaceId,
                  ruleId: r.id,
                  memberId: r.memberId,
                  scopeType: r.scopeType,
                  scopeId: r.scopeId,
                  earningType: r.earningType,
                  percentage: new Prisma.Decimal(r.percentage),
                  effectiveFrom: new Date(r.effectiveFrom),
                  effectiveTo: r.effectiveTo ? new Date(r.effectiveTo) : null,
                  terms: json(r),
                })),
              },
            },
          });
          return {
            version,
            effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
            configuration: body.configuration,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(error.code)
      )
        throw new ConflictException({ code: "revenue.VERSION_CONFLICT" });
      throw error;
    }
  }
  private validateHistory(
    old: RevenueConfiguration,
    next: RevenueConfiguration,
    effective: string,
    reason: string,
  ): void {
    // Rate terms stay fixed; closing and documented departure amendments create new snapshots.
    const rateTerms = (a: RevenueConfiguration["agreements"][number]) => {
      return {
        id: a.id,
        memberId: a.memberId,
        agreementType: a.agreementType,
        effectiveFrom: a.effectiveFrom,
        rates: a.rates,
        originationRate: a.originationRate,
        selfOrigination: a.selfOrigination,
      };
    };
    for (const a of old.agreements) {
      const b = next.agreements.find((row) => row.id === a.id);
      if (!b) revenueError("HISTORY_IMMUTABLE");
      if (a.effectiveFrom >= effective) continue;
      if (JSON.stringify(rateTerms(a)) !== JSON.stringify(rateTerms(b)))
        revenueError("HISTORY_IMMUTABLE");
      const departureChanged =
        a.departurePolicy !== b.departurePolicy ||
        a.departureCutoffDate !== b.departureCutoffDate ||
        a.description !== b.description;
      if (departureChanged && !reason.trim()) revenueError("REASON_REQUIRED");
      if (
        departureChanged &&
        b.departureCutoffDate &&
        b.departureCutoffDate < precedingDate(effective)
      )
        revenueError("BACKDATED_PUBLICATION");
      if (
        a.effectiveTo !== b.effectiveTo &&
        (a.effectiveTo !== null ||
          !b.effectiveTo ||
          b.effectiveTo < precedingDate(effective))
      )
        revenueError("HISTORY_IMMUTABLE");
    }
    for (const a of old.specialRules) {
      const b = next.specialRules.find((row) => row.id === a.id);
      if (!b) revenueError("HISTORY_IMMUTABLE");
      if (
        a.effectiveFrom < effective &&
        JSON.stringify({ ...a, active: true, effectiveTo: null }) !==
          JSON.stringify({ ...b, active: true, effectiveTo: null })
      )
        revenueError("HISTORY_IMMUTABLE");
      if (
        a.effectiveFrom < effective &&
        a.effectiveTo !== b.effectiveTo &&
        (a.effectiveTo !== null ||
          !b.effectiveTo ||
          b.effectiveTo < precedingDate(effective))
      )
        revenueError("HISTORY_IMMUTABLE");
    }
  }
  /** Stable future integration boundary. Date is the explicit configured entitlement reference date. */
  async resolveConfiguration(
    referenceDate: string,
    collectionDate?: string | null,
  ): Promise<RevenueSettingsResponse> {
    const { workspaceId } = this.context();
    parseRevenue(dateSchema, referenceDate);
    const row = await this.db.revenueSharingVersion.findFirst({
      where: { workspaceId, effectiveFrom: { lte: new Date(referenceDate) } },
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
    });
    const configuration = row
      ? (structuredClone(row.configuration) as unknown as RevenueConfiguration)
      : defaultRevenueConfiguration();
    // Rates use the work/reference-date revision. Later departure amendments may
    // govern collection after leaving, without replacing those historical rates.
    if (row && collectionDate && collectionDate >= referenceDate) {
      parseRevenue(dateSchema, collectionDate);
      const collectionRevision = await this.db.revenueSharingVersion.findFirst({
        where: {
          workspaceId,
          effectiveFrom: { lte: new Date(collectionDate) },
        },
        orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
      });
      const amendments =
        (
          collectionRevision?.configuration as unknown as
            | RevenueConfiguration
            | undefined
        )?.agreements ?? [];
      configuration.agreements = configuration.agreements.map((a) => {
        const amendment = amendments.find((b) => b.id === a.id);
        return amendment
          ? {
              ...a,
              effectiveTo: amendment.effectiveTo,
              departurePolicy: amendment.departurePolicy,
              departureCutoffDate: amendment.departureCutoffDate,
              description: amendment.description,
            }
          : a;
      });
    }
    return {
      version: row?.version ?? 0,
      effectiveFrom: row?.effectiveFrom.toISOString().slice(0, 10) ?? null,
      configuration,
    };
  }
  async preview(input: unknown) {
    const { workspaceId } = this.context();
    const body = parseRevenue(previewSchema, input) as RevenuePreviewRequest;
    const c =
      body.configuration ??
      (
        await this.resolveConfiguration(
          body.scenario.referenceDate,
          body.scenario.revenueBasis === "COLLECTED"
            ? body.scenario.collectionDate
            : null,
        )
      ).configuration;
    validateConfiguration(c);
    const scopes: Pick<RevenueSpecialRule, "scopeType" | "scopeId">[] = [
      { scopeType: "CLIENT", scopeId: body.scenario.clientId },
      { scopeType: "CASE", scopeId: body.scenario.caseId },
      { scopeType: "WORK_EVENT", scopeId: body.scenario.eventId },
    ].filter((row) => row.scopeId) as Pick<
      RevenueSpecialRule,
      "scopeType" | "scopeId"
    >[];
    await this.validateReferences(
      this.db,
      workspaceId,
      c,
      [
        body.scenario.memberId,
        ...(body.scenario.originatorId ? [body.scenario.originatorId] : []),
      ],
      scopes,
      body.configuration
        ? (await this.get()).configuration.specialRules
        : c.specialRules,
    );
    return previewRevenue(c, body.scenario);
  }
}
