import {
  ChatSessionDetail,
  ChatStreamEvent,
  WorkflowJobResponse,
} from "@law/api-interfaces";
import {
  buildWorkflowActivityState,
  reduceWorkflowActivityEvent,
  selectWorkflowActivities,
} from "./assistant-workflow-state";

const job = (
  id: string,
  correlationId: string,
  status: WorkflowJobResponse["status"],
  workflowName: WorkflowJobResponse["workflowName"] = "triage",
  updatedAt = "2026-09-15T12:00:00.000Z",
): WorkflowJobResponse => ({
  id,
  workspaceId: "workspace-1",
  sessionId: "session-1",
  workflowName,
  status,
  correlationId,
  progressStage:
    workflowName === "answering" ? "PREPARING_ANSWER" : "UNDERSTANDING_REQUEST",
  errorCode: null,
  createdAt: "2026-09-15T11:59:00.000Z",
  updatedAt,
});

const detail = (jobs: WorkflowJobResponse[]): ChatSessionDetail => ({
  id: "session-1",
  workspaceId: "workspace-1",
  createdByUserId: "user-1",
  title: "Test",
  status: "ACTIVE",
  isDeleted: false,
  createdAt: "2026-09-15T11:00:00.000Z",
  updatedAt: "2026-09-15T12:00:00.000Z",
  messages: [],
  jobs,
  drafts: [],
  latestBriefId: null,
});

describe("assistant workflow state", () => {
  it("keeps concurrent correlations independent", () => {
    const state = buildWorkflowActivityState(
      detail([
        job("job-1", "corr-1", "RUNNING"),
        job("job-2", "corr-2", "COMPLETED", "answering"),
      ]),
    );

    expect(selectWorkflowActivities(state)).toEqual([
      expect.objectContaining({ correlationId: "corr-1", status: "active" }),
      expect.objectContaining({
        correlationId: "corr-2",
        status: "completed",
        kind: "answer",
      }),
    ]);
  });

  it("rejects an older job update", () => {
    const current = buildWorkflowActivityState(
      detail([job("job-1", "corr-1", "RUNNING")]),
    );
    const stale: ChatStreamEvent = {
      type: "job.updated",
      sessionId: "session-1",
      createdAt: "2026-09-15T11:00:00.000Z",
      job: job(
        "job-1",
        "corr-1",
        "QUEUED",
        "triage",
        "2026-09-15T11:00:00.000Z",
      ),
    };

    const next = reduceWorkflowActivityEvent(current, stale);

    expect(next).toBe(current);
  });

  it("tracks streamed message and draft completion events", () => {
    let state = buildWorkflowActivityState(
      detail([job("job-1", "corr-1", "RUNNING", "answering")]),
    );
    state = reduceWorkflowActivityEvent(state, {
      type: "message.started",
      sessionId: "session-1",
      correlationId: "corr-1",
      createdAt: "2026-09-15T12:00:01.000Z",
    });
    state = reduceWorkflowActivityEvent(state, {
      type: "job.updated",
      sessionId: "session-1",
      createdAt: "2026-09-15T12:00:02.000Z",
      job: job(
        "job-1",
        "corr-1",
        "COMPLETED",
        "answering",
        "2026-09-15T12:00:02.000Z",
      ),
    });
    state = reduceWorkflowActivityEvent(state, {
      type: "draft.updated",
      sessionId: "session-1",
      correlationId: "corr-1",
      createdAt: "2026-09-15T12:00:03.000Z",
    });

    expect(selectWorkflowActivities(state)).toEqual([
      expect.objectContaining({
        correlationId: "corr-1",
        status: "completed",
        kind: "draft",
        hasDraft: true,
      }),
    ]);
  });
});
