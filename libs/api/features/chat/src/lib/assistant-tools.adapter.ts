import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import { CaseListQueryDto, CasesService } from "@law/cases";
import { WorkspaceContextService } from "@law/core";
import { LegalKnowledgeService } from "@law/legal-knowledge";
import type { GroundingSearchHit } from "@law/legal-grounding";
import type {
  ActionProposalResult,
  ActivityQuery,
  AssistantActionRequest,
  AssistantActivityEntry,
  AssistantCaseFacts,
  AssistantCaseLookup,
  AssistantClientFacts,
  AssistantClientLookup,
  AssistantListResult,
  AssistantTurnScope,
  AssistantWorkItem,
  DraftListItem,
  DraftReadResult,
  DraftToolResult,
  LegalAssistantToolDeps,
  WorkItemQuery,
} from "@law/mastra";
import { AssistantActionsService } from "./assistant-actions.service";
import { AssistantDraftingService } from "./assistant-drafting.service";
import {
  AssistantOfficeReadsService,
  caseFacts,
} from "./assistant-office-reads.service";

const CASE_CANDIDATE_LIMIT = 5;
const DRAFTING_UNAVAILABLE = {
  status: "FAILED" as const,
  message: "Izrada nacrta trenutno nije dostupna.",
};
const OFFICE_UNAVAILABLE = {
  status: "UNAVAILABLE" as const,
  message: "Podaci kancelarije trenutno nisu dostupni.",
};

/**
 * Implements the assistant tools' business operations on top of existing
 * services. CasesService scopes by the workspace context that
 * WorkflowProcessor sets for the job.
 */
@Injectable()
export class AssistantToolsAdapter implements LegalAssistantToolDeps {
  constructor(
    @Optional() private readonly legalKnowledge?: LegalKnowledgeService,
    @Optional() private readonly cases?: CasesService,
    @Optional() private readonly drafting?: AssistantDraftingService,
    @Optional() private readonly actions?: AssistantActionsService,
    @Optional() private readonly office?: AssistantOfficeReadsService,
  ) {}

  searchCases(
    scope: AssistantTurnScope,
    args: Parameters<AssistantOfficeReadsService["searchCases"]>[1],
  ): Promise<AssistantListResult<AssistantCaseFacts>> {
    return this.office
      ? this.office.searchCases(scope, args)
      : Promise.resolve(OFFICE_UNAVAILABLE);
  }

  searchClients(
    scope: AssistantTurnScope,
    args: { query?: string; status?: string; responsible?: string },
  ): Promise<AssistantListResult<AssistantClientFacts>> {
    return this.office
      ? this.office.searchClients(scope, args)
      : Promise.resolve(OFFICE_UNAVAILABLE);
  }

  getClient(
    scope: AssistantTurnScope,
    args: { reference: string },
  ): Promise<AssistantClientLookup> {
    return this.office
      ? this.office.getClient(scope, args)
      : Promise.resolve({ found: "none", message: OFFICE_UNAVAILABLE.message });
  }

  listWorkItems(
    scope: AssistantTurnScope,
    args: WorkItemQuery,
  ): Promise<AssistantListResult<AssistantWorkItem>> {
    return this.office
      ? this.office.listWorkItems(scope, args)
      : Promise.resolve(OFFICE_UNAVAILABLE);
  }

  getAgenda(
    scope: AssistantTurnScope,
    args: { from: string; to: string; person?: string },
  ): Promise<AssistantListResult<AssistantWorkItem>> {
    return this.office
      ? this.office.getAgenda(scope, args)
      : Promise.resolve(OFFICE_UNAVAILABLE);
  }

  listActivity(
    scope: AssistantTurnScope,
    args: ActivityQuery,
  ): Promise<AssistantListResult<AssistantActivityEntry>> {
    return this.office
      ? this.office.listActivity(scope, args)
      : Promise.resolve(OFFICE_UNAVAILABLE);
  }

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
      const linked = await this.getCase(input.workspaceId, input.sessionCaseId);
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
      const detail = await this.getCase(
        input.workspaceId,
        (exact ?? items[0]).id,
      );
      if (detail) return { found: "one", case: detail };
    }
    return { found: "many", candidates: items.map((item) => caseFacts(item)) };
  }

  private async getCase(
    workspaceId: string,
    caseId: string,
  ): Promise<AssistantCaseFacts | null> {
    try {
      const facts = caseFacts(await this.cases!.get(caseId));
      const extras = await this.office?.caseExtras(workspaceId, caseId);
      return { ...facts, ...extras };
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }
}
