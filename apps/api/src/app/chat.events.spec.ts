import { ChatEventBus } from "@law/chat";

describe("ChatEventBus workspace streams", () => {
  it("delivers only events from the subscribed workspace", () => {
    const events = new ChatEventBus();
    const received: string[] = [];
    events
      .streamWorkspace("workspace-1")
      .subscribe((event) => received.push(event.sessionId));

    events.emit({
      type: "job.queued",
      sessionId: "session-1",
      createdAt: "2026-09-15T12:00:00.000Z",
      job: {
        id: "job-1",
        workspaceId: "workspace-1",
        sessionId: "session-1",
        workflowName: "triage",
        status: "QUEUED",
        correlationId: "corr-1",
        createdAt: "2026-09-15T12:00:00.000Z",
        updatedAt: "2026-09-15T12:00:00.000Z",
      },
    });
    events.emit({
      type: "error",
      workspaceId: "workspace-2",
      sessionId: "session-2",
      createdAt: "2026-09-15T12:00:01.000Z",
      error: "failed",
    });

    expect(received).toEqual(["session-1"]);
  });
});
