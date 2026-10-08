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
      case "update_client_from_document":
        return this.clientUpdateProposal(scope, request);
    }
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
   * checks first: no processed (READY) readable document on the case, or
   * nothing empty on the client, ends it before any facts are read.
   */
  async clientUpdateHint(
    workspaceId: string,
    sessionId: string,
    caseId: string,
  ): Promise<boolean> {
    if (!this.documents) return false;
    const ready = await this.prisma.document.count({
      where: {
        workspaceId,
        archivedAt: null,
        aiAccess: true,
        cases: { some: { caseId } },
        currentVersion: { content: { status: "READY" } },
      },
    });
    if (!ready) return false;
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
