import {
  Body,
  Controller,
  Header,
  HttpCode,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import { WorkspaceRole } from "@law/api-interfaces";
import { PricingSuggestionDto } from "./pricing-suggestion.dto";
import { PricingSuggestionService } from "./pricing-suggestion.service";

@Controller("work-entries")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess(WorkspaceRole.ADMIN)
export class PricingSuggestionController {
  constructor(private readonly pricing: PricingSuggestionService) {}

  @Post("pricing-suggestion")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  suggest(@Body() input: PricingSuggestionDto) {
    return this.pricing.suggest(input);
  }
}
