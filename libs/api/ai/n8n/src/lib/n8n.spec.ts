import type { N8nWorkflowClient } from "./n8n";

describe("N8nWorkflowClient", () => {
  it("can represent a server-side workflow client", () => {
    const client: N8nWorkflowClient = {
      start: async () => ({
        workflow: "triage",
        correlationId: "correlation-1",
        status: "queued",
      }),
    };

    expect(client).toBeDefined();
  });
});
