import {
  AgentToolCallStatus,
  AgentToolCallSummary,
  ChatEventType,
  ChatMessageStatus,
  ChatSessionDetail,
  ChatStreamEvent,
  ChatWorkflowName,
  WorkflowJobResponse,
  WorkflowJobStatus,
  WorkflowProgressStage,
} from "@law/api-interfaces";
import {
  CHAT_WORKFLOW_AGENT_LABELS,
  WORKFLOW_PROGRESS_STAGE_LABELS,
} from "../../shared/models";

export const WorkflowActivityStatus = {
  ACTIVE: "active",
  WAITING: "waiting",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;
export type WorkflowActivityStatus =
  (typeof WorkflowActivityStatus)[keyof typeof WorkflowActivityStatus];

export const WorkflowActivityKind = {
  ANSWER: "answer",
  DRAFT: "draft",
  OTHER: "other",
} as const;
export type WorkflowActivityKind =
  (typeof WorkflowActivityKind)[keyof typeof WorkflowActivityKind];

export const WorkflowActivityStepKind = {
  JOB: "job",
  TOOL: "tool",
} as const;
export type WorkflowActivityStepKind =
  (typeof WorkflowActivityStepKind)[keyof typeof WorkflowActivityStepKind];

const ANSWER_WORKFLOWS: readonly ChatWorkflowName[] = [
  ChatWorkflowName.ANSWERING,
  ChatWorkflowName.AGENT_TURN,
  ChatWorkflowName.AGENT_RESUME,
];

export interface WorkflowActivity {
  correlationId: string;
  jobsById: Readonly<Record<string, WorkflowJobResponse>>;
  toolCallsById: Readonly<Record<string, AgentToolCallSummary>>;
  messageStatus: ChatMessageStatus | null;
  hasDraft: boolean;
  startedAt: string;
  updatedAt: string;
}

export type WorkflowActivityState = Readonly<Record<string, WorkflowActivity>>;

export interface WorkflowActivityViewModel {
  correlationId: string;
  status: WorkflowActivityStatus;
  kind: WorkflowActivityKind;
  stage: WorkflowProgressStage;
  titleKey: string;
  agentKey: string;
  startedAt: string;
  updatedAt: string;
  hasDraft: boolean;
  retryJobId: string | null;
  steps: readonly WorkflowActivityStep[];
}

export interface WorkflowActivityStep {
  id: string;
  kind: WorkflowActivityStepKind;
  titleKey: string;
  /** Agent label key for job steps; null for tool steps. */
  agentKey: string | null;
  status: WorkflowJobResponse["status"];
  /** Tool steps: the tool's main argument (e.g. the search query). */
  detail: string | null;
  resultCount: number | null;
}

export function buildWorkflowActivityState(
  detail: Pick<ChatSessionDetail, "jobs" | "messages" | "drafts" | "toolCalls">,
): WorkflowActivityState {
  let state: WorkflowActivityState = {};
  for (const job of detail.jobs) state = mergeJob(state, job);
  for (const toolCall of detail.toolCalls ?? []) {
    state = mergeToolCall(state, toolCall);
  }
  for (const message of detail.messages) {
    if (!message.correlationId) continue;
    state = mergeMessageStatus(
      state,
      message.correlationId,
      message.status,
      message.createdAt,
    );
  }
  for (const draft of detail.drafts) {
    const job = detail.jobs.find((item) => item.id === draft.jobId);
    if (!job) continue;
    state = markDraft(
      state,
      job.correlationId,
      draft.updatedAt ?? draft.createdAt,
    );
  }
  return state;
}

export function reduceWorkflowActivityEvent(
  state: WorkflowActivityState,
  event: ChatStreamEvent,
): WorkflowActivityState {
  const correlationId =
    event.job?.correlationId ??
    event.message?.correlationId ??
    event.correlationId ??
    null;
  if (!correlationId) return state;

  if (
    (event.type === ChatEventType.JOB_QUEUED ||
      event.type === ChatEventType.JOB_UPDATED) &&
    event.job
  ) {
    return mergeJob(state, event.job);
  }
  if (
    (event.type === ChatEventType.TOOL_STARTED ||
      event.type === ChatEventType.TOOL_FINISHED) &&
    event.toolCall
  ) {
    return mergeToolCall(state, event.toolCall);
  }
  if (event.type === ChatEventType.DRAFT_UPDATED) {
    return markDraft(state, correlationId, event.createdAt);
  }
  if (event.type === ChatEventType.MESSAGE_STARTED) {
    return mergeMessageStatus(
      state,
      correlationId,
      ChatMessageStatus.PENDING,
      event.createdAt,
    );
  }
  if (event.type === ChatEventType.MESSAGE_UPDATED && event.message) {
    return mergeMessageStatus(
      state,
      correlationId,
      event.message.status,
      event.createdAt,
    );
  }
  return state;
}

export function selectWorkflowActivities(
  state: WorkflowActivityState,
): readonly WorkflowActivityViewModel[] {
  return Object.values(state)
    .map(toViewModel)
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

function mergeJob(
  state: WorkflowActivityState,
  job: WorkflowJobResponse,
): WorkflowActivityState {
  const current = state[job.correlationId];
  const previousJob = current?.jobsById[job.id];
  if (previousJob && previousJob.updatedAt > job.updatedAt) return state;
  const activity = current ?? createActivity(job.correlationId, job.createdAt);
  return {
    ...state,
    [job.correlationId]: {
      ...activity,
      jobsById: { ...activity.jobsById, [job.id]: job },
      updatedAt:
        activity.updatedAt > job.updatedAt ? activity.updatedAt : job.updatedAt,
    },
  };
}

function mergeToolCall(
  state: WorkflowActivityState,
  toolCall: AgentToolCallSummary,
): WorkflowActivityState {
  const current = state[toolCall.correlationId];
  const previous = current?.toolCallsById[toolCall.id];
  // A late "started" event must not reopen a finished call.
  if (
    previous &&
    previous.status !== AgentToolCallStatus.RUNNING &&
    toolCall.status === AgentToolCallStatus.RUNNING
  ) {
    return state;
  }
  const activity =
    current ?? createActivity(toolCall.correlationId, toolCall.startedAt);
  const updatedAt = toolCall.finishedAt ?? toolCall.startedAt;
  return {
    ...state,
    [toolCall.correlationId]: {
      ...activity,
      toolCallsById: { ...activity.toolCallsById, [toolCall.id]: toolCall },
      updatedAt:
        activity.updatedAt > updatedAt ? activity.updatedAt : updatedAt,
    },
  };
}

function mergeMessageStatus(
  state: WorkflowActivityState,
  correlationId: string,
  messageStatus: ChatMessageStatus,
  updatedAt: string,
): WorkflowActivityState {
  const activity =
    state[correlationId] ?? createActivity(correlationId, updatedAt);
  return {
    ...state,
    [correlationId]: {
      ...activity,
      messageStatus,
      updatedAt:
        activity.updatedAt > updatedAt ? activity.updatedAt : updatedAt,
    },
  };
}

function markDraft(
  state: WorkflowActivityState,
  correlationId: string,
  updatedAt: string,
): WorkflowActivityState {
  const activity =
    state[correlationId] ?? createActivity(correlationId, updatedAt);
  return {
    ...state,
    [correlationId]: {
      ...activity,
      hasDraft: true,
      updatedAt:
        activity.updatedAt > updatedAt ? activity.updatedAt : updatedAt,
    },
  };
}

function createActivity(
  correlationId: string,
  createdAt: string,
): WorkflowActivity {
  return {
    correlationId,
    jobsById: {},
    toolCallsById: {},
    messageStatus: null,
    hasDraft: false,
    startedAt: createdAt,
    updatedAt: createdAt,
  };
}

function toViewModel(activity: WorkflowActivity): WorkflowActivityViewModel {
  const jobs = Object.values(activity.jobsById);
  const activeJobs = jobs.filter(
    (job) =>
      job.status === WorkflowJobStatus.QUEUED ||
      job.status === WorkflowJobStatus.RUNNING,
  );
  const latestJob = [...(activeJobs.length ? activeJobs : jobs)].sort(
    (left, right) => right.updatedAt.localeCompare(left.updatedAt),
  )[0];
  const failed =
    !activeJobs.length &&
    jobs.some((job) => job.status === WorkflowJobStatus.FAILED);
  const waiting = jobs.some(
    (job) => job.status === WorkflowJobStatus.WAITING_CONFIRMATION,
  );
  const status: WorkflowActivityStatus = activeJobs.length
    ? WorkflowActivityStatus.ACTIVE
    : waiting
      ? WorkflowActivityStatus.WAITING
      : failed || activity.messageStatus === ChatMessageStatus.FAILED
        ? WorkflowActivityStatus.FAILED
        : WorkflowActivityStatus.COMPLETED;
  const kind: WorkflowActivityKind =
    activity.hasDraft ||
    jobs.some((job) => job.workflowName === ChatWorkflowName.DRAFTING)
      ? WorkflowActivityKind.DRAFT
      : jobs.some((job) => ANSWER_WORKFLOWS.includes(job.workflowName))
        ? WorkflowActivityKind.ANSWER
        : WorkflowActivityKind.OTHER;
  const stage = latestJob?.progressStage ?? fallbackStage(latestJob);
  const toolCalls = Object.values(activity.toolCallsById).sort((left, right) =>
    left.startedAt.localeCompare(right.startedAt),
  );
  const runningTools =
    status === WorkflowActivityStatus.ACTIVE
      ? toolCalls.filter(
          (toolCall) => toolCall.status === AgentToolCallStatus.RUNNING,
        )
      : [];
  const runningTool = runningTools[runningTools.length - 1];

  return {
    correlationId: activity.correlationId,
    status,
    kind,
    stage,
    titleKey: runningTool
      ? `assistant.workflow.toolActive.${runningTool.toolName}`
      : status === WorkflowActivityStatus.WAITING
        ? "assistant.workflow.waitingConfirmation"
        : status === WorkflowActivityStatus.ACTIVE
          ? WORKFLOW_PROGRESS_STAGE_LABELS[stage]
          : status === WorkflowActivityStatus.FAILED
            ? "assistant.workflow.failed"
            : kind === WorkflowActivityKind.DRAFT
              ? "assistant.workflow.draftReady"
              : kind === WorkflowActivityKind.ANSWER
                ? "assistant.workflow.answerReady"
                : "assistant.workflow.completed",
    agentKey:
      CHAT_WORKFLOW_AGENT_LABELS[
        latestJob?.workflowName ?? ChatWorkflowName.TRIAGE
      ],
    startedAt: activity.startedAt,
    updatedAt: activity.updatedAt,
    hasDraft: activity.hasDraft,
    retryJobId:
      status === WorkflowActivityStatus.FAILED
        ? ([...jobs]
            .filter((job) => job.status === WorkflowJobStatus.FAILED)
            .sort((left, right) =>
              right.updatedAt.localeCompare(left.updatedAt),
            )[0]?.id ?? null)
        : null,
    steps: [...jobs]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .flatMap((job): WorkflowActivityStep[] => [
        {
          id: job.id,
          kind: WorkflowActivityStepKind.JOB,
          titleKey:
            WORKFLOW_PROGRESS_STAGE_LABELS[
              job.progressStage ?? fallbackStage(job)
            ],
          agentKey: CHAT_WORKFLOW_AGENT_LABELS[job.workflowName],
          status: job.status,
          detail: null,
          resultCount: null,
        },
        ...toolCalls
          .filter((toolCall) => toolCall.jobId === job.id)
          .map(
            (toolCall): WorkflowActivityStep => ({
              id: toolCall.id,
              kind: WorkflowActivityStepKind.TOOL,
              titleKey: `assistant.workflow.tool.${toolCall.toolName}`,
              agentKey: null,
              status: toolCall.status,
              detail: toolCall.label,
              resultCount: toolCall.resultCount,
            }),
          ),
      ]),
  };
}

function fallbackStage(job?: WorkflowJobResponse): WorkflowProgressStage {
  switch (job?.workflowName) {
    case ChatWorkflowName.ANSWERING:
    case ChatWorkflowName.AGENT_TURN:
    case ChatWorkflowName.AGENT_RESUME:
      return WorkflowProgressStage.PREPARING_ANSWER;
    case ChatWorkflowName.BRIEF_EXTRACTION:
      return WorkflowProgressStage.EXTRACTING_FACTS;
    case ChatWorkflowName.DRAFTING:
      return WorkflowProgressStage.PREPARING_DRAFT;
    default:
      return WorkflowProgressStage.UNDERSTANDING_REQUEST;
  }
}
