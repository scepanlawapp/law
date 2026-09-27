import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { CaseDetail, CaseSummary } from "@law/api-interfaces";
import { CaseListQueryDto, CasesService } from "@law/cases";
import { WorkspaceContextService } from "@law/core";
import { LegalKnowledgeService } from "@law/legal-knowledge";
import type { GroundingSearchHit } from "@law/legal-grounding";
import type {
  ActionProposalResult,
  AssistantActionRequest,
  AssistantCaseFacts,
  AssistantCaseLookup,
  AssistantTurnScope,
  DraftListItem,
  DraftReadResult,
  DraftToolResult,
  LegalAssistantToolDeps,
} from "@law/mastra";
import { AssistantActionsService } from "./assistant-actions.service";
import { AssistantDraftingService } from "./assistant-drafting.service";

const CASE_CANDIDATE_LIMIT = 5;
const DRAFTING_UNAVAILABLE = {
  status: "FAILED" as const,
  message: "Izrada nacrta trenutno nije dostupna.",
};

/**
 * Implements the assistant tools' business operations on top of existing
 * services. Read-only. CasesService scopes by the workspace context that
 * WorkflowProcessor sets for the job.
 */
@Injectable()
export class AssistantToolsAdapter implements LegalAssistantToolDeps {
  constructor(
    @Optional() private readonly legalKnowledge?: LegalKnowledgeService,
    @Optional() private readonly cases?: CasesService,
    @Optional() private readonly drafting?: AssistantDraftingService,
    @Optional() private readonly actions?: AssistantActionsService,
  ) {}

  proposeAction(
    scope: AssistantTurnScope,
    request: AssistantActionRequest,
  ): Promise<ActionProposalResult> {
    return this.actions
      ? this.actions.propose(scope, request)
      : Promise.resolve({
          status: "INVALID",
          message: "Predlaganje izmena trenutno nije dostupno.",
        });
  }

  draftLawsuit(
    scope: AssistantTurnScope,
    args: { note?: string },
  ): Promise<DraftToolResult> {
    return this.drafting
      ? this.drafting.draftLawsuit(scope, args)
      : Promise.resolve(DRAFTING_UNAVAILABLE);
  }

  reviseDraft(
    scope: AssistantTurnScope,
    args: { instruction: string; draftId?: string },
  ): Promise<DraftToolResult> {
    return this.drafting
      ? this.drafting.reviseDraft(scope, args)
      : Promise.resolve(DRAFTING_UNAVAILABLE);
  }

  getDraft(
    scope: AssistantTurnScope,
    args: { draftId?: string },
  ): Promise<DraftReadResult> {
    return this.drafting
      ? this.drafting.getDraft(scope, args)
      : Promise.resolve({
          status: "NOT_FOUND",
          message: DRAFTING_UNAVAILABLE.message,
        });
  }

  listDrafts(scope: AssistantTurnScope): Promise<{ drafts: DraftListItem[] }> {
    return this.drafting
      ? this.drafting.listDrafts(scope)
      : Promise.resolve({ drafts: [] });
  }

  async searchLegalSources(
    query: string,
    limit: number,
    workspaceId: string,
  ): Promise<readonly GroundingSearchHit[]> {
    if (!this.legalKnowledge) return [];
    return this.legalKnowledge.search(query, limit, workspaceId);
  }

  async lookupCase(input: {
    workspaceId: string;
    sessionCaseId: string | null;
    reference?: string;
  }): Promise<AssistantCaseLookup> {
    // CasesService scopes by the job's workspace context; never let it differ from the tool's.
    if (
      !this.cases ||
      WorkspaceContextService.current?.workspaceId !== input.workspaceId
    ) {
      return { found: "none", message: "Predmeti trenutno nisu dostupni." };
    }
    const reference = input.reference?.trim();
    if (!reference) {
      if (!input.sessionCaseId) {
        return {
          found: "none",
          message:
            "Razgovor nije povezan sa predmetom. Navedite broj ili naziv predmeta.",
        };
      }
      const linked = await this.getCase(input.sessionCaseId);
      return linked
        ? { found: "one", case: linked }
        : { found: "none", message: "Povezani predmet nije pronađen." };
    }

    const query = Object.assign(new CaseListQueryDto(), {
      search: reference,
      page: 1,
      pageSize: CASE_CANDIDATE_LIMIT,
    });
    const { items } = await this.cases.list(query);
    if (!items.length) {
      return { found: "none", message: `Nema predmeta za "${reference}".` };
    }
    const exact = items.find(
      (item) => item.caseNumber.toLowerCase() === reference.toLowerCase(),
    );
    if (exact || items.length === 1) {
      const detail = await this.getCase((exact ?? items[0]).id);
      if (detail) return { found: "one", case: detail };
    }
    return { found: "many", candidates: items.map((item) => toFacts(item)) };
  }

  private async getCase(caseId: string): Promise<AssistantCaseFacts | null> {
    try {
      return toFacts(await this.cases!.get(caseId));
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }
}

function toFacts(item: CaseSummary | CaseDetail): AssistantCaseFacts {
  const detail = "description" in item ? item : null;
  return {
    caseNumber: item.caseNumber,
    name: item.name,
    status: item.status,
    priority: item.priority,
    client: item.client.displayName,
    responsible: item.responsibleUser.displayName,
    opposingParty: detail?.opposingPartyName ?? null,
    description: detail?.description?.trim() || null,
    openedDate: item.openedDate,
    closedDate: item.closedDate,
  };
}
