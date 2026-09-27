import { NotFoundException } from "@nestjs/common";
import { WorkspaceContextService } from "@law/core";
import { WorkspaceRole } from "@law/api-interfaces";
import { AssistantToolsAdapter } from "@law/chat";

function summary(id: string, caseNumber: string, name = "Spor") {
  return {
    id,
    caseNumber,
    name,
    status: "ACTIVE",
    priority: "NORMAL",
    client: { displayName: "Petar Petrović" },
    responsibleUser: { displayName: "Advokat" },
    openedDate: null,
    closedDate: null,
  };
}

function casesMock() {
  return {
    get: jest.fn((id: string) =>
      id === "missing"
        ? Promise.reject(new NotFoundException())
        : Promise.resolve({
            ...summary(id, "P-1/2026"),
            description: "Neisplaćene zarade",
            opposingPartyName: "Alfa d.o.o.",
          }),
    ),
    list: jest.fn(),
  };
}

function inWorkspace<T>(workspaceId: string, fn: () => Promise<T>): Promise<T> {
  return WorkspaceContextService.run(
    { userId: "system-workflow", workspaceId, role: WorkspaceRole.ADMIN },
    fn,
  );
}

describe("AssistantToolsAdapter.lookupCase", () => {
  it("returns the linked case when no reference is given", async () => {
    const cases = casesMock();
    const adapter = new AssistantToolsAdapter(undefined, cases as never);

    const result = await inWorkspace("workspace-1", () =>
      adapter.lookupCase({
        workspaceId: "workspace-1",
        sessionCaseId: "case-1",
      }),
    );

    expect(result).toMatchObject({
      found: "one",
      case: {
        caseNumber: "P-1/2026",
        opposingParty: "Alfa d.o.o.",
        client: "Petar Petrović",
      },
    });
  });

  it("refuses when the job's workspace differs from the tool's workspace", async () => {
    const cases = casesMock();
    const adapter = new AssistantToolsAdapter(undefined, cases as never);

    const result = await inWorkspace("workspace-2", () =>
      adapter.lookupCase({
        workspaceId: "workspace-1",
        sessionCaseId: "case-1",
      }),
    );

    expect(result.found).toBe("none");
    expect(cases.get).not.toHaveBeenCalled();
  });

  it("prefers an exact case-number match and lists candidates otherwise", async () => {
    const cases = casesMock();
    cases.list.mockResolvedValueOnce({
      items: [summary("case-1", "P-1/2026"), summary("case-2", "P-10/2026")],
    });
    cases.list.mockResolvedValueOnce({
      items: [
        summary("case-3", "P-3/2026", "Razvod"),
        summary("case-4", "P-4/2026", "Razvod"),
      ],
    });
    const adapter = new AssistantToolsAdapter(undefined, cases as never);

    const exact = await inWorkspace("workspace-1", () =>
      adapter.lookupCase({
        workspaceId: "workspace-1",
        sessionCaseId: null,
        reference: "p-1/2026",
      }),
    );
    const many = await inWorkspace("workspace-1", () =>
      adapter.lookupCase({
        workspaceId: "workspace-1",
        sessionCaseId: null,
        reference: "Razvod",
      }),
    );

    expect(cases.get).toHaveBeenCalledWith("case-1");
    expect(exact).toMatchObject({ found: "one" });
    expect(many).toMatchObject({ found: "many" });
    expect((many as { candidates: unknown[] }).candidates).toHaveLength(2);
    expect(cases.list).toHaveBeenCalledWith(
      expect.objectContaining({ search: "Razvod", page: 1, pageSize: 5 }),
    );
  });

  it("explains when the conversation has no linked case", async () => {
    const adapter = new AssistantToolsAdapter(undefined, casesMock() as never);

    await expect(
      inWorkspace("workspace-1", () =>
        adapter.lookupCase({ workspaceId: "workspace-1", sessionCaseId: null }),
      ),
    ).resolves.toMatchObject({ found: "none" });
  });
});
