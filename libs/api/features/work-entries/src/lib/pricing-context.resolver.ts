import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";
import { LegalKnowledgeService } from "@law/legal-knowledge";
import type { PricingSuggestionWork } from "@law/api-interfaces";
import { WorkEntriesService } from "./work-entries.service";
import type { PricingContext } from "./pricing-interpreter";
import type { PricingSuggestionDto } from "./pricing-suggestion.dto";

@Injectable()
export class PricingContextResolver {
  constructor(
    private readonly db: PlatformPrismaService,
    private readonly entries: WorkEntriesService,
    private readonly knowledge: LegalKnowledgeService,
  ) {}

  async resolve(input: PricingSuggestionDto): Promise<PricingContext> {
    const { role, workspaceId } = WorkspaceContextService.required;
    if (role !== "OWNER" && role !== "ADMIN")
      throw new ForbiddenException(
        "Pricing suggestions require finance manager access",
      );
    if (
      (input.kind === "SAVED" &&
        (!input.workEntryId || input.work !== undefined)) ||
      (input.kind === "UNSAVED" &&
        (!input.work || input.workEntryId !== undefined))
    )
      throw new BadRequestException(
        "Provide either a saved entry ID or unsaved work, not both",
      );
    let work: PricingSuggestionWork;
    if (input.kind === "SAVED") {
      const entry = await this.entries.get(input.workEntryId as string);
      work = {
        title: entry.title,
        description: entry.description,
        workDate: entry.workDate.slice(0, 10),
        minutes: entry.minutes,
        clientId: entry.client?.id,
        caseId: entry.case?.id,
        serviceCategoryId: entry.serviceCategory?.id,
      };
    } else work = input.work as PricingSuggestionWork;
    const date = new Date(`${work.workDate}T00:00:00Z`);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== work.workDate ||
      !work.title.trim() ||
      work.title.length > 200 ||
      (work.description?.length ?? 0) > 10000
    )
      throw new BadRequestException("Invalid work date or description");
    const client = work.clientId
      ? await this.db.client.findFirst({
          where: { id: work.clientId, workspaceId },
          select: { id: true, displayName: true },
        })
      : null;
    if (work.clientId && !client)
      throw new NotFoundException("Client not found");
    const caseRecord = work.caseId
      ? await this.db.case.findFirst({
          where: { id: work.caseId, workspaceId },
          select: { id: true, clientId: true, name: true, caseNumber: true },
        })
      : null;
    if (work.caseId && !caseRecord)
      throw new NotFoundException("Case not found");
    if (caseRecord && work.clientId && caseRecord.clientId !== work.clientId)
      throw new BadRequestException("Case does not belong to client");
    if (caseRecord && !work.clientId) {
      work = { ...work, clientId: caseRecord.clientId };
    }
    if (
      work.serviceCategoryId &&
      !(await this.db.serviceCategory.findFirst({
        where: { id: work.serviceCategoryId, workspaceId },
        select: { id: true },
      }))
    )
      throw new NotFoundException("Service category not found");
    const context: PricingContext = {
      work,
      facts: input.pricingFacts ?? {},
      clientName: client?.displayName ?? null,
      caseName: caseRecord
        ? `${caseRecord.caseNumber} ${caseRecord.name}`
        : null,
      sources: [],
      warnings: ["LAWYER_REVIEW_REQUIRED", "WORK_VALUE_NOT_ADDITIONAL_CHARGE"],
    };
    const versions = await this.db.priceSourceVersion.findMany({
      where: {
        workspaceId,
        priceSource: {
          workspaceId,
          OR: [
            {
              scope: { in: ["COMPANY_CATALOG", "WORKSPACE_PUBLIC_REFERENCE"] },
            },
            ...(work.clientId
              ? [
                  {
                    scope: "CLIENT_AGREEMENT" as const,
                    clientId: work.clientId,
                  },
                ]
              : []),
            ...(work.caseId
              ? [{ scope: "CASE_OVERRIDE" as const, caseId: work.caseId }]
              : []),
          ],
        },
        AND: [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: date } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }] },
        ],
      },
      include: { priceSource: true },
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
      take: 20,
    });
    if (versions.length === 20)
      context.warnings.push("PRICE_SOURCE_CONTEXT_LIMIT");
    for (const version of versions) {
      if (version.rawText.length > 12000)
        context.warnings.push("PRICING_CONTEXT_TRUNCATED");
      const reliableDate = version.effectiveFrom !== null;
      if (!reliableDate)
        context.warnings.push("PRICE_SOURCE_EFFECTIVE_DATE_UNKNOWN");
      if (
        version.effectiveTo &&
        version.effectiveFrom &&
        version.effectiveTo < version.effectiveFrom
      )
        continue;
      context.sources.push({
        id: version.id,
        sourceId: version.priceSourceId,
        versionId: version.id,
        version: version.version,
        kind: "PRICE_SOURCE",
        title: `${version.priceSource.scope}: ${version.priceSource.title}`,
        reference: null,
        sourceUrl: version.priceSource.sourceUrl,
        effectiveFrom:
          version.effectiveFrom?.toISOString().slice(0, 10) ?? null,
        effectiveTo: version.effectiveTo?.toISOString().slice(0, 10) ?? null,
        excerpt: "",
        text: version.rawText.slice(0, 12000),
        reliableDate,
      });
    }
    if (work.clientId) {
      const profile = await this.db.clientBillingProfile.findFirst({
        where: { workspaceId, clientId: work.clientId },
      });
      if (profile?.hourlyRate && profile.currency) {
        context.sources.push({
          id: profile.id,
          sourceId: profile.id,
          versionId: null,
          version: null,
          kind: "HOURLY_PROFILE",
          title: "Client hourly profile (mutable)",
          reference: null,
          sourceUrl: null,
          effectiveFrom: null,
          effectiveTo: null,
          excerpt: "",
          text: `Hourly rate ${profile.hourlyRate.toString()} ${profile.currency}`,
          reliableDate: false,
        });
        context.warnings.push("HOURLY_PROFILE_HISTORICAL_TERMS_UNVERIFIED");
      }
      const agreements = await this.db.retainerAgreement.findMany({
        where: {
          workspaceId,
          clientId: work.clientId,
          active: true,
          validFrom: { lte: date },
          OR: [{ validTo: null }, { validTo: { gte: date } }],
        },
        include: {
          categories: {
            include: { serviceCategory: { select: { name: true } } },
          },
        },
        take: 5,
      });
      for (const agreement of agreements)
        context.sources.push({
          id: agreement.id,
          sourceId: agreement.id,
          versionId: null,
          version: null,
          kind: "RETAINER",
          title: agreement.title,
          reference: null,
          sourceUrl: null,
          effectiveFrom: agreement.validFrom.toISOString().slice(0, 10),
          effectiveTo: agreement.validTo?.toISOString().slice(0, 10) ?? null,
          excerpt: "",
          text: JSON.stringify({
            monthlyFee: agreement.monthlyFee.toString(),
            currency: agreement.currency,
            includedMinutes: agreement.includedMinutes,
            categories: agreement.categories.map(
              (item) => item.serviceCategory.name,
            ),
            overageRule: agreement.overageRule,
            outOfScopeRule: agreement.outOfScopeRule,
          }),
          reliableDate: false,
        });
      if (agreements.length)
        context.warnings.push("RETAINER_CONTEXT_ONLY_MUTABLE_TERMS");
    }
    try {
      const hits = await this.knowledge.search(
        `Advokatska tarifa ${work.title} ${(work.description ?? "").slice(0, 1000)} ${context.facts.proceedingType ?? ""} ${context.facts.legalAction ?? ""}`,
        12,
        workspaceId,
      );
      const chunks = await this.db.legalChunk.findMany({
        where: {
          id: { in: hits.map((hit) => hit.id) },
          version: {
            indexingStatus: "INDEXED",
            source: { OR: [{ visibility: "PUBLIC" }, { workspaceId }] },
          },
        },
        include: { version: { include: { source: true } } },
        take: 12,
      });
      for (const chunk of chunks) {
        if (
          !/tarif/i.test(
            `${chunk.version.source.slug} ${chunk.version.source.title}`,
          )
        )
          continue;
        context.sources.push({
          id: chunk.id,
          sourceId: chunk.version.sourceId,
          versionId: chunk.versionId,
          version: null,
          kind: "LEGAL_TARIFF",
          title: chunk.version.source.title,
          reference: chunk.articleNumber,
          sourceUrl: chunk.version.source.sourceUrl,
          effectiveFrom: null,
          effectiveTo: null,
          excerpt: "",
          text: chunk.text.slice(0, 12000),
          reliableDate: false,
        });
      }
      const tariffVersionIds = [
        ...new Set(
          context.sources
            .filter((source) => source.kind === "LEGAL_TARIFF")
            .map((source) => source.versionId as string),
        ),
      ];
      if (tariffVersionIds.length) {
        const clauses = await this.db.legalChunk.findMany({
          where: {
            versionId: { in: tariffVersionIds },
            OR: [
              { text: { contains: "primen", mode: "insensitive" } },
              { text: { contains: "stupa", mode: "insensitive" } },
            ],
            version: {
              source: { OR: [{ visibility: "PUBLIC" }, { workspaceId }] },
            },
          },
          include: { version: { include: { source: true } } },
          orderBy: { ordinal: "desc" },
          take: 6,
        });
        for (const clause of clauses)
          if (!context.sources.some((source) => source.id === clause.id))
            context.sources.push({
              id: clause.id,
              sourceId: clause.version.sourceId,
              versionId: clause.versionId,
              version: null,
              kind: "LEGAL_TARIFF",
              title: clause.version.source.title,
              reference: clause.articleNumber,
              sourceUrl: clause.version.source.sourceUrl,
              effectiveFrom: null,
              effectiveTo: null,
              excerpt: "",
              text: clause.text.slice(0, 12000),
              reliableDate: false,
            });
      }
      if (chunks.length)
        context.warnings.push("LEGAL_TARIFF_EFFECTIVE_DATE_REQUIRES_EVIDENCE");
    } catch {
      context.warnings.push("LEGAL_TARIFF_SEARCH_UNAVAILABLE");
    }
    let remaining = 48000;
    context.sources = context.sources.flatMap((source) => {
      if (remaining <= 0) {
        context.warnings.push("PRICING_CONTEXT_TRUNCATED");
        return [];
      }
      const text = source.text.slice(0, remaining);
      remaining -= text.length;
      if (text.length < source.text.length)
        context.warnings.push("PRICING_CONTEXT_TRUNCATED");
      return [{ ...source, text }];
    });
    context.warnings = [...new Set(context.warnings)];
    const versionsBySource = new Map<string, Set<string>>();
    for (const source of context.sources) {
      const versions =
        versionsBySource.get(source.sourceId) ?? new Set<string>();
      if (source.versionId) versions.add(source.versionId);
      versionsBySource.set(source.sourceId, versions);
    }
    if ([...versionsBySource.values()].some((versions) => versions.size > 1))
      context.warnings.push("MULTIPLE_APPLICABLE_SOURCE_VERSIONS");
    return context;
  }
}
