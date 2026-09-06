import type { WorkflowRequest, WorkflowResult } from "./contracts";

describe("workflow contracts", () => {
  it("supports scoped workflow requests and results", () => {
    const request: WorkflowRequest<{ message: string }> = {
      workflow: "triage",
      correlationId: "correlation-1",
      authorization: { actorId: "actor-1", workspaceId: "workspace-1" },
      input: { message: "Legal intake request" },
    };
    const result: WorkflowResult<{ accepted: boolean }> = {
      workflow: request.workflow,
      correlationId: request.correlationId,
      status: "completed",
      output: { accepted: true },
    };

    expect(result.output?.accepted).toBe(true);
  });
});
