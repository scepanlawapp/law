import {
  ChatMessageStatus,
  ChatSessionDetail,
  ChatStreamEvent,
  WorkflowJobResponse,
  WorkflowProgressStage,
} from "@law/api-interfaces";

export type WorkflowActivityStatus = "active" | "completed" | "failed";
export type WorkflowActivityKind = "answer" | "draft" | "other";

export interface WorkflowActivity {
  correlationId: string;
  jobsById: Readonly<Record<string, WorkflowJobResponse>>;
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
  titleKey: string;
  agentKey: string;
  status: WorkflowJobResponse["status"];
}

export function buildWorkflowActivityState(
  detail: Pick<ChatSessionDetail, "jobs" | "messages" | "drafts">,
): WorkflowActivityState {
  let state: WorkflowActivityState = {};
  for (const job of detail.jobs) state = mergeJob(state, job);
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
  const status: WorkflowActivityStatus = activeJobs.length
    ? "active"
    : failed || activity.messageStatus === "FAILED"
      ? "failed"
      : "completed";
  const kind: WorkflowActivityKind = activity.hasDraft || jobs.some((job) => job.workflowName === "drafting")
    ? "draft"
    : jobs.some((job) => job.workflowName === "answering")
      ? "answer"
      : "other";
  const stage = latestJob?.progressStage ?? fallbackStage(latestJob);

  return {
    correlationId: activity.correlationId,
    status,
    kind,
    stage,
    titleKey:
      status === "active"
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
      .map((job) => ({
        id: job.id,
        titleKey: `assistant.workflow.stage.${job.progressStage ?? fallbackStage(job)}`,
        agentKey: `assistant.workflow.agent.${job.workflowName}`,
        status: job.status,
      })),
  };
}

function fallbackStage(job?: WorkflowJobResponse): WorkflowProgressStage {
  switch (job?.workflowName) {
    case "answering":
      return "PREPARING_ANSWER";
    case "brief-extraction":
      return "EXTRACTING_FACTS";
    case "drafting":
      return "PREPARING_DRAFT";
    default:
      return "UNDERSTANDING_REQUEST";
  }
}
