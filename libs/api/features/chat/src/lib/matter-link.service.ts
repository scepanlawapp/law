import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  BriefApplyPreview,
  BriefApplyRequest,
  BriefApplyResponse,
  BriefResult,
  BriefTaskApplyRequest,
  BriefTaskApplyResponse,
  BriefTaskPreview,
  ChatSessionCaseSummary,
  ChatSessionSummary,
} from "@law/api-interfaces";
import { PlatformPrismaService } from "@law/core";
import { ActivitiesTasksDeadlinesService } from "@law/activities-tasks-deadlines";
import { CasesService } from "@law/cases";
import { ClientsService } from "@law/clients";
import { toSessionSummary } from "./chat.mappers";

const AI_SOURCE = { source: "AI_ASSISTED" } as const;

@Injectable()
export class MatterLinkService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly cases: CasesService,
    private readonly clients: ClientsService,
    private readonly work: ActivitiesTasksDeadlinesService,
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

  async listForCase(workspaceId: string, caseId: string) {
    await this.requireWorkspaceCase(workspaceId, caseId);
    const [sessions, drafts] = await Promise.all([
      this.db.chatSession.findMany({
        where: { workspaceId, caseId, isDeleted: false },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      this.db.draftResult.findMany({
        where: { workspaceId, caseId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          sessionId: true,
          approvalStatus: true,
          reviewedAt: true,
          createdAt: true,
          warnings: true,
        },
      }),
    ]);
    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        title: session.title,
        updatedAt: session.updatedAt.toISOString(),
      })),
      drafts: drafts.map((draft) => ({
        id: draft.id,
        sessionId: draft.sessionId,
        approvalStatus: draft.approvalStatus,
        reviewedAt: draft.reviewedAt?.toISOString() ?? null,
        createdAt: draft.createdAt.toISOString(),
        warnings: draft.warnings,
      })),
    };
  }

  async previewBrief(input: {
    workspaceId: string;
    userId: string;
    sessionId: string;
    briefId: string;
  }): Promise<BriefApplyPreview> {
    const briefRow = await this.requireBrief(
      input.workspaceId,
      input.sessionId,
      input.briefId,
    );
    const brief = this.readBrief(briefRow.brief);
    const plaintiffName = brief.plaintiff.name?.trim() || null;
    const split = splitPersonName(plaintiffName);
    const matches = plaintiffName
      ? await this.clients.list({
          page: 1,
          pageSize: 5,
          search: plaintiffName,
          status: "ACTIVE",
        } as never)
      : { items: [] };
    const suggestion = await this.cases.nextNumberSuggestion();
    return {
      briefId: briefRow.id,
      alreadyApplied: Boolean(briefRow.appliedCaseId),
      appliedCaseId: briefRow.appliedCaseId,
      plaintiffName,
      plaintiffAddress: brief.plaintiff.address,
      nameNeedsSplit: Boolean(plaintiffName) && !split,
      suggestedFirstName: split?.firstName ?? null,
      suggestedLastName: split?.lastName ?? null,
      clientMatches: matches.items.map((item) => ({
        id: item.id,
        displayName: item.displayName,
        clientNumber: item.clientNumber,
      })),
      defendantName: brief.defendant.name,
      defendantAddress: brief.defendant.address,
      suggestedCaseName: suggestCaseName(brief, briefRow.sessionId),
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
    const brief = this.readBrief(briefRow.brief);
    const applied = new Set(briefRow.appliedTaskKeys);
    const proposals = [
      ...brief.missingFields.map((title, index) =>
        this.proposal("missing", index, title, briefRow.id, matter, applied),
      ),
      ...brief.evidence.map((title, index) =>
        this.proposal("evidence", index, title, briefRow.id, matter, applied),
      ),
    ].filter((item): item is NonNullable<typeof item> => item !== null);
    return {
      briefId: briefRow.id,
      caseId: matter.id,
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
        caseId: preview.caseId,
        clientId: (
          await this.requireWorkspaceCase(input.workspaceId, preview.caseId)
        ).clientId,
        status: "TODO",
        priority: "NORMAL",
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

  private proposal(
    source: "missing" | "evidence",
    index: number,
    rawTitle: string,
    briefId: string,
    matter: { responsibleUserId: string },
    applied: Set<string>,
  ) {
    const title = rawTitle.trim();
    if (!title) return null;
    const key = `${source}:${index}`;
    return {
      key,
      source,
      title: title.slice(0, 320),
      description:
        source === "missing"
          ? `Nedostaje podatak iz briefa ${briefId}: ${title}`
          : `Dokaz iz briefa ${briefId}: ${title}`,
      assigneeUserId: matter.responsibleUserId,
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

  private readBrief(value: Prisma.JsonValue): BriefResult {
    const brief = value as Partial<BriefResult> | null;
    return {
      jobType: brief?.jobType ?? null,
      plaintiff: {
        name: brief?.plaintiff?.name ?? null,
        address: brief?.plaintiff?.address ?? null,
      },
      defendant: {
        name: brief?.defendant?.name ?? null,
        address: brief?.defendant?.address ?? null,
      },
      competentCourt: brief?.competentCourt ?? null,
      claimValue: brief?.claimValue ?? null,
      legalBasis: brief?.legalBasis ?? [],
      factualDescription: brief?.factualDescription ?? null,
      evidence: brief?.evidence ?? [],
      reliefSought: brief?.reliefSought ?? null,
      missingFields: brief?.missingFields ?? [],
      confidence: brief?.confidence ?? 0,
      warnings: brief?.warnings ?? [],
    };
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

function suggestCaseName(brief: BriefResult, fallback: string): string {
  const relief = brief.reliefSought?.trim();
  if (relief) return relief.slice(0, 320);
  const plaintiff = brief.plaintiff.name?.trim();
  if (plaintiff) return `Predmet — ${plaintiff}`.slice(0, 320);
  return fallback.slice(0, 320);
}

export function suggestDescription(brief: BriefResult): string {
  const lines = [
    brief.factualDescription?.trim(),
    brief.competentCourt ? `Sud: ${brief.competentCourt}` : null,
    brief.claimValue ? `Vrednost spora: ${brief.claimValue}` : null,
    brief.legalBasis.length
      ? `Pravni osnov: ${brief.legalBasis.join("; ")}`
      : null,
    brief.reliefSought ? `Tuzbeni zahtev: ${brief.reliefSought}` : null,
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n\n");
}
