import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { PlatformPrismaService } from "@law/core";
import { detectMimeType, isAllowedDocumentMime } from "./content-type";
import { FileStorageConfig } from "./file-storage.config";
import { LocalStorageAdapter } from "./local-storage.adapter";
import { StorageError } from "./storage.errors";
import { StorageRouter } from "./storage.router";
import { buildStorageKey } from "./storage-key";

export interface UploadIngestInput {
  workspaceId: string;
  actorUserId: string;
  idempotencyKey: string;
  purpose: "CREATE_DOCUMENT" | "ADD_VERSION";
  fingerprint: string;
  documentId?: string;
  originalFilename: string;
  stream: Readable;
}

export interface UploadIngestResult {
  replay: boolean;
  operationId: string;
  storedFileId: string;
  fileLocationId: string;
  storageConnectionId: string;
  storageKey: string;
  sizeBytes: number;
  sha256: string;
  mimeType: string;
  documentId?: string | null;
  documentVersionId?: string | null;
}

const HEAD_BYTES = 16_384;
const STALE_STATUSES = ["ACCEPTED", "WRITING", "FINALIZING"] as const;

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private reconciling = false;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly router: StorageRouter,
    private readonly adapter: LocalStorageAdapter,
    private readonly config: FileStorageConfig,
  ) {}

  async ingest(input: UploadIngestInput): Promise<UploadIngestResult> {
    void this.reconcile();
    const existing = await this.prisma.uploadOperation.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: input.workspaceId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) {
      return this.resumeExisting(existing, input);
    }

    const connection = await this.router.defaultConnection(input.workspaceId);
    this.router.adapterFor(connection);

    const storedFileId = crypto.randomUUID();
    const storageKey = buildStorageKey(input.workspaceId, storedFileId);

    const storedFile = await this.prisma.storedFile.create({
      data: {
        id: storedFileId,
        workspaceId: input.workspaceId,
        lifecycle: "PENDING",
      },
    });
    const location = await this.prisma.fileLocation.create({
      data: {
        workspaceId: input.workspaceId,
        storedFileId: storedFile.id,
        storageConnectionId: connection.id,
        storageKey,
        state: "PENDING",
        isActive: false,
      },
    });
    const operation = await this.prisma.uploadOperation.create({
      data: {
        workspaceId: input.workspaceId,
        idempotencyKey: input.idempotencyKey,
        actorUserId: input.actorUserId,
        purpose: input.purpose,
        status: "WRITING",
        requestFingerprint: input.fingerprint,
        documentId: input.documentId,
        storedFileId: storedFile.id,
        fileLocationId: location.id,
        storageConnectionId: connection.id,
        lastHeartbeatAt: new Date(),
      },
    });

    return this.writePending(operation.id, input.stream);
  }

  async commitAvailable(params: {
    operationId: string;
    workspaceId: string;
    documentId: string;
    documentVersionId: string;
  }): Promise<void> {
    const operation = await this.prisma.uploadOperation.findFirst({
      where: { id: params.operationId, workspaceId: params.workspaceId },
    });
    if (!operation) {
      throw new BadRequestException("Upload operation was not found");
    }
    if (operation.status === "COMMITTED") return;
    await this.prisma.$transaction([
      this.prisma.storedFile.update({
        where: { id: operation.storedFileId },
        data: { lifecycle: "AVAILABLE", finalizedAt: new Date() },
      }),
      this.prisma.fileLocation.update({
        where: { id: operation.fileLocationId },
        data: { state: "AVAILABLE", isActive: true, verifiedAt: new Date() },
      }),
      this.prisma.uploadOperation.update({
        where: { id: operation.id },
        data: {
          status: "COMMITTED",
          documentId: params.documentId,
          documentVersionId: params.documentVersionId,
          completedAt: new Date(),
        },
      }),
    ]);
  }

  async openDownload(params: {
    workspaceId: string;
    storedFileId: string;
  }): Promise<{
    stream: Readable;
    mimeType: string;
    sizeBytes: number;
  }> {
    const file = await this.prisma.storedFile.findFirst({
      where: {
        id: params.storedFileId,
        workspaceId: params.workspaceId,
        lifecycle: "AVAILABLE",
      },
      include: {
        locations: {
          where: { isActive: true, state: "AVAILABLE" },
          take: 1,
        },
      },
    });
    if (!file || !file.locations[0]) {
      throw new ServiceUnavailableException("File content is unavailable");
    }
    const location = file.locations[0];
    const connection = await this.router.connectionById(
      params.workspaceId,
      location.storageConnectionId,
    );
    let adapter;
    try {
      adapter = this.router.adapterFor(connection);
    } catch (error) {
      this.mapStorageError(error);
    }
    try {
      const stream = await adapter.read(location.storageKey);
      return {
        stream,
        mimeType: file.detectedMimeType ?? "application/octet-stream",
        sizeBytes: Number(file.sizeBytes),
      };
    } catch (error) {
      this.mapStorageError(error);
    }
  }

  async reconcile(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const cutoff = new Date(Date.now() - this.config.staleHeartbeatMs);
      const stale = await this.prisma.uploadOperation.findMany({
        where: {
          status: { in: [...STALE_STATUSES] },
          lastHeartbeatAt: { lt: cutoff },
        },
        include: { fileLocation: true, storedFile: true },
      });
      for (const operation of stale) {
        if (operation.documentVersionId || operation.storedFile.lifecycle === "AVAILABLE") {
          continue;
        }
        try {
          await this.adapter.delete(operation.fileLocation.storageKey);
        } catch {
          /* missing is fine */
        }
        await this.prisma.$transaction([
          this.prisma.storedFile.update({
            where: { id: operation.storedFileId },
            data: { lifecycle: "ABANDONED" },
          }),
          this.prisma.fileLocation.update({
            where: { id: operation.fileLocationId },
            data: { state: "FAILED", isActive: false },
          }),
          this.prisma.uploadOperation.update({
            where: { id: operation.id },
            data: { status: "ABANDONED", errorCode: "STALE", completedAt: new Date() },
          }),
        ]);
      }
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : "File reconciliation failed",
      );
    } finally {
      this.reconciling = false;
    }
  }

  private async resumeExisting(
    existing: {
      id: string;
      requestFingerprint: string;
      status: string;
      storedFileId: string;
      fileLocationId: string;
      storageConnectionId: string;
      documentId: string | null;
      documentVersionId: string | null;
    },
    input: UploadIngestInput,
  ): Promise<UploadIngestResult> {
    if (existing.requestFingerprint !== input.fingerprint) {
      throw new BadRequestException(
        "Idempotency key was reused with a different request",
      );
    }
    if (existing.status === "COMMITTED") {
      const file = await this.prisma.storedFile.findUniqueOrThrow({
        where: { id: existing.storedFileId },
      });
      const location = await this.prisma.fileLocation.findUniqueOrThrow({
        where: { id: existing.fileLocationId },
      });
      return {
        replay: true,
        operationId: existing.id,
        storedFileId: file.id,
        fileLocationId: location.id,
        storageConnectionId: existing.storageConnectionId,
        storageKey: location.storageKey,
        sizeBytes: Number(file.sizeBytes),
        sha256: file.sha256 ?? "",
        mimeType: file.detectedMimeType ?? "application/octet-stream",
        documentId: existing.documentId,
        documentVersionId: existing.documentVersionId,
      };
    }
    if (existing.status === "FINALIZING") {
      return this.finishFromDisk(existing.id);
    }
    if (existing.status === "WRITING" || existing.status === "ACCEPTED") {
      throw new ConflictException("Upload is already in progress");
    }
    await this.prisma.uploadOperation.update({
      where: { id: existing.id },
      data: { status: "WRITING", errorCode: null, lastHeartbeatAt: new Date() },
    });
    return this.writePending(existing.id, input.stream);
  }

  private async writePending(
    operationId: string,
    stream: Readable,
  ): Promise<UploadIngestResult> {
    const operation = await this.prisma.uploadOperation.findUniqueOrThrow({
      where: { id: operationId },
      include: { fileLocation: true },
    });
    const connection = await this.router.connectionById(
      operation.workspaceId,
      operation.storageConnectionId,
    );
    const adapter = this.router.adapterFor(connection);

    const headChunks: Buffer[] = [];
    let headBytes = 0;
    const headTap = new Transform({
      transform(chunk: Buffer, _enc, callback) {
        if (headBytes < HEAD_BYTES) {
          const remain = HEAD_BYTES - headBytes;
          headChunks.push(chunk.subarray(0, remain));
          headBytes += Math.min(chunk.length, remain);
        }
        callback(null, chunk);
      },
    });

    try {
      await this.prisma.uploadOperation.update({
        where: { id: operationId },
        data: { lastHeartbeatAt: new Date(), status: "WRITING" },
      });
      const written = await adapter.write(operation.fileLocation.storageKey, stream.pipe(headTap), {
        maxBytes: this.config.maxBytes,
        tempSuffix: operationId,
      });
      const mimeType = detectMimeType(Buffer.concat(headChunks));
      if (!isAllowedDocumentMime(mimeType)) {
        await adapter.delete(operation.fileLocation.storageKey);
        await this.fail(operationId, "UNSUPPORTED_TYPE");
        throw new BadRequestException(
          `Unsupported file type${mimeType ? `: ${mimeType}` : ""}`,
        );
      }
      await this.prisma.storedFile.update({
        where: { id: operation.storedFileId },
        data: {
          sizeBytes: BigInt(written.bytes),
          sha256: written.sha256,
          detectedMimeType: mimeType,
        },
      });
      await this.prisma.uploadOperation.update({
        where: { id: operationId },
        data: { status: "FINALIZING", lastHeartbeatAt: new Date() },
      });
      return {
        replay: false,
        operationId,
        storedFileId: operation.storedFileId,
        fileLocationId: operation.fileLocationId,
        storageConnectionId: operation.storageConnectionId,
        storageKey: operation.fileLocation.storageKey,
        sizeBytes: written.bytes,
        sha256: written.sha256,
        mimeType,
        documentId: operation.documentId,
        documentVersionId: operation.documentVersionId,
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ConflictException) {
        throw error;
      }
      await this.fail(operationId, "WRITE_FAILED");
      this.mapStorageError(error);
    }
  }

  private async finishFromDisk(operationId: string): Promise<UploadIngestResult> {
    const operation = await this.prisma.uploadOperation.findUniqueOrThrow({
      where: { id: operationId },
      include: { fileLocation: true, storedFile: true },
    });
    const connection = await this.router.connectionById(
      operation.workspaceId,
      operation.storageConnectionId,
    );
    const adapter = this.router.adapterFor(connection);
    try {
      const stat = await adapter.stat(operation.fileLocation.storageKey);
      return {
        replay: false,
        operationId,
        storedFileId: operation.storedFileId,
        fileLocationId: operation.fileLocationId,
        storageConnectionId: operation.storageConnectionId,
        storageKey: operation.fileLocation.storageKey,
        sizeBytes: stat.bytes,
        sha256: operation.storedFile.sha256 ?? "",
        mimeType: operation.storedFile.detectedMimeType ?? "application/octet-stream",
        documentId: operation.documentId,
        documentVersionId: operation.documentVersionId,
      };
    } catch (error) {
      this.mapStorageError(error);
    }
  }

  private async fail(operationId: string, errorCode: string): Promise<void> {
    const operation = await this.prisma.uploadOperation.findUnique({
      where: { id: operationId },
    });
    if (!operation) return;
    await this.prisma.$transaction([
      this.prisma.uploadOperation.update({
        where: { id: operationId },
        data: { status: "FAILED", errorCode, completedAt: new Date() },
      }),
      this.prisma.storedFile.update({
        where: { id: operation.storedFileId },
        data: { lifecycle: "FAILED" },
      }),
      this.prisma.fileLocation.update({
        where: { id: operation.fileLocationId },
        data: { state: "FAILED", isActive: false },
      }),
    ]);
  }

  private mapStorageError(error: unknown): never {
    if (error instanceof StorageError) {
      if (error.code === "DISABLED_CONNECTION" || error.code === "UNSUPPORTED_CONNECTION") {
        throw new ServiceUnavailableException(error.message);
      }
      if (error.code === "NO_DEFAULT_CONNECTION") {
        throw new ServiceUnavailableException(error.message);
      }
      if (error.code === "ALREADY_EXISTS") {
        throw new ConflictException(error.message);
      }
      if (error.code === "NOT_FOUND") {
        throw new ServiceUnavailableException("File content is unavailable");
      }
      if (error.message.includes("size limit")) {
        throw new BadRequestException("Attachment exceeds the size limit");
      }
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}

export function uploadFingerprint(input: {
  purpose: string;
  documentId?: string;
  title?: string;
  caseIds: string[];
  clientIds: string[];
  originalFilename: string;
}): string {
  const payload = [
    input.purpose,
    input.documentId ?? "",
    input.title ?? "",
    [...input.caseIds].sort().join(","),
    [...input.clientIds].sort().join(","),
    input.originalFilename,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}
