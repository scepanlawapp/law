import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Readable } from "node:stream";
import { WorkspaceContextService } from "@law/core";
import { WorkspaceRole } from "@law/api-interfaces";
import { DocumentsService } from "@law/workspace-documents";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const otherWorkspaceId = "99999999-9999-4999-a999-999999999999";
const userId = "22222222-2222-4222-a222-222222222222";
const caseId = "33333333-3333-4333-a333-333333333333";
const clientId = "44444444-4444-4444-a444-444444444444";

describe("DocumentsService", () => {
  const files = {
    ingest: jest.fn(),
    commitAvailable: jest.fn(),
    openDownload: jest.fn(),
  };
  const activityLog = { create: jest.fn() };
  const prisma = {
    case: { count: jest.fn() },
    client: { count: jest.fn() },
    document: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    documentVersion: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
    documentCase: { deleteMany: jest.fn(), createMany: jest.fn() },
    documentClient: { deleteMany: jest.fn(), createMany: jest.fn() },
    activityLog,
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };
  const service = new DocumentsService(prisma as never, files as never);
  const run = <T>(callback: () => Promise<T>, ws = workspaceId) =>
    WorkspaceContextService.run(
      { workspaceId: ws, userId, role: WorkspaceRole.OWNER } as never,
      callback,
    );

  const documentRow = {
    id: "doc-1",
    title: "Contract",
    category: null,
    archivedAt: null,
    createdByUserId: userId,
    updatedByUserId: userId,
    createdAt: new Date("2026-09-21T00:00:00.000Z"),
    updatedAt: new Date("2026-09-21T00:00:00.000Z"),
    cases: [{ caseId }],
    clients: [{ clientId }],
    versions: [
      {
        id: "ver-1",
        versionNumber: 1,
        originalFilename: "a.pdf",
        storedFileId: "file-1",
        uploadedByUserId: userId,
        createdAt: new Date("2026-09-21T00:00:00.000Z"),
        storedFile: {
          detectedMimeType: "application/pdf",
          sizeBytes: BigInt(12),
          sha256: "abc",
        },
      },
    ],
    currentVersion: {
      id: "ver-1",
      versionNumber: 1,
      originalFilename: "a.pdf",
      storedFileId: "file-1",
      uploadedByUserId: userId,
      createdAt: new Date("2026-09-21T00:00:00.000Z"),
      storedFile: {
        detectedMimeType: "application/pdf",
        sizeBytes: BigInt(12),
        sha256: "abc",
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === "function") return arg(prisma);
      if (Array.isArray(arg)) return Promise.all(arg);
      return arg;
    });
    prisma.case.count.mockResolvedValue(1);
    prisma.client.count.mockResolvedValue(1);
    prisma.document.create.mockResolvedValue({ id: "doc-1" });
    prisma.documentVersion.create.mockResolvedValue({
      id: "ver-1",
      versionNumber: 1,
    });
    prisma.document.update.mockResolvedValue({});
    prisma.document.findFirst.mockResolvedValue(documentRow);
    prisma.document.findMany.mockResolvedValue([documentRow]);
    prisma.document.count.mockResolvedValue(1);
    prisma.documentVersion.aggregate.mockResolvedValue({
      _max: { versionNumber: 1 },
    });
    files.ingest.mockResolvedValue({
      replay: false,
      operationId: "op-1",
      storedFileId: "file-1",
    });
    files.commitAvailable.mockResolvedValue(undefined);
    files.openDownload.mockResolvedValue({
      stream: Readable.from([Buffer.from("%PDF-1.4")]),
      mimeType: "application/pdf",
      sizeBytes: 8,
    });
  });

  it("rejects case/client links outside the workspace", async () => {
    prisma.case.count.mockResolvedValue(0);
    await expect(
      run(() =>
        service.create({
          title: "Contract",
          caseIds: [caseId],
          clientIds: [],
          originalFilename: "a.pdf",
          stream: Readable.from([Buffer.from("x")]),
          idempotencyKey: "k1",
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(files.ingest).not.toHaveBeenCalled();
  });

  it("returns 404 for another workspace document id", async () => {
    prisma.document.findFirst.mockResolvedValue(null);
    await expect(
      run(() => service.get("doc-1"), otherWorkspaceId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.document.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: otherWorkspaceId }),
      }),
    );
  });

  it("creates a document, logs activity, and commits storage", async () => {
    const created = await run(() =>
      service.create({
        title: "Contract",
        caseIds: [caseId],
        clientIds: [clientId],
        originalFilename: "a.pdf",
        stream: Readable.from([Buffer.from("%PDF-1.4")]),
        idempotencyKey: "k1",
      }),
    );
    expect(activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "DOCUMENT_CREATED",
          entityType: "Document",
          metadata: expect.objectContaining({
            caseIds: [caseId],
            clientIds: [clientId],
          }),
        }),
      }),
    );
    expect(files.commitAvailable).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        documentVersionId: "ver-1",
      }),
    );
    expect(created.id).toBe("doc-1");
  });

  it("adds a version without replacing the previous stored file id", async () => {
    prisma.documentVersion.create.mockResolvedValue({
      id: "ver-2",
      versionNumber: 2,
    });
    files.ingest.mockResolvedValue({
      replay: false,
      operationId: "op-2",
      storedFileId: "file-2",
    });
    await run(() =>
      service.addVersion({
        documentId: "doc-1",
        originalFilename: "b.pdf",
        stream: Readable.from([Buffer.from("%PDF-1.4 v2")]),
        idempotencyKey: "k2",
      }),
    );
    expect(prisma.documentVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storedFileId: "file-2",
          versionNumber: 2,
        }),
      }),
    );
    expect(activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "DOCUMENT_VERSION_ADDED" }),
      }),
    );
  });

  it("hides archived documents from the default list but still loads detail", async () => {
    await run(() => service.list({ page: 1, pageSize: 20 } as never));
    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId, archivedAt: null }),
      }),
    );
    prisma.document.findFirst.mockResolvedValue({
      ...documentRow,
      archivedAt: new Date("2026-09-21T01:00:00.000Z"),
    });
    const detail = await run(() => service.get("doc-1"));
    expect(detail.archived).toBe(true);
  });

  it("still opens download for an archived document", async () => {
    prisma.document.findFirst.mockResolvedValue({
      ...documentRow,
      archivedAt: new Date(),
    });
    const download = await run(() => service.openDownload("doc-1"));
    expect(download.filename).toBe("a.pdf");
    expect(files.openDownload).toHaveBeenCalledWith({
      workspaceId,
      storedFileId: "file-1",
    });
  });

  it("paginates list results", async () => {
    prisma.document.count.mockResolvedValue(45);
    const result = await run(() =>
      service.list({ page: 2, pageSize: 20 } as never),
    );
    expect(result.meta.totalItems).toBe(45);
    expect(result.meta.hasPreviousPage).toBe(true);
    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20 }),
    );
  });

  it("replaces case/client arrays on patch when provided", async () => {
    await run(() =>
      service.update("doc-1", { caseIds: [], clientIds: [clientId] }),
    );
    expect(prisma.documentCase.deleteMany).toHaveBeenCalled();
    expect(prisma.documentCase.createMany).not.toHaveBeenCalled();
    expect(prisma.documentClient.createMany).toHaveBeenCalled();
  });

  it("stores a valid category on create and rejects unknown codes before ingest", async () => {
    await run(() =>
      service.create({
        title: "Contract",
        category: "CONTRACT_AGREEMENT",
        caseIds: [],
        clientIds: [],
        originalFilename: "a.pdf",
        stream: Readable.from([Buffer.from("%PDF-1.4")]),
        idempotencyKey: "k-cat",
      }),
    );
    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: "CONTRACT_AGREEMENT" }),
      }),
    );

    await expect(
      run(() =>
        service.create({
          title: "Contract",
          category: "NOT_A_CATEGORY",
          caseIds: [],
          clientIds: [],
          originalFilename: "a.pdf",
          stream: Readable.from([Buffer.from("%PDF-1.4")]),
          idempotencyKey: "k-bad",
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(files.ingest).toHaveBeenCalledTimes(1);
  });

  it("omits category on patch to leave it unchanged and null to clear it", async () => {
    prisma.document.findFirst.mockResolvedValue({
      ...documentRow,
      category: "EVIDENCE",
    });
    await run(() => service.update("doc-1", { title: "Renamed" }));
    expect(prisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Renamed",
          category: "EVIDENCE",
        }),
      }),
    );

    await run(() => service.update("doc-1", { category: null }));
    expect(prisma.document.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: null }),
      }),
    );
  });

  it("filters by exact category or uncategorized, but not both", async () => {
    await run(() =>
      service.list({
        page: 1,
        pageSize: 20,
        category: "EVIDENCE",
      } as never),
    );
    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category: "EVIDENCE" }),
      }),
    );

    await run(() =>
      service.list({
        page: 1,
        pageSize: 20,
        uncategorized: true,
      } as never),
    );
    expect(prisma.document.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category: null }),
      }),
    );

    await expect(
      run(() =>
        service.list({
          page: 1,
          pageSize: 20,
          category: "EVIDENCE",
          uncategorized: true,
        } as never),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
