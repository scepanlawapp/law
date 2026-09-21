import { BadRequestException, ConflictException } from "@nestjs/common";
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

  it("changes the upload fingerprint when category changes", () => {
    const base = {
      purpose: "CREATE_DOCUMENT",
      originalFilename: "a.pdf",
      caseIds: [] as string[],
      clientIds: [] as string[],
    };
    expect(
      uploadFingerprint({ ...base, category: null }),
    ).not.toBe(
      uploadFingerprint({ ...base, category: "CONTRACT_AGREEMENT" }),
    );
  });
});
