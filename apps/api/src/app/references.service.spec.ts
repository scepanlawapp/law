import { WorkspaceContextService } from "@law/core";
import { WorkspaceRole } from "@law/api-interfaces";
import { ReferencesService } from "@law/references";

describe("ReferencesService users", () => {
  it("orders active workspace users by name then email", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ReferencesService({
      workspaceMember: { findMany },
    } as never);
    const workspaceId = "11111111-1111-4111-a111-111111111111";

    await WorkspaceContextService.run(
      { workspaceId, userId: "user-1", role: WorkspaceRole.OWNER },
      () => service.users(),
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId, status: "ACTIVE" },
        orderBy: [
          { user: { firstName: "asc" } },
          { user: { lastName: "asc" } },
          { user: { email: "asc" } },
        ],
      }),
    );
  });
});
