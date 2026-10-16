import type {
  CalendarSourceType,
  EventType,
  ActivityType,
  ActivitySource,
} from "./api-interfaces";
import type {
  CasePriority,
  ClientAddressType,
  ClientContactStatus,
  CaseStatus,
  ClientStatus,
  ClientType,
  DeadlineStatus,
  DeadlineType,
  DraftApprovalStatus,
  DraftDocumentType,
  EventDetail,
  PaginatedResponse,
  PaginationQuery,
  TaskStatus,
} from "./api-interfaces";

export interface ReferenceRequest {
  name: string;
  description?: string;
  color?: string;
  isActive?: boolean;
}

export interface CalendarQuery {
  from: string;
  to: string;
  limit?: number;
  userId?: string;
  userIds?: string[];
  clientId?: string;
  caseId?: string;
  sourceType?: CalendarSourceType;
  sourceTypes?: Array<CalendarSourceType>;
  status?: string;
  statuses?: string[];
  includeNoDueDate?: boolean;
}

export interface EventRequest {
  type: EventType;
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  isAllDay?: boolean;
  location?: string;
  meetingUrl?: string;
  courtName?: string;
  courtroom?: string;
  caseId?: string;
  assigneeUserIds?: string[];
  clientIds?: string[];
  attendees?: Array<{
    clientContactId?: string;
    displayName: string;
    email?: string;
  }>;
}

export interface EventListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  from?: string;
  to?: string;
  type?: EventDetail["type"];
  status?: EventDetail["status"];
  statuses?: EventDetail["status"][];
  caseId?: string;
  clientId?: string;
  userId?: string;
  userIds?: string[];
}

export interface TaskListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  from?: string;
  to?: string;
  status?: TaskStatus;
  statuses?: TaskStatus[];
  priority?: CasePriority;
  assigneeUserId?: string;
  assigneeUserIds?: string[];
  caseId?: string;
  clientId?: string;
  deadlineId?: string;
}

export interface DeadlineListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  from?: string;
  to?: string;
  status?: DeadlineStatus;
  statuses?: DeadlineStatus[];
  type?: DeadlineType;
  responsibleUserId?: string;
  responsibleUserIds?: string[];
  caseId?: string;
  clientId?: string;
}

export interface DeadlineRequest {
  title: string;
  description?: string;
  type: DeadlineType;
  dueDate?: string;
  dueAt?: string;
  timeZone: string;
  responsibleUserId: string;
  caseId?: string;
  clientId?: string;
  sourceDescription?: string;
}

export interface ClientListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  status?: ClientStatus;
  type?: ClientType;
  responsibleUserId?: string;
  tags?: string[];
}

export interface CaseRequest {
  clientId: string;
  caseNumber: string;
  name: string;
  responsibleUserId: string;
  description?: string;
  caseTypeId?: string;
  practiceAreaId?: string;
  status?: CaseStatus;
  priority?: CasePriority;
  openedDate?: string;
  externalReference?: string;
  confidentialityLevel?: string;
  tagIds?: string[];
  opposingPartyName?: string;
  opposingPartyAddress?: string;
}

export interface ActivityRequest {
  type: ActivityType;
  title: string;
  description?: string;
  activityDate: string;
  relatedCaseId?: string;
  /** Create only: minutes spent, which records a billable work entry. */
  durationMinutes?: number;
}

export interface ClientAddressRequest {
  addressType: ClientAddressType;
  street: string;
  streetAdditional?: string;
  city: string;
  postalCode: string;
  stateOrRegion?: string;
  country: string;
  note?: string;
  isPrimary?: boolean;
}

export interface ClientIdentificationDocumentRequest {
  type: string;
  number: string;
  issuedDate?: string;
  expiredDate?: string;
  country: string;
}

export interface ClientIdentificationDocument {
  id: string;
  clientId: string;
  type: string;
  number: string;
  country: string;
  issuedDate: string | null;
  expiredDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientContactRequest {
  firstName: string;
  lastName: string;
  position?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
  notes?: string;
}

export interface ClientActivityQuery {
  page?: number;
  pageSize?: number;
  type?: ActivityRequest["type"];
  includeCaseActivities?: boolean;
}

export interface CaseCloseRequest {
  closedDate: string;
  closingNote?: string;
}

export interface CaseResponsibilityRequest {
  userId: string;
  isPrimary?: boolean;
  startedAt?: string;
}

export interface CaseActivityQuery extends PaginationQuery {
  types?: ActivityRequest["type"][];
}

export type CaseResponsibilityQuery = PaginationQuery;

export interface CaseLinksQuery {
  page?: number;
  draftPage?: number;
  pageSize?: number;
}

export interface CaseLinksResponse {
  sessions: PaginatedResponse<{
    id: string;
    title: string | null;
    updatedAt: string;
    draftCount: number;
  }>;
  drafts: PaginatedResponse<{
    id: string;
    sessionId: string;
    documentType: DraftDocumentType;
    approvalStatus: DraftApprovalStatus;
    reviewedAt: string | null;
    createdAt: string;
  }>;
  /** Latest assistant timeline of the case's documents, if any. */
  latestTimeline?: {
    id: string;
    sessionId: string;
    createdAt: string;
    summary: string;
    eventCount: number;
  } | null;
}

export interface CaseResponsibilityUpdateRequest {
  startedAt?: string;
}

export interface DomainActivity {
  id: string;
  type: ActivityRequest["type"];
  title: string;
  description: string | null;
  activityDate: string;
  source: ActivitySource;
  relatedCaseId?: string | null;
}

export interface ClientAddress extends ClientAddressRequest {
  id: string;
  isPrimary: boolean;
}

export interface ClientContact extends ClientContactRequest {
  id: string;
  status: ClientContactStatus;
  isPrimary: boolean;
}

export interface CaseResponsibility {
  id: string;
  userId: string;
  isPrimary: boolean;
  startedAt: string;
  endedAt: string | null;
}
