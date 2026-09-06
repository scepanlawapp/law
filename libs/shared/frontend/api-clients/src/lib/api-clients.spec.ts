import { chatEventsUrl } from "./chat-events-url";

describe("chatEventsUrl", () => {
  it("builds an SSE URL with workspace id", () => {
    expect(
      chatEventsUrl(
        "http://localhost:3000",
        "/api",
        "workspace-1",
        "session-1",
        "2026-09-06T00:00:00.000Z",
      ),
    ).toBe(
      "http://localhost:3000/api/chat/sessions/session-1/events?workspaceId=workspace-1&after=2026-09-06T00%3A00%3A00.000Z",
    );
  });
});
