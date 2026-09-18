import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import { ClientDetail, ClientListResponse } from "@law/api-interfaces";
import {
  ClientActivityDto,
  ClientActivityListQueryDto,
  ClientAddressDto,
  ClientCaseListQueryDto,
  ClientContactDto,
  ClientIdentificationDocumentDto,
  ClientListQueryDto,
  CreateClientDto,
  UpdateClientActivityDto,
  UpdateClientContactDto,
  UpdateClientDto,
} from "./clients.dto";
import { ClientsService } from "./clients.service";

@Controller("clients")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list(@Query() query: ClientListQueryDto): Promise<ClientListResponse> {
    return this.clients.list(query);
  }

  @Post()
  create(@Body() body: CreateClientDto): Promise<ClientDetail> {
    return this.clients.create(body);
  }

  @Get(":clientId")
  get(@Param("clientId") clientId: string): Promise<ClientDetail> {
    return this.clients.get(clientId);
  }

  @Patch(":clientId")
  update(
    @Param("clientId") clientId: string,
    @Body() body: UpdateClientDto,
  ): Promise<ClientDetail> {
    return this.clients.update(clientId, body);
  }

  @Post(":clientId/archive")
  archive(@Param("clientId") clientId: string): Promise<ClientDetail> {
    return this.clients.archive(clientId);
  }

  @Post(":clientId/activate")
  activate(@Param("clientId") clientId: string): Promise<ClientDetail> {
    return this.clients.activate(clientId);
  }

  @Get(":clientId/cases")
  listCases(
    @Param("clientId") clientId: string,
    @Query() query: ClientCaseListQueryDto,
  ) {
    return this.clients.listCases(clientId, query);
  }

  @Get(":clientId/addresses")
  listAddresses(@Param("clientId") clientId: string) {
    return this.clients.listAddresses(clientId);
  }

  @Post(":clientId/addresses")
  createAddress(
    @Param("clientId") clientId: string,
    @Body() body: ClientAddressDto,
  ) {
    return this.clients.createAddress(clientId, body);
  }

  @Patch(":clientId/addresses/:addressId")
  updateAddress(
    @Param("clientId") clientId: string,
    @Param("addressId") addressId: string,
    @Body() body: ClientAddressDto,
  ) {
    return this.clients.updateAddress(clientId, addressId, body);
  }

  @Delete(":clientId/addresses/:addressId")
  removeAddress(
    @Param("clientId") clientId: string,
    @Param("addressId") addressId: string,
  ): Promise<void> {
    return this.clients.removeAddress(clientId, addressId);
  }

  @Get(":clientId/identification-documents")
  listIdentificationDocuments(@Param("clientId") clientId: string) {
    return this.clients.listIdentificationDocuments(clientId);
  }

  @Post(":clientId/identification-documents")
  createIdentificationDocument(
    @Param("clientId") clientId: string,
    @Body() body: ClientIdentificationDocumentDto,
  ) {
    return this.clients.createIdentificationDocument(clientId, body);
  }

  @Patch(":clientId/identification-documents/:documentId")
  updateIdentificationDocument(
    @Param("clientId") clientId: string,
    @Param("documentId") documentId: string,
    @Body() body: ClientIdentificationDocumentDto,
  ) {
    return this.clients.updateIdentificationDocument(
      clientId,
      documentId,
      body,
    );
  }

  @Delete(":clientId/identification-documents/:documentId")
  removeIdentificationDocument(
    @Param("clientId") clientId: string,
    @Param("documentId") documentId: string,
  ): Promise<void> {
    return this.clients.removeIdentificationDocument(clientId, documentId);
  }

  @Get(":clientId/contacts")
  listContacts(@Param("clientId") clientId: string) {
    return this.clients.listContacts(clientId);
  }

  @Post(":clientId/contacts")
  createContact(
    @Param("clientId") clientId: string,
    @Body() body: ClientContactDto,
  ) {
    return this.clients.createContact(clientId, body);
  }

  @Get(":clientId/contacts/:contactId")
  getContact(
    @Param("clientId") clientId: string,
    @Param("contactId") contactId: string,
  ) {
    return this.clients.getContact(clientId, contactId);
  }

  @Patch(":clientId/contacts/:contactId")
  updateContact(
    @Param("clientId") clientId: string,
    @Param("contactId") contactId: string,
    @Body() body: UpdateClientContactDto,
  ) {
    return this.clients.updateContact(clientId, contactId, body);
  }

  @Post(":clientId/contacts/:contactId/deactivate")
  deactivateContact(
    @Param("clientId") clientId: string,
    @Param("contactId") contactId: string,
  ) {
    return this.clients.deactivateContact(clientId, contactId);
  }

  @Get(":clientId/activities")
  listActivities(
    @Param("clientId") clientId: string,
    @Query() query: ClientActivityListQueryDto,
  ) {
    return this.clients.listActivities(clientId, query);
  }

  @Post(":clientId/activities")
  createActivity(
    @Param("clientId") clientId: string,
    @Body() body: ClientActivityDto,
  ) {
    return this.clients.createActivity(clientId, body);
  }

  @Patch(":clientId/activities/:activityId")
  updateActivity(
    @Param("clientId") clientId: string,
    @Param("activityId") activityId: string,
    @Body() body: UpdateClientActivityDto,
  ) {
    return this.clients.updateActivity(clientId, activityId, body);
  }
}
