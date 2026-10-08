import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  BriefApplyPreview,
  BriefApplyRequest,
  BriefApplyResponse,
  BriefEvidenceItem,
  BriefMissingField,
  BriefTaskApplyRequest,
  BriefTaskApplyResponse,
  BriefTaskPreview,
  BriefTaskProposal,
  ChatSessionCaseSummary,
  ChatSessionSummary,
} from "@law/api-interfaces";
import {
  DOCUMENT_FAMILY_TEXT,
  briefFieldValue,
  briefParty,
  describeMissingField,
  getDocumentType,
  normalizeBrief,
  type BriefResult,
  type DocumentTypeDefinition,
} from "@law/brief-extraction";
import { PlatformPrismaService, paginationMeta } from "@law/core";
import { ActivitiesTasksDeadlinesService } from "@law/activities-tasks-deadlines";
import { CasesService } from "@law/cases";
import { ClientsService } from "@law/clients";
import { ChatDocumentPromotionService } from "./chat-document-promotion.service";
import { toCaseTimeline, toSessionSummary } from "./chat.mappers";

const AI_SOURCE = { source: "AI_ASSISTED" } as const;

const DEFAULT_DUE_WORKING_DAYS = 3;

@Injectable()
export class MatterLinkService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly cases: CasesService,
    private readonly clients: ClientsService,
    private readonly work: ActivitiesTasksDeadlinesService,
    @Optional() private readonly promotion?: ChatDocumentPromotionService,
  ) {}

  private get db(): PlatformPrismaService {
    return this.prisma;
  }

  async requireWorkspaceCase(workspaceId: string, caseId: string) {
    const item = await this.db.case.findFirst({
      where: { id: caseId, workspaceId },
      include: { client: { select: { displayName: true } } },
    });
    if (!item) {
      throw new BadRequestException("Case is not available in this workspace");
    }
    return item;
  }

  caseSummary(item: {
    id: string;
    caseNumber: string;
    name: string;
    clientId: string;
    client?: { displayName: string } | null;
  }): ChatSessionCaseSummary {
    return {
      id: item.id,
      caseNumber: item.caseNumber,
      name: item.name,
      clientId: item.clientId,
      clientDisplayName: item.client?.displayName ?? null,
    };
  }

  async createSession(input: {
    workspaceId: string;
    userId: string;
    title?: string;
    caseId?: string | null;
  }): Promise<ChatSessionSummary> {
    if (input.caseId) {
      await this.requireWorkspaceCase(input.workspaceId, input.caseId);
    }
    const session = await this.db.chatSession.create({
      data: {
        workspaceId: input.workspaceId,
        createdByUserId: input.userId,
        title: input.title?.trim() || "New chat",
        caseId: input.caseId ?? null,
      },
      include: {
        case: { include: { client: { select: { displayName: true } } } },
      },
    });
    return {
      ...toSessionSummary(session),
      caseId: session.caseId,
      case: session.case ? this.caseSummary(session.case) : null,
    };
  }

  async linkSession(input: {
    workspaceId: string;
    userId: string;
    sessionId: string;
    caseId: string | null;
  }): Promise<ChatSessionSummary> {
    const session = await this.db.chatSession.findFirst({
      where: {
        id: input.sessionId,
        workspaceId: input.workspaceId,
        isDeleted: false,
      },
    });
    if (!session) throw new NotFoundException("Chat session not found");
    if (input.caseId) {
      await this.requireWorkspaceCase(input.workspaceId, input.caseId);
    }
    const updated = await this.db.$transaction(async (tx) => {
      const next = await tx.chatSession.update({
        where: { id: session.id },
        data: { caseId: input.caseId },
        include: {
          case: { include: { client: { select: { displayName: true } } } },
        },
      });
      await tx.draftResult.updateMany({
        where: {
          sessionId: session.id,
          approvalStatus: { not: "APPROVED" },
        },
        data: { caseId: input.caseId },
      });
      if (session.caseId !== input.caseId) {
        await tx.activityLog.create({
          data: {
            workspaceId: input.workspaceId,
            actorUserId: input.userId,
            action: input.caseId
              ? "CHAT_SESSION_LINKED"
              : "CHAT_SESSION_UNLINKED",
            entityType: "ChatSession",
            entityId: session.id,
            caseId: input.caseId ?? session.caseId,
          },
        });
      }
      return next;
    });
    if (input.caseId) {
      await this.promotion?.promoteSession(input.workspaceId, session.id);
    }
    return {
      ...toSessionSummary(updated),
      caseId: updated.caseId,
      case: updated.case ? this.caseSummary(updated.case) : null,
    };
  }

  async sessionCaseId(
    workspaceId: string,
    sessionId: string,
  ): Promise<string | null> {
    const session = await this.db.chatSession.findFirst({
      where: { id: sessionId, workspaceId },
      select: { caseId: true },
    });
    return session?.caseId ?? null;
  }

  async caseContextBlock(
    workspaceId: string,
    sessionId: string,
  ): Promise<string | null> {
    const session = await this.db.chatSession.findFirst({
      where: { id: sessionId, workspaceId, caseId: { not: null } },
      select: { caseId: true },
    });
    if (!session?.caseId) return null;
    const item = await this.db.case.findFirst({
      where: { id: session.caseId, workspaceId },
      include: { client: { select: { displayName: true } } },
    });
    if (!item) return null;
    const lines = [
      "Povezani predmet (kontekst, ne menjati zapise):",
      `Broj: ${item.caseNumber}`,
      `Naziv: ${item.name}`,
      `Klijent: ${item.client.displayName}`,
    ];
    if (item.opposingPartyName) {
      lines.push(`Protivna strana: ${item.opposingPartyName}`);
    }
    if (item.description?.trim()) {
      lines.push(`Opis: ${item.description.trim()}`);
    }
    return lines.join("\n");
  }

  async listForCase(
    workspaceId: string,
    caseId: string,
    query: { page: number; draftPage: number; pageSize: number },
  ) {
    await this.requireWorkspaceCase(workspaceId, caseId);
    const [sessionTotal, sessions, draftTotal, drafts, timeline] =
      await Promise.all([
        this.db.chatSession.count({
          where: { workspaceId, caseId, isDeleted: false },
        }),
        this.db.chatSession.findMany({
          where: { workspaceId, caseId, isDeleted: false },
          orderBy: { updatedAt: "desc" },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: { _count: { select: { draftResults: true } } },
        }),
        this.db.draftResult.count({
          where: { workspaceId, caseId },
        }),
        this.db.draftResult.findMany({
          where: { workspaceId, caseId },
          orderBy: { createdAt: "desc" },
          skip: (query.draftPage - 1) * query.pageSize,
          take: query.pageSize,
          select: {
            id: true,
            sessionId: true,
            documentType: true,
            approvalStatus: true,
            reviewedAt: true,
            createdAt: true,
            warnings: true,
          },
        }),
        this.db.documentAnalysis.findFirst({
          where: { workspaceId, caseId, kind: "CASE_TIMELINE" },
          orderBy: { createdAt: "desc" },
        }),
      ]);
    const latestTimeline = timeline ? toCaseTimeline(timeline) : null;
    return {
      sessions: {
        items: sessions.map((session) => ({
          id: session.id,
          title: session.title,
          updatedAt: session.updatedAt.toISOString(),
          draftCount: session._count.draftResults,
        })),
        meta: paginationMeta(query.page, query.pageSize, sessionTotal, [
          { field: "updatedAt", direction: "desc" },
        ]),
      },
      drafts: {
        items: drafts.map((draft) => ({
          id: draft.id,
          sessionId: draft.sessionId,
          documentType: draft.documentType,
          approvalStatus: draft.approvalStatus,
          reviewedAt: draft.reviewedAt?.toISOString() ?? null,
          createdAt: draft.createdAt.toISOString(),
          warnings: draft.warnings,
        })),
        meta: paginationMeta(query.draftPage, query.pageSize, draftTotal, [
          { field: "createdAt", direction: "desc" },
        ]),
      },
      latestTimeline: latestTimeline
        ? {
            id: latestTimeline.id,
            sessionId: latestTimeline.sessionId,
            createdAt: latestTimeline.createdAt,
            summary: latestTimeline.result.summary,
            eventCount: latestTimeline.result.events.length,
          }
        : null,
    };
  }

  async previewBrief(input: {
    workspaceId: string;
    userId: string;
    sessionId: string;
    briefId: string;
    clientRole?: string;
  }): Promise<BriefApplyPreview> {
    const briefRow = await this.requireBrief(
      input.workspaceId,
      input.sessionId,
      input.briefId,
    );
    const brief = normalizeBrief(briefRow.brief);
    const type = getDocumentType(brief.documentType);
    const clientRole = type.parties.some(
      (party) => party.role === input.clientRole,
    )
      ? input.clientRole!
      : type.defaultClientRole;
    const clientParty = briefParty(brief, clientRole);
    // The opposing party is the first other party that has a name.
    const opposing =
      brief.parties.find((party) => party.role !== clientRole && party.name) ??
      brief.parties.find((party) => party.role !== clientRole) ??
      null;
    const clientName = clientParty?.name ?? null;
    const split = splitPersonName(clientName);
    const matches = clientName
      ? await this.clients.list({
          page: 1,
          pageSize: 5,
          search: clientName,
          status: "ACTIVE",
        } as never)
      : { items: [] };
    const suggestion = await this.cases.nextNumberSuggestion();
    return {
      briefId: briefRow.id,
      alreadyApplied: Boolean(briefRow.appliedCaseId),
      appliedCaseId: briefRow.appliedCaseId,
      documentType: brief.documentType,
      parties: type.parties.map((party) => {
        const entry = briefParty(brief, party.role);
        return {
          role: party.role,
          label: party.label,
          name: entry?.name ?? null,
          address: entry?.address ?? null,
          source: entry?.source ?? null,
        };
      }),
      clientRole,
      clientPartyName: clientName,
      clientPartyAddress: clientParty?.address ?? null,
      clientPartySource: clientParty?.source ?? null,
      nameNeedsSplit: Boolean(clientName) && !split,
      suggestedFirstName: split?.firstName ?? null,
      suggestedLastName: split?.lastName ?? null,
      clientMatches: matches.items.map((item) => ({
        id: item.id,
        displayName: item.displayName,
        clientNumber: item.clientNumber,
      })),
      opposingPartyName: opposing?.name ?? null,
      opposingPartyAddress: opposing?.address ?? null,
      opposingPartySource: opposing?.source ?? null,
      suggestedCaseName: suggestCaseName(brief, clientName, briefRow.sessionId),
      suggestedDescription: suggestDescription(brief),
      suggestedCaseNumber: suggestion.caseNumber,
      responsibleUserId: input.userId,
      missingFields: brief.missingFields,
      warnings: brief.warnings,
      confidence: brief.confidence,
    };
  }

  async applyBrief(input: {
    workspaceId: string;
    userId: string;
    sessionId: string;
    briefId: string;
    body: BriefApplyRequest;
  }): Promise<BriefApplyResponse> {
    const briefRow = await this.requireBrief(
      input.workspaceId,
      input.sessionId,
      input.briefId,
    );
    if (briefRow.appliedCaseId) {
      const existing = await this.db.case.findFirst({
        where: { id: briefRow.appliedCaseId, workspaceId: input.workspaceId },
      });
      if (existing) {
        return {
          briefId: briefRow.id,
          caseId: existing.id,
          clientId: existing.clientId,
          createdClient: false,
          sessionId: input.sessionId,
        };
      }
    }
    const session = await this.db.chatSession.findFirst({
      where: { id: input.sessionId, workspaceId: input.workspaceId },
    });
    if (session?.caseId) {
      throw new ConflictException("Session is already linked to a case");
    }

    let clientId = input.body.client.clientId;
    let createdClient = false;
    if (input.body.client.mode === "existing") {
      if (!clientId) throw new BadRequestException("Select an existing client");
      const client = await this.db.client.findFirst({
        where: {
          id: clientId,
          workspaceId: input.workspaceId,
          status: "ACTIVE",
        },
      });
      if (!client) {
        throw new BadRequestException("Selected client is not available");
      }
    } else {
      const firstName = input.body.client.firstName?.trim();
      const lastName = input.body.client.lastName?.trim();
      if (!firstName || !lastName) {
        throw new BadRequestException(
          "First and last name are required to create a client",
        );
      }
      const created = await this.clients.create({
        type: "INDIVIDUAL",
        firstName,
        lastName,
        responsibleUserId: input.body.responsibleUserId,
        status: "ACTIVE",
      });
      clientId = created.id;
      createdClient = true;
      await this.db.activityLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: input.userId,
          action: "CLIENT_CREATED",
          entityType: "Client",
          entityId: created.id,
          clientId: created.id,
          metadata: { ...AI_SOURCE, briefId: briefRow.id },
        },
      });
    }

    const createdCase = await this.cases.create({
      clientId: clientId!,
      caseNumber: input.body.caseNumber,
      name: input.body.name,
      description: input.body.description,
      responsibleUserId: input.body.responsibleUserId,
      status: "DRAFT",
    });
    await this.db.case.update({
      where: { id: createdCase.id },
      data: {
        opposingPartyName: input.body.opposingPartyName?.trim() || null,
        opposingPartyAddress: input.body.opposingPartyAddress?.trim() || null,
      },
    });
    await this.db.$transaction([
      this.db.chatSession.update({
        where: { id: input.sessionId },
        data: { caseId: createdCase.id },
      }),
      this.db.draftResult.updateMany({
        where: {
          sessionId: input.sessionId,
          approvalStatus: { not: "APPROVED" },
        },
        data: { caseId: createdCase.id },
      }),
      this.db.briefExtractionResult.update({
        where: { id: briefRow.id },
        data: { appliedCaseId: createdCase.id },
      }),
      this.db.activityLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: input.userId,
          action: "CASE_CREATED",
          entityType: "Case",
          entityId: createdCase.id,
          caseId: createdCase.id,
          clientId: clientId!,
          metadata: { ...AI_SOURCE, briefId: briefRow.id },
        },
      }),
    ]);
    await this.promotion?.promoteSession(input.workspaceId, input.sessionId);
    return {
      briefId: briefRow.id,
      caseId: createdCase.id,
      clientId: clientId!,
      createdClient,
      sessionId: input.sessionId,
    };
  }

  async previewTasks(input: {
    workspaceId: string;
    sessionId: string;
    briefId: string;
  }): Promise<BriefTaskPreview> {
    const briefRow = await this.requireBrief(
      input.workspaceId,
      input.sessionId,
      input.briefId,
    );
    if (!briefRow.appliedCaseId) {
      throw new BadRequestException("Link a case before proposing tasks");
    }
    const matter = await this.requireWorkspaceCase(
      input.workspaceId,
      briefRow.appliedCaseId,
    );
    const brief = normalizeBrief(briefRow.brief);
    const type = getDocumentType(brief.documentType);
    const applied = new Set(briefRow.appliedTaskKeys);
    const today = new Date();
    const proposals = [
      ...brief.missingFields.map((field, index) =>
        this.missingProposal(type, field, index, matter, applied, today),
      ),
      ...brief.evidence.map((item, index) =>
        this.evidenceProposal(type, item, index, matter, applied, today),
      ),
    ].filter((item): item is BriefTaskProposal => item !== null);
    return {
      briefId: briefRow.id,
      caseId: matter.id,
      documentFamily: type.family,
      proposals,
    };
  }

  async applyTasks(input: {
    workspaceId: string;
    userId: string;
    sessionId: string;
    briefId: string;
    body: BriefTaskApplyRequest;
  }): Promise<BriefTaskApplyResponse> {
    const preview = await this.previewTasks(input);
    const byKey = new Map(preview.proposals.map((item) => [item.key, item]));
    const createdTaskIds: string[] = [];
    const skippedKeys: string[] = [];
    const appliedKeys: string[] = [];
    for (const requested of input.body.tasks) {
      const proposal = byKey.get(requested.key);
      if (!proposal || proposal.alreadyApplied) {
        skippedKeys.push(requested.key);
        continue;
      }
      const created = await this.work.createTask({
        title: (requested.title?.trim() || proposal.title).slice(0, 320),
        description: proposal.description,
        assigneeUserId: requested.assigneeUserId || proposal.assigneeUserId,
        dueDate: requested.dueDate || proposal.dueDate,
        caseId: preview.caseId,
        clientId: (
          await this.requireWorkspaceCase(input.workspaceId, preview.caseId)
        ).clientId,
        status: "TODO",
        priority: proposal.priority,
      });
      createdTaskIds.push(created.id);
      appliedKeys.push(requested.key);
      await this.db.activityLog.updateMany({
        where: {
          workspaceId: input.workspaceId,
          entityType: "Task",
          entityId: created.id,
          action: "TASK_CREATED",
        },
        data: {
          metadata: {
            ...AI_SOURCE,
            briefId: input.briefId,
            key: requested.key,
          },
        },
      });
    }
    if (appliedKeys.length) {
      await this.db.briefExtractionResult.update({
        where: { id: input.briefId },
        data: { appliedTaskKeys: { push: appliedKeys } },
      });
    }
    return {
      briefId: input.briefId,
      caseId: preview.caseId,
      createdTaskIds,
      skippedKeys,
    };
  }

  private missingProposal(
    type: DocumentTypeDefinition,
    field: BriefMissingField,
    index: number,
    matter: { responsibleUserId: string },
    applied: Set<string>,
    today: Date,
  ): BriefTaskProposal | null {
    const label = field.label.trim();
    if (!label) return null;
    const key = `missing:${field.key}:${index}`;
    const info = describeMissingField(type, field.key);
    const urgent = info?.urgent ?? false;
    return {
      key,
      source: "missing",
      fieldKey: field.key,
      title: (info?.taskTitle ?? `Pribaviti podatak: ${label}`).slice(0, 320),
      description: urgent
        ? (info?.urgentDescription ??
          `Od datuma dostavljanja zavisi rok za podnošenje ${type.labelGenitive} — utvrditi hitno i uneti rok u kalendar.`)
        : `Podatak je potreban za nacrt ${type.labelGenitive}, a ne nalazi se u dostavljenim dokumentima: ${label}.`,
      assigneeUserId: matter.responsibleUserId,
      priority: urgent ? "HIGH" : "NORMAL",
      dueDate: addWorkingDays(today, urgent ? 1 : DEFAULT_DUE_WORKING_DAYS),
      selectedByDefault: true,
      // Briefs linked before structured fields used `missing:<index>` keys.
      alreadyApplied: applied.has(key) || applied.has(`missing:${index}`),
    };
  }

  private evidenceProposal(
    type: DocumentTypeDefinition,
    item: BriefEvidenceItem,
    index: number,
    matter: { responsibleUserId: string },
    applied: Set<string>,
    today: Date,
  ): BriefTaskProposal | null {
    const label = item.label.trim();
    if (!label || item.provided) return null;
    const key = `evidence:${index}`;
    const familyText = DOCUMENT_FAMILY_TEXT[type.family];
    return {
      key,
      source: "evidence",
      title: `${familyText.evidenceTaskPrefix}: ${label}`.slice(0, 320),
      description: familyText.evidenceDescription
        .replace("{document}", type.labelGenitive)
        .replace("{label}", label),
      assigneeUserId: matter.responsibleUserId,
      priority: "NORMAL",
      dueDate: addWorkingDays(today, DEFAULT_DUE_WORKING_DAYS),
      selectedByDefault: false,
      alreadyApplied: applied.has(key),
    };
  }

  private async requireBrief(
    workspaceId: string,
    sessionId: string,
    briefId: string,
  ) {
    const brief = await this.db.briefExtractionResult.findFirst({
      where: { id: briefId, workspaceId, sessionId },
    });
    if (!brief) throw new NotFoundException("Brief not found");
    return brief;
  }
}

export function splitPersonName(
  name: string | null,
): { firstName: string; lastName: string } | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function suggestCaseName(
  brief: BriefResult,
  clientName: string | null,
  fallback: string,
): string {
  const type = getDocumentType(brief.documentType);
  const purposeKey = type.fields.find((field) => field.caseName)?.key;
  const purpose = purposeKey ? briefFieldValue(brief, purposeKey) : null;
  if (purpose) return purpose.slice(0, 320);
  if (clientName) return `Predmet — ${clientName}`.slice(0, 320);
  return fallback.slice(0, 320);
}

export function suggestDescription(brief: BriefResult): string {
  const type = getDocumentType(brief.documentType);
  const lines = [
    brief.factualDescription?.trim(),
    ...type.fields.map((field) => {
      const value = briefFieldValue(brief, field.key);
      return value ? `${field.label}: ${value}` : null;
    }),
    brief.legalBasis.length
      ? `Pravni osnov: ${brief.legalBasis.join("; ")}`
      : null,
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n\n");
}

// Skips Saturdays and Sundays; returns an ISO date (YYYY-MM-DD).
export function addWorkingDays(from: Date, days: number): string {
  const date = new Date(
    Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()),
  );
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date.toISOString().slice(0, 10);
}
