import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Readable } from "node:stream";
import { WorkspaceContextService } from "@law/core";
import { WorkspaceRole } from "@law/api-interfaces";
import { DocumentsService } from "@law/workspace-documents";
import { DocumentContentService } from "@law/document-ingestion";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const otherWorkspaceId = "99999999-9999-4999-a999-999999999999";
const userId = "22222222-2222-4222-a222-222222222222";
const caseId = "33333333-3333-4333-a333-333333333333";
const clientId = "44444444-4444-4444-a444-444444444444";
const sha = "a".repeat(64);

describe("DocumentsService", () => {
  const files = {
    ingest: jest.fn(),
    commitAvailable: jest.fn(),
    openDownload: jest.fn(),
  };
  const activityLog = { create: jest.fn() };
  const prisma = {
    documentFolder: { findFirst: jest.fn() },
    case: { count: jest.fn() },
    client: { count: jest.fn() },
    documentContent: {
      upsert: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    document: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
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
  const queue = { enqueue: jest.fn() };
  const content = new DocumentContentService(
    prisma as never,
    queue as never,
    {} as never,
  );
  const service = new DocumentsService(
    prisma as never,
    files as never,
    content,
  );
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
    aiAccess: false,
    chatAttachments: [] as { id: string }[],
    createdByUserId: userId,
    updatedByUserId: userId,
    createdAt: new Date("2026-09-21T00:00:00.000Z"),
    updatedAt: new Date("2026-09-21T00:00:00.000Z"),
    cases: [
      {
        caseId,
        case: {
          id: caseId,
          caseNumber: "P-1/2026",
          name: "Contract dispute",
          status: "ACTIVE",
          priority: "NORMAL",
        },
      },
    ],
    clients: [
      {
        clientId,
        client: {
          id: clientId,
          clientNumber: "CL-1",
          type: "ORGANIZATION",
          displayName: "Client One",
          status: "ACTIVE",
        },
      },
    ],
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
      contentId: "content-1" as string | null,
      content: null as { status: string; documentKind: string | null } | null,
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
      sha256: sha,
      mimeType: "application/pdf",
      sizeBytes: 12,
    });
    prisma.documentContent.upsert.mockResolvedValue({
      id: "content-1",
      status: "PENDING",
      pipelineVersion: 0,
    });
    prisma.documentContent.findFirst.mockResolvedValue({
      status: "PENDING",
      pipelineVersion: 0,
    });
    prisma.documentContent.updateMany.mockResolvedValue({ count: 1 });
    prisma.document.updateMany.mockResolvedValue({ count: 0 });
    queue.enqueue.mockResolvedValue(undefined);
    files.commitAvailable.mockResolvedValue(undefined);
    files.openDownload.mockResolvedValue({
      stream: Readable.from([Buffer.from("%PDF-1.4")]),
      mimeType: "application/pdf",
      sizeBytes: 8,
    });
  });

  it("moves a document only to an active workspace folder and supports root", async () => {
    prisma.documentFolder.findFirst.mockResolvedValue(null);
    await expect(
      run(() => service.update("doc-1", { folderId: "foreign" })),
    ).rejects.toThrow("Destination folder not found");
    expect(prisma.documentFolder.findFirst).toHaveBeenCalledWith({
      where: { id: "foreign", workspaceId, archivedAt: null },
    });
    expect(prisma.document.update).not.toHaveBeenCalled();
    await run(() => service.update("doc-1", { folderId: null }));
    expect(prisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ folderId: null }),
      }),
    );
  });

  it("rechecks an upload destination inside the transaction before creating a document", async () => {
    prisma.documentFolder.findFirst
      .mockResolvedValueOnce({ id: "folder" })
      .mockResolvedValueOnce(null);
    await expect(
      run(() =>
        service.create({
          title: "Brief",
          folderId: "folder",
          caseIds: [],
          clientIds: [],
          originalFilename: "brief.txt",
          stream: Readable.from(["text"]),
          idempotencyKey: "upload-race",
        }),
      ),
    ).rejects.toThrow("Folder is unavailable");
    expect(prisma.documentFolder.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.document.create).not.toHaveBeenCalled();
    expect(files.commitAvailable).not.toHaveBeenCalled();
  });

  it("filters documents linked to any selected case", async () => {
    const secondCaseId = "55555555-5555-4555-a555-555555555555";

    await run(() =>
      service.list({
        caseIds: [secondCaseId],
        caseId,
        page: 1,
        pageSize: 20,
      } as never),
    );

    expect(prisma.document.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              cases: {
                some: {
                  caseId: { in: [secondCaseId, caseId] },
                },
              },
            },
          ],
        }),
      }),
    );
  });

  it("rejects an upload destination outside the workspace before ingestion", async () => {
    prisma.documentFolder.findFirst.mockResolvedValue(null);
    await expect(
      run(() =>
        service.create({
          title: "File",
          folderId: "foreign",
          caseIds: [],
          clientIds: [],
          originalFilename: "a.pdf",
          stream: Readable.from("file"),
          idempotencyKey: "key",
        }),
      ),
    ).rejects.toThrow("Folder is unavailable");
    expect(prisma.documentFolder.findFirst).toHaveBeenCalledWith({
      where: { id: "foreign", workspaceId, archivedAt: null },
    });
    expect(files.ingest).not.toHaveBeenCalled();
  });

  it("persists the destination in metadata and the upload fingerprint", async () => {
    prisma.documentFolder.findFirst.mockResolvedValue({ id: "folder" });
    await run(() =>
      service.create({
        title: "File",
        folderId: "folder",
        caseIds: [],
        clientIds: [],
        originalFilename: "a.pdf",
        stream: Readable.from("file"),
        idempotencyKey: "key",
      }),
    );
    expect(prisma.document.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ folderId: "folder", workspaceId }),
    });
    const locatedFingerprint = files.ingest.mock.calls[0][0].fingerprint;
    await run(() =>
      service.create({
        title: "File",
        caseIds: [],
        clientIds: [],
        originalFilename: "a.pdf",
        stream: Readable.from("file"),
        idempotencyKey: "other-key",
      }),
    );
    expect(files.ingest.mock.calls[1][0].fingerprint).not.toBe(
      locatedFingerprint,
    );
  });

  it("scopes direct-child listing before pagination and keeps global lists compatible", async () => {
    await run(() =>
      service.list({
        folderId: "root",
        view: "needs-linking",
        page: 2,
        pageSize: 20,
      } as never),
    );
    expect(prisma.document.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId,
          folderId: null,
          cases: { none: {} },
          clients: { none: {} },
        }),
        skip: 20,
        take: 20,
      }),
    );
    await run(() =>
      service.list({ folderId: "folder", page: 1, pageSize: 20 } as never),
    );
    expect(prisma.document.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ folderId: "folder" }),
      }),
    );
    await run(() => service.list({ page: 1, pageSize: 20 } as never));
    expect(
      prisma.document.findMany.mock.calls.at(-1)?.[0].where,
    ).not.toHaveProperty("folderId");
  });

  it("keeps Recent based on last modification while import time remains createdAt", async () => {
    await run(() =>
      service.list({ view: "recent", page: 1, pageSize: 20 } as never),
    );
    expect(prisma.document.findMany.mock.calls.at(-1)?.[0].where).toMatchObject(
      { updatedAt: { gte: expect.any(Date) } },
    );
    expect(
      prisma.document.findMany.mock.calls.at(-1)?.[0].where,
    ).not.toHaveProperty("createdAt");
  });

  it("returns real zero statistics independently of the current page", async () => {
    prisma.document.count.mockResolvedValue(0);
    expect(await run(() => service.statistics())).toEqual({
      active: 0,
      addedThisMonth: 0,
      needsLinking: 0,
      archived: 0,
    });
    expect(
      prisma.document.count.mock.calls.every(
        ([query]) => query.where.workspaceId === workspaceId,
      ),
    ).toBe(true);
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
      sha256: "b".repeat(64),
      mimeType: "application/pdf",
      sizeBytes: 14,
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
  describe("AI access and ingestion status", () => {
    const upload = (extra: Record<string, unknown> = {}) => ({
      title: "Contract",
      caseIds: [],
      clientIds: [],
      originalFilename: "a.pdf",
      stream: Readable.from([Buffer.from("%PDF-1.4")]),
      idempotencyKey: "k-ai",
      ...extra,
    });
    const rowWith = (
      extra: Record<string, unknown>,
      status?: string,
      contentExtra: Record<string, unknown> = {},
    ) => ({
      ...documentRow,
      ...extra,
      currentVersion: {
        ...documentRow.currentVersion,
        content: status
          ? { status, documentKind: null, ...contentExtra }
          : null,
      },
    });
    const minutesAgo = (minutes: number) =>
      new Date(Date.now() - minutes * 60_000);

    it("links content on upload and enqueues when AI access is on", async () => {
      await run(() => service.create(upload({ aiAccess: true })));
      expect(prisma.documentContent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId_sha256: { workspaceId, sha256: sha } },
          create: expect.objectContaining({
            workspaceId,
            sha256: sha,
            mimeType: "application/pdf",
            sizeBytes: 12,
          }),
        }),
      );
      expect(prisma.documentVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ contentId: "content-1" }),
      });
      expect(prisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          aiAccess: true,
          aiAccessChangedByUserId: userId,
          aiAccessChangedAt: expect.any(Date),
        }),
      });
      expect(queue.enqueue).toHaveBeenCalledWith(workspaceId, "content-1");
    });

    it("links content on upload without enqueueing when AI access is off", async () => {
      await run(() => service.create(upload()));
      expect(prisma.documentVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ contentId: "content-1" }),
      });
      expect(prisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ aiAccess: false }),
      });
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it("reuses the same content for an identical second upload", async () => {
      await run(() => service.create(upload()));
      await run(() => service.create(upload({ idempotencyKey: "k-ai-2" })));
      const keys = prisma.documentContent.upsert.mock.calls.map(
        ([arg]) => arg.where,
      );
      expect(keys[0]).toEqual(keys[1]);
      const contentIds = prisma.documentVersion.create.mock.calls.map(
        ([arg]) => arg.data.contentId,
      );
      expect(contentIds).toEqual(["content-1", "content-1"]);
    });

    it("does not re-link or enqueue on an idempotent replay", async () => {
      files.ingest.mockResolvedValue({
        replay: true,
        documentId: "doc-1",
        operationId: "op-1",
        storedFileId: "file-1",
        sha256: sha,
        mimeType: "application/pdf",
        sizeBytes: 12,
      });
      await run(() => service.create(upload({ aiAccess: true })));
      expect(prisma.documentContent.upsert).not.toHaveBeenCalled();
      expect(prisma.documentVersion.create).not.toHaveBeenCalled();
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it("does not fail an upload when the queue is unavailable", async () => {
      queue.enqueue.mockRejectedValue(new Error("redis down"));
      const created = await run(() =>
        service.create(upload({ aiAccess: true })),
      );
      expect(created.id).toBe("doc-1");
      expect(files.commitAvailable).toHaveBeenCalled();
    });

    it("links a provided contentId after verifying it in the workspace", async () => {
      prisma.documentContent.findFirst.mockResolvedValue({ id: "content-9" });
      await run(() => service.create(upload({ contentId: "content-9" })));
      expect(prisma.documentContent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "content-9", workspaceId },
        }),
      );
      expect(prisma.documentContent.upsert).not.toHaveBeenCalled();
      expect(prisma.documentVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ contentId: "content-9" }),
      });

      prisma.documentContent.findFirst.mockResolvedValue(null);
      await expect(
        run(() => service.create(upload({ contentId: "foreign" }))),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("turns AI access on for a READY content without enqueueing", async () => {
      prisma.document.findFirst.mockResolvedValue(rowWith({}, "READY"));
      prisma.documentContent.findFirst.mockResolvedValue({
        status: "READY",
        pipelineVersion: 99,
      });
      await run(() => service.setAiAccess("doc-1", true));
      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "doc-1", workspaceId },
          data: expect.objectContaining({
            aiAccess: true,
            aiAccessChangedByUserId: userId,
            aiAccessChangedAt: expect.any(Date),
          }),
        }),
      );
      expect(activityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "DOCUMENT_AI_ACCESS_ENABLED",
            entityId: "doc-1",
          }),
        }),
      );
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it("enqueues the current content when turning AI access on for unprocessed content", async () => {
      prisma.document.findFirst.mockResolvedValue(rowWith({}, "PENDING"));
      await run(() => service.setAiAccess("doc-1", true));
      expect(queue.enqueue).toHaveBeenCalledWith(workspaceId, "content-1");
    });

    it("does not fail the toggle when the queue is unavailable", async () => {
      queue.enqueue.mockRejectedValue(new Error("redis down"));
      prisma.document.findFirst.mockResolvedValue(rowWith({}, "PENDING"));
      await expect(
        run(() => service.setAiAccess("doc-1", true)),
      ).resolves.toBeDefined();
      expect(activityLog.create).toHaveBeenCalled();
    });

    it("turns AI access off and logs it", async () => {
      prisma.document.findFirst.mockResolvedValue(
        rowWith({ aiAccess: true }, "READY"),
      );
      await run(() => service.setAiAccess("doc-1", false));
      expect(activityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "DOCUMENT_AI_ACCESS_DISABLED",
          }),
        }),
      );
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it("writes nothing when the AI access value does not change", async () => {
      prisma.document.findFirst.mockResolvedValue(rowWith({ aiAccess: true }));
      await run(() => service.setAiAccess("doc-1", true));
      expect(prisma.document.update).not.toHaveBeenCalled();
      expect(activityLog.create).not.toHaveBeenCalled();
    });

    it("applies aiAccess from a document patch with one activity row", async () => {
      prisma.document.findFirst.mockResolvedValue(rowWith({}, "PENDING"));
      await run(() => service.update("doc-1", { aiAccess: true }));
      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            aiAccess: true,
            aiAccessChangedByUserId: userId,
          }),
        }),
      );
      const actions = activityLog.create.mock.calls.map(
        ([arg]) => arg.data.action,
      );
      expect(actions).toEqual([
        "DOCUMENT_UPDATED",
        "DOCUMENT_AI_ACCESS_ENABLED",
      ]);
      expect(queue.enqueue).toHaveBeenCalledWith(workspaceId, "content-1");
    });

    describe("bulk", () => {
      const bulkRow = (
        id: string,
        aiAccess: boolean,
        contentId: string | null,
      ) => ({
        id,
        aiAccess,
        currentVersion: contentId ? { contentId } : null,
        cases: [{ caseId }],
        clients: [{ clientId }],
      });
      const ids = ["a", "b", "c", "d"];

      it("updates only changed non-archived documents and counts them", async () => {
        prisma.document.findMany.mockResolvedValue([
          bulkRow("a", false, "content-a"),
          bulkRow("b", true, "content-b"),
          bulkRow("c", false, null),
        ]);
        const result = await run(() =>
          service.setAiAccessBulk({ documentIds: ids, aiAccess: true }),
        );
        expect(prisma.document.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              id: { in: ids },
              workspaceId,
              archivedAt: null,
            },
          }),
        );
        expect(result).toEqual({ updated: 2 });
        expect(prisma.document.updateMany).toHaveBeenCalledWith({
          where: { id: { in: ["a", "c"] }, workspaceId },
          data: expect.objectContaining({
            aiAccess: true,
            aiAccessChangedByUserId: userId,
            aiAccessChangedAt: expect.any(Date),
            updatedByUserId: userId,
          }),
        });
        const logs = activityLog.create.mock.calls.map(([arg]) => arg.data);
        expect(logs.map((row) => row.entityId)).toEqual(["a", "c"]);
        expect(
          logs.every((row) => row.action === "DOCUMENT_AI_ACCESS_ENABLED"),
        ).toBe(true);
        expect(queue.enqueue).toHaveBeenCalledTimes(1);
        expect(queue.enqueue).toHaveBeenCalledWith(workspaceId, "content-a");
      });

      it("logs disables without enqueueing and skips an unchanged batch", async () => {
        prisma.document.findMany.mockResolvedValue([
          bulkRow("a", true, "content-a"),
        ]);
        await run(() =>
          service.setAiAccessBulk({ documentIds: ["a"], aiAccess: false }),
        );
        expect(activityLog.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              action: "DOCUMENT_AI_ACCESS_DISABLED",
            }),
          }),
        );
        expect(queue.enqueue).not.toHaveBeenCalled();

        jest.clearAllMocks();
        prisma.$transaction.mockImplementation(async (arg: unknown) =>
          typeof arg === "function" ? arg(prisma) : arg,
        );
        prisma.document.findMany.mockResolvedValue([
          bulkRow("a", true, "content-a"),
        ]);
        const result = await run(() =>
          service.setAiAccessBulk({ documentIds: ["a"], aiAccess: true }),
        );
        expect(result).toEqual({ updated: 0 });
        expect(prisma.document.updateMany).not.toHaveBeenCalled();
        expect(activityLog.create).not.toHaveBeenCalled();
      });

      it("rejects more than 200 ids", async () => {
        await expect(
          run(() =>
            service.setAiAccessBulk({
              documentIds: Array.from({ length: 201 }, (_, i) => `d${i}`),
              aiAccess: true,
            }),
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      });
    });

    it("links new version content and enqueues for an opted-in document", async () => {
      const optedIn = rowWith({ aiAccess: true }, "READY");
      const afterVersion = {
        ...optedIn,
        currentVersion: {
          ...optedIn.currentVersion,
          id: "ver-2",
          contentId: "content-2",
          content: { status: "EXTRACTING", documentKind: null },
        },
      };
      prisma.document.findFirst
        .mockResolvedValueOnce(optedIn)
        .mockResolvedValueOnce(afterVersion);
      prisma.documentVersion.create.mockResolvedValue({
        id: "ver-2",
        versionNumber: 2,
      });
      prisma.documentContent.upsert.mockResolvedValue({
        id: "content-2",
        status: "PENDING",
        pipelineVersion: 0,
      });
      const detail = await run(() =>
        service.addVersion({
          documentId: "doc-1",
          originalFilename: "b.pdf",
          stream: Readable.from([Buffer.from("v2")]),
          idempotencyKey: "k-v2",
        }),
      );
      expect(prisma.documentVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ contentId: "content-2" }),
      });
      expect(queue.enqueue).toHaveBeenCalledWith(workspaceId, "content-2");
      expect(detail.aiStatus).toBe("PROCESSING");
    });

    it("links new version content without enqueueing when AI access is off", async () => {
      prisma.documentVersion.create.mockResolvedValue({
        id: "ver-2",
        versionNumber: 2,
      });
      await run(() =>
        service.addVersion({
          documentId: "doc-1",
          originalFilename: "b.pdf",
          stream: Readable.from([Buffer.from("v2")]),
          idempotencyKey: "k-v2",
        }),
      );
      expect(prisma.documentVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ contentId: "content-1" }),
      });
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it("reads status from the current version's content in one query", async () => {
      await run(() => service.list({ page: 1, pageSize: 20 } as never));
      const include = prisma.document.findMany.mock.calls.at(-1)?.[0].include;
      expect(include.currentVersion.include.content).toEqual({
        select: {
          status: true,
          documentKind: true,
          failedStep: true,
          updatedAt: true,
        },
      });
      expect(include.chatAttachments).toEqual({
        select: { id: true },
        take: 1,
      });
    });

    it.each([
      [false, undefined, "OFF"],
      [true, undefined, "QUEUED"],
      [false, "READY", "OFF"],
      [true, "PENDING", "QUEUED"],
      [true, "EXTRACTING", "PROCESSING"],
      [true, "EMBEDDING", "PROCESSING"],
      [true, "CLASSIFYING", "PROCESSING"],
      [true, "READY", "READY"],
      [true, "FAILED", "FAILED"],
      [true, "UNSUPPORTED", "UNSUPPORTED"],
    ])(
      "maps aiAccess=%s content=%s to %s",
      async (aiAccess, status, expected) => {
        prisma.document.findFirst.mockResolvedValue(
          rowWith({ aiAccess }, status),
        );
        const detail = await run(() => service.get("doc-1"));
        expect(detail.aiAccess).toBe(aiAccess);
        expect(detail.aiStatus).toBe(expected);
      },
    );

    it("exposes the document kind and assistant-chat origin", async () => {
      prisma.document.findFirst.mockResolvedValue({
        ...rowWith({ aiAccess: true, chatAttachments: [{ id: "att-1" }] }),
        currentVersion: {
          ...documentRow.currentVersion,
          content: { status: "READY", documentKind: "ID_CARD" },
        },
      });
      const detail = await run(() => service.get("doc-1"));
      expect(detail.documentKind).toBe("ID_CARD");
      expect(detail.fromAssistantChat).toBe(true);
    });

    describe("reprocess", () => {
      const contentRow = (row: Record<string, unknown>) =>
        prisma.documentContent.findFirst.mockResolvedValue(row);

      it("re-enqueues FAILED content", async () => {
        prisma.document.findFirst.mockResolvedValue(
          rowWith({ aiAccess: true }, "FAILED"),
        );
        contentRow({ status: "FAILED", pipelineVersion: 1 });
        await run(() => service.reprocess("doc-1"));
        expect(queue.enqueue).toHaveBeenCalledWith(workspaceId, "content-1");
      });

      it("re-enqueues PENDING content older than ten minutes", async () => {
        prisma.document.findFirst.mockResolvedValue(
          rowWith({ aiAccess: true }, "PENDING", { updatedAt: minutesAgo(11) }),
        );
        contentRow({ status: "PENDING", pipelineVersion: 0 });
        await run(() => service.reprocess("doc-1"));
        expect(queue.enqueue).toHaveBeenCalledWith(workspaceId, "content-1");
      });

      it("re-enqueues READY content marked for retry", async () => {
        prisma.document.findFirst.mockResolvedValue(
          rowWith({ aiAccess: true }, "READY", { failedStep: "CLASSIFYING" }),
        );
        contentRow({
          status: "READY",
          pipelineVersion: 1,
          failedStep: "CLASSIFYING",
        });
        await run(() => service.reprocess("doc-1"));
        expect(queue.enqueue).toHaveBeenCalledWith(workspaceId, "content-1");
      });

      it.each([
        ["fresh PENDING", "PENDING", { updatedAt: minutesAgo(2) }],
        ["clean READY", "READY", { failedStep: null }],
        ["EXTRACTING", "EXTRACTING", { updatedAt: minutesAgo(60) }],
        ["EMBEDDING", "EMBEDDING", { updatedAt: minutesAgo(60) }],
        ["CLASSIFYING", "CLASSIFYING", { updatedAt: minutesAgo(60) }],
        ["UNSUPPORTED", "UNSUPPORTED", {}],
      ])("rejects %s content with 409", async (_label, status, extra) => {
        prisma.document.findFirst.mockResolvedValue(
          rowWith({ aiAccess: true }, status, extra),
        );
        await expect(
          run(() => service.reprocess("doc-1")),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(queue.enqueue).not.toHaveBeenCalled();
      });

      it("rejects a document whose AI access is off, even with failed content", async () => {
        prisma.document.findFirst.mockResolvedValue(
          rowWith({ aiAccess: false }, "FAILED"),
        );
        await expect(
          run(() => service.reprocess("doc-1")),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(queue.enqueue).not.toHaveBeenCalled();
      });

      it("rejects an archived document, even with failed content", async () => {
        prisma.document.findFirst.mockResolvedValue(
          rowWith({ aiAccess: true, archivedAt: new Date() }, "FAILED"),
        );
        await expect(
          run(() => service.reprocess("doc-1")),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(queue.enqueue).not.toHaveBeenCalled();
      });
    });

    describe("aiRetryable", () => {
      it.each([
        ["FAILED", {}, true, true],
        ["PENDING", { updatedAt: minutesAgo(11) }, true, true],
        ["PENDING", { updatedAt: minutesAgo(3) }, true, false],
        ["READY", { failedStep: "FACTS" }, true, true],
        ["READY", { failedStep: null }, true, false],
        ["EMBEDDING", { updatedAt: minutesAgo(90) }, true, false],
        ["FAILED", {}, false, false],
      ])(
        "content %s %j aiAccess=%s gives %s",
        async (status, extra, aiAccess, expected) => {
          prisma.document.findFirst.mockResolvedValue(
            rowWith({ aiAccess }, status, extra),
          );
          const detail = await run(() => service.get("doc-1"));
          expect(detail.aiRetryable).toBe(expected);
        },
      );

      it("is false for an archived document", async () => {
        prisma.document.findFirst.mockResolvedValue(
          rowWith({ aiAccess: true, archivedAt: new Date() }, "FAILED"),
        );
        const detail = await run(() => service.get("doc-1"));
        expect(detail.aiRetryable).toBe(false);
      });

      it("is false when the version has no content row", async () => {
        prisma.document.findFirst.mockResolvedValue(
          rowWith({ aiAccess: true }),
        );
        const detail = await run(() => service.get("doc-1"));
        expect(detail.aiRetryable).toBe(false);
      });
    });

    describe("archived documents", () => {
      const archived = () =>
        rowWith({ aiAccess: false, archivedAt: new Date() }, "PENDING");

      it("turning AI access on through a patch changes the flag without enqueueing", async () => {
        prisma.document.findFirst.mockResolvedValue(archived());
        await run(() => service.update("doc-1", { aiAccess: true }));
        expect(prisma.document.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ aiAccess: true }),
          }),
        );
        expect(queue.enqueue).not.toHaveBeenCalled();
      });

      it("turning AI access on with setAiAccess changes the flag without enqueueing", async () => {
        prisma.document.findFirst.mockResolvedValue(archived());
        await run(() => service.setAiAccess("doc-1", true));
        expect(prisma.document.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ aiAccess: true }),
          }),
        );
        expect(queue.enqueue).not.toHaveBeenCalled();
      });
    });
  });
});
