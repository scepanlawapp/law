import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import {
  LegalClientDetail,
  LegalClientListResponse,
  OrganizationContactResponse,
} from "@law/api-interfaces";
import {
  AutocompleteQueryDto,
  ClientListQueryDto,
  CreateClientDto,
  CreateOrganizationContactDto,
  UpdateClientDto,
} from "./clients.dto";
import { ClientsService } from "./clients.service";

@Controller("clients")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list(@Query() query: ClientListQueryDto): Promise<LegalClientListResponse> {
    return this.clients.list(query);
  }

  @Get("search")
  search(@Query() query: AutocompleteQueryDto) {
    return this.clients.autocomplete(query.q, query.limit);
  }

  @Get(":clientId")
  get(@Param("clientId") clientId: string): Promise<LegalClientDetail> {
    return this.clients.get(clientId);
  }

  @Post()
  create(@Body() body: CreateClientDto): Promise<LegalClientDetail> {
    return this.clients.create(body);
  }

  @Patch(":clientId")
  update(
    @Param("clientId") clientId: string,
    @Body() body: UpdateClientDto,
  ): Promise<LegalClientDetail> {
    return this.clients.update(clientId, body);
  }

  @Post(":clientId/archive")
  archive(@Param("clientId") clientId: string): Promise<LegalClientDetail> {
    return this.clients.archive(clientId);
  }

  @Post(":clientId/activate")
  activate(@Param("clientId") clientId: string): Promise<LegalClientDetail> {
    return this.clients.activate(clientId);
  }

  @Post(":clientId/contacts")
  addContact(
    @Param("clientId") clientId: string,
    @Body() body: CreateOrganizationContactDto,
  ): Promise<OrganizationContactResponse> {
    return this.clients.addOrganizationContact(clientId, body);
  }
}
