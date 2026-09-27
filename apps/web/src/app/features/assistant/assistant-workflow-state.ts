import {
  AgentToolCallSummary,
  ChatMessageStatus,
  ChatSessionDetail,
  ChatStreamEvent,
  WorkflowJobResponse,
  WorkflowProgressStage,
} from "@law/api-interfaces";

export type WorkflowActivityStatus =
  | "active"
  | "waiting"
  | "completed"
  | "failed";
export type WorkflowActivityKind = "answer" | "draft" | "other";

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
  kind: "job" | "tool";
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
    state = markDraft(state, job.correlationId, draft.updatedAt ?? draft.createdAt);
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

  if ((event.type === "job.queued" || event.type === "job.updated") && event.job) {
    return mergeJob(state, event.job);
  }
  if (
    (event.type === "tool.started" || event.type === "tool.finished") &&
    event.toolCall
  ) {
    return mergeToolCall(state, event.toolCall);
  }
  if (event.type === "draft.updated") {
    return markDraft(state, correlationId, event.createdAt);
  }
  if (event.type === "message.started") {
    return mergeMessageStatus(state, correlationId, "PENDING", event.createdAt);
  }
  if (event.type === "message.updated" && event.message) {
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
  if (previous && previous.status !== "RUNNING" && toolCall.status === "RUNNING") {
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
      updatedAt: activity.updatedAt > updatedAt ? activity.updatedAt : updatedAt,
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
      updatedAt: activity.updatedAt > updatedAt ? activity.updatedAt : updatedAt,
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
      updatedAt: activity.updatedAt > updatedAt ? activity.updatedAt : updatedAt,
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
    (job) => job.status === "QUEUED" || job.status === "RUNNING",
  );
  const latestJob = [...(activeJobs.length ? activeJobs : jobs)].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )[0];
  const failed = !activeJobs.length && jobs.some((job) => job.status === "FAILED");
  const waiting = jobs.some((job) => job.status === "WAITING_CONFIRMATION");
  const status: WorkflowActivityStatus = activeJobs.length
    ? "active"
    : waiting
      ? "waiting"
      : failed || activity.messageStatus === "FAILED"
        ? "failed"
        : "completed";
  const kind: WorkflowActivityKind = activity.hasDraft || jobs.some((job) => job.workflowName === "drafting")
    ? "draft"
    : jobs.some((job) => isAnswerWorkflow(job.workflowName))
      ? "answer"
      : "other";
  const stage = latestJob?.progressStage ?? fallbackStage(latestJob);
  const toolCalls = Object.values(activity.toolCallsById).sort((left, right) =>
    left.startedAt.localeCompare(right.startedAt),
  );
  const runningTools =
    status === "active"
      ? toolCalls.filter((toolCall) => toolCall.status === "RUNNING")
      : [];
  const runningTool = runningTools[runningTools.length - 1];

  return {
    correlationId: activity.correlationId,
    status,
    kind,
    stage,
    titleKey: runningTool
      ? `assistant.workflow.toolActive.${runningTool.toolName}`
      : status === "waiting"
        ? "assistant.workflow.waitingConfirmation"
        : status === "active"
        ? `assistant.workflow.stage.${stage}`
        : status === "failed"
          ? "assistant.workflow.failed"
          : kind === "draft"
            ? "assistant.workflow.draftReady"
            : kind === "answer"
              ? "assistant.workflow.answerReady"
              : "assistant.workflow.completed",
    agentKey: `assistant.workflow.agent.${latestJob?.workflowName ?? "triage"}`,
    startedAt: activity.startedAt,
    updatedAt: activity.updatedAt,
    hasDraft: activity.hasDraft,
    retryJobId:
      status === "failed"
        ? ([...jobs]
            .filter((job) => job.status === "FAILED")
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
            ?.id ?? null)
        : null,
    steps: [...jobs]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .flatMap((job): WorkflowActivityStep[] => [
        {
          id: job.id,
          kind: "job",
          titleKey: `assistant.workflow.stage.${job.progressStage ?? fallbackStage(job)}`,
          agentKey: `assistant.workflow.agent.${job.workflowName}`,
          status: job.status,
          detail: null,
          resultCount: null,
        },
        ...toolCalls
          .filter((toolCall) => toolCall.jobId === job.id)
          .map(
            (toolCall): WorkflowActivityStep => ({
              id: toolCall.id,
              kind: "tool",
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

function isAnswerWorkflow(name: WorkflowJobResponse["workflowName"]): boolean {
  return (
    name === "answering" || name === "agent-turn" || name === "agent-resume"
  );
}

function fallbackStage(job?: WorkflowJobResponse): WorkflowProgressStage {
  switch (job?.workflowName) {
    case "answering":
    case "agent-turn":
    case "agent-resume":
      return "PREPARING_ANSWER";
    case "brief-extraction":
      return "EXTRACTING_FACTS";
    case "drafting":
      return "PREPARING_DRAFT";
    default:
      return "UNDERSTANDING_REQUEST";
  }
}
