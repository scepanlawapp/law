import { BadRequestException, ConflictException, Logger } from "@nestjs/common";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import {
  FileService,
  createFileStorageConfig,
  LocalStorageAdapter,
  StorageRouter,
  uploadFingerprint,
} from "@law/file-storage";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const userId = "22222222-2222-4222-a222-222222222222";
const connectionId = "33333333-3333-4333-a333-333333333333";

function pdfStream(body = "hello"): Readable {
  return Readable.from([Buffer.from(`%PDF-1.4\n${body}`)]);
}

describe("FileService", () => {
  let root: string;
  let service: FileService;
  let adapter: LocalStorageAdapter;
  const operations = new Map<string, Record<string, unknown>>();
  const files = new Map<string, Record<string, unknown>>();
  const locations = new Map<string, Record<string, unknown>>();

  const prisma = {
    uploadOperation: {
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: {
            workspaceId_idempotencyKey?: { idempotencyKey: string };
            id?: string;
          };
        }) => {
          if (where.id) return operations.get(where.id) ?? null;
          const key = where.workspaceId_idempotencyKey?.idempotencyKey;
          return (
            [...operations.values()].find(
              (row) => row.idempotencyKey === key,
            ) ?? null
          );
        },
      ),
      findUniqueOrThrow: jest.fn(
        async ({ where }: { where: { id: string } }) => {
          const row = operations.get(where.id);
          if (!row) throw new Error("missing");
          return {
            ...row,
            fileLocation: locations.get(String(row.fileLocationId)),
            storedFile: files.get(String(row.storedFileId)),
          };
        },
      ),
      findFirst: jest.fn(),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: String(data.id ?? crypto.randomUUID()) };
        operations.set(String(row.id), row);
        return row;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const next = { ...operations.get(where.id), ...data, id: where.id };
          operations.set(where.id, next);
          return next;
        },
      ),
    },
    storedFile: {
      create: jest.fn(async ({ data }: { data: { id: string } }) => {
        const row = { ...data, sizeBytes: BigInt(0) };
        files.set(data.id, row);
        return row;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const next = { ...files.get(where.id), ...data };
          files.set(where.id, next);
          return next;
        },
      ),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) =>
        files.get(where.id),
      ),
      findFirst: jest.fn(),
    },
    fileLocation: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: crypto.randomUUID() };
        locations.set(String(row.id), row);
        return row;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const next = { ...locations.get(where.id), ...data };
          locations.set(where.id, next);
          return next;
        },
      ),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) =>
        locations.get(where.id),
      ),
    },
    documentVersion: {
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    storageConnection: {
      findFirst: jest.fn(async () => ({
        id: connectionId,
        workspaceId,
        providerType: "LOCAL",
        enabled: true,
        isDefault: true,
        configRef: "local-default",
      })),
    },
    $transaction: jest.fn(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      return (ops as (tx: unknown) => unknown)(prisma);
    }),
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "law-fileservice-"));
    operations.clear();
    files.clear();
    locations.clear();
    jest.clearAllMocks();
    const config = createFileStorageConfig({ root });
    adapter = new LocalStorageAdapter(config);
    const router = new StorageRouter(prisma as never, adapter);
    service = new FileService(prisma as never, router, adapter, config);
  });

  it("stores an allowed PDF and returns checksum metadata", async () => {
    const result = await service.ingest({
      workspaceId,
      actorUserId: userId,
      idempotencyKey: "key-1",
      purpose: "CREATE_DOCUMENT",
      fingerprint: uploadFingerprint({
        purpose: "CREATE_DOCUMENT",
        originalFilename: "a.pdf",
        category: null,
        caseIds: [],
        clientIds: [],
      }),
      originalFilename: "a.pdf",
      stream: pdfStream(),
    });
    expect(result.mimeType).toBe("application/pdf");
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.sha256).toHaveLength(64);
  });

  it("rejects oversize uploads", async () => {
    const config = createFileStorageConfig({ root, maxBytes: 8 });
    adapter = new LocalStorageAdapter(config);
    service = new FileService(
      prisma as never,
      new StorageRouter(prisma as never, adapter),
      adapter,
      config,
    );
    await expect(
      service.ingest({
        workspaceId,
        actorUserId: userId,
        idempotencyKey: "key-big",
        purpose: "CREATE_DOCUMENT",
        fingerprint: "fp-big",
        originalFilename: "a.pdf",
        stream: pdfStream("0123456789"),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects unsupported MIME types and marks the operation failed", async () => {
    await expect(
      service.ingest({
        workspaceId,
        actorUserId: userId,
        idempotencyKey: "key-bin",
        purpose: "CREATE_DOCUMENT",
        fingerprint: "fp-bin",
        originalFilename: "a.bin",
        stream: Readable.from([Buffer.from([0x00, 0x01, 0x02, 0xff])]),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const failed = [...operations.values()].find(
      (row) => row.idempotencyKey === "key-bin",
    );
    expect(failed?.status).toBe("FAILED");
  });

  it("replays a committed idempotent upload and rejects fingerprint mismatch", async () => {
    const fingerprint = "same-fp";
    const first = await service.ingest({
      workspaceId,
      actorUserId: userId,
      idempotencyKey: "key-idem",
      purpose: "CREATE_DOCUMENT",
      fingerprint,
      originalFilename: "a.pdf",
      stream: pdfStream(),
    });
    const op = operations.get(first.operationId)!;
    op.status = "COMMITTED";
    op.documentId = "doc-1";
    op.documentVersionId = "ver-1";
    files.set(first.storedFileId, {
      ...files.get(first.storedFileId),
      sizeBytes: BigInt(first.sizeBytes),
      sha256: first.sha256,
      detectedMimeType: first.mimeType,
    });

    const replay = await service.ingest({
      workspaceId,
      actorUserId: userId,
      idempotencyKey: "key-idem",
      purpose: "CREATE_DOCUMENT",
      fingerprint,
      originalFilename: "a.pdf",
      stream: pdfStream(),
    });
    expect(replay.replay).toBe(true);
    expect(replay.documentId).toBe("doc-1");

    await expect(
      service.ingest({
        workspaceId,
        actorUserId: userId,
        idempotencyKey: "key-idem",
        purpose: "CREATE_DOCUMENT",
        fingerprint: "other",
        originalFilename: "b.pdf",
        stream: pdfStream(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a second in-progress upload with the same idempotency key", async () => {
    const first = await service.ingest({
      workspaceId,
      actorUserId: userId,
      idempotencyKey: "key-progress",
      purpose: "CREATE_DOCUMENT",
      fingerprint: "fp",
      originalFilename: "a.pdf",
      stream: pdfStream(),
    });
    operations.get(first.operationId)!.status = "WRITING";
    await expect(
      service.ingest({
        workspaceId,
        actorUserId: userId,
        idempotencyKey: "key-progress",
        purpose: "CREATE_DOCUMENT",
        fingerprint: "fp",
        originalFilename: "a.pdf",
        stream: pdfStream(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("reads using the recorded connection even if default changes", async () => {
    const storedFileId = crypto.randomUUID();
    const locationId = crypto.randomUUID();
    const recordedConnection = {
      id: "recorded-connection",
      workspaceId,
      providerType: "LOCAL" as const,
      enabled: true,
      isDefault: false,
      configRef: "local-default",
    };
    prisma.storedFile.findFirst.mockResolvedValue({
      id: storedFileId,
      detectedMimeType: "application/pdf",
      sizeBytes: BigInt(4),
      locations: [
        {
          id: locationId,
          storageConnectionId: recordedConnection.id,
          storageKey: `${workspaceId}/${storedFileId}/content`,
          isActive: true,
          state: "AVAILABLE",
        },
      ],
    });
    prisma.storageConnection.findFirst.mockImplementation(
      async ({ where }: { where: { id?: string } }) => {
        if (where.id === recordedConnection.id) return recordedConnection;
        return { ...recordedConnection, id: "new-default", isDefault: true };
      },
    );
    const key = `${workspaceId}/${storedFileId}/content`;
    await adapter.write(key, Readable.from([Buffer.from("%PDF")]), {
      maxBytes: 1000,
      tempSuffix: "dl",
    });
    const download = await service.openDownload({ workspaceId, storedFileId });
    expect(download.mimeType).toBe("application/pdf");
    expect(prisma.storageConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: recordedConnection.id }),
      }),
    );
  });

  it("does not abandon AVAILABLE files during reconciliation", async () => {
    const storedFileId = crypto.randomUUID();
    const locationId = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    files.set(storedFileId, { id: storedFileId, lifecycle: "AVAILABLE" });
    locations.set(locationId, {
      id: locationId,
      storageKey: `${workspaceId}/${storedFileId}/content`,
    });
    prisma.uploadOperation.findMany.mockResolvedValueOnce([
      {
        id: operationId,
        storedFileId,
        fileLocationId: locationId,
        documentVersionId: "ver",
        storedFile: files.get(storedFileId),
        fileLocation: locations.get(locationId),
      },
    ]);
    await service.reconcile();
    expect(prisma.storedFile.update).not.toHaveBeenCalled();
  });

  describe("commitAvailable byte dedup", () => {
    const otherWorkspaceId = "44444444-4444-4444-a444-444444444444";

    async function ingestFinalizing(key = "key-dedup") {
      const result = await service.ingest({
        workspaceId,
        actorUserId: userId,
        idempotencyKey: key,
        purpose: "CREATE_DOCUMENT",
        fingerprint: "fp-dedup",
        originalFilename: "a.pdf",
        stream: pdfStream("same bytes"),
      });
      prisma.uploadOperation.findFirst.mockImplementation(async () => {
        const row = operations.get(result.operationId)!;
        return {
          ...row,
          fileLocation: locations.get(String(row.fileLocationId)),
          storedFile: files.get(String(row.storedFileId)),
        };
      });
      return result;
    }

    function seedExisting() {
      const existingFileId = crypto.randomUUID();
      const existingLocationId = crypto.randomUUID();
      const existingConnectionId = "55555555-5555-4555-a555-555555555555";
      files.set(existingFileId, {
        id: existingFileId,
        lifecycle: "AVAILABLE",
        sha256: "x",
        sizeBytes: BigInt(10),
        detectedMimeType: "application/pdf",
      });
      locations.set(existingLocationId, {
        id: existingLocationId,
        storedFileId: existingFileId,
        storageConnectionId: existingConnectionId,
        storageKey: `${workspaceId}/${existingFileId}/content`,
        state: "AVAILABLE",
        isActive: true,
      });
      return {
        existingFileId,
        existingLocationId,
        existingConnectionId,
        row: {
          id: existingFileId,
          workspaceId,
          lifecycle: "AVAILABLE",
          locations: [locations.get(existingLocationId)],
        },
      };
    }

    it("reuses an available stored file with the same hash", async () => {
      const ingested = await ingestFinalizing();
      const existing = seedExisting();
      prisma.storedFile.findFirst.mockResolvedValue(existing.row);
      const deleteSpy = jest.spyOn(adapter, "delete");
      const callOrder: string[] = [];
      prisma.$transaction.mockImplementationOnce(async (ops: unknown) => {
        const out = await Promise.all(ops as Promise<unknown>[]);
        callOrder.push("transaction");
        return out;
      });
      deleteSpy.mockImplementationOnce(async () => {
        callOrder.push("delete");
      });

      const result = await service.commitAvailable({
        operationId: ingested.operationId,
        workspaceId,
        documentId: "doc-1",
        documentVersionId: "ver-1",
      });

      expect(result).toEqual({ storedFileId: existing.existingFileId });
      expect(prisma.storedFile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId,
            sha256: ingested.sha256,
            lifecycle: "AVAILABLE",
            id: { not: ingested.storedFileId },
          }),
        }),
      );
      expect(files.get(ingested.storedFileId)?.lifecycle).toBe("ABANDONED");
      expect(locations.get(ingested.fileLocationId)).toMatchObject({
        state: "FAILED",
        isActive: false,
      });
      expect(operations.get(ingested.operationId)).toMatchObject({
        status: "COMMITTED",
        storedFileId: existing.existingFileId,
        fileLocationId: existing.existingLocationId,
        storageConnectionId: existing.existingConnectionId,
        documentId: "doc-1",
        documentVersionId: "ver-1",
      });
      expect(prisma.documentVersion.updateMany).toHaveBeenCalledWith({
        where: { id: "ver-1", workspaceId },
        data: { storedFileId: existing.existingFileId },
      });
      expect(deleteSpy).toHaveBeenCalledWith(ingested.storageKey);
      expect(callOrder).toEqual(["transaction", "delete"]);
      expect(files.get(existing.existingFileId)?.lifecycle).toBe("AVAILABLE");
    });

    it("still succeeds when deleting the duplicate bytes fails", async () => {
      const ingested = await ingestFinalizing("key-dedup-del");
      prisma.storedFile.findFirst.mockResolvedValue(seedExisting().row);
      jest.spyOn(adapter, "delete").mockRejectedValueOnce(new Error("boom"));
      const warn = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);
      await expect(
        service.commitAvailable({
          operationId: ingested.operationId,
          workspaceId,
          documentId: "doc-1",
          documentVersionId: "ver-1",
        }),
      ).resolves.toEqual({ storedFileId: expect.any(String) });
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it("resolves an idempotent replay to the deduplicated file", async () => {
      const ingested = await ingestFinalizing("key-dedup-replay");
      const existing = seedExisting();
      prisma.storedFile.findFirst.mockResolvedValue(existing.row);
      await service.commitAvailable({
        operationId: ingested.operationId,
        workspaceId,
        documentId: "doc-1",
        documentVersionId: "ver-1",
      });

      const replay = await service.ingest({
        workspaceId,
        actorUserId: userId,
        idempotencyKey: "key-dedup-replay",
        purpose: "CREATE_DOCUMENT",
        fingerprint: "fp-dedup",
        originalFilename: "a.pdf",
        stream: pdfStream("same bytes"),
      });
      expect(replay).toMatchObject({
        replay: true,
        storedFileId: existing.existingFileId,
        fileLocationId: existing.existingLocationId,
        storageConnectionId: existing.existingConnectionId,
        storageKey: `${workspaceId}/${existing.existingFileId}/content`,
        documentVersionId: "ver-1",
      });
    });

    it("does not reconcile a deduplicated operation or its shared bytes", async () => {
      const ingested = await ingestFinalizing("key-dedup-rec");
      const existing = seedExisting();
      prisma.storedFile.findFirst.mockResolvedValue(existing.row);
      await service.commitAvailable({
        operationId: ingested.operationId,
        workspaceId,
        documentId: "doc-1",
        documentVersionId: "ver-1",
      });
      const deleteSpy = jest.spyOn(adapter, "delete");
      deleteSpy.mockClear();
      prisma.uploadOperation.findMany.mockImplementationOnce(
        async ({ where }: { where: { status: { in: string[] } } }) =>
          [...operations.values()]
            .filter((row) => where.status.in.includes(String(row.status)))
            .map((row) => ({
              ...row,
              fileLocation: locations.get(String(row.fileLocationId)),
              storedFile: files.get(String(row.storedFileId)),
            })),
      );
      await service.reconcile();
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(files.get(existing.existingFileId)?.lifecycle).toBe("AVAILABLE");
    });

    it("does not dedup across workspaces", async () => {
      const ingested = await ingestFinalizing("key-dedup-ws");
      // The lookup is scoped to the caller's workspace, so a match that only
      // exists in another workspace is never returned.
      prisma.storedFile.findFirst.mockImplementation(
        async ({ where }: { where: { workspaceId: string } }) =>
          where.workspaceId === otherWorkspaceId ? seedExisting().row : null,
      );
      const deleteSpy = jest.spyOn(adapter, "delete");
      const result = await service.commitAvailable({
        operationId: ingested.operationId,
        workspaceId,
        documentId: "doc-1",
        documentVersionId: "ver-1",
      });
      expect(result).toEqual({ storedFileId: ingested.storedFileId });
      expect(files.get(ingested.storedFileId)?.lifecycle).toBe("AVAILABLE");
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(prisma.documentVersion.updateMany).not.toHaveBeenCalled();
    });

    it("keeps the new file when no match exists", async () => {
      const ingested = await ingestFinalizing("key-dedup-none");
      prisma.storedFile.findFirst.mockResolvedValue(null);
      const deleteSpy = jest.spyOn(adapter, "delete");
      const result = await service.commitAvailable({
        operationId: ingested.operationId,
        workspaceId,
        documentId: "doc-1",
        documentVersionId: "ver-1",
      });
      expect(result).toEqual({ storedFileId: ingested.storedFileId });
      expect(files.get(ingested.storedFileId)?.lifecycle).toBe("AVAILABLE");
      expect(locations.get(ingested.fileLocationId)).toMatchObject({
        state: "AVAILABLE",
        isActive: true,
      });
      expect(operations.get(ingested.operationId)?.status).toBe("COMMITTED");
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it("returns the stored file of an already committed operation", async () => {
      const ingested = await ingestFinalizing("key-dedup-done");
      operations.get(ingested.operationId)!.status = "COMMITTED";
      const result = await service.commitAvailable({
        operationId: ingested.operationId,
        workspaceId,
        documentId: "doc-1",
        documentVersionId: "ver-1",
      });
      expect(result).toEqual({ storedFileId: ingested.storedFileId });
    });
  });

  it("changes the upload fingerprint when category changes", () => {
    const base = {
      purpose: "CREATE_DOCUMENT",
      originalFilename: "a.pdf",
      caseIds: [] as string[],
      clientIds: [] as string[],
    };
    expect(uploadFingerprint({ ...base, category: null })).not.toBe(
      uploadFingerprint({ ...base, category: "CONTRACT_AGREEMENT" }),
    );
  });
});
