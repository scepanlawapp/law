import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";
import {
  PriceSuggestionSource,
  PriceSuggestionWorkEvent,
  WorkspaceRole,
} from "@law/api-interfaces";
import { toLatin } from "@law/transliteration";

export interface PricingFact extends PriceSuggestionSource {
  facts: unknown;
}

@Injectable()
export class PriceSuggestionContextBuilder {
  constructor(private readonly db: PlatformPrismaService) {}

  async build(input: PriceSuggestionWorkEvent) {
    const { workspaceId, userId, role } = WorkspaceContextService.required;
    const manager =
      role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN;
    if (!manager && role !== WorkspaceRole.LAWYER)
      throw new ForbiddenException("Finance access required");
    if (!manager && input.userId && input.userId !== userId)
      throw new ForbiddenException("Own work only");
    if (input.id) {
      const entry = await this.db.workEntry.findFirst({
        where: { workspaceId, id: input.id },
      });
      if (!entry) throw new NotFoundException("Work entry not found");
      if (!manager && entry.userId !== userId)
        throw new ForbiddenException("Own work only");
    }
    const caseRecord = input.caseId
      ? await this.db.case.findFirst({
          where: { workspaceId, id: input.caseId },
          select: { id: true, clientId: true, name: true, description: true },
        })
      : null;
    if (input.caseId && !caseRecord)
      throw new NotFoundException("Case not found");
    const clientId = input.clientId ?? caseRecord?.clientId;
    if (caseRecord && clientId !== caseRecord.clientId)
      throw new ConflictException("Case does not belong to client");
    const client = clientId
      ? await this.db.client.findFirst({
          where: { workspaceId, id: clientId },
          select: { id: true, displayName: true },
        })
      : null;
    if (clientId && !client) throw new NotFoundException("Client not found");
    const category = input.serviceCategoryId
      ? await this.db.serviceCategory.findFirst({
          where: { workspaceId, id: input.serviceCategoryId },
          select: { id: true, name: true },
        })
      : null;
    if (input.serviceCategoryId && !category)
      throw new NotFoundException("Service category not found");
    const task = input.taskId
      ? await this.db.task.findFirst({
          where: { workspaceId, id: input.taskId },
          select: {
            id: true,
            title: true,
            description: true,
            clientId: true,
            caseId: true,
          },
        })
      : null;
    if (input.taskId && !task) throw new NotFoundException("Task not found");
    if (
      task &&
      ((task.clientId && task.clientId !== clientId) ||
        (task.caseId && task.caseId !== input.caseId))
    )
      throw new ConflictException(
        "Task does not belong to selected client/case",
      );
    const event = input.eventId
      ? await this.db.event.findFirst({
          where: { workspaceId, id: input.eventId },
          select: {
            id: true,
            title: true,
            description: true,
            caseId: true,
            clients: { where: { workspaceId }, select: { clientId: true } },
          },
        })
      : null;
    if (input.eventId && !event) throw new NotFoundException("Event not found");
    if (
      event &&
      ((event.caseId && event.caseId !== input.caseId) ||
        (event.clients.length &&
          !event.clients.some((c) => c.clientId === clientId)))
    )
      throw new ConflictException(
        "Event does not belong to selected client/case",
      );
    const date = new Date(input.workDate);
    const [sources, retainers, profile, settings, relatedWork] =
      await Promise.all([
        this.db.priceSource.findMany({
          where: {
            workspaceId,
            OR: [
              {
                scope: {
                  in: ["COMPANY_CATALOG", "WORKSPACE_PUBLIC_REFERENCE"],
                },
                clientId: null,
                caseId: null,
              },
              ...(clientId
                ? [
                    {
                      scope: "CLIENT_AGREEMENT" as const,
                      clientId,
                      caseId: null,
                    },
                  ]
                : []),
              ...(caseRecord
                ? [
                    {
                      scope: {
                        in: [
                          "CASE_OVERRIDE" as const,
                          "CLIENT_AGREEMENT" as const,
                        ],
                      },
                      clientId,
                      caseId: caseRecord.id,
                    },
                  ]
                : []),
            ],
          },
          include: {
            versions: {
              where: {
                workspaceId,
                AND: [
                  {
                    OR: [
                      { effectiveFrom: null },
                      { effectiveFrom: { lte: date } },
                    ],
                  },
                  {
                    OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
                  },
                ],
              },
              orderBy: { version: "desc" },
              take: 1,
            },
          },
          orderBy: { id: "asc" },
        }),
        clientId
          ? this.db.retainerAgreement.findMany({
              where: {
                workspaceId,
                clientId,
                active: true,
                validFrom: { lte: date },
                OR: [{ validTo: null }, { validTo: { gte: date } }],
              },
              include: {
                categories: {
                  where: { workspaceId },
                  select: { serviceCategoryId: true },
                },
              },
              orderBy: { validFrom: "desc" },
            })
          : [],
        clientId
          ? this.db.clientBillingProfile.findFirst({
              where: { workspaceId, clientId },
            })
          : null,
        this.db.organizationSettings.findFirst({
          where: { workspaceId },
          select: { defaultCurrencyCode: true },
        }),
        task
          ? this.db.workEntry.findMany({
              where: {
                workspaceId,
                taskId: task.id,
                id: { not: input.id },
                status: { in: ["CONFIRMED", "BILLED"] },
              },
              select: {
                title: true,
                minutes: true,
                value: true,
                currency: true,
              },
            })
          : [],
      ]);
    const orderedSources: PricingFact[] = [];
    for (const retainer of retainers) {
      const monthStart = new Date(`${input.workDate.slice(0, 7)}-01T00:00:00Z`);
      const used = await this.db.workEntry.aggregate({
        where: {
          workspaceId,
          clientId,
          id: { not: input.id },
          treatment: "RETAINER",
          status: { in: ["CONFIRMED", "BILLED"] },
          workDate: {
            gte:
              retainer.validFrom > monthStart ? retainer.validFrom : monthStart,
            lte: date,
          },
        },
        _sum: { minutes: true },
      });
      orderedSources.push({
        id: retainer.id,
        kind: "RETAINER",
        title: retainer.title,
        versionId: null,
        sourceUrl: null,
        facts: {
          ...retainer,
          usedMinutesExcludingCurrentEntry: used._sum.minutes ?? 0,
        },
      });
    }
    const rank = {
      CASE_OVERRIDE: 0,
      CLIENT_AGREEMENT: 1,
      COMPANY_CATALOG: 2,
      WORKSPACE_PUBLIC_REFERENCE: 3,
    };
    for (const source of sources.sort(
      (a, b) => (a.caseId ? 0 : rank[a.scope]) - (b.caseId ? 0 : rank[b.scope]),
    )) {
      const version = source.versions[0];
      if (!version) continue;
      orderedSources.push({
        id: source.id,
        kind: source.caseId ? "CASE_OVERRIDE" : source.scope,
        title: source.title,
        versionId: version.id,
        sourceUrl: source.sourceUrl,
        facts: {
          rawText: toLatin(version.rawText),
          effectiveFrom: version.effectiveFrom,
          effectiveTo: version.effectiveTo,
        },
      });
    }
    if (profile?.hourlyRate != null) {
      const index = orderedSources.findIndex((s) =>
        ["COMPANY_CATALOG", "WORKSPACE_PUBLIC_REFERENCE"].includes(s.kind),
      );
      orderedSources.splice(index < 0 ? orderedSources.length : index, 0, {
        id: profile.id,
        kind: "CLIENT_HOURLY_RATE",
        title: "Satnica klijenta",
        versionId: null,
        sourceUrl: null,
        facts: {
          hourlyRate: profile.hourlyRate.toString(),
          currency: profile.currency,
        },
      });
    }
    return {
      workEvent: {
        ...input,
        clientId,
        title: toLatin(input.title),
        description: toLatin(input.description ?? ""),
        additionalInformation: toLatin(input.additionalInformation ?? ""),
      },
      client,
      case: caseRecord,
      task,
      event,
      category,
      relatedWork,
      currency:
        input.currency ??
        profile?.currency ??
        settings?.defaultCurrencyCode ??
        "RSD",
      orderedSources,
      warnings:
        retainers.length > 1
          ? ["Više paušalnih ugovora važi na datum rada; potrebna je provera."]
          : [],
    };
  }
}
