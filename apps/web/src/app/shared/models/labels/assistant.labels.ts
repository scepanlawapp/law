import {
  AssistantPermissionMode,
  BriefMissingFieldKey,
  CaseTimelineEventKind,
  CaseTimelineSourceStatus,
  ChatAttachmentExtractionStatus,
  ChatSessionScope,
  ChatSessionStateFilter,
  ChatWorkflowName,
  ContractIssueCategory,
  ContractIssueRisk,
  ContractReviewType,
  DocumentAnalysisKind,
  DocumentScript,
  DraftApprovalStatus,
  DraftDocumentFamily,
  DraftDocumentType,
  PendingActionResultEntityType,
  PendingActionStatus,
  WorkflowProgressStage,
} from "@law/api-interfaces";
import { LabelMap } from "../select-option";

export const ASSISTANT_PERMISSION_MODE_LABELS: LabelMap<AssistantPermissionMode> =
  {
    [AssistantPermissionMode.MANUAL]: "assistant.permissionMode.MANUAL",
    [AssistantPermissionMode.ASK]: "assistant.permissionMode.ASK",
    [AssistantPermissionMode.AUTO]: "assistant.permissionMode.AUTO",
  };

export const ASSISTANT_PERMISSION_MODE_DESCRIPTIONS: LabelMap<AssistantPermissionMode> =
  {
    [AssistantPermissionMode.MANUAL]:
      "assistant.permissionMode.MANUALDescription",
    [AssistantPermissionMode.ASK]: "assistant.permissionMode.ASKDescription",
    [AssistantPermissionMode.AUTO]: "assistant.permissionMode.AUTODescription",
  };

export const CHAT_SESSION_SCOPE_LABELS: LabelMap<ChatSessionScope> = {
  [ChatSessionScope.MINE]: "assistant.organizer.mine",
  [ChatSessionScope.TEAM]: "assistant.organizer.team",
};

export const CHAT_SESSION_STATE_FILTER_LABELS: LabelMap<ChatSessionStateFilter> =
  {
    [ChatSessionStateFilter.PENDING]: "assistant.organizer.pending",
    [ChatSessionStateFilter.DRAFT]: "assistant.organizer.drafts",
    [ChatSessionStateFilter.ANALYSIS]: "assistant.organizer.analyses",
  };

/** Kinds of typed search tokens in the conversation sidebar; also URL params. */
export const ConversationTokenKind = {
  CLIENT: "client",
  CASE: "case",
  AUTHOR: "author",
  KIND: "kind",
} as const;
export type ConversationTokenKind =
  (typeof ConversationTokenKind)[keyof typeof ConversationTokenKind];

export const CONVERSATION_TOKEN_KIND_LABELS: LabelMap<ConversationTokenKind> = {
  [ConversationTokenKind.CLIENT]: "assistant.organizer.tokenClient",
  [ConversationTokenKind.CASE]: "assistant.organizer.tokenCase",
  [ConversationTokenKind.AUTHOR]: "assistant.organizer.tokenAuthor",
  [ConversationTokenKind.KIND]: "assistant.organizer.tokenKind",
};

export const DOCUMENT_ANALYSIS_KIND_LABELS: LabelMap<DocumentAnalysisKind> = {
  [DocumentAnalysisKind.CONTRACT_REVIEW]:
    "assistant.organizer.kindContractReview",
  [DocumentAnalysisKind.CASE_TIMELINE]: "assistant.organizer.kindCaseTimeline",
};

export const DRAFT_DOCUMENT_TYPE_LABELS: LabelMap<DraftDocumentType> = {
  [DraftDocumentType.LAWSUIT]: "assistant.documentType.LAWSUIT",
  [DraftDocumentType.STATEMENT_OF_DEFENCE]:
    "assistant.documentType.STATEMENT_OF_DEFENCE",
  [DraftDocumentType.APPEAL]: "assistant.documentType.APPEAL",
  [DraftDocumentType.ENFORCEMENT_MOTION]:
    "assistant.documentType.ENFORCEMENT_MOTION",
  [DraftDocumentType.SUBMISSION]: "assistant.documentType.SUBMISSION",
  [DraftDocumentType.SERVICES_CONTRACT]:
    "assistant.documentType.SERVICES_CONTRACT",
  [DraftDocumentType.NDA]: "assistant.documentType.NDA",
  [DraftDocumentType.EMPLOYMENT_CONTRACT]:
    "assistant.documentType.EMPLOYMENT_CONTRACT",
  [DraftDocumentType.COPYRIGHT_LICENCE]:
    "assistant.documentType.COPYRIGHT_LICENCE",
  [DraftDocumentType.DEMAND_LETTER]: "assistant.documentType.DEMAND_LETTER",
  [DraftDocumentType.TERMINATION_NOTICE]:
    "assistant.documentType.TERMINATION_NOTICE",
  [DraftDocumentType.MEDIA_REPLY_REQUEST]:
    "assistant.documentType.MEDIA_REPLY_REQUEST",
  [DraftDocumentType.POWER_OF_ATTORNEY]:
    "assistant.documentType.POWER_OF_ATTORNEY",
  [DraftDocumentType.CORPORATE_DECISION]:
    "assistant.documentType.CORPORATE_DECISION",
};

/** Heading of the evidence/attachment task group per document family. */
export const DRAFT_DOCUMENT_FAMILY_EVIDENCE_LABELS: LabelMap<DraftDocumentFamily> =
  {
    [DraftDocumentFamily.LITIGATION]: "assistant.matter.evidenceGroup",
    [DraftDocumentFamily.CONTRACT]: "assistant.matter.evidenceGroup.CONTRACT",
    [DraftDocumentFamily.LETTER]: "assistant.matter.evidenceGroup.LETTER",
    [DraftDocumentFamily.CORPORATE]: "assistant.matter.evidenceGroup.CORPORATE",
  };

export const DRAFT_APPROVAL_STATUS_LABELS: LabelMap<DraftApprovalStatus> = {
  [DraftApprovalStatus.DRAFT]: "assistant.draftStatus.DRAFT",
  [DraftApprovalStatus.READY_FOR_SIGNOFF]:
    "assistant.draftStatus.READY_FOR_SIGNOFF",
  [DraftApprovalStatus.APPROVED]: "assistant.draftStatus.APPROVED",
  [DraftApprovalStatus.REJECTED]: "assistant.draftStatus.REJECTED",
  [DraftApprovalStatus.CHANGES_REQUESTED]:
    "assistant.draftStatus.CHANGES_REQUESTED",
};

export const DOCUMENT_SCRIPT_LABELS: LabelMap<DocumentScript> = {
  [DocumentScript.LATIN]: "assistant.latin",
  [DocumentScript.CYRILLIC]: "assistant.cyrillic",
};

export const CHAT_ATTACHMENT_EXTRACTION_STATUS_LABELS: LabelMap<ChatAttachmentExtractionStatus> =
  {
    [ChatAttachmentExtractionStatus.PENDING]:
      "assistant.attachmentStatus.PENDING",
    [ChatAttachmentExtractionStatus.RUNNING]:
      "assistant.attachmentStatus.RUNNING",
    [ChatAttachmentExtractionStatus.COMPLETED]:
      "assistant.attachmentStatus.COMPLETED",
    [ChatAttachmentExtractionStatus.FAILED]:
      "assistant.attachmentStatus.FAILED",
    [ChatAttachmentExtractionStatus.UNSUPPORTED]:
      "assistant.attachmentStatus.UNSUPPORTED",
  };

export const WORKFLOW_PROGRESS_STAGE_LABELS: LabelMap<WorkflowProgressStage> = {
  [WorkflowProgressStage.UNDERSTANDING_REQUEST]:
    "assistant.workflow.stage.UNDERSTANDING_REQUEST",
  [WorkflowProgressStage.READING_ATTACHMENTS]:
    "assistant.workflow.stage.READING_ATTACHMENTS",
  [WorkflowProgressStage.EXTRACTING_FACTS]:
    "assistant.workflow.stage.EXTRACTING_FACTS",
  [WorkflowProgressStage.PREPARING_ANSWER]:
    "assistant.workflow.stage.PREPARING_ANSWER",
  [WorkflowProgressStage.PREPARING_DRAFT]:
    "assistant.workflow.stage.PREPARING_DRAFT",
  [WorkflowProgressStage.SAVING_FOR_REVIEW]:
    "assistant.workflow.stage.SAVING_FOR_REVIEW",
};

/** Name of the agent that runs each workflow. */
export const CHAT_WORKFLOW_AGENT_LABELS: LabelMap<ChatWorkflowName> = {
  [ChatWorkflowName.TRIAGE]: "assistant.workflow.agent.triage",
  [ChatWorkflowName.ANSWERING]: "assistant.workflow.agent.answering",
  [ChatWorkflowName.AGENT_TURN]: "assistant.workflow.agent.agent-turn",
  [ChatWorkflowName.AGENT_RESUME]: "assistant.workflow.agent.agent-resume",
  [ChatWorkflowName.BRIEF_EXTRACTION]:
    "assistant.workflow.agent.brief-extraction",
  [ChatWorkflowName.DRAFTING]: "assistant.workflow.agent.drafting",
};

export const PENDING_ACTION_STATUS_LABELS: LabelMap<PendingActionStatus> = {
  [PendingActionStatus.PENDING]: "assistant.pendingAction.status.PENDING",
  [PendingActionStatus.EXECUTING]: "assistant.pendingAction.status.EXECUTING",
  [PendingActionStatus.APPROVED]: "assistant.pendingAction.status.APPROVED",
  [PendingActionStatus.DECLINED]: "assistant.pendingAction.status.DECLINED",
  [PendingActionStatus.FAILED]: "assistant.pendingAction.status.FAILED",
  [PendingActionStatus.EXPIRED]: "assistant.pendingAction.status.EXPIRED",
};

/** "Open …" button label per kind of record an executed action produced. */
export const PENDING_ACTION_RESULT_LABELS: LabelMap<PendingActionResultEntityType> =
  {
    EVENT: "assistant.pendingAction.openResult.EVENT",
    TASK: "assistant.pendingAction.openResult.TASK",
    DEADLINE: "assistant.pendingAction.openResult.DEADLINE",
    WORK_ENTRY: "assistant.pendingAction.openResult.WORK_ENTRY",
    CASE: "assistant.pendingAction.openResult.CASE",
    TIME_REVIEW: "assistant.pendingAction.openResult.TIME_REVIEW",
  };

/** Highest risk first. */
export const CONTRACT_ISSUE_RISK_LABELS: LabelMap<ContractIssueRisk> = {
  [ContractIssueRisk.HIGH]: "assistant.review.risk.HIGH",
  [ContractIssueRisk.MEDIUM]: "assistant.review.risk.MEDIUM",
  [ContractIssueRisk.LOW]: "assistant.review.risk.LOW",
};

export const CONTRACT_ISSUE_CATEGORY_LABELS: LabelMap<ContractIssueCategory> = {
  [ContractIssueCategory.RISK]: "assistant.review.category.RISK",
  [ContractIssueCategory.COMPLIANCE]: "assistant.review.category.COMPLIANCE",
};

export const CONTRACT_REVIEW_TYPE_LABELS: LabelMap<ContractReviewType> = {
  [ContractReviewType.SERVICES_CONTRACT]:
    "assistant.review.type.SERVICES_CONTRACT",
  [ContractReviewType.NDA]: "assistant.review.type.NDA",
  [ContractReviewType.EMPLOYMENT_CONTRACT]:
    "assistant.review.type.EMPLOYMENT_CONTRACT",
  [ContractReviewType.COPYRIGHT_LICENCE]:
    "assistant.review.type.COPYRIGHT_LICENCE",
  [ContractReviewType.OTHER_CONTRACT]: "assistant.review.type.OTHER_CONTRACT",
};

export const CASE_TIMELINE_EVENT_KIND_LABELS: LabelMap<CaseTimelineEventKind> =
  {
    [CaseTimelineEventKind.FILING]: "assistant.timeline.kind.FILING",
    [CaseTimelineEventKind.DECISION]: "assistant.timeline.kind.DECISION",
    [CaseTimelineEventKind.HEARING]: "assistant.timeline.kind.HEARING",
    [CaseTimelineEventKind.CORRESPONDENCE]:
      "assistant.timeline.kind.CORRESPONDENCE",
    [CaseTimelineEventKind.CONTRACT]: "assistant.timeline.kind.CONTRACT",
    [CaseTimelineEventKind.PAYMENT]: "assistant.timeline.kind.PAYMENT",
    [CaseTimelineEventKind.DEADLINE]: "assistant.timeline.kind.DEADLINE",
    [CaseTimelineEventKind.OTHER]: "assistant.timeline.kind.OTHER",
  };

export const CASE_TIMELINE_SOURCE_STATUS_LABELS: LabelMap<CaseTimelineSourceStatus> =
  {
    [CaseTimelineSourceStatus.READ]: "assistant.timeline.sourceStatus.READ",
    [CaseTimelineSourceStatus.TRUNCATED]:
      "assistant.timeline.sourceStatus.TRUNCATED",
    [CaseTimelineSourceStatus.NO_TEXT]:
      "assistant.timeline.sourceStatus.NO_TEXT",
    [CaseTimelineSourceStatus.FAILED]: "assistant.timeline.sourceStatus.FAILED",
    [CaseTimelineSourceStatus.SKIPPED]:
      "assistant.timeline.sourceStatus.SKIPPED",
  };

/** Lawsuit brief fields with a UI label; "other" keeps the model's label. */
export const BRIEF_MISSING_FIELD_LABELS: LabelMap<
  Exclude<BriefMissingFieldKey, typeof BriefMissingFieldKey.other>
> = {
  [BriefMissingFieldKey.plaintiffName]: "assistant.briefField.plaintiffName",
  [BriefMissingFieldKey.plaintiffAddress]:
    "assistant.briefField.plaintiffAddress",
  [BriefMissingFieldKey.plaintiffIdNumber]:
    "assistant.briefField.plaintiffIdNumber",
  [BriefMissingFieldKey.defendantName]: "assistant.briefField.defendantName",
  [BriefMissingFieldKey.defendantAddress]:
    "assistant.briefField.defendantAddress",
  [BriefMissingFieldKey.defendantIdNumber]:
    "assistant.briefField.defendantIdNumber",
  [BriefMissingFieldKey.competentCourt]: "assistant.briefField.competentCourt",
  [BriefMissingFieldKey.claimValue]: "assistant.briefField.claimValue",
  [BriefMissingFieldKey.legalBasis]: "assistant.briefField.legalBasis",
  [BriefMissingFieldKey.factualDescription]:
    "assistant.briefField.factualDescription",
  [BriefMissingFieldKey.reliefSought]: "assistant.briefField.reliefSought",
  [BriefMissingFieldKey.serviceDate]: "assistant.briefField.serviceDate",
  [BriefMissingFieldKey.contractReference]:
    "assistant.briefField.contractReference",
};
