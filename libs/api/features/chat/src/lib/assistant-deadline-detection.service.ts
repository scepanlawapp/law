import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import {
  deadlineProposalDescription,
  deadlineProposalTitle,
  describeComputation,
  formatSerbianDate,
  type ClassifiedAct,
  type DeadlineOutcome,
  type DeadlineRule,
} from "@law/legal-deadlines";
import type { ChatModelProvider } from "@law/llm";
import {
  createDeadlineDetectionWorkflow,
  runDeadlineDetectionWorkflow,
  type AssistantTurnScope,
  type ComputedDeadlineFacts,
  type DeadlineToolResult,
  type DetectedDeadlineFacts,
} from "@law/mastra";
import {
  AssistantActionsService,
  belgradeToday,
} from "./assistant-actions.service";
import { AssistantDocumentReadsService } from "./assistant-document-reads.service";
import { ChatRuntimeConfig } from "./chat.config";
import { resolveChatModelProvider } from "./chat-model.util";
import { CHAT_MODEL_PROVIDER } from "./chat.tokens";

/** Characters of the document the model sees (head and tail of longer ones). */
const MAX_CHARS = 40_000;

/**
 * Deadline from a served document behind the assistant's detect_deadlines
 * tool. The Mastra deadline-detection workflow classifies the act and
 * computes the date by the rules in `@law/legal-deadlines`; the date is then
 * proposed as a create_deadline PendingAction, so nothing changes until a
 * user approves it, and the model never retypes the date.
 */
@Injectable()
export class AssistantDeadlineDetectionService {
  private readonly logger = new Logger(AssistantDeadlineDetectionService.name);

  constructor(
    private readonly config: ChatRuntimeConfig,
    @Optional() private readonly documentReads?: AssistantDocumentReadsService,
    @Optional() private readonly actions?: AssistantActionsService,
    @Optional()
    @Inject(CHAT_MODEL_PROVIDER)
    private readonly provider?: ChatModelProvider,
  ) {}

  async detectDeadlines(
    scope: AssistantTurnScope,
    args: { documentRef: string; serviceDate?: string },
  ): Promise<DeadlineToolResult> {
    if (!this.documentReads) {
      return {
        status: "FAILED",
        message: "Čitanje dokumenata trenutno nije dostupno.",
      };
    }
    const ref = args.documentRef.trim();
    const [document] = await this.documentReads.documentsByRef(scope, [ref]);
    if (!document) {
      return {
        status: "NOT_FOUND",
        message: `Dokument "${ref}" nije pronađen. Koristite list_documents.`,
      };
    }
    if (document.status !== "COMPLETED" || !document.text?.trim()) {
      return {
        status: "NO_TEXT",
        message: `Dokument „${document.name}” nema čitljiv tekst.`,
      };
    }

    let outcome: DeadlineOutcome;
    try {
      ({ outcome } = await runDeadlineDetectionWorkflow(
        createDeadlineDetectionWorkflow({
          provider: resolveChatModelProvider(this.config, this.provider),
        }),
        {
          documentTitle: document.name,
          text: document.text,
          serviceDate: args.serviceDate?.trim() || null,
          today: belgradeToday(),
          maxChars: MAX_CHARS,
        },
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Deadline detection failed (session ${scope.sessionId}, job ${scope.jobId}): ${message}`,
      );
      return {
        status: "FAILED",
        message: "Prepoznavanje dokumenta za rok nije uspelo.",
      };
    }

    switch (outcome.status) {
      case "INVALID_SERVICE_DATE":
        return { status: "INVALID", message: outcome.message };
      case "NO_DEADLINE":
        return {
          status: "NO_DEADLINE",
          document: document.name,
          act: actLabel(outcome.act),
          reason: outcome.reason,
          warnings: outcome.warnings,
        };
      case "NEEDS_SERVICE_DATE":
        return {
          status: "NEEDS_SERVICE_DATE",
          ...facts(document.name, outcome.act, outcome.rule),
          message:
            "Datum dostavljanja nije poznat. Pitajte korisnika kada je dokument dostavljen klijentu ili kancelariji i pozovite alat ponovo sa serviceDate.",
          warnings: outcome.warnings,
        };
      case "COMPUTED":
        return this.propose(scope, document.name, outcome);
    }
  }

  private async propose(
    scope: AssistantTurnScope,
    documentTitle: string,
    outcome: Extract<DeadlineOutcome, { status: "COMPUTED" }>,
  ): Promise<DeadlineToolResult> {
    const computed: ComputedDeadlineFacts = {
      ...facts(documentTitle, outcome.act, outcome.rule),
      serviceDate: outcome.serviceDate,
      serviceDateSource: outcome.serviceDateSource,
      dueDate: outcome.dueDate,
      computation: describeComputation(
        outcome.stated && outcome.stated.dueDate === outcome.dueDate
          ? outcome.stated
          : outcome.computed,
      ),
      warnings: outcome.warnings,
    };
    if (outcome.expired) {
      return {
        status: "EXPIRED",
        ...computed,
        message: `Rok je istekao ${formatSerbianDate(outcome.dueDate)}; nije predložen.`,
      };
    }
    if (!this.actions) {
      return {
        status: "NOT_PROPOSED",
        ...computed,
        message: "Predlaganje rokova trenutno nije dostupno.",
      };
    }
    const proposal = await this.actions.propose(scope, {
      type: "create_deadline",
      title: deadlineProposalTitle(outcome),
      dueDate: outcome.dueDate,
      deadlineType: outcome.rule.deadlineType,
      description: deadlineProposalDescription(outcome, documentTitle),
    });
    if (proposal.status !== "CONFIRMATION_REQUIRED") {
      return { status: "NOT_PROPOSED", ...computed, message: proposal.message };
    }
    return {
      status: "PROPOSED",
      ...computed,
      pendingActionId: proposal.pendingActionId,
    };
  }
}

function actLabel(act: ClassifiedAct): string {
  return act.title && act.title !== act.kindLabel
    ? `${act.kindLabel}: ${act.title}`
    : act.kindLabel;
}

function facts(
  document: string,
  act: ClassifiedAct,
  rule: DeadlineRule,
): DetectedDeadlineFacts {
  return {
    document,
    act: actLabel(act),
    procedure: act.procedureLabel,
    remedy: rule.remedy,
    days: rule.days,
    legalBasis: rule.legalBasis,
  };
}
