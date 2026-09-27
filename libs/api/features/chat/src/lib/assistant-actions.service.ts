import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type {
  ChatStreamEvent,
  PendingActionSummary,
} from "@law/api-interfaces";
import {
  ActivitiesTasksDeadlinesService,
  CreateDeadlineDto,
} from "@law/activities-tasks-deadlines";
import { PlatformPrismaService } from "@law/core";
import type {
  ActionProposalResult,
  AssistantActionRequest,
  AssistantTurnScope,
} from "@law/mastra";
import { Prisma } from "@prisma/client";
import { ChatEventBus } from "./chat.events";
import { toJob, toPendingAction } from "./chat.mappers";
import { MatterLinkService } from "./matter-link.service";
import {
  WORKFLOW_QUEUE_PORT,
  type WorkflowQueuePort,
} from "./workflow-queue.types";

const EXPIRY_MS = 24 * 60 * 60 * 1000;
const CASE_CANDIDATES = 5;
const TASK_DETAIL_LINES = 10;
const BELGRADE_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Belgrade",
});
const AI_SOURCE = { source: "AI_ASSISTED" } as const;

const DEADLINE_TYPE_LABELS: Record<string, string> = {
  COURT: "sudski",
  STATUTORY: "zakonski",
  CONTRACTUAL: "ugovorni",
  INTERNAL: "interni",
  OTHER: "ostalo",
};

type PendingActionRow = Awaited<
  ReturnType<PlatformPrismaService["pendingAction"]["create"]>
>;

type Proposal = {
  actionType: AssistantActionRequest["type"];
  payload: Record<string, unknown>;
  summary: string;
  details: string[];
};

type CaseMatch = {
  id: string;
  caseNumber: string;
  name: string;
  clientId: string;
  responsibleUserId: string;
  client: { displayName: string };
};

class InvalidProposal extends Error {}

/** Today's date in the office's time zone (YYYY-MM-DD). */
export function belgradeToday(now = new Date()): string {
  return BELGRADE_DATE.format(now);
}

/**
 * Record changes proposed by the assistant (AI_ARCHITECTURE.md §5). A tool
 * only stores a validated, normalized proposal; approval executes it through
 * the existing services with the approving user as the actor.
 */
@Injectable()
export class AssistantActionsService {
  private readonly logger = new Logger(AssistantActionsService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly events: ChatEventBus,
    private readonly matterLink: MatterLinkService,
    @Inject(WORKFLOW_QUEUE_PORT)
    private readonly workflowQueue: WorkflowQueuePort,
    @Optional() private readonly work?: ActivitiesTasksDeadlinesService,
  ) {}

  async propose(
    scope: AssistantTurnScope,
    request: AssistantActionRequest,
  ): Promise<ActionProposalResult> {
    let proposal: Proposal;
    try {
      proposal = await this.normalize(scope, request);
    } catch (error) {
      if (error instanceof InvalidProposal) {
        return { status: "INVALID", message: error.message };
      }
      throw error;
    }
    const idempotencyKey = createHash("sha256")
      .update(
        `${scope.jobId}|${proposal.actionType}|${stableStringify(proposal.payload)}`,
      )
      .digest("hex");
    const existing = await this.prisma.pendingAction.findUnique({
      where: { idempotencyKey },
    });
    const row =
      existing ??
      (await this.prisma.pendingAction.create({
        data: {
          workspaceId: scope.workspaceId,
          sessionId: scope.sessionId,
          jobId: scope.jobId,
          correlationId: scope.correlationId,
          actionType: proposal.actionType,
          payload: proposal.payload as Prisma.InputJsonValue,
          summary: proposal.summary,
          details: proposal.details,
          idempotencyKey,
          expiresAt: new Date(Date.now() + EXPIRY_MS),
        },
      }));
    if (!existing) {
      this.emit(row, "confirmation.required");
    }
    return {
      status: "CONFIRMATION_REQUIRED",
      pendingActionId: row.id,
      summary: row.summary,
      details: row.details,
    };
  }

  async decide(input: {
    workspaceId: string;
    userId: string;
    actionId: string;
    decision: "APPROVE" | "DECLINE";
    reason?: string;
  }): Promise<PendingActionSummary> {
    const action = await this.prisma.pendingAction.findFirst({
      where: { id: input.actionId, workspaceId: input.workspaceId },
    });
    const session = action
      ? await this.prisma.chatSession.findFirst({
          where: {
            id: action.sessionId,
            workspaceId: input.workspaceId,
            isDeleted: false,
          },
          select: { id: true },
        })
      : null;
    if (!action || !session) {
      throw new NotFoundException("Pending action not found");
    }
    // Already decided (double click, second tab): report the current state.
    if (action.status !== "PENDING") return toPendingAction(action);

    const now = new Date();
    if (action.expiresAt <= now) {
      await this.prisma.pendingAction.updateMany({
        where: { id: action.id, status: "PENDING" },
        data: { status: "EXPIRED" },
      });
      const expired = await this.reload(action.id);
      this.emit(expired, "confirmation.updated");
      await this.afterDecision(expired);
      return toPendingAction(expired);
    }

    // Atomic claim: only one request can move PENDING forward.
    const claimed = await this.prisma.pendingAction.updateMany({
      where: { id: action.id, status: "PENDING" },
      data: {
        status: input.decision === "APPROVE" ? "EXECUTING" : "DECLINED",
        decidedByUserId: input.userId,
        decidedAt: now,
        declineReason:
          input.decision === "DECLINE" ? input.reason?.trim() || null : null,
      },
    });
    if (claimed.count === 0) {
      return toPendingAction(await this.reload(action.id));
    }

    if (input.decision === "APPROVE") {
      try {
        const result = await this.execute(action, input.userId);
        await this.prisma.pendingAction.update({
          where: { id: action.id },
          data: { status: "APPROVED", result },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Pending action ${action.id} failed: ${message}`);
        await this.prisma.pendingAction.update({
          where: { id: action.id },
          data: { status: "FAILED", errorMessage: message.slice(0, 500) },
        });
      }
    }

    const decided = await this.reload(action.id);
    this.emit(decided, "confirmation.updated");
    await this.afterDecision(decided);
    return toPendingAction(decided);
  }

  private async normalize(
    scope: AssistantTurnScope,
    request: AssistantActionRequest,
  ): Promise<Proposal> {
    switch (request.type) {
      case "link_case": {
        const target = await this.resolveCase(
          scope.workspaceId,
          request.caseReference,
        );
        const sessionCaseId = await this.matterLink.sessionCaseId(
          scope.workspaceId,
          scope.sessionId,
        );
        if (sessionCaseId === target.id) {
          throw new InvalidProposal(
            `Razgovor je već povezan sa predmetom ${target.caseNumber}.`,
          );
        }
        return {
          actionType: "link_case",
          payload: { caseId: target.id },
          summary: `Povezivanje razgovora sa predmetom ${target.caseNumber} – ${target.name}`,
          details: [`Klijent: ${target.client.displayName}`],
        };
      }
      case "create_deadline": {
        const dueDate = request.dueDate.trim();
        if (!isIsoDate(dueDate)) {
          throw new InvalidProposal(
            `Datum „${dueDate}“ nije ispravan (YYYY-MM-DD).`,
          );
        }
        if (dueDate < belgradeToday()) {
          throw new InvalidProposal(
            `Datum ${formatDate(dueDate)} je u prošlosti.`,
          );
        }
        const target = request.caseReference
          ? await this.resolveCase(scope.workspaceId, request.caseReference)
          : await this.linkedCase(scope);
        const responsible = await this.prisma.user.findFirst({
          where: { id: target.responsibleUserId },
          select: { firstName: true, lastName: true, email: true },
        });
        const type = request.deadlineType ?? "OTHER";
        const title = request.title.trim();
        return {
          actionType: "create_deadline",
          payload: {
            title,
            dueDate,
            type,
            description: request.description?.trim() || null,
            caseId: target.id,
            clientId: target.clientId,
            responsibleUserId: target.responsibleUserId,
            timeZone: "Europe/Belgrade",
          },
          summary: `Novi rok: ${title} — ${formatDate(dueDate)}`,
          details: [
            `Predmet: ${target.caseNumber} – ${target.name}`,
            `Vrsta roka: ${DEADLINE_TYPE_LABELS[type] ?? type}`,
            `Odgovoran: ${displayName(responsible) ?? "odgovorni advokat predmeta"}`,
            ...(request.description?.trim()
              ? [`Opis: ${request.description.trim()}`]
              : []),
          ],
        };
      }
      case "create_tasks_from_brief": {
        const brief = await this.prisma.briefExtractionResult.findFirst({
          where: {
            workspaceId: scope.workspaceId,
            sessionId: scope.sessionId,
            ...(request.briefId ? { id: request.briefId } : {}),
          },
          orderBy: { createdAt: "desc" },
        });
        if (!brief) {
          throw new InvalidProposal(
            "U ovom razgovoru nema izvučenih činjenica (briefa).",
          );
        }
        if (!brief.appliedCaseId) {
          throw new InvalidProposal(
            "Najpre primenite brief na predmet u panelu Case-work, pa onda predložite zadatke.",
          );
        }
        const preview = await this.matterLink.previewTasks({
          workspaceId: scope.workspaceId,
          sessionId: scope.sessionId,
          briefId: brief.id,
        });
        const open = preview.proposals.filter(
          (proposal) => !proposal.alreadyApplied,
        );
        if (!open.length) {
          throw new InvalidProposal(
            "Svi zadaci iz ovog briefa su već kreirani.",
          );
        }
        const target = await this.prisma.case.findFirst({
          where: { id: preview.caseId, workspaceId: scope.workspaceId },
          select: { caseNumber: true },
        });
        return {
          actionType: "create_tasks_from_brief",
          payload: {
            briefId: brief.id,
            caseId: preview.caseId,
            keys: open.map((proposal) => proposal.key),
          },
          summary:
            `Kreiranje zadataka (${open.length}) u predmetu ${target?.caseNumber ?? ""}`.trim(),
          details: [
            ...open
              .slice(0, TASK_DETAIL_LINES)
              .map((proposal) => `• ${proposal.title}`),
            ...(open.length > TASK_DETAIL_LINES
              ? [`… i još ${open.length - TASK_DETAIL_LINES}`]
              : []),
          ],
        };
      }
    }
  }

  /** Runs an approved action through the existing services. */
  private async execute(
    action: PendingActionRow,
    userId: string,
  ): Promise<Prisma.InputJsonValue> {
    const payload = action.payload as Record<string, unknown>;
    const aiMetadata = { ...AI_SOURCE, pendingActionId: action.id };
    switch (action.actionType) {
      case "link_case": {
        const startedAt = new Date();
        const linked = await this.matterLink.linkSession({
          workspaceId: action.workspaceId,
          userId,
          sessionId: action.sessionId,
          caseId: String(payload["caseId"]),
        });
        await this.prisma.activityLog.updateMany({
          where: {
            workspaceId: action.workspaceId,
            entityType: "ChatSession",
            entityId: action.sessionId,
            action: "CHAT_SESSION_LINKED",
            createdAt: { gte: startedAt },
          },
          data: { metadata: aiMetadata },
        });
        this.events.emit({
          type: "session.title.updated",
          workspaceId: action.workspaceId,
          sessionId: action.sessionId,
          createdAt: linked.updatedAt,
          title: linked.title,
        });
        return {
          message:
            `Razgovor je povezan sa predmetom ${linked.case?.caseNumber ?? ""}.`.replace(
              " .",
              ".",
            ),
          caseId: linked.caseId,
        };
      }
      case "create_deadline": {
        if (!this.work) throw new Error("Deadlines are not available");
        const deadline = await this.work.createDeadline(
          Object.assign(new CreateDeadlineDto(), {
            title: payload["title"],
            dueDate: payload["dueDate"],
            type: payload["type"],
            description: payload["description"] ?? undefined,
            timeZone: payload["timeZone"],
            responsibleUserId: payload["responsibleUserId"],
            caseId: payload["caseId"],
            clientId: payload["clientId"],
            sourceDescription: "Predložio AI asistent, odobrio korisnik.",
          }),
        );
        await this.prisma.activityLog.updateMany({
          where: {
            workspaceId: action.workspaceId,
            entityType: "Deadline",
            entityId: deadline.id,
            action: "DEADLINE_CREATED",
          },
          data: { metadata: aiMetadata },
        });
        return {
          message: `Rok „${String(payload["title"])}“ je kreiran za ${formatDate(String(payload["dueDate"]))}`,
          deadlineId: deadline.id,
        };
      }
      case "create_tasks_from_brief": {
        const keys = (payload["keys"] as string[]) ?? [];
        const applied = await this.matterLink.applyTasks({
          workspaceId: action.workspaceId,
          userId,
          sessionId: action.sessionId,
          briefId: String(payload["briefId"]),
          body: { tasks: keys.map((key) => ({ key })) },
        });
        return {
          message: `Kreirano zadataka: ${applied.createdTaskIds.length}${
            applied.skippedKeys.length
              ? ` (preskočeno već postojećih: ${applied.skippedKeys.length})`
              : ""
          }.`,
          taskIds: applied.createdTaskIds,
        };
      }
      default:
        throw new Error(`Unsupported action ${action.actionType}`);
    }
  }

  /**
   * When the turn's last proposal is decided: complete the waiting run and
   * let the agent continue with the outcome (`agent-resume`).
   */
  private async afterDecision(action: PendingActionRow): Promise<void> {
    const open = await this.prisma.pendingAction.count({
      where: { jobId: action.jobId, status: { in: ["PENDING", "EXECUTING"] } },
    });
    if (open > 0) return;
    const job = await this.prisma.workflowJob.findUnique({
      where: { id: action.jobId },
    });
    if (!job || job.status !== "WAITING_CONFIRMATION") return;
    const completed = await this.prisma.workflowJob.update({
      where: { id: job.id },
      data: { status: "COMPLETED", finishedAt: new Date() },
    });
    this.emitJob(completed, "job.updated");

    const decided = await this.prisma.pendingAction.findMany({
      where: { jobId: job.id },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    const turnInput = (job.input ?? {}) as Record<string, unknown>;
    const resume = await this.prisma.workflowJob.create({
      data: {
        workspaceId: job.workspaceId,
        sessionId: job.sessionId,
        workflowName: "agent-resume",
        status: "QUEUED",
        correlationId: job.correlationId,
        input: {
          messageId: (turnInput["messageId"] as string | undefined) ?? null,
          language: (turnInput["language"] as string | undefined) ?? "sr",
          userText: "",
          attachments: [],
          resumeActionIds: decided.map((item) => item.id),
        },
      },
    });
    this.emitJob(resume, "job.queued");
    await this.workflowQueue.enqueue("agent-resume", resume.id, {
      workspaceId: resume.workspaceId,
      sessionId: resume.sessionId,
      jobId: resume.id,
      correlationId: resume.correlationId,
    });
  }

  private async resolveCase(
    workspaceId: string,
    reference: string,
  ): Promise<CaseMatch> {
    const ref = reference.trim();
    const matches = await this.prisma.case.findMany({
      where: {
        workspaceId,
        OR: [
          { caseNumber: { contains: ref, mode: "insensitive" } },
          { name: { contains: ref, mode: "insensitive" } },
          { externalReference: { contains: ref, mode: "insensitive" } },
        ],
      },
      include: { client: { select: { displayName: true } } },
      orderBy: { updatedAt: "desc" },
      take: CASE_CANDIDATES,
    });
    const exact = matches.find(
      (item) => item.caseNumber.toLowerCase() === ref.toLowerCase(),
    );
    if (exact) return exact;
    if (matches.length === 1) return matches[0];
    if (!matches.length) {
      throw new InvalidProposal(`Nema predmeta za „${ref}“.`);
    }
    throw new InvalidProposal(
      `Više predmeta odgovara „${ref}“: ${matches
        .map((item) => `${item.caseNumber} (${item.name})`)
        .join("; ")}. Navedite broj predmeta.`,
    );
  }

  private async linkedCase(scope: AssistantTurnScope): Promise<CaseMatch> {
    const caseId = await this.matterLink.sessionCaseId(
      scope.workspaceId,
      scope.sessionId,
    );
    const linked = caseId
      ? await this.prisma.case.findFirst({
          where: { id: caseId, workspaceId: scope.workspaceId },
          include: { client: { select: { displayName: true } } },
        })
      : null;
    if (!linked) {
      throw new InvalidProposal(
        "Razgovor nije povezan sa predmetom. Navedite broj ili naziv predmeta.",
      );
    }
    return linked;
  }

  private async reload(id: string): Promise<PendingActionRow> {
    return this.prisma.pendingAction.findUniqueOrThrow({ where: { id } });
  }

  private emit(
    action: PendingActionRow,
    type: "confirmation.required" | "confirmation.updated",
  ): void {
    const summary = toPendingAction(action);
    this.events.emit({
      type,
      workspaceId: action.workspaceId,
      sessionId: action.sessionId,
      correlationId: action.correlationId,
      createdAt: new Date().toISOString(),
      pendingAction: summary,
    } satisfies ChatStreamEvent);
  }

  private emitJob(
    job: Parameters<typeof toJob>[0],
    type: "job.queued" | "job.updated",
  ): void {
    const mapped = toJob(job);
    this.events.emit({
      type,
      workspaceId: job.workspaceId,
      sessionId: job.sessionId,
      correlationId: job.correlationId,
      createdAt: mapped.updatedAt,
      job: mapped,
    });
  }
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${Number(day)}.${Number(month)}.${year}.`;
}

function displayName(
  user: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null,
): string | null {
  if (!user) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
