import { ChatStreamEvent, WorkspaceRole } from "./api-interfaces";

describe("apiInterfaces", () => {
  it("exposes workspace roles for auth and chat", () => {
    expect(WorkspaceRole.MEMBER).toBe("MEMBER");
  });

  it("accepts chat stream event shapes", () => {
    const event: ChatStreamEvent = {
      type: "triage.started",
      sessionId: "session-1",
      createdAt: new Date(0).toISOString(),
    };
    expect(event.type).toBe("triage.started");
  });
});
