import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard, WorkspaceContextService } from "@law/core";
import { LegalKnowledgeSearchDto } from "./legal-knowledge.dto";
import { LegalKnowledgeService } from "./legal-knowledge.service";

@Controller("legal-knowledge")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class LegalKnowledgeController {
  constructor(private readonly knowledge: LegalKnowledgeService) {}

  @Post("search")
  search(@Body() body: LegalKnowledgeSearchDto) {
    return this.knowledge.search(
      body.query,
      body.limit,
      WorkspaceContextService.required.workspaceId,
    );
  }
}
