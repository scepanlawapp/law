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
    workflowName === "answering" || workflowName === "agent-turn"
      ? "PREPARING_ANSWER"
      : "UNDERSTANDING_REQUEST",
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

  it("treats a Mastra agent turn as an answer", () => {
    const state = buildWorkflowActivityState(
      detail([
        job("job-1", "corr-1", "COMPLETED"),
        job(
          "job-2",
          "corr-1",
          "RUNNING",
          "agent-turn",
          "2026-09-15T12:01:00.000Z",
        ),
      ]),
    );

    expect(selectWorkflowActivities(state)).toEqual([
      expect.objectContaining({
        correlationId: "corr-1",
        status: "active",
        kind: "answer",
        stage: "PREPARING_ANSWER",
        agentKey: "assistant.workflow.agent.agent-turn",
      }),
    ]);
  });

  it("shows agent tool calls as steps and the running tool as the title", () => {
    const turn = job(
      "job-2",
      "corr-1",
      "RUNNING",
      "agent-turn",
      "2026-09-15T12:01:00.000Z",
    );
    const toolCall = {
      id: "tool-1",
      jobId: "job-2",
      correlationId: "corr-1",
      toolName: "search_legal_sources",
      status: "RUNNING" as const,
      label: "Zakon o radu godišnji odmor",
      resultCount: null,
      durationMs: null,
      startedAt: "2026-09-15T12:01:01.000Z",
      finishedAt: null,
    };
    let state = buildWorkflowActivityState(
      detail([job("job-1", "corr-1", "COMPLETED"), turn]),
    );
    state = reduceWorkflowActivityEvent(state, {
      type: "tool.started",
      sessionId: "session-1",
      correlationId: "corr-1",
      createdAt: toolCall.startedAt,
      toolCall,
    });

    expect(selectWorkflowActivities(state)[0]).toMatchObject({
      titleKey: "assistant.workflow.toolActive.search_legal_sources",
    });

    const finished = {
      ...toolCall,
      status: "COMPLETED" as const,
      resultCount: 3,
      durationMs: 420,
      finishedAt: "2026-09-15T12:01:02.000Z",
    };
    state = reduceWorkflowActivityEvent(state, {
      type: "tool.finished",
      sessionId: "session-1",
      correlationId: "corr-1",
      createdAt: finished.finishedAt,
      toolCall: finished,
    });
    // A late duplicate "started" must not reopen the finished call.
    state = reduceWorkflowActivityEvent(state, {
      type: "tool.started",
      sessionId: "session-1",
      correlationId: "corr-1",
      createdAt: toolCall.startedAt,
      toolCall,
    });

    const [activity] = selectWorkflowActivities(state);
    expect(activity.titleKey).toBe("assistant.workflow.stage.PREPARING_ANSWER");
    expect(activity.steps).toEqual([
      expect.objectContaining({ id: "job-1", kind: "job" }),
      expect.objectContaining({ id: "job-2", kind: "job" }),
      {
        id: "tool-1",
        kind: "tool",
        titleKey: "assistant.workflow.tool.search_legal_sources",
        agentKey: null,
        status: "COMPLETED",
        detail: "Zakon o radu godišnji odmor",
        resultCount: 3,
      },
    ]);
  });

  it("restores tool steps from the session detail after a reload", () => {
    const state = buildWorkflowActivityState({
      ...detail([job("job-2", "corr-1", "COMPLETED", "agent-turn")]),
      toolCalls: [
        {
          id: "tool-1",
          jobId: "job-2",
          correlationId: "corr-1",
          toolName: "get_case",
          status: "COMPLETED",
          label: null,
          resultCount: 1,
          durationMs: 30,
          startedAt: "2026-09-15T11:59:30.000Z",
          finishedAt: "2026-09-15T11:59:31.000Z",
        },
      ],
    });

    expect(
      selectWorkflowActivities(state)[0].steps.map((step) => step.kind),
    ).toEqual(["job", "tool"]);
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
