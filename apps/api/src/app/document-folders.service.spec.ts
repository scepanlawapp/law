import {
  DocumentFoldersService,
  DocumentsController,
  folderSegments,
} from "@law/workspace-documents";
import { WorkspaceContextService } from "@law/core";
import { WorkspaceRole } from "@law/api-interfaces";
import { PassThrough, Readable } from "node:stream";
import { once } from "node:events";

const workspaceId = "workspace";
const run = <T>(callback: () => Promise<T>) =>
  WorkspaceContextService.run(
    { workspaceId, userId: "user", role: WorkspaceRole.OWNER } as never,
    callback,
  );

describe("document folders", () => {
  it("streams a real ZIP with folder paths and file bytes", async () => {
    const response = Object.assign(new PassThrough(), { setHeader: jest.fn() });
    const chunks: Buffer[] = [];
    response.on("data", (chunk) => chunks.push(chunk));
    const finished = once(response, "end");
    const controller = new DocumentsController(
      {
        openDownload: jest
          .fn()
          .mockResolvedValue({ stream: Readable.from(["file content"]) }),
      } as never,
      {
        downloadEntries: jest.fn().mockResolvedValue({
          filename: "Legal.zip",
          directories: ["Legal/"],
          entries: [{ id: "doc", name: "Legal/brief.txt" }],
        }),
      } as never,
    );
    await controller.downloadFolder("root", response as never);
    await finished;
    const zip = Buffer.concat(chunks);
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/zip",
    );
    expect(zip.subarray(0, 2).toString()).toBe("PK");
    expect(zip.includes(Buffer.from("Legal/brief.txt"))).toBe(true);
    expect(zip.length).toBeGreaterThan(100);
  });
  it("builds scoped ZIP entries with nested empty folders and safe duplicate filenames", async () => {
    const rows = [
      { id: "root", name: "Legal", parentId: null },
      { id: "child", name: "Contracts", parentId: "root" },
    ];
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue(rows),
      document: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "one",
            folderId: "child",
            currentVersion: {
              originalFilename: "../brief.pdf",
              storedFile: { sizeBytes: BigInt(10) },
            },
          },
          {
            id: "two",
            folderId: "child",
            currentVersion: {
              originalFilename: "brief.pdf",
              storedFile: { sizeBytes: BigInt(10) },
            },
          },
        ]),
      },
    };
    const result = await run(() =>
      new DocumentFoldersService(prisma as never).downloadEntries("root"),
    );
    expect(result.directories).toEqual(["Legal/", "Legal/Contracts/"]);
    expect(result.entries).toEqual([
      { id: "one", name: "Legal/Contracts/brief.pdf" },
      { id: "two", name: "Legal/Contracts/two-brief.pdf" },
    ]);
    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId,
          folderId: { in: ["root", "child"] },
          currentVersionId: { not: null },
        },
      }),
    );
  });

  it("rejects missing and oversized folder downloads before file reads", async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      document: { findMany: jest.fn() },
    };
    const service = new DocumentFoldersService(prisma as never);
    await expect(run(() => service.downloadEntries("foreign"))).rejects.toThrow(
      "Folder not found",
    );
    prisma.$queryRaw.mockResolvedValue(
      Array.from({ length: 1001 }, (_, index) => ({
        id: index ? String(index) : "root",
      })),
    );
    await expect(run(() => service.downloadEntries("root"))).rejects.toThrow(
      "1000 folders",
    );
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });
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
      where: { id: "foreign", workspaceId, archivedAt: null },
    });
    expect(tx.documentFolder.create).not.toHaveBeenCalled();
  });
  const mutationSetup = () => {
    const rows = [
      {
        id: "parent",
        workspaceId,
        parentId: null,
        name: "Legal",
        archivedAt: null,
        createdAt: new Date(),
      },
      {
        id: "child",
        workspaceId,
        parentId: "parent",
        name: "Contracts",
        archivedAt: null,
        createdAt: new Date(),
      },
    ];
    const tx = {
      $queryRaw: jest.fn(),
      documentFolder: {
        findMany: jest.fn().mockResolvedValue(rows),
        findFirst: jest.fn(({ where }) =>
          where.id === "parent" ? rows[0] : null,
        ),
        update: jest.fn(({ data }) => ({ ...rows[0], ...data })),
        updateMany: jest.fn(),
      },
      document: { updateMany: jest.fn() },
    };
    const service = new DocumentFoldersService({
      $transaction: (fn: (value: typeof tx) => Promise<unknown>) => fn(tx),
    } as never);
    return { service, tx, rows };
  };

  it.each(["parent", "child"])(
    "rejects self or descendant destination %s",
    async (parentId) => {
      const { service, tx } = mutationSetup();
      await expect(
        run(() => service.update("parent", { parentId })),
      ).rejects.toThrow("Cannot move folder");
      expect(tx.documentFolder.findMany).toHaveBeenCalledWith({
        where: { workspaceId },
      });
      expect(tx.documentFolder.update).not.toHaveBeenCalled();
    },
  );
  it("rejects foreign destinations and duplicate siblings", async () => {
    const { service, tx, rows } = mutationSetup();
    await expect(
      run(() => service.update("parent", { parentId: "foreign" })),
    ).rejects.toThrow("Folder not found");
    tx.documentFolder.findFirst.mockImplementation(() => rows[0]);
    await expect(
      run(() => service.update("parent", { name: "Legal" })),
    ).rejects.toThrow("already exists");
    expect(tx.documentFolder.update).not.toHaveBeenCalled();
  });
  it("renames in canonical Latin and moves to root", async () => {
    const { service, tx } = mutationSetup();
    const result = await run(() =>
      service.update("parent", { name: "Pravo", parentId: null }),
    );
    expect(result.name).toBe("Pravo");
    expect(tx.documentFolder.update).toHaveBeenCalledWith({
      where: { id: "parent", workspaceId },
      data: { name: "Pravo", parentId: null },
    });
  });
  it("archives a subtree and restores only documents from that archive batch", async () => {
    const { service, tx, rows } = mutationSetup();
    const result = await run(() => service.setArchived("parent", true));
    const stamp = new Date(result.archivedAt ?? "");
    expect(tx.document.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId,
        folderId: { in: ["parent", "child"] },
        archivedAt: null,
      },
      data: {
        archivedAt: stamp,
        archivedByUserId: "user",
        updatedByUserId: "user",
      },
    });
    Object.assign(rows[0], { archivedAt: stamp });
    await run(() => service.setArchived("parent", false));
    expect(tx.document.updateMany).toHaveBeenLastCalledWith({
      where: {
        workspaceId,
        folderId: { in: ["parent", "child"] },
        archivedAt: stamp,
      },
      data: {
        archivedAt: null,
        archivedByUserId: null,
        updatedByUserId: "user",
      },
    });
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
      where: { workspaceId, parentId: "child", archivedAt: null },
      orderBy: { name: "asc" },
    });
  });
});
