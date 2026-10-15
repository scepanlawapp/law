import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type {
  AssistantPermissionMode,
  ChatStreamEvent,
  PendingActionMode,
  PendingActionSummary,
} from "@law/api-interfaces";
import {
  ActivitiesTasksDeadlinesService,
  CreateDeadlineDto,
  CreateEventDto,
  CreateTaskDto,
  UpdateEventDto,
} from "@law/activities-tasks-deadlines";
import { CreateWorkEntryDto, WorkEntriesService } from "@law/work-entries";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PlatformPrismaService } from "@law/core";
import { digitsOnly, singleIsoDate } from "@law/document-intelligence";
import type {
  ActionProposalResult,
  AssistantActionRequest,
  AssistantEventLookup,
  AssistantTurnScope,
} from "@law/mastra";
import { Prisma } from "@prisma/client";
import { AssistantDocumentReadsService } from "./assistant-document-reads.service";
import { runAsMember } from "./assistant-actor";
import { ChatEventBus } from "./chat.events";
import {
  clientEmptyFillFields,
  matchClientFields,
  type ClientFactInput,
  type ClientFieldConflict,
  type ClientFieldSkip,
  type ClientFieldSnapshot,
  type ClientFillField,
  type ClientFillItem,
} from "./client-fact-match";
import {
  toJob,
  toPendingAction,
  UNDO_WINDOW_MS,
  UNDOABLE_ACTIONS,
} from "./chat.mappers";
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
const OFFICE_TIME_ZONE = "Europe/Belgrade";
const DEFAULT_EVENT_MINUTES = 60;
const PARTICIPANT_CANDIDATES = 5;
const CONFLICT_LINES = 5;
const EVENT_CANDIDATES = 5;
const EVENT_CHANGE_INCLUDE = {
  clients: {
    select: { clientId: true, client: { select: { displayName: true } } },
  },
  assignees: { select: { userId: true } },
  attendees: {
    select: { clientContactId: true, displayName: true, email: true },
  },
} as const;
const MAX_BATCH_ENTRIES = 10;
type ActionType = AssistantActionRequest["type"];
/**
 * Modes each action supports besides the card. MANUAL needs a dialog that can
 * save the action; AUTO is withheld where a mistake is costly or final.
 */
const MODE_POLICY: Record<ActionType, { form: boolean; auto: boolean }> = {
  link_case: { form: false, auto: true },
  // A missed procedural deadline is a malpractice risk: never saved unseen.
  create_deadline: { form: true, auto: false },
  create_tasks_from_brief: { form: false, auto: true },
  update_client_from_document: { form: false, auto: true },
  create_event: { form: true, auto: true },
  reschedule_event: { form: true, auto: true },
  // Cancelling cannot be undone.
  cancel_event: { form: false, auto: false },
  create_task: { form: true, auto: true },
  log_work_entry: { form: true, auto: true },
  // No dialog edits several entries; automatic entries are only proposed.
  log_work_entries: { form: false, auto: true },
};
/** The DTO a saved form is validated against, by action type. */
const FORM_DTOS: Partial<Record<ActionType, new () => object>> = {
  create_event: CreateEventDto,
  reschedule_event: UpdateEventDto,
  create_task: CreateTaskDto,
  create_deadline: CreateDeadlineDto,
  log_work_entry: CreateWorkEntryDto,
};
/** Fields a user may add in the form although the proposal left them empty. */
const FORM_OPTIONAL_KEYS = [
  "description",
  "location",
  "caseId",
  "clientId",
  "dueDate",
  "dueAt",
];
/** Payload keys a form does not show; they never count as an edit. */
const FORM_HIDDEN_KEYS = new Set([
  "eventId",
  "timeZone",
  "attendees",
  "source",
  "aiParsed",
  "sourceDescription",
  "isAllDay",
]);
const MODE_BY_PERMISSION: Record<AssistantPermissionMode, PendingActionMode> = {
  MANUAL: "FORM",
  ASK: "CARD",
  AUTO: "AUTO",
};
const EVENT_TYPE_LABELS: Record<string, string> = {
  MEETING: "sastanak",
  CALL: "poziv",
  HEARING: "ročište",
  OTHER: "ostalo",
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "nizak",
  NORMAL: "normalan",
  HIGH: "visok",
  URGENT: "hitno",
};

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
  /** Something the user should look at (e.g. a calendar overlap): never saved automatically. */
  hasWarnings?: boolean;
};

type Participant =
  | { kind: "USER"; id: string; label: string }
  | { kind: "CLIENT"; id: string; label: string }
  | {
      kind: "CONTACT";
      id: string;
      clientId: string;
      displayName: string;
      email: string | null;
      label: string;
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

/** Line the context builder adds when case documents can fill empty client fields. */
export const CLIENT_UPDATE_HINT =
  "Dokumenti predmeta sadrže podatke koji mogu dopuniti klijenta (propose_client_update_from_document).";

const CLIENT_FIELD_LABELS: Record<ClientFillField, string> = {
  jmbg: "JMBG",
  firstName: "Ime",
  lastName: "Prezime",
  registrationNumber: "Matični broj",
  taxNumber: "PIB",
  address: "Adresa",
  identificationDocument: "Identifikaciona isprava",
};
const SCALAR_CLIENT_FIELDS = new Set<ClientFillField>([
  "jmbg",
  "firstName",
  "lastName",
  "registrationNumber",
  "taxNumber",
]);
const IDENTIFIER_FACT_FIELDS = new Set([
  "jmbg",
  "registrationNumber",
  "taxNumber",
]);
const DATE_FACT_FIELDS = new Set(["dateOfBirth", "issuedDate", "expiryDate"]);
const IDENTIFICATION_LABELS: Record<string, string> = {
  LICNA_KARTA: "Lična karta",
  PASSPORT: "Pasoš",
};
const SOURCE_UNAVAILABLE_MESSAGE =
  "Dokument više nije dostupan asistentu ili nije povezan sa klijentom.";
const DOC_REF_PREFIX = "doc:";
const ATTACHMENT_REF_PREFIX = "att:";

const CLIENT_SNAPSHOT_SELECT = {
  id: true,
  type: true,
  displayName: true,
  firstName: true,
  lastName: true,
  jmbg: true,
  registrationNumber: true,
  taxNumber: true,
  addresses: { select: { id: true } },
  identificationDocuments: { select: { number: true } },
} as const;

type ClientRow = {
  id: string;
  type: "INDIVIDUAL" | "ORGANIZATION";
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  jmbg: string | null;
  registrationNumber: string | null;
  taxNumber: string | null;
  addresses: Array<{ id: string }>;
  identificationDocuments: Array<{ number: string }>;
};

function toSnapshot(client: ClientRow): ClientFieldSnapshot {
  return {
    type: client.type,
    firstName: client.firstName,
    lastName: client.lastName,
    jmbg: client.jmbg,
    registrationNumber: client.registrationNumber,
    taxNumber: client.taxNumber,
    addressCount: client.addresses.length,
    identificationNumbers: client.identificationDocuments.map(
      (document) => document.number,
    ),
  };
}

/** The reads service returns facts as extracted; identifiers and dates are normalized here. */
function toFactInput(fact: {
  field: string;
  value: string;
  quote: string;
}): ClientFactInput {
  const normalizedValue = IDENTIFIER_FACT_FIELDS.has(fact.field)
    ? digitsOnly(fact.value) || null
    : DATE_FACT_FIELDS.has(fact.field)
      ? singleIsoDate(fact.value)
      : null;
  return { ...fact, normalizedValue };
}

function conflictWarnings(
  conflicts: ClientFieldConflict[],
  documentSide: string,
): string[] {
  return conflicts.map(
    (conflict) =>
      `Upozorenje: ${CLIENT_FIELD_LABELS[conflict.field]} u dokumentu (${conflict.found}) razlikuje se od upisanog (${conflict.current}); ${documentSide}`,
  );
}

function skippedNotes(skipped: ClientFieldSkip[]): string[] {
  return skipped.map(
    (item) =>
      `Preskočeno: ${CLIENT_FIELD_LABELS[item.field]} (${item.reason}).`,
  );
}

function fillDetail(item: ClientFillItem): string {
  const source = `izvor: „${item.quote}“`;
  if (item.identificationDocument) {
    const document = item.identificationDocument;
    const parts = [
      document.issuedDate ? `izdata ${formatDate(document.issuedDate)}` : null,
      document.expiredDate
        ? `važi do ${formatDate(document.expiredDate)}`
        : null,
      `država ${document.country}`,
    ].filter(Boolean);
    return `${IDENTIFICATION_LABELS[document.type] ?? document.type} br. ${document.number} (${parts.join(", ")}; ${source})`;
  }
  return `${CLIENT_FIELD_LABELS[item.field]}: ${item.value} (${source})`;
}

/** Today's date in the office's time zone (YYYY-MM-DD). */
export function belgradeToday(now = new Date()): string {
  return BELGRADE_DATE.format(now);
}

/** UTC instant of a wall-clock date and time (YYYY-MM-DD, HH:mm) in Belgrade. */
export function belgradeLocalToDate(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  // The zone's offset at that instant; one correction pass is exact outside the DST gap.
  const offset = (instant: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: OFFICE_TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(instant));
    const value = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value);
    return (
      Date.UTC(
        value("year"),
        value("month") - 1,
        value("day"),
        value("hour"),
        value("minute"),
      ) - instant
    );
  };
  const guess = wallClockAsUtc - offset(wallClockAsUtc);
  return new Date(wallClockAsUtc - offset(guess));
}

const BELGRADE_TIME = new Intl.DateTimeFormat("sr-Latn-RS", {
  timeZone: OFFICE_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

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
    @Optional() private readonly documents?: AssistantDocumentReadsService,
    @Optional() private readonly workEntries?: WorkEntriesService,
  ) {}

  /**
   * Stores a proposal in the conversation's permission mode. `forceCard` keeps
   * the approval card (deadline detection proposes several at once).
   */
  async propose(
    scope: AssistantTurnScope,
    request: AssistantActionRequest,
    options: { forceCard?: boolean } = {},
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
    const mode = options.forceCard
      ? "CARD"
      : await this.pendingMode(scope, proposal);
    const idempotencyKey = createHash("sha256")
      .update(
        `${scope.jobId}|${proposal.actionType}|${stableStringify(proposal.payload)}${
          mode === "CARD" ? "" : `|${mode}`
        }`,
      )
      .digest("hex");
    const existing = await this.prisma.pendingAction.findUnique({
      where: { idempotencyKey },
    });
    if (existing) return proposalResult(existing);

    const now = new Date();
    const row = await this.prisma.pendingAction.create({
      data: {
        workspaceId: scope.workspaceId,
        sessionId: scope.sessionId,
        jobId: scope.jobId,
        correlationId: scope.correlationId,
        actionType: proposal.actionType,
        payload: proposal.payload as Prisma.InputJsonValue,
        summary: proposal.summary,
        details: proposal.details,
        mode,
        idempotencyKey,
        expiresAt: new Date(now.getTime() + EXPIRY_MS),
        // AUTO: the conversation owner's standing permission is the decision.
        ...(mode === "AUTO"
          ? {
              status: "EXECUTING" as const,
              decidedByUserId: scope.userId,
              decidedAt: now,
            }
          : {}),
      },
    });
    if (mode !== "AUTO") {
      this.emit(row, "confirmation.required");
      return proposalResult(row);
    }

    await this.runAndRecord(row, () =>
      this.asUser(scope, String(scope.userId), () =>
        this.execute(row, String(scope.userId)),
      ),
    );
    const executed = await this.reload(row.id);
    this.emit(executed, "confirmation.required");
    return proposalResult(executed);
  }

  /**
   * MANUAL mode: the user saved the prefilled form. The edited values are
   * validated like the domain endpoint would, executed as they are, and the
   * agent resumes as after an approval.
   */
  async completeForm(input: {
    workspaceId: string;
    userId: string;
    actionId: string;
    body: unknown;
  }): Promise<PendingActionSummary> {
    const action = await this.requireAction(input.workspaceId, input.actionId);
    const dto = FORM_DTOS[action.actionType as ActionType];
    if (action.mode !== "FORM" || !dto) {
      throw new BadRequestException("This action is not a prefilled form");
    }
    const form = await validForm(dto, input.body);
    if (action.status !== "PENDING") return toPendingAction(action);
    const now = new Date();
    if (action.expiresAt <= now) return this.expire(action);

    const claimed = await this.prisma.pendingAction.updateMany({
      where: { id: action.id, status: "PENDING" },
      data: {
        status: "EXECUTING",
        decidedByUserId: input.userId,
        decidedAt: now,
      },
    });
    if (claimed.count === 0) {
      return toPendingAction(await this.reload(action.id));
    }
    const proposed = (action.payload ?? {}) as Record<string, unknown>;
    // The form cannot change which record it edits.
    const payload =
      action.actionType === "reschedule_event"
        ? { ...form, eventId: proposed["eventId"] }
        : action.actionType === "log_work_entry"
          ? { ...form, source: "QUICK_CAPTURE", aiParsed: true }
          : form;
    // Defaults the dialog adds (e.g. a work treatment) are not edits.
    const keys = new Set([...Object.keys(proposed), ...FORM_OPTIONAL_KEYS]);
    const edited =
      formFingerprint(proposed, keys) !== formFingerprint(payload, keys);
    await this.runAndRecord(action, async () => {
      const result = (await this.execute(
        { ...action, payload: payload as unknown as Prisma.JsonValue },
        input.userId,
      )) as Prisma.InputJsonObject;
      return { ...result, edited };
    });
    const decided = await this.reload(action.id);
    this.emit(decided, "confirmation.updated");
    await this.afterDecision(decided);
    return toPendingAction(decided);
  }

  /**
   * Reverts an automatic save for the conversation owner within 24 hours:
   * events and tasks are cancelled, a move restores the previous time, and
   * proposed work entries are deleted. A record that has moved on since (a
   * confirmed entry, a started task, an event changed again) is refused.
   */
  async undo(input: {
    workspaceId: string;
    userId: string;
    actionId: string;
  }): Promise<PendingActionSummary> {
    const action = await this.requireAction(input.workspaceId, input.actionId);
    if (action.undoneAt) return toPendingAction(action);
    if (
      action.mode !== "AUTO" ||
      action.status !== "APPROVED" ||
      !UNDOABLE_ACTIONS.has(action.actionType)
    ) {
      throw new BadRequestException("Ova izmena se ne može poništiti.");
    }
    const session = await this.prisma.chatSession.findFirst({
      where: { id: action.sessionId, workspaceId: input.workspaceId },
      select: { createdByUserId: true },
    });
    if (session?.createdByUserId !== input.userId) {
      throw new ForbiddenException("Samo vlasnik razgovora može poništiti izmenu.");
    }
    const now = new Date();
    const savedAt = action.decidedAt ?? action.createdAt;
    if (now.getTime() - savedAt.getTime() > UNDO_WINDOW_MS) {
      throw new BadRequestException("Rok od 24 sata za poništavanje je istekao.");
    }
    // Atomic claim: a double click undoes once.
    const claimed = await this.prisma.pendingAction.updateMany({
      where: { id: action.id, undoneAt: null },
      data: { undoneAt: now, undoneByUserId: input.userId },
    });
    if (claimed.count === 0) return toPendingAction(await this.reload(action.id));
    try {
      await this.revert(action);
    } catch (error) {
      await this.prisma.pendingAction.update({
        where: { id: action.id },
        data: { undoneAt: null, undoneByUserId: null },
      });
      const message = error instanceof Error ? error.message : String(error);
      throw new ConflictException(`Poništavanje nije uspelo: ${message}`);
    }
    const undone = await this.reload(action.id);
    this.emit(undone, "confirmation.updated");
    return toPendingAction(undone);
  }

  /** Lines for the agent: automatic saves of this conversation the user undid. */
  async undoneNote(workspaceId: string, sessionId: string): Promise<string | null> {
    const undone = await this.prisma.pendingAction.findMany({
      where: { workspaceId, sessionId, undoneAt: { not: null } },
      orderBy: { undoneAt: "desc" },
      select: { summary: true },
      take: 5,
    });
    return undone.length
      ? [
          "Korisnik je poništio ove automatske izmene (više ne postoje):",
          ...undone.map((item) => `- ${item.summary}`),
        ].join("\n")
      : null;
  }

  private async revert(action: PendingActionRow): Promise<void> {
    const result = (action.result ?? {}) as Record<string, unknown>;
    const ids = (key: string) =>
      ((result[key] as string[] | undefined) ?? []).filter(Boolean);
    switch (action.actionType) {
      case "create_event": {
        if (!this.work) throw new Error("Events are not available");
        const eventId = String(result["eventId"]);
        const event = await this.prisma.event.findFirst({
          where: { id: eventId, workspaceId: action.workspaceId },
          select: { status: true },
        });
        if (event?.status !== "SCHEDULED") {
          throw new Error("događaj više nije zakazan.");
        }
        await this.work.transitionEvent(eventId, "CANCELLED");
        return;
      }
      case "reschedule_event": {
        if (!this.work) throw new Error("Events are not available");
        const previous = result["previous"] as Record<string, unknown> | undefined;
        const moved = (action.payload ?? {}) as Record<string, unknown>;
        if (!previous) throw new Error("prethodni termin nije sačuvan.");
        const current = await this.prisma.event.findFirst({
          where: { id: String(previous["eventId"]), workspaceId: action.workspaceId },
          select: { status: true, startsAt: true, endsAt: true },
        });
        if (
          current?.status !== "SCHEDULED" ||
          current.startsAt.toISOString() !== String(moved["startsAt"]) ||
          current.endsAt.toISOString() !== String(moved["endsAt"])
        ) {
          throw new Error("događaj je u međuvremenu promenjen.");
        }
        const { eventId, ...fields } = previous;
        await this.work.updateEvent(
          String(eventId),
          Object.assign(new UpdateEventDto(), fields),
        );
        return;
      }
      case "create_task":
      case "create_tasks_from_brief": {
        if (!this.work) throw new Error("Tasks are not available");
        const taskIds =
          action.actionType === "create_task"
            ? [String(result["taskId"])]
            : ids("taskIds");
        const tasks = await this.prisma.task.findMany({
          where: { id: { in: taskIds }, workspaceId: action.workspaceId },
          select: { id: true, status: true },
        });
        if (tasks.length !== taskIds.length || tasks.some((task) => task.status !== "TODO")) {
          throw new Error("zadatak je u međuvremenu započet ili promenjen.");
        }
        for (const task of tasks) {
          await this.work.transitionTask(task.id, "CANCELLED");
        }
        return;
      }
      case "log_work_entry":
      case "log_work_entries": {
        if (!this.workEntries) throw new Error("Work entries are not available");
        const entryIds =
          action.actionType === "log_work_entry"
            ? [String(result["workEntryId"])]
            : ids("workEntryIds");
        const entries = await this.prisma.workEntry.findMany({
          where: { id: { in: entryIds }, workspaceId: action.workspaceId },
          select: { id: true, status: true },
        });
        if (
          entries.length !== entryIds.length ||
          entries.some((entry) => entry.status !== "PROPOSED")
        ) {
          throw new Error("upis rada je u međuvremenu potvrđen ili obrisan.");
        }
        for (const entry of entries) await this.workEntries.remove(entry.id);
        return;
      }
      default:
        throw new Error(`Unsupported undo for ${action.actionType}`);
    }
  }

  /** FORM / CARD / AUTO for a proposal, from the conversation's permission mode. */
  private async pendingMode(
    scope: AssistantTurnScope,
    proposal: Proposal,
  ): Promise<PendingActionMode> {
    const policy = MODE_POLICY[proposal.actionType];
    if (!policy.form && !policy.auto) return "CARD";
    const session = await this.prisma.chatSession.findFirst({
      where: { id: scope.sessionId, workspaceId: scope.workspaceId },
      select: {
        permissionMode: true,
        createdBy: { select: { settings: { select: { assistantPermissionMode: true } } } },
      },
    });
    const permission: AssistantPermissionMode =
      session?.permissionMode ??
      session?.createdBy?.settings?.assistantPermissionMode ??
      "ASK";
    const mode = MODE_BY_PERMISSION[permission];
    if (mode === "FORM" && !policy.form) return "CARD";
    // AUTO needs someone to act as, and never skips a warning.
    if (
      mode === "AUTO" &&
      (!policy.auto || !scope.userId || proposal.hasWarnings)
    ) {
      return "CARD";
    }
    return mode;
  }

  /** Runs an action with the user as the workspace actor (the worker runs as the system). */
  private asUser<T>(
    scope: AssistantTurnScope,
    userId: string,
    run: () => Promise<T>,
  ): Promise<T> {
    return runAsMember(this.prisma, scope.workspaceId, userId, run);
  }

  /** Executes a claimed (EXECUTING) action and stores APPROVED or FAILED. */
  private async runAndRecord(
    action: PendingActionRow,
    run: () => Promise<Prisma.InputJsonValue>,
  ): Promise<void> {
    try {
      const result = await run();
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

  private async requireAction(
    workspaceId: string,
    actionId: string,
  ): Promise<PendingActionRow> {
    const action = await this.prisma.pendingAction.findFirst({
      where: { id: actionId, workspaceId },
    });
    const session = action
      ? await this.prisma.chatSession.findFirst({
          where: { id: action.sessionId, workspaceId, isDeleted: false },
          select: { id: true },
        })
      : null;
    if (!action || !session) {
      throw new NotFoundException("Pending action not found");
    }
    return action;
  }

  private async expire(action: PendingActionRow): Promise<PendingActionSummary> {
    await this.prisma.pendingAction.updateMany({
      where: { id: action.id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    const expired = await this.reload(action.id);
    this.emit(expired, "confirmation.updated");
    await this.afterDecision(expired);
    return toPendingAction(expired);
  }

  async decide(input: {
    workspaceId: string;
    userId: string;
    actionId: string;
    decision: "APPROVE" | "DECLINE";
    reason?: string;
  }): Promise<PendingActionSummary> {
    const action = await this.requireAction(input.workspaceId, input.actionId);
    // Already decided (double click, second tab): report the current state.
    if (action.status !== "PENDING") return toPendingAction(action);

    const now = new Date();
    if (action.expiresAt <= now) return this.expire(action);

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
      await this.runAndRecord(action, () => this.execute(action, input.userId));
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
            ...(request.description?.trim()
              ? { description: request.description.trim() }
              : {}),
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
      case "update_client_from_document":
        return this.clientUpdateProposal(scope, request);
      case "create_event":
        return this.eventProposal(scope, request);
      case "reschedule_event":
        return this.rescheduleProposal(scope, request);
      case "cancel_event":
        return this.cancelProposal(scope, request);
      case "create_task":
        return this.taskProposal(scope, request);
      case "log_work_entry":
        return this.workEntryProposal(scope, request);
      case "log_work_entries":
        return this.workEntriesProposal(scope, request);
    }
  }

  /**
   * A calendar event for the conversation's owner. Every name must match one
   * record; overlapping scheduled events are listed as warnings.
   */
  private async eventProposal(
    scope: AssistantTurnScope,
    request: Extract<AssistantActionRequest, { type: "create_event" }>,
  ): Promise<Proposal> {
    const date = request.date.trim();
    const time = request.startTime.trim();
    if (!isIsoDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      throw new InvalidProposal(
        `Datum i vreme „${date} ${time}“ nisu ispravni (YYYY-MM-DD, HH:mm).`,
      );
    }
    const startsAt = belgradeLocalToDate(date, time);
    if (startsAt.getTime() <= Date.now()) {
      throw new InvalidProposal(
        `Termin ${formatDate(date)} u ${time} je u prošlosti.`,
      );
    }
    const minutes = request.durationMinutes ?? DEFAULT_EVENT_MINUTES;
    const endsAt = new Date(startsAt.getTime() + minutes * 60_000);

    const participants: Participant[] = [];
    for (const reference of request.participants ?? []) {
      const participant = await this.resolveParticipant(scope, reference);
      if (participant && !participants.some((item) => item.id === participant.id)) {
        participants.push(participant);
      }
    }
    const colleagueIds = participants
      .filter((item) => item.kind === "USER")
      .map((item) => item.id);
    const clientIds = unique(
      participants.flatMap((item) =>
        item.kind === "CLIENT" ? [item.id] : item.kind === "CONTACT" ? [item.clientId] : [],
      ),
    );
    const attendees = participants.flatMap((item) =>
      item.kind === "CONTACT"
        ? [
            {
              clientContactId: item.id,
              displayName: item.displayName,
              ...(item.email ? { email: item.email } : {}),
            },
          ]
        : [],
    );

    // An explicit case always applies; the linked case only when it belongs to the same client.
    let target: CaseMatch | null = request.caseReference
      ? await this.resolveCase(scope.workspaceId, request.caseReference)
      : await this.optionalLinkedCase(scope);
    if (
      target &&
      !request.caseReference &&
      clientIds.length &&
      !clientIds.includes(target.clientId)
    ) {
      target = null;
    }
    if (target && !clientIds.includes(target.clientId)) {
      clientIds.push(target.clientId);
    }

    const assigneeUserIds = unique([
      ...(scope.userId ? [scope.userId] : []),
      ...colleagueIds,
    ]);
    const conflicts = await this.eventConflicts(
      scope.workspaceId,
      assigneeUserIds,
      startsAt,
      endsAt,
    );
    const type = request.eventType ?? "MEETING";
    const title = request.title.trim();
    const location = request.location?.trim() || undefined;
    const description = request.description?.trim() || undefined;
    return {
      actionType: "create_event",
      payload: {
        type,
        title,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        timeZone: OFFICE_TIME_ZONE,
        assigneeUserIds,
        clientIds,
        attendees,
        ...(target ? { caseId: target.id } : {}),
        ...(location ? { location } : {}),
        ...(description ? { description } : {}),
      },
      summary: `Novi događaj: ${title} — ${formatDate(date)} u ${time}`,
      details: [
        `Vrsta: ${EVENT_TYPE_LABELS[type] ?? type}, ${time}–${BELGRADE_TIME.format(endsAt)}`,
        ...(participants.length
          ? [`Učesnici: ${participants.map((item) => item.label).join(", ")}`]
          : []),
        ...(target ? [`Predmet: ${target.caseNumber} – ${target.name}`] : []),
        ...(location ? [`Mesto: ${location}`] : []),
        ...(description ? [`Opis: ${description}`] : []),
        ...conflicts,
      ],
      hasWarnings: conflicts.length > 0,
    };
  }

  /**
   * One colleague, client, or client contact person for a name. Zero or
   * several matches are refused with the candidates, so the agent asks.
   */
  private async resolveParticipant(
    scope: AssistantTurnScope,
    reference: string,
    options: {
      kinds?: ReadonlyArray<Participant["kind"]>;
      /** The current user may be named (an assignee or performer). */
      includeSelf?: boolean;
    } = {},
  ): Promise<Participant | null> {
    const kinds = options.kinds ?? ["USER", "CLIENT", "CONTACT"];
    const ref = reference.trim();
    const tokens = ref.split(/\s+/).filter((token) => token.length > 1);
    if (!tokens.length) return null;
    const nameMatch = (fields: string[]) => ({
      AND: tokens.map((token) => ({
        OR: fields.map((field) => ({
          [field]: { contains: token, mode: "insensitive" as const },
        })),
      })),
    });
    const [users, clients, contacts] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          ...nameMatch(["firstName", "lastName", "email"]),
          memberships: {
            some: { workspaceId: scope.workspaceId, status: "ACTIVE" },
          },
        },
        select: { id: true, firstName: true, lastName: true, email: true },
        take: PARTICIPANT_CANDIDATES,
      }),
      this.prisma.client.findMany({
        where: {
          workspaceId: scope.workspaceId,
          OR: [
            nameMatch(["displayName"]),
            { clientNumber: { equals: ref, mode: "insensitive" } },
          ],
        },
        select: { id: true, displayName: true, clientNumber: true },
        take: PARTICIPANT_CANDIDATES,
      }),
      this.prisma.clientContact.findMany({
        where: {
          ...nameMatch(["firstName", "lastName"]),
          status: "ACTIVE",
          client: { workspaceId: scope.workspaceId },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          clientId: true,
          client: { select: { displayName: true } },
        },
        take: PARTICIPANT_CANDIDATES,
      }),
    ]);
    const allCandidates: Array<Participant & { name: string }> = [
      ...users
        .filter((user) => options.includeSelf || user.id !== scope.userId)
        .map((user) => {
          const name = displayName(user) ?? user.email;
          const role = user.id === scope.userId ? "vi" : "kolega";
          return { kind: "USER" as const, id: user.id, name, label: `${name} (${role})` };
        }),
      ...clients.map((client) => ({
        kind: "CLIENT" as const,
        id: client.id,
        name: client.displayName,
        label: `${client.displayName} (klijent ${client.clientNumber})`,
      })),
      ...contacts.map((contact) => {
        const name = `${contact.firstName} ${contact.lastName}`.trim();
        return {
          kind: "CONTACT" as const,
          id: contact.id,
          clientId: contact.clientId,
          displayName: name,
          email: contact.email,
          name,
          label: `${name} (kontakt osoba klijenta ${contact.client.displayName})`,
        };
      }),
    ];
    const candidates = allCandidates.filter((item) => kinds.includes(item.kind));
    if (!candidates.length) {
      throw new InvalidProposal(
        `Nema ${kinds.includes("USER") ? (kinds.length === 1 ? "kolege" : "kolege, klijenta ni kontakt osobe") : "klijenta ni kontakt osobe"} za „${ref}“. Proverite ime.`,
      );
    }
    const exact = candidates.filter(
      (item) => item.name.toLowerCase() === ref.toLowerCase(),
    );
    const match =
      candidates.length === 1 ? candidates[0] : exact.length === 1 ? exact[0] : null;
    if (match) return match;
    throw new InvalidProposal(
      `Više osoba odgovara „${ref}“: ${candidates
        .slice(0, PARTICIPANT_CANDIDATES)
        .map((item) => item.label)
        .join("; ")}. Pitajte korisnika na koga misli.`,
    );
  }

  /** Client for a name (a contact person stands for their client), with its display name. */
  private async resolveClient(
    scope: AssistantTurnScope,
    reference: string | undefined,
  ): Promise<{ id: string; label: string } | null> {
    if (!reference?.trim()) return null;
    const match = await this.resolveParticipant(scope, reference, {
      kinds: ["CLIENT", "CONTACT"],
    });
    if (!match) return null;
    if (match.kind === "CONTACT") {
      const client = await this.prisma.client.findFirst({
        where: { id: match.clientId, workspaceId: scope.workspaceId },
        select: { displayName: true },
      });
      return { id: match.clientId, label: client?.displayName ?? match.label };
    }
    return { id: match.id, label: match.label };
  }

  /** A colleague by name, or the current user when no name is given. */
  private async resolveUser(
    scope: AssistantTurnScope,
    reference: string | undefined,
    missing: string,
  ): Promise<{ id: string; label: string }> {
    if (reference?.trim()) {
      const match = await this.resolveParticipant(scope, reference, {
        kinds: ["USER"],
        includeSelf: true,
      });
      if (match) return { id: match.id, label: match.label };
    }
    if (!scope.userId) throw new InvalidProposal(missing);
    const user = await this.prisma.user.findFirst({
      where: { id: scope.userId },
      select: { firstName: true, lastName: true, email: true },
    });
    return { id: scope.userId, label: `${displayName(user) ?? "vi"} (vi)` };
  }

  /**
   * Case for a task or work entry: an explicit case must belong to the named
   * client; the linked case is used only when it does.
   */
  private async caseForClient(
    scope: AssistantTurnScope,
    caseReference: string | undefined,
    clientId: string | undefined,
  ): Promise<CaseMatch | null> {
    if (caseReference?.trim()) {
      const target = await this.resolveCase(scope.workspaceId, caseReference);
      if (clientId && target.clientId !== clientId) {
        throw new InvalidProposal(
          `Predmet ${target.caseNumber} pripada klijentu ${target.client.displayName}, ne navedenom klijentu.`,
        );
      }
      return target;
    }
    const linked = await this.optionalLinkedCase(scope);
    return linked && (!clientId || linked.clientId === clientId) ? linked : null;
  }

  private async taskProposal(
    scope: AssistantTurnScope,
    request: Extract<AssistantActionRequest, { type: "create_task" }>,
  ): Promise<Proposal> {
    const dueDate = request.dueDate?.trim();
    if (dueDate && !isIsoDate(dueDate)) {
      throw new InvalidProposal(`Datum „${dueDate}“ nije ispravan (YYYY-MM-DD).`);
    }
    if (dueDate && dueDate < belgradeToday()) {
      throw new InvalidProposal(`Rok zadatka ${formatDate(dueDate)} je u prošlosti.`);
    }
    const assignee = await this.resolveUser(
      scope,
      request.assignee,
      "Navedite kome je zadatak namenjen.",
    );
    const client = await this.resolveClient(scope, request.client);
    const target = await this.caseForClient(
      scope,
      request.caseReference,
      client?.id,
    );
    const clientId = target?.clientId ?? client?.id;
    const title = request.title.trim();
    const description = request.description?.trim() || undefined;
    const priority = request.priority ?? "NORMAL";
    return {
      actionType: "create_task",
      payload: {
        title,
        assigneeUserId: assignee.id,
        priority,
        ...(dueDate ? { dueDate } : {}),
        ...(target ? { caseId: target.id } : {}),
        ...(clientId ? { clientId } : {}),
        ...(description ? { description } : {}),
      },
      summary: `Novi zadatak: ${title}${dueDate ? ` — rok ${formatDate(dueDate)}` : ""}`,
      details: [
        `Izvršilac: ${assignee.label}`,
        ...(priority !== "NORMAL" ? [`Prioritet: ${PRIORITY_LABELS[priority] ?? priority}`] : []),
        ...(target
          ? [`Predmet: ${target.caseNumber} – ${target.name}`]
          : client
            ? [`Klijent: ${client.label}`]
            : []),
        ...(description ? [`Opis: ${description}`] : []),
      ],
    };
  }

  private async workEntryProposal(
    scope: AssistantTurnScope,
    request: Extract<AssistantActionRequest, { type: "log_work_entry" }>,
  ): Promise<Proposal> {
    const minutes = request.minutes;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      throw new InvalidProposal("Trajanje rada mora biti između 1 i 1440 minuta.");
    }
    const workDate = request.date?.trim() || belgradeToday();
    if (!isIsoDate(workDate)) {
      throw new InvalidProposal(`Datum „${workDate}“ nije ispravan (YYYY-MM-DD).`);
    }
    if (workDate > belgradeToday()) {
      throw new InvalidProposal(`Datum rada ${formatDate(workDate)} je u budućnosti.`);
    }
    const performer = await this.resolveUser(
      scope,
      request.performer,
      "Navedite ko je obavio rad.",
    );
    const client = await this.resolveClient(scope, request.client);
    const target = await this.caseForClient(
      scope,
      request.caseReference,
      client?.id,
    );
    const clientId = target?.clientId ?? client?.id;
    if (!clientId) {
      throw new InvalidProposal(
        "Za kog klijenta je rad? Navedite klijenta ili predmet.",
      );
    }
    const clientLabel =
      client?.label ?? (target ? target.client.displayName : clientId);
    const title = request.title.trim();
    const description = request.description?.trim() || undefined;
    return {
      actionType: "log_work_entry",
      payload: {
        title,
        minutes,
        workDate,
        clientId,
        userId: performer.id,
        source: "QUICK_CAPTURE",
        aiParsed: true,
        ...(target ? { caseId: target.id } : {}),
        ...(description ? { description } : {}),
      },
      summary: `Upis rada: ${title} — ${formatMinutes(minutes)}, ${formatDate(workDate)}`,
      details: [
        `Klijent: ${clientLabel}`,
        ...(target ? [`Predmet: ${target.caseNumber} – ${target.name}`] : []),
        `Izvršilac: ${performer.label}`,
        ...(description ? [`Opis: ${description}`] : []),
      ],
    };
  }

  /**
   * Several work entries in one proposal. Every entry must resolve; an error
   * names the entry, and nothing is proposed.
   */
  private async workEntriesProposal(
    scope: AssistantTurnScope,
    request: Extract<AssistantActionRequest, { type: "log_work_entries" }>,
  ): Promise<Proposal> {
    if (!request.entries.length || request.entries.length > MAX_BATCH_ENTRIES) {
      throw new InvalidProposal(
        `Navedite od 1 do ${MAX_BATCH_ENTRIES} stavki rada.`,
      );
    }
    const entries: Array<Record<string, unknown>> = [];
    const lines: string[] = [];
    const eventIds = new Set<string>();
    for (const [index, entry] of request.entries.entries()) {
      try {
        if ("eventRef" in entry) {
          const resolved = await this.meetingWorkEntry(scope, entry);
          if (eventIds.has(String(resolved.payload["eventId"]))) {
            throw new InvalidProposal("Isti sastanak je naveden dva puta.");
          }
          eventIds.add(String(resolved.payload["eventId"]));
          entries.push(resolved.payload);
          lines.push(resolved.line);
        } else {
          const proposal = await this.workEntryProposal(scope, {
            type: "log_work_entry",
            ...entry,
          });
          entries.push(proposal.payload);
          lines.push(
            `• ${proposal.payload["title"]} — ${formatMinutes(Number(proposal.payload["minutes"]))}, ${formatDate(String(proposal.payload["workDate"]))} (${proposal.details[0].replace(/^Klijent: /, "")})`,
          );
        }
      } catch (error) {
        if (error instanceof InvalidProposal) {
          throw new InvalidProposal(`Stavka ${index + 1}: ${error.message}`);
        }
        throw error;
      }
    }
    const total = entries.reduce((sum, item) => sum + Number(item["minutes"]), 0);
    return {
      actionType: "log_work_entries",
      payload: { entries },
      summary: `Upis rada: ${entries.length} ${entries.length === 1 ? "stavka" : "stavke"}, ukupno ${formatMinutes(total)}`,
      details: lines,
    };
  }

  /** A finished meeting of the owner that has no work entry yet. */
  private async meetingWorkEntry(
    scope: AssistantTurnScope,
    entry: { eventRef: string; minutes?: number; title?: string },
  ): Promise<{ payload: Record<string, unknown>; line: string }> {
    const eventId = entry.eventRef.startsWith("event:")
      ? entry.eventRef.slice("event:".length)
      : "";
    if (!scope.userId || !eventId) {
      throw new InvalidProposal(`Sastanak „${entry.eventRef}“ nije prepoznat.`);
    }
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        workspaceId: scope.workspaceId,
        status: { not: "CANCELLED" },
        OR: [
          { organizerUserId: scope.userId },
          { assignees: { some: { userId: scope.userId } } },
        ],
      },
      include: {
        clients: { select: { clientId: true, client: { select: { displayName: true } } } },
      },
    });
    if (!event) {
      throw new InvalidProposal("Sastanak nije pronađen u vašem kalendaru.");
    }
    if (event.endsAt.getTime() > Date.now()) {
      throw new InvalidProposal(`Sastanak „${event.title}“ još nije završen.`);
    }
    const logged = await this.prisma.workEntry.findFirst({
      where: { workspaceId: scope.workspaceId, eventId },
      select: { id: true },
    });
    if (logged) {
      throw new InvalidProposal(`Za sastanak „${event.title}“ rad je već upisan.`);
    }
    const minutes =
      entry.minutes ??
      Math.round((event.endsAt.getTime() - event.startsAt.getTime()) / 60_000);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      throw new InvalidProposal("Trajanje rada mora biti između 1 i 1440 minuta.");
    }
    const title = entry.title?.trim() || event.title;
    const workDate = belgradeToday(event.startsAt);
    // A meeting with one client bills that client; otherwise it is office time.
    const client = event.clients.length === 1 ? event.clients[0] : null;
    return {
      payload: {
        eventId,
        title,
        minutes,
        workDate,
        userId: scope.userId,
        aiParsed: true,
        ...(client
          ? { clientId: client.clientId, ...(event.caseId ? { caseId: event.caseId } : {}) }
          : {}),
      },
      line: `• ${title} — ${formatMinutes(minutes)}, ${formatDate(workDate)} (${client ? client.client.displayName : "bez klijenta, nenaplativo"})`,
    };
  }

  /**
   * One upcoming scheduled event of the conversation's owner, matched by what
   * the user said about it. Zero or several matches are refused with the
   * candidates, so the agent asks.
   */
  private async findEventForChange(
    scope: AssistantTurnScope,
    lookup: AssistantEventLookup,
  ) {
    if (!scope.userId) {
      throw new InvalidProposal("Nije poznato čiji kalendar treba promeniti.");
    }
    const date = lookup.date?.trim();
    const time = lookup.startTime?.trim();
    const title = lookup.title?.trim();
    const participant = lookup.participant?.trim();
    if (!date && !time && !title && !participant) {
      throw new InvalidProposal(
        "Navedite o kom događaju je reč (učesnik, datum, vreme ili naziv).",
      );
    }
    if (date && !isIsoDate(date)) {
      throw new InvalidProposal(`Datum „${date}“ nije ispravan (YYYY-MM-DD).`);
    }
    const tokens = (participant ?? "")
      .split(/\s+/)
      .filter((token) => token.length > 1);
    const nameMatch = (fields: string[]) => ({
      AND: tokens.map((token) => ({
        OR: fields.map((field) => ({
          [field]: { contains: token, mode: "insensitive" as const },
        })),
      })),
    });
    const now = new Date();
    const dayStart = date ? belgradeLocalToDate(date, "00:00") : null;
    const dayEnd = date ? belgradeLocalToDate(nextIsoDate(date), "00:00") : null;
    const events = await this.prisma.event.findMany({
      where: {
        workspaceId: scope.workspaceId,
        status: "SCHEDULED",
        startsAt: {
          gte: dayStart && dayStart > now ? dayStart : now,
          ...(dayEnd ? { lt: dayEnd } : {}),
        },
        AND: [
          {
            OR: [
              { organizerUserId: scope.userId },
              { assignees: { some: { userId: scope.userId } } },
            ],
          },
          ...(title
            ? [{ title: { contains: title, mode: "insensitive" as const } }]
            : []),
          ...(tokens.length
            ? [
                {
                  OR: [
                    nameMatch(["title"]),
                    { clients: { some: { client: nameMatch(["displayName"]) } } },
                    { attendees: { some: nameMatch(["displayName"]) } },
                    {
                      assignees: {
                        some: { user: nameMatch(["firstName", "lastName"]) },
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      include: EVENT_CHANGE_INCLUDE,
      orderBy: { startsAt: "asc" },
      take: 20,
    });
    const matches = time
      ? events.filter((event) => BELGRADE_TIME.format(event.startsAt) === time)
      : events;
    if (matches.length === 1) return matches[0];
    if (!matches.length) {
      throw new InvalidProposal(
        "Nisam našao takav zakazan događaj u vašem kalendaru. Proverite učesnika, datum ili vreme.",
      );
    }
    throw new InvalidProposal(
      `Više događaja odgovara: ${matches
        .slice(0, EVENT_CANDIDATES)
        .map(eventLabel)
        .join("; ")}. Pitajte korisnika na koji misli (datum i vreme).`,
    );
  }

  private async rescheduleProposal(
    scope: AssistantTurnScope,
    request: Extract<AssistantActionRequest, { type: "reschedule_event" }>,
  ): Promise<Proposal> {
    const newDate = request.newDate?.trim();
    const newTime = request.newStartTime?.trim();
    if (!newDate && !newTime && !request.durationMinutes) {
      throw new InvalidProposal("Navedite novi datum, vreme ili trajanje.");
    }
    if (newDate && !isIsoDate(newDate)) {
      throw new InvalidProposal(`Datum „${newDate}“ nije ispravan (YYYY-MM-DD).`);
    }
    if (newTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(newTime)) {
      throw new InvalidProposal(`Vreme „${newTime}“ nije ispravno (HH:mm).`);
    }
    const event = await this.findEventForChange(scope, request);
    const date = newDate ?? belgradeToday(event.startsAt);
    const time = newTime ?? BELGRADE_TIME.format(event.startsAt);
    const startsAt = belgradeLocalToDate(date, time);
    if (startsAt.getTime() <= Date.now()) {
      throw new InvalidProposal(`Termin ${formatDate(date)} u ${time} je u prošlosti.`);
    }
    const minutes =
      request.durationMinutes ??
      Math.round((event.endsAt.getTime() - event.startsAt.getTime()) / 60_000);
    const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
    const assigneeUserIds = unique([
      ...event.assignees.map((item) => item.userId),
    ]);
    const conflicts = await this.eventConflicts(
      scope.workspaceId,
      unique([event.organizerUserId, ...assigneeUserIds]),
      startsAt,
      endsAt,
      event.id,
    );
    return {
      actionType: "reschedule_event",
      payload: {
        ...eventUpdatePayload(event),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        assigneeUserIds,
      },
      summary: `Pomeranje: ${event.title} — ${formatDate(date)} u ${time}`,
      details: [
        `Bilo: ${eventWhen(event.startsAt, event.endsAt)}`,
        `Novo: ${formatDate(date)} ${time}–${BELGRADE_TIME.format(endsAt)}`,
        ...(event.clients.length
          ? [`Klijenti: ${event.clients.map((item) => item.client.displayName).join(", ")}`]
          : []),
        ...conflicts,
      ],
      hasWarnings: conflicts.length > 0,
    };
  }

  private async cancelProposal(
    scope: AssistantTurnScope,
    request: Extract<AssistantActionRequest, { type: "cancel_event" }>,
  ): Promise<Proposal> {
    const event = await this.findEventForChange(scope, request);
    return {
      actionType: "cancel_event",
      payload: { eventId: event.id },
      summary: `Otkazivanje: ${event.title} — ${eventWhen(event.startsAt, event.endsAt)}`,
      details: [
        ...(event.clients.length
          ? [`Klijenti: ${event.clients.map((item) => item.client.displayName).join(", ")}`]
          : []),
        "Otkazan događaj se ne može vratiti.",
      ],
    };
  }

  /** Scheduled events of these users that overlap the slot, as warning lines. */
  private async eventConflicts(
    workspaceId: string,
    userIds: string[],
    startsAt: Date,
    endsAt: Date,
    excludeEventId?: string,
  ): Promise<string[]> {
    if (!userIds.length) return [];
    const overlapping = await this.prisma.event.findMany({
      where: {
        workspaceId,
        ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
        status: "SCHEDULED",
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        OR: [
          { organizerUserId: { in: userIds } },
          { assignees: { some: { userId: { in: userIds } } } },
        ],
      },
      select: { title: true, startsAt: true, endsAt: true },
      orderBy: { startsAt: "asc" },
      take: CONFLICT_LINES,
    });
    return overlapping.map(
      (event) =>
        `⚠ Preklapa se sa: ${event.title} (${BELGRADE_TIME.format(event.startsAt)}–${BELGRADE_TIME.format(event.endsAt)})`,
    );
  }

  /**
   * Fills only EMPTY fields of the client the document is filed for, from one
   * subject of the document's facts. Facts come through the reads service, so a
   * document with AI access off is refused by construction.
   */
  private async clientUpdateProposal(
    scope: AssistantTurnScope,
    request: Extract<
      AssistantActionRequest,
      { type: "update_client_from_document" }
    >,
  ): Promise<Proposal> {
    const ref = request.documentRef.trim();
    if (ref.startsWith(ATTACHMENT_REF_PREFIX)) {
      throw new InvalidProposal(
        "Prilog još nije arhiviran u dokumente predmeta. Najpre ga sačuvajte u predmet, pa predložite dopunu klijenta.",
      );
    }
    if (
      !ref.startsWith(DOC_REF_PREFIX) ||
      ref.length === DOC_REF_PREFIX.length
    ) {
      throw new InvalidProposal(
        `Dokument „${ref}“ nije prepoznat. Koristite ref (doc:…) iz list_documents.`,
      );
    }
    if (!this.documents) {
      throw new InvalidProposal("Dokumenti trenutno nisu dostupni.");
    }
    const documentId = ref.slice(DOC_REF_PREFIX.length);
    const facts = await this.documents.getDocumentFacts(scope, { ref });
    if (facts.status !== "OK") throw new InvalidProposal(facts.message);
    const subject = facts.subjects.find(
      (item) => item.ref === ref && item.subjectKey === request.subjectKey,
    );
    if (!subject) {
      throw new InvalidProposal(
        facts.notIndexed.length
          ? "Dokument još nije obrađen, pa nema izdvojenih podataka."
          : `Dokument nema izdvojene podatke za subjekt „${request.subjectKey}“. Koristite get_document_facts.`,
      );
    }
    const links = await this.prisma.documentClient.findMany({
      where: { workspaceId: scope.workspaceId, documentId },
      select: { clientId: true },
    });
    if (links.length === 0) {
      throw new InvalidProposal(
        "Dokument nije povezan ni sa jednim klijentom. Povežite ga sa klijentom, pa predložite dopunu.",
      );
    }
    if (links.length > 1) {
      throw new InvalidProposal(
        "Dokument je povezan sa više klijenata, pa se ne zna čije podatke dopunjuje.",
      );
    }
    const client = (await this.prisma.client.findFirst({
      where: { id: links[0].clientId, workspaceId: scope.workspaceId },
      select: CLIENT_SNAPSHOT_SELECT,
    })) as ClientRow | null;
    if (!client) throw new InvalidProposal("Klijent dokumenta nije pronađen.");

    const match = matchClientFields(toSnapshot(client), {
      subjectType: subject.subjectType,
      documentKind: subject.documentKind,
      facts: subject.facts.map(toFactInput),
    });
    if (!match.matched) {
      throw new InvalidProposal(
        [
          `Podaci iz dokumenta ne odgovaraju klijentu ${client.displayName} (ime i prezime, JMBG, matični broj ili PIB se ne poklapaju), pa dopuna nije predložena.`,
          ...conflictWarnings(match.conflicts, "dopuna nije predložena."),
        ].join(" "),
      );
    }
    if (!match.fill.length) {
      throw new InvalidProposal(
        [
          `Klijent ${client.displayName} nema praznih polja koja ovaj dokument može da dopuni.`,
          ...skippedNotes(match.skipped),
          ...conflictWarnings(match.conflicts, "upisana vrednost se ne menja."),
        ].join(" "),
      );
    }
    return {
      actionType: "update_client_from_document",
      payload: {
        clientId: client.id,
        documentId,
        fill: match.fill as unknown as Prisma.InputJsonValue,
      },
      summary: `Dopuna podataka klijenta ${client.displayName} iz dokumenta „${subject.title}"`,
      details: [
        ...match.fill.map(fillDetail),
        ...skippedNotes(match.skipped),
        ...conflictWarnings(match.conflicts, "upisana vrednost se ne menja."),
      ],
      hasWarnings: match.conflicts.length > 0,
    };
  }

  /**
   * True when a readable case document filed for the conversation's client has
   * a matching subject whose facts could fill an empty client field. Cheap
   * checks first: no person or company fact on the case's readable documents,
   * or nothing empty on the client, ends it before any sources are listed or
   * facts are read.
   */
  async clientUpdateHint(
    workspaceId: string,
    sessionId: string,
    caseId: string,
  ): Promise<boolean> {
    if (!this.documents) return false;
    // One cheap count first: person or company facts of the current version
    // of an on, non-archived case document. Nothing else is loaded without it.
    const personFacts = await this.prisma.documentFact.count({
      where: {
        workspaceId,
        subjectType: { in: ["PERSON", "COMPANY"] },
        content: {
          versions: {
            some: {
              currentFor: {
                workspaceId,
                archivedAt: null,
                aiAccess: true,
                cases: { some: { caseId } },
              },
            },
          },
        },
      },
    });
    if (!personFacts) return false;
    const linked = await this.prisma.case.findFirst({
      where: { id: caseId, workspaceId },
      select: { clientId: true },
    });
    if (!linked) return false;
    const client = (await this.prisma.client.findFirst({
      where: { id: linked.clientId, workspaceId },
      select: CLIENT_SNAPSHOT_SELECT,
    })) as ClientRow | null;
    if (!client) return false;
    const snapshot = toSnapshot(client);
    if (!clientEmptyFillFields(snapshot).length) return false;

    const facts = await this.documents.getDocumentFacts(
      {
        workspaceId,
        sessionId,
        jobId: "",
        correlationId: "",
        messageId: "",
        language: "sr",
        userId: null,
        userDisplayName: null,
      },
      {},
    );
    if (facts.status !== "OK") return false;
    const refs = new Set<string>();
    for (const subject of facts.subjects) {
      if (!subject.ref.startsWith(DOC_REF_PREFIX)) continue;
      const match = matchClientFields(snapshot, {
        subjectType: subject.subjectType,
        documentKind: subject.documentKind,
        facts: subject.facts.map(toFactInput),
      });
      if (match.matched && match.fill.length) refs.add(subject.ref);
    }
    if (!refs.size) return false;
    const documentIds = [...refs].map((ref) =>
      ref.slice(DOC_REF_PREFIX.length),
    );
    const links = await this.prisma.documentClient.findMany({
      where: { workspaceId, documentId: { in: documentIds } },
      select: { documentId: true, clientId: true },
    });
    return documentIds.some((documentId) => {
      const own = links.filter((link) => link.documentId === documentId);
      return own.length === 1 && own[0].clientId === client.id;
    });
  }

  /**
   * Re-reads the client inside the transaction and writes only what is still
   * empty; anything filled since the proposal is skipped, never overwritten.
   */
  private async applyClientUpdate(
    action: PendingActionRow,
    userId: string,
    aiMetadata: Record<string, unknown>,
  ): Promise<Prisma.InputJsonValue> {
    const payload = action.payload as unknown as {
      clientId: string;
      documentId: string;
      fill: ClientFillItem[];
    };
    return this.prisma.$transaction(async (tx) => {
      // The source must still be readable by the assistant and filed for this
      // client only; anything else means the approval no longer holds.
      const source = await tx.document.findFirst({
        where: { id: payload.documentId, workspaceId: action.workspaceId },
        select: {
          archivedAt: true,
          aiAccess: true,
          clients: { select: { clientId: true } },
        },
      });
      if (
        !source ||
        source.archivedAt ||
        !source.aiAccess ||
        source.clients.length !== 1 ||
        source.clients[0].clientId !== payload.clientId
      ) {
        throw new Error(SOURCE_UNAVAILABLE_MESSAGE);
      }
      const client = (await tx.client.findFirst({
        where: { id: payload.clientId, workspaceId: action.workspaceId },
        select: CLIENT_SNAPSHOT_SELECT,
      })) as ClientRow | null;
      if (!client) throw new Error("Klijent više ne postoji.");
      const applied: ClientFillField[] = [];
      const skipped: ClientFillField[] = [];
      for (const item of payload.fill) {
        if (item.field === "address") {
          const address = item.address;
          if (client.addresses.length === 0 && address) {
            await tx.clientAddress.create({
              data: {
                addressType: address.addressType,
                street: address.street,
                city: address.city,
                postalCode: address.postalCode,
                country: address.country,
                isPrimary: true,
                clientId: client.id,
              },
            });
            applied.push(item.field);
          } else skipped.push(item.field);
        } else if (item.field === "identificationDocument") {
          const known = client.identificationDocuments.some(
            (document) => digitsKey(document.number) === digitsKey(item.value),
          );
          const document = item.identificationDocument;
          if (!known && document) {
            await tx.clientIdentificationDocument.create({
              data: {
                type: document.type,
                number: document.number,
                issuedDate: document.issuedDate
                  ? new Date(document.issuedDate)
                  : null,
                expiredDate: document.expiredDate
                  ? new Date(document.expiredDate)
                  : null,
                country: document.country,
                clientId: client.id,
              },
            });
            applied.push(item.field);
          } else skipped.push(item.field);
        } else if (SCALAR_CLIENT_FIELDS.has(item.field)) {
          // Compare-and-set: the write itself only matches while the field is
          // still empty, so a concurrent edit is never overwritten.
          const current = client[item.field as keyof ClientRow] as
            | string
            | null;
          if (current?.trim()) {
            skipped.push(item.field);
            continue;
          }
          const written = await tx.client.updateMany({
            where: {
              id: client.id,
              workspaceId: action.workspaceId,
              OR: [{ [item.field]: null }, { [item.field]: "" }],
            },
            data: { [item.field]: item.value, updatedByUserId: userId },
          });
          if (written.count === 1) applied.push(item.field);
          else skipped.push(item.field);
        }
      }
      const labels = (fields: ClientFillField[]) =>
        fields.map((field) => CLIENT_FIELD_LABELS[field]).join(", ");
      if (applied.length) {
        await tx.client.updateMany({
          where: { id: client.id, workspaceId: action.workspaceId },
          data: { updatedByUserId: userId },
        });
        await tx.clientActivity.create({
          data: {
            workspaceId: action.workspaceId,
            clientId: client.id,
            type: "NOTE",
            title: "Podaci klijenta dopunjeni iz dokumenta",
            description: `Dopunjeno: ${labels(applied)}. Predložio AI asistent, odobrio korisnik.`,
            activityDate: new Date(),
            source: "AI",
            createdByUserId: userId,
            updatedByUserId: userId,
          },
        });
        await tx.activityLog.create({
          data: {
            workspaceId: action.workspaceId,
            actorUserId: userId,
            action: "CLIENT_UPDATED",
            entityType: "Client",
            entityId: client.id,
            clientId: client.id,
            metadata: {
              ...aiMetadata,
              documentId: payload.documentId,
              applied,
              skipped,
            } as Prisma.InputJsonValue,
          },
        });
      }
      return {
        message: applied.length
          ? `Klijent ${client.displayName}: dopunjeno (${labels(applied)})${
              skipped.length
                ? `; preskočeno jer je već popunjeno (${labels(skipped)})`
                : ""
            }.`
          : `Klijent ${client.displayName}: ništa nije promenjeno, polja su u međuvremenu popunjena (${labels(skipped)}).`,
        clientId: client.id,
        applied,
        skipped,
      };
    });
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
            occurredAt: { gte: startedAt },
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
        const { description, ...deadlineFields } = payload;
        const deadline = await this.work.createDeadline(
          Object.assign(new CreateDeadlineDto(), deadlineFields, {
            ...(description ? { description } : {}),
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
          data: { metadata: { ...aiMetadata, mode: action.mode } },
        });
        const due = String(payload["dueDate"] ?? payload["dueAt"] ?? "").slice(0, 10);
        return {
          message: `Rok „${String(payload["title"])}“ je kreiran${isIsoDate(due) ? ` za ${formatDate(due)}` : "."}`,
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
      case "update_client_from_document":
        return this.applyClientUpdate(action, userId, aiMetadata);
      case "create_event": {
        if (!this.work) throw new Error("Events are not available");
        const event = await this.work.createEvent(
          Object.assign(new CreateEventDto(), payload),
        );
        await this.prisma.activityLog.updateMany({
          where: {
            workspaceId: action.workspaceId,
            entityType: "Event",
            entityId: event.id,
            action: "EVENT_CREATED",
          },
          data: { metadata: { ...aiMetadata, mode: action.mode } },
        });
        const startsAt = new Date(event.startsAt);
        return {
          message: `Događaj „${event.title}“ je zakazan za ${formatDate(
            belgradeToday(startsAt),
          )} u ${BELGRADE_TIME.format(startsAt)}.`,
          eventId: event.id,
        };
      }
      case "reschedule_event": {
        if (!this.work) throw new Error("Events are not available");
        const { eventId, ...fields } = payload;
        // Kept so an automatic move can be undone.
        const before = await this.prisma.event.findFirst({
          where: { id: String(eventId), workspaceId: action.workspaceId },
          include: EVENT_CHANGE_INCLUDE,
        });
        const startedAt = new Date();
        const event = await this.work.updateEvent(
          String(eventId),
          Object.assign(new UpdateEventDto(), fields),
        );
        await this.prisma.activityLog.updateMany({
          where: {
            workspaceId: action.workspaceId,
            entityType: "Event",
            entityId: event.id,
            action: "EVENT_UPDATED",
            occurredAt: { gte: startedAt },
          },
          data: { metadata: { ...aiMetadata, mode: action.mode } },
        });
        const startsAt = new Date(event.startsAt);
        return {
          message: `Događaj „${event.title}“ je pomeren na ${formatDate(
            belgradeToday(startsAt),
          )} u ${BELGRADE_TIME.format(startsAt)}.`,
          eventId: event.id,
          ...(before
            ? { previous: eventUpdatePayload(before) as Prisma.InputJsonObject }
            : {}),
        };
      }
      case "cancel_event": {
        if (!this.work) throw new Error("Events are not available");
        const event = await this.work.transitionEvent(
          String(payload["eventId"]),
          "CANCELLED",
        );
        return {
          message: `Događaj „${event.title}“ je otkazan.`,
          eventId: event.id,
        };
      }
      case "create_task": {
        if (!this.work) throw new Error("Tasks are not available");
        const task = await this.work.createTask(
          Object.assign(new CreateTaskDto(), payload),
        );
        await this.prisma.activityLog.updateMany({
          where: {
            workspaceId: action.workspaceId,
            entityType: "Task",
            entityId: task.id,
            action: "TASK_CREATED",
          },
          data: { metadata: { ...aiMetadata, mode: action.mode } },
        });
        return {
          message: `Zadatak „${task.title}“ je kreiran.`,
          taskId: task.id,
        };
      }
      case "log_work_entry": {
        if (!this.workEntries) throw new Error("Work entries are not available");
        // Saved unseen (AUTO), the entry is only proposed: the lawyer confirms
        // it in the time review. A human-approved entry is confirmed.
        const entry = await this.workEntries.create(
          Object.assign(new CreateWorkEntryDto(), payload),
          action.mode === "AUTO" ? { status: "PROPOSED" } : {},
        );
        const minutes = entry.minutes ?? Number(payload["minutes"]);
        return {
          message:
            action.mode === "AUTO"
              ? `Rad „${entry.title}“ (${formatMinutes(minutes)}) je upisan kao predlog; potvrdite ga u pregledu vremena.`
              : `Rad „${entry.title}“ (${formatMinutes(minutes)}) je upisan.`,
          workEntryId: entry.id,
        };
      }
      case "log_work_entries": {
        if (!this.workEntries) throw new Error("Work entries are not available");
        const items = (payload["entries"] as Array<Record<string, unknown>>) ?? [];
        const created: string[] = [];
        const failed: string[] = [];
        for (const item of items) {
          try {
            const entry = await this.workEntries.create(
              Object.assign(new CreateWorkEntryDto(), item),
              action.mode === "AUTO" ? { status: "PROPOSED" } : {},
            );
            created.push(entry.id);
          } catch (error) {
            failed.push(
              `${String(item["title"])} (${error instanceof Error ? error.message : String(error)})`,
            );
          }
        }
        if (!created.length) {
          throw new Error(`Nijedna stavka nije upisana: ${failed.join("; ")}`);
        }
        return {
          message: `Upisano stavki: ${created.length} od ${items.length}${
            action.mode === "AUTO" ? " (kao predlog; potvrdite u pregledu vremena)" : ""
          }.${failed.length ? ` Nije upisano: ${failed.join("; ")}.` : ""}`,
          workEntryIds: created,
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

  /** The linked case, or null when the conversation has none. */
  private async optionalLinkedCase(
    scope: AssistantTurnScope,
  ): Promise<CaseMatch | null> {
    try {
      return await this.linkedCase(scope);
    } catch (error) {
      if (error instanceof InvalidProposal) return null;
      throw error;
    }
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

/** What the tool tells the model for a stored proposal, by mode and outcome. */
function proposalResult(row: PendingActionRow): ActionProposalResult {
  if (row.mode === "AUTO") {
    const summary = toPendingAction(row);
    return row.status === "APPROVED"
      ? {
          status: "EXECUTED",
          pendingActionId: row.id,
          summary: row.summary,
          message: summary.resultMessage ?? row.summary,
        }
      : {
          status: "INVALID",
          message: `Čuvanje nije uspelo: ${row.errorMessage ?? "nepoznata greška"}`,
        };
  }
  return {
    status: row.mode === "FORM" ? "FORM_REQUIRED" : "CONFIRMATION_REQUIRED",
    pendingActionId: row.id,
    summary: row.summary,
    details: row.details,
  };
}

/** Validates a saved form like the domain endpoint (whitelist, no extra fields). */
async function validForm(
  dto: new () => object,
  body: unknown,
): Promise<Record<string, unknown>> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestException("The form body must be an object");
  }
  const instance = plainToInstance(dto, body);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length) {
    throw new BadRequestException(
      errors.flatMap((error) => Object.values(error.constraints ?? {})),
    );
  }
  return { ...(instance as Record<string, unknown>) };
}

/**
 * The visible fields of a form, compared without empty values, id order, or
 * timestamp formatting, so an untouched form never counts as edited.
 */
function formFingerprint(
  value: Record<string, unknown>,
  keys: ReadonlySet<string>,
): string {
  const visible: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (FORM_HIDDEN_KEYS.has(key) || !keys.has(key)) continue;
    if (raw === null || raw === undefined) continue;
    if (typeof raw === "string") {
      const text = raw.trim();
      if (!text) continue;
      visible[key] = /^\d{4}-\d{2}-\d{2}T/.test(text)
        ? new Date(text).getTime()
        : text;
    } else if (Array.isArray(raw)) {
      if (!raw.length) continue;
      visible[key] = raw.every((item) => typeof item === "string")
        ? [...(raw as string[])].sort()
        : raw;
    } else {
      visible[key] = raw;
    }
  }
  return stableStringify(visible);
}

type EventRow = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  isAllDay: boolean;
  location: string | null;
  meetingUrl: string | null;
  courtName: string | null;
  courtroom: string | null;
  caseId: string | null;
  clients: Array<{ clientId: string }>;
  assignees: Array<{ userId: string }>;
  attendees: Array<{
    clientContactId: string | null;
    displayName: string;
    email: string | null;
  }>;
};

/** The full update request that keeps an event exactly as it is. */
function eventUpdatePayload(event: EventRow): Record<string, unknown> {
  return {
    eventId: event.id,
    type: event.type,
    title: event.title,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    timeZone: event.timeZone,
    isAllDay: event.isAllDay,
    assigneeUserIds: unique(event.assignees.map((item) => item.userId)),
    clientIds: event.clients.map((item) => item.clientId),
    attendees: event.attendees.map((item) => ({
      ...(item.clientContactId ? { clientContactId: item.clientContactId } : {}),
      displayName: item.displayName,
      ...(item.email ? { email: item.email } : {}),
    })),
    ...(event.caseId ? { caseId: event.caseId } : {}),
    ...(event.description ? { description: event.description } : {}),
    ...(event.location ? { location: event.location } : {}),
    ...(event.meetingUrl ? { meetingUrl: event.meetingUrl } : {}),
    ...(event.courtName ? { courtName: event.courtName } : {}),
    ...(event.courtroom ? { courtroom: event.courtroom } : {}),
  };
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function nextIsoDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function eventWhen(startsAt: Date, endsAt: Date): string {
  return `${formatDate(belgradeToday(startsAt))} ${BELGRADE_TIME.format(startsAt)}–${BELGRADE_TIME.format(endsAt)}`;
}

function eventLabel(event: {
  title: string;
  startsAt: Date;
  endsAt: Date;
  clients: Array<{ client: { displayName: string } }>;
  attendees: Array<{ displayName: string }>;
}): string {
  const people = [
    ...event.clients.map((item) => item.client.displayName),
    ...event.attendees.map((item) => item.displayName),
  ];
  return `${event.title}${people.length ? ` – ${unique(people).join(", ")}` : ""}, ${eventWhen(event.startsAt, event.endsAt)}`;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
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

/** Identification numbers compared without spaces, dashes, or case. */
function digitsKey(value: string): string {
  return value.replace(/[^0-9a-z]/gi, "").toLowerCase();
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
