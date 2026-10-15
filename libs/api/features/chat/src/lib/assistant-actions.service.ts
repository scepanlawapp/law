import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { WorkspaceRole } from "@law/api-interfaces";
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
} from "@law/activities-tasks-deadlines";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";
import { digitsOnly, singleIsoDate } from "@law/document-intelligence";
import type {
  ActionProposalResult,
  AssistantActionRequest,
  AssistantTurnScope,
} from "@law/mastra";
import { Prisma } from "@prisma/client";
import { AssistantDocumentReadsService } from "./assistant-document-reads.service";
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
const OFFICE_TIME_ZONE = "Europe/Belgrade";
const DEFAULT_EVENT_MINUTES = 60;
const PARTICIPANT_CANDIDATES = 5;
const CONFLICT_LINES = 5;
/** Actions that honour the permission mode; every other action is always a card. */
const MODE_AWARE_ACTIONS = new Set<AssistantActionRequest["type"]>([
  "create_event",
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
    const mode = await this.pendingMode(scope, proposal);
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
   * executed as they are; the agent resumes as after an approval.
   */
  async completeEventForm(input: {
    workspaceId: string;
    userId: string;
    actionId: string;
    event: CreateEventDto;
  }): Promise<PendingActionSummary> {
    const action = await this.requireAction(input.workspaceId, input.actionId);
    if (action.actionType !== "create_event" || action.mode !== "FORM") {
      throw new BadRequestException("This action is not a prefilled form");
    }
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
    const edited = eventFingerprint(action.payload) !== eventFingerprint(input.event);
    await this.runAndRecord(action, async () => {
      const result = (await this.execute(
        { ...action, payload: { ...input.event } as unknown as Prisma.JsonValue },
        input.userId,
      )) as Prisma.InputJsonObject;
      return { ...result, edited };
    });
    const decided = await this.reload(action.id);
    this.emit(decided, "confirmation.updated");
    await this.afterDecision(decided);
    return toPendingAction(decided);
  }

  /** FORM / CARD / AUTO for a proposal, from the conversation's permission mode. */
  private async pendingMode(
    scope: AssistantTurnScope,
    proposal: Proposal,
  ): Promise<PendingActionMode> {
    if (!MODE_AWARE_ACTIONS.has(proposal.actionType)) return "CARD";
    const session = await this.prisma.chatSession.findFirst({
      where: { id: scope.sessionId, workspaceId: scope.workspaceId },
      select: {
        permissionMode: true,
        createdBy: { select: { settings: { select: { assistantPermissionMode: true } } } },
      },
    });
    const permission: AssistantPermissionMode =
      session?.permissionMode ??
      session?.createdBy.settings?.assistantPermissionMode ??
      "ASK";
    const mode = MODE_BY_PERMISSION[permission];
    // AUTO needs someone to act as, and never skips a warning.
    if (mode === "AUTO" && (!scope.userId || proposal.hasWarnings)) {
      return "CARD";
    }
    return mode;
  }

  /** Runs an action with the user as the workspace actor (the worker runs as the system). */
  private async asUser<T>(
    scope: AssistantTurnScope,
    userId: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const member = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId: scope.workspaceId, userId, status: "ACTIVE" },
      select: { role: true },
    });
    if (!member) throw new Error("User is not an active workspace member");
    return WorkspaceContextService.run(
      {
        workspaceId: scope.workspaceId,
        userId,
        role: member.role as WorkspaceRole,
      },
      run,
    );
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
      case "update_client_from_document":
        return this.clientUpdateProposal(scope, request);
      case "create_event":
        return this.eventProposal(scope, request);
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
  ): Promise<Participant | null> {
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
    const candidates: Array<Participant & { name: string }> = [
      ...users
        .filter((user) => user.id !== scope.userId)
        .map((user) => {
          const name = displayName(user) ?? user.email;
          return { kind: "USER" as const, id: user.id, name, label: `${name} (kolega)` };
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
    if (!candidates.length) {
      throw new InvalidProposal(
        `Nema kolege, klijenta ni kontakt osobe za „${ref}“. Proverite ime.`,
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

  /** Scheduled events of these users that overlap the slot, as warning lines. */
  private async eventConflicts(
    workspaceId: string,
    userIds: string[],
    startsAt: Date,
    endsAt: Date,
  ): Promise<string[]> {
    if (!userIds.length) return [];
    const overlapping = await this.prisma.event.findMany({
      where: {
        workspaceId,
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

/** Event fields the user can change in the form, compared order-insensitively. */
function eventFingerprint(value: unknown): string {
  const event = (value ?? {}) as Record<string, unknown>;
  const text = (key: string) => String(event[key] ?? "").trim() || null;
  const time = (key: string) =>
    event[key] ? new Date(String(event[key])).getTime() : null;
  const ids = (key: string) =>
    [...((event[key] as string[] | undefined) ?? [])].sort();
  return stableStringify({
    type: text("type"),
    title: text("title"),
    description: text("description"),
    location: text("location"),
    caseId: text("caseId"),
    startsAt: time("startsAt"),
    endsAt: time("endsAt"),
    clientIds: ids("clientIds"),
    assigneeUserIds: ids("assigneeUserIds"),
  });
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
