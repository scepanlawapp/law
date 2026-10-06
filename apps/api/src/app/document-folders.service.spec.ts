import {
  DocumentFoldersService,
  folderSegments,
} from "@law/workspace-documents";
import { WorkspaceContextService } from "@law/core";
import { WorkspaceRole } from "@law/api-interfaces";

const workspaceId = "workspace";
const run = <T>(callback: () => Promise<T>) =>
  WorkspaceContextService.run(
    { workspaceId, userId: "user", role: WorkspaceRole.OWNER } as never,
    callback,
  );

describe("document folders", () => {
  it.each([
    "../Legal",
    "Legal/..",
    "Legal/./x",
    "/Legal",
    "Legal//x",
    "Legal/ ",
    "Legal/\u0000",
    "Legal\\..\\x",
  ])("rejects unsafe path %s", (path) => {
    expect(() => folderSegments(path)).toThrow();
  });
  it("preserves valid names with canonical Latin and separators", () => {
    expect(folderSegments("Правни документи\\Ugovori 2026")).toEqual([
      "Pravni dokumenti",
      "Ugovori 2026",
    ]);
  });
  it("rejects excessive path depth and lengths", () => {
    expect(() => folderSegments(Array(33).fill("a").join("/"))).toThrow();
    expect(() => folderSegments("a".repeat(256))).toThrow();
  });
  it("resolves shared ancestors once and reuses existing siblings on retry", async () => {
    const rows: Array<{
      id: string;
      workspaceId: string;
      parentId: string | null;
      name: string;
    }> = [];
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      documentFolder: {
        findFirst: jest.fn(
          ({ where }) =>
            rows.find((row) =>
              Object.entries(where).every(
                ([key, value]) => row[key as keyof typeof row] === value,
              ),
            ) ?? null,
        ),
        create: jest.fn(({ data }) => {
          const row = { id: `folder-${rows.length}`, ...data };
          rows.push(row);
          return row;
        }),
      },
    };
    const prisma = {
      $transaction: (fn: (value: typeof tx) => Promise<unknown>) => fn(tx),
    };
    const service = new DocumentFoldersService(prisma as never);
    const input = { paths: ["Legal/Contracts", "Legal/Evidence", "Legal"] };
    const first = await run(() => service.ensure(input));
    const second = await run(() => service.ensure(input));
    expect(second).toEqual(first);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.workspaceId === workspaceId)).toBe(true);
    expect(rows[1].parentId).toBe(rows[0].id);
    expect(rows[2].parentId).toBe(rows[0].id);
  });
  it("rejects a foreign parent before creating folders", async () => {
    const tx = {
      $queryRaw: jest.fn(),
      documentFolder: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    const service = new DocumentFoldersService({
      $transaction: (fn: (value: typeof tx) => Promise<unknown>) => fn(tx),
    } as never);
    await expect(
      run(() =>
        service.ensure({ targetParentFolderId: "foreign", paths: ["Legal"] }),
      ),
    ).rejects.toThrow("Folder not found");
    expect(tx.documentFolder.findFirst).toHaveBeenCalledWith({
      where: { id: "foreign", workspaceId },
    });
    expect(tx.documentFolder.create).not.toHaveBeenCalled();
  });
  it("loads only direct children and returns ordered ancestor breadcrumbs", async () => {
    const root = {
      id: "root",
      parentId: null,
      name: "Legal",
      createdAt: new Date(),
    };
    const child = { ...root, id: "child", parentId: "root", name: "Contracts" };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([root, child]),
      documentFolder: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new DocumentFoldersService(prisma as never);
    const response = await run(() => service.browse({ parentId: "child" }));
    expect(response.breadcrumbs.map((folder) => folder.id)).toEqual([
      "root",
      "child",
    ]);
    expect(prisma.documentFolder.findMany).toHaveBeenCalledWith({
      where: { workspaceId, parentId: "child" },
      orderBy: { name: "asc" },
    });
  });
});
