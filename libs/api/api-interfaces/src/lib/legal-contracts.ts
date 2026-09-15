import type { PaginatedResponse } from "./api-interfaces";

export type LegalPartyType = "PERSON" | "ORGANIZATION";
export type LegalClientStatus = "ACTIVE" | "INACTIVE";
export type MatterState = "DRAFT" | "OPEN" | "CLOSED";
export type MatterPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type ProceedingStatus = "OPEN" | "SUSPENDED" | "CLOSED" | "OTHER";
export type PartyContactPointType =
  | "EMAIL"
  | "PHONE"
  | "MOBILE"
  | "FAX"
  | "WEBSITE"
  | "OTHER";
export type PartyIdentifierType =
  | "NATIONAL_ID"
  | "TAX_ID"
  | "REGISTRATION_ID"
  | "PASSPORT"
  | "ID_CARD"
  | "VAT_ID"
  | "OTHER";
export type PartyAddressType =
  | "PRIMARY"
  | "REGISTERED"
  | "MAILING"
  | "BILLING"
  | "OTHER";

export interface LegalLookupSummary {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface PartyContactPointResponse {
  id: string;
  type: PartyContactPointType;
  value: string;
  label: string | null;
  isPrimary: boolean;
}

export interface PartyIdentifierResponse {
  id: string;
  type: PartyIdentifierType;
  value: string;
  countryCode: string | null;
  issuer: string | null;
  isPrimary: boolean;
}

export interface PartyAddressResponse {
  id: string;
  type: PartyAddressType;
  addressLine1: string;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  region: string | null;
  countryCode: string | null;
  isPrimary: boolean;
}

export interface PartySummary {
  id: string;
  type: LegalPartyType;
  displayName: string;
  secondaryText: string | null;
}

export interface OrganizationContactResponse extends PartySummary {
  relationshipId: string;
  relationshipType: LegalLookupSummary;
  jobTitle: string | null;
  department: string | null;
  isPrimaryContact: boolean;
  isActive: boolean;
  contactPoints: PartyContactPointResponse[];
}

export interface PartyDetail extends PartySummary {
  firstName: string | null;
  lastName: string | null;
  legalName: string | null;
  tradeName: string | null;
  notes: string | null;
  contactPoints: PartyContactPointResponse[];
  identifiers: PartyIdentifierResponse[];
  addresses: PartyAddressResponse[];
}

export interface LegalClientSummary {
  id: string;
  clientCode: string;
  status: LegalClientStatus;
  party: PartySummary;
  responsibleUserId: string | null;
  openedAt: string;
  archivedAt: string | null;
}

export interface LegalClientDetail extends LegalClientSummary {
  party: PartyDetail;
  organizationContacts: OrganizationContactResponse[];
}

export interface LegalClientListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  status?: LegalClientStatus;
}

export interface CreatePartyContactPointRequest {
  type: PartyContactPointType;
  value: string;
  label?: string;
  isPrimary?: boolean;
}

export interface CreatePartyIdentifierRequest {
  type: PartyIdentifierType;
  value: string;
  countryCode?: string;
  issuer?: string;
  isPrimary?: boolean;
}

export interface CreatePartyAddressRequest {
  type?: PartyAddressType;
  addressLine1: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  region?: string;
  countryCode?: string;
  isPrimary?: boolean;
}

export interface CreateClientRequest {
  type: LegalPartyType;
  firstName?: string;
  lastName?: string;
  legalName?: string;
  tradeName?: string;
  notes?: string;
  responsibleUserId?: string;
  contactPoints?: CreatePartyContactPointRequest[];
  identifiers?: CreatePartyIdentifierRequest[];
  addresses?: CreatePartyAddressRequest[];
}

export interface CreateOrganizationContactRequest {
  existingPartyId?: string;
  firstName?: string;
  lastName?: string;
  relationshipTypeId: string;
  jobTitle?: string;
  department?: string;
  isPrimaryContact?: boolean;
  contactPoints?: CreatePartyContactPointRequest[];
}

export interface UpdateClientRequest {
  firstName?: string;
  lastName?: string;
  legalName?: string;
  tradeName?: string;
  notes?: string;
  responsibleUserId?: string | null;
  status?: LegalClientStatus;
}

export type LegalClientListResponse = PaginatedResponse<LegalClientSummary>;

export interface MatterClientResponse {
  id: string;
  isPrimary: boolean;
  notes: string | null;
  client: LegalClientSummary;
}

export interface MatterParticipantRoleResponse {
  id: string;
  code: string;
  name: string;
}

export interface MatterParticipantResponse {
  id: string;
  party: PartySummary;
  notes: string | null;
  roles: MatterParticipantRoleResponse[];
}

export interface ProceedingResponse {
  id: string;
  type: LegalLookupSummary;
  externalNumber: string | null;
  authorityName: string | null;
  judgeName: string | null;
  status: ProceedingStatus | null;
  startedAt: string | null;
  endedAt: string | null;
  notes: string | null;
}

export interface MatterSummary {
  id: string;
  internalNumber: string | null;
  title: string;
  state: MatterState;
  priority: MatterPriority;
  practiceArea: LegalLookupSummary | null;
  stage: LegalLookupSummary | null;
  responsibleUserId: string | null;
  clientCount: number;
  openedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MatterDetail extends MatterSummary {
  description: string | null;
  clients: MatterClientResponse[];
  participants: MatterParticipantResponse[];
  proceedings: ProceedingResponse[];
}

export interface MatterListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  state?: MatterState;
  priority?: MatterPriority;
  practiceAreaId?: string;
  stageId?: string;
  responsibleUserId?: string;
  clientId?: string;
}

export interface CreateMatterRequest {
  title: string;
  description?: string;
  priority?: MatterPriority;
  practiceAreaId?: string;
  stageId?: string;
  responsibleUserId?: string;
  clientIds?: string[];
  primaryClientId?: string;
}

export interface UpdateMatterRequest {
  title?: string;
  description?: string;
  priority?: MatterPriority;
  practiceAreaId?: string | null;
  stageId?: string | null;
  responsibleUserId?: string | null;
}

export interface MatterClientRequest {
  clientId: string;
  isPrimary?: boolean;
  notes?: string;
}

export interface MatterParticipantRequest {
  partyId: string;
  roleIds?: string[];
  notes?: string;
}

export interface ProceedingRequest {
  typeId: string;
  externalNumber?: string;
  authorityName?: string;
  judgeName?: string;
  status?: ProceedingStatus;
  startedAt?: string;
  endedAt?: string;
  notes?: string;
}

export interface UserAutocompleteItem {
  id: string;
  displayName: string;
  secondaryText: string | null;
}

export type ClientAutocompleteItem = PartySummary & {
  clientId: string;
  clientCode: string;
};

export interface MatterAutocompleteItem {
  id: string;
  internalNumber: string | null;
  title: string;
}

export interface AutocompleteQuery {
  q: string;
  limit?: number;
}

export type LookupKind =
  | "practice-areas"
  | "matter-stages"
  | "participant-roles"
  | "proceeding-types"
  | "document-categories"
  | "organization-relationship-types";

export interface LookupListQuery {
  includeInactive?: boolean;
  practiceAreaId?: string;
}

export interface CreateLookupRequest {
  code: string;
  name: string;
  sortOrder?: number;
  practiceAreaId?: string;
}

export interface UpdateLookupRequest {
  name?: string;
  sortOrder?: number;
  practiceAreaId?: string | null;
}

export interface MatterTransitionResponse extends MatterDetail {}

export type LegalPaginatedResponse<T> = PaginatedResponse<T>;

export type DocumentSource = "UPLOAD" | "EMAIL" | "API" | "GENERATED" | "SCAN";
export type DocumentVisibility = "INTERNAL" | "CLIENT_SHARED";

export interface DocumentSummary {
  id: string;
  originalFilename: string;
  title: string | null;
  mimeType: string;
  sizeBytes: number;
  category: LegalLookupSummary | null;
  documentDate: string | null;
  source: DocumentSource;
  visibility: DocumentVisibility;
  archivedAt: string | null;
  createdAt: string;
}

export interface DocumentListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  includeArchived?: boolean;
  clientId?: string;
  matterId?: string;
}

export interface ActivityEventSummary {
  id: string;
  entityType: string;
  entityId: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  actorUserId: string | null;
  createdAt: string;
}
