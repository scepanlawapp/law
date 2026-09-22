import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  DocumentDetail,
  DocumentListResponse,
  DocumentVersionListResponse,
  DocumentVersionSummary,
  isDocumentCategory,
} from "@law/api-interfaces";
import {
  paginationMeta,
  parseSort,
  PlatformPrismaService,
  WorkspaceContextService,
} from "@law/core";
import { FileService, uploadFingerprint } from "@law/file-storage";
import { Readable } from "node:stream";
import {
  DocumentListQueryDto,
  DocumentVersionListQueryDto,
  UpdateDocumentDto,
} from "./documents.dto";
import { sanitizeDownloadFilename } from "./documents.multipart";

const TITLE_MAX = 320;
const DOCUMENT_SORT = ["updatedAt", "createdAt", "title"] as const;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly files: FileService,
  ) {}

  private get context() {
    return WorkspaceContextService.required;
  }

  async create(input: {
    title: string;
    category?: string;
    caseIds: string[];
    clientIds: string[];
    originalFilename: string;
    stream: Readable;
    idempotencyKey: string;
  }): Promise<DocumentDetail> {
    let title: string;
    let category: string | null;
    const caseIds = uniqueIds(input.caseIds);
    const clientIds = uniqueIds(input.clientIds);
    try {
      title = this.requireTitle(input.title);
      category = this.requireCategory(input.category);
      await this.requireLinks(caseIds, clientIds);
    } catch (error) {
      input.stream.resume();
      throw error;
    }

    const ingest = await this.files.ingest({
      workspaceId: this.context.workspaceId,
      actorUserId: this.context.userId,
      idempotencyKey: input.idempotencyKey,
      purpose: "CREATE_DOCUMENT",
      fingerprint: uploadFingerprint({
        purpose: "CREATE_DOCUMENT",
        title,
        category,
        caseIds,
        clientIds,
        originalFilename: input.originalFilename,
      }),
      originalFilename: input.originalFilename,
      stream: input.stream,
    });

    if (ingest.replay && ingest.documentId) {
      return this.get(ingest.documentId);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          workspaceId: this.context.workspaceId,
          title,
          category,
          createdByUserId: this.context.userId,
          updatedByUserId: this.context.userId,
        },
      });
      const version = await tx.documentVersion.create({
        data: {
          documentId: document.id,
          workspaceId: this.context.workspaceId,
          versionNumber: 1,
          storedFileId: ingest.storedFileId,
          originalFilename: input.originalFilename,
          uploadedByUserId: this.context.userId,
        },
      });
      await tx.document.update({
        where: { id: document.id },
        data: { currentVersionId: version.id },
      });
      await this.replaceLinks(tx, document.id, caseIds, clientIds);
      await this.log(tx, {
        action: "DOCUMENT_CREATED",
        entityId: document.id,
        caseId: caseIds[0],
        clientId: clientIds[0],
        metadata: { caseIds, clientIds, category, versionId: version.id },
      });
      return { documentId: document.id, versionId: version.id };
    });

    await this.files.commitAvailable({
      operationId: ingest.operationId,
      workspaceId: this.context.workspaceId,
      documentId: created.documentId,
      documentVersionId: created.versionId,
    });
    return this.get(created.documentId);
  }

  async addVersion(input: {
    documentId: string;
    originalFilename: string;
    stream: Readable;
    idempotencyKey: string;
  }): Promise<DocumentDetail> {
    const existing = await this.requireDocument(input.documentId);
    const ingest = await this.files.ingest({
      workspaceId: this.context.workspaceId,
      actorUserId: this.context.userId,
      idempotencyKey: input.idempotencyKey,
      purpose: "ADD_VERSION",
      documentId: existing.id,
      fingerprint: uploadFingerprint({
        purpose: "ADD_VERSION",
        documentId: existing.id,
        originalFilename: input.originalFilename,
        caseIds: [],
        clientIds: [],
      }),
      originalFilename: input.originalFilename,
      stream: input.stream,
    });

    if (ingest.replay && ingest.documentId) {
      return this.get(ingest.documentId);
    }

    const versionId = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "Document" WHERE id = ${existing.id} AND "workspaceId" = ${this.context.workspaceId} FOR UPDATE`,
      );
      const aggregate = await tx.documentVersion.aggregate({
        where: { documentId: existing.id },
        _max: { versionNumber: true },
      });
      const versionNumber = (aggregate._max.versionNumber ?? 0) + 1;
      const version = await tx.documentVersion.create({
        data: {
          documentId: existing.id,
          workspaceId: this.context.workspaceId,
          versionNumber,
          storedFileId: ingest.storedFileId,
          originalFilename: input.originalFilename,
          uploadedByUserId: this.context.userId,
        },
      });
      await tx.document.update({
        where: { id: existing.id },
        data: {
          currentVersionId: version.id,
          updatedByUserId: this.context.userId,
        },
      });
      const caseIds = existing.cases.map((row) => row.caseId);
      const clientIds = existing.clients.map((row) => row.clientId);
      await this.log(tx, {
        action: "DOCUMENT_VERSION_ADDED",
        entityId: existing.id,
        caseId: caseIds[0],
        clientId: clientIds[0],
        metadata: {
          caseIds,
          clientIds,
          versionId: version.id,
          versionNumber,
        },
      });
      return version.id;
    });

    await this.files.commitAvailable({
      operationId: ingest.operationId,
      workspaceId: this.context.workspaceId,
      documentId: existing.id,
      documentVersionId: versionId,
    });
    return this.get(existing.id);
  }

  async list(query: DocumentListQueryDto): Promise<DocumentListResponse> {
    const { workspaceId } = this.context;
    const archived = query.archived ?? "false";
    const sort = parseSort(query.sort, DOCUMENT_SORT, [
      { field: "updatedAt", direction: "desc" },
    ]);
    const where: Prisma.DocumentWhereInput = { workspaceId };
    if (archived === "false") where.archivedAt = null;
    if (archived === "true") where.archivedAt = { not: null };
    if (query.category && query.uncategorized) {
      throw new BadRequestException(
        "category and uncategorized cannot be combined",
      );
    }
    if (query.caseId) where.cases = { some: { caseId: query.caseId } };
    if (query.clientId) where.clients = { some: { clientId: query.clientId } };
    if (query.category) where.category = query.category;
    if (query.uncategorized) where.category = null;
    if (query.search?.trim()) {
      where.title = { contains: query.search.trim(), mode: "insensitive" };
    }
    const [totalItems, rows] = await this.prisma.$transaction([
      this.prisma.document.count({ where }),
      this.prisma.document.findMany({
        where,
        include: this.detailInclude(),
        orderBy: sort.map((item) => ({ [item.field]: item.direction })),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => this.toDetail(row)),
      meta: paginationMeta(query.page, query.pageSize, totalItems, sort),
    };
  }

  async get(id: string): Promise<DocumentDetail> {
    return this.toDetail(await this.requireDocument(id));
  }

  async update(id: string, body: UpdateDocumentDto): Promise<DocumentDetail> {
    const existing = await this.requireDocument(id);
    const title =
      body.title === undefined ? existing.title : this.requireTitle(body.title);
    const category =
      body.category === undefined
        ? existing.category
        : this.requireCategory(body.category);
    const caseIds =
      body.caseIds === undefined
        ? existing.cases.map((row) => row.caseId)
        : uniqueIds(body.caseIds);
    const clientIds =
      body.clientIds === undefined
        ? existing.clients.map((row) => row.clientId)
        : uniqueIds(body.clientIds);
    if (body.caseIds !== undefined) await this.requireLinks(caseIds, []);
    if (body.clientIds !== undefined) await this.requireLinks([], clientIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: existing.id },
        data: { title, category, updatedByUserId: this.context.userId },
      });
      if (body.caseIds !== undefined || body.clientIds !== undefined) {
        await this.replaceLinks(
          tx,
          existing.id,
          body.caseIds === undefined
            ? existing.cases.map((row) => row.caseId)
            : caseIds,
          body.clientIds === undefined
            ? existing.clients.map((row) => row.clientId)
            : clientIds,
        );
      }
      await this.log(tx, {
        action: "DOCUMENT_UPDATED",
        entityId: existing.id,
        caseId: caseIds[0],
        clientId: clientIds[0],
        metadata: { caseIds, clientIds, category },
      });
    });
    return this.get(id);
  }

  async archive(id: string): Promise<DocumentDetail> {
    const existing = await this.requireDocument(id);
    if (!existing.archivedAt) {
      await this.prisma.$transaction(async (tx) => {
        await tx.document.update({
          where: { id: existing.id },
          data: {
            archivedAt: new Date(),
            archivedByUserId: this.context.userId,
            updatedByUserId: this.context.userId,
          },
        });
        const caseIds = existing.cases.map((row) => row.caseId);
        const clientIds = existing.clients.map((row) => row.clientId);
        await this.log(tx, {
          action: "DOCUMENT_ARCHIVED",
          entityId: existing.id,
          caseId: caseIds[0],
          clientId: clientIds[0],
          metadata: { caseIds, clientIds },
        });
      });
    }
    return this.get(id);
  }

  async restore(id: string): Promise<DocumentDetail> {
    const existing = await this.requireDocument(id);
    if (existing.archivedAt) {
      await this.prisma.$transaction(async (tx) => {
        await tx.document.update({
          where: { id: existing.id },
          data: {
            archivedAt: null,
            archivedByUserId: null,
            updatedByUserId: this.context.userId,
          },
        });
        const caseIds = existing.cases.map((row) => row.caseId);
        const clientIds = existing.clients.map((row) => row.clientId);
        await this.log(tx, {
          action: "DOCUMENT_RESTORED",
          entityId: existing.id,
          caseId: caseIds[0],
          clientId: clientIds[0],
          metadata: { caseIds, clientIds },
        });
      });
    }
    return this.get(id);
  }

  async listVersions(
    id: string,
    query: DocumentVersionListQueryDto,
  ): Promise<DocumentVersionListResponse> {
    const document = await this.requireDocument(id);
    const sort = parseSort(
      query.sort,
      ["createdAt", "versionNumber"],
      [{ field: "versionNumber", direction: "desc" }],
    );
    const where = {
      documentId: document.id,
      workspaceId: this.context.workspaceId,
    };
    const [totalItems, rows] = await this.prisma.$transaction([
      this.prisma.documentVersion.count({ where }),
      this.prisma.documentVersion.findMany({
        where,
        include: { storedFile: true },
        orderBy: sort.map((item) => ({ [item.field]: item.direction })),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => this.toVersion(row)),
      meta: paginationMeta(query.page, query.pageSize, totalItems, sort),
    };
  }

  async openDownload(
    documentId: string,
    versionId?: string,
  ): Promise<{
    stream: Readable;
    mimeType: string;
    sizeBytes: number;
    filename: string;
  }> {
    const document = await this.requireDocument(documentId);
    const version = versionId
      ? document.versions.find((item) => item.id === versionId)
      : document.currentVersion;
    if (!version) throw new NotFoundException("Document version not found");
    const download = await this.files.openDownload({
      workspaceId: this.context.workspaceId,
      storedFileId: version.storedFileId,
    });
    return {
      ...download,
      filename: sanitizeDownloadFilename(version.originalFilename),
    };
  }

  private async requireDocument(id: string) {
    const item = await this.prisma.document.findFirst({
      where: { id, workspaceId: this.context.workspaceId },
      include: this.detailInclude(),
    });
    if (!item) throw new NotFoundException("Document not found");
    return item;
  }

  private detailInclude() {
    return {
      cases: true,
      clients: true,
      versions: { include: { storedFile: true } },
      currentVersion: { include: { storedFile: true } },
    } as const;
  }

  private async requireLinks(
    caseIds: string[],
    clientIds: string[],
  ): Promise<void> {
    const { workspaceId } = this.context;
    if (caseIds.length) {
      const count = await this.prisma.case.count({
        where: { id: { in: caseIds }, workspaceId },
      });
      if (count !== caseIds.length) {
        throw new BadRequestException("Case is unavailable");
      }
    }
    if (clientIds.length) {
      const count = await this.prisma.client.count({
        where: { id: { in: clientIds }, workspaceId },
      });
      if (count !== clientIds.length) {
        throw new BadRequestException("Client is unavailable");
      }
    }
  }

  private async replaceLinks(
    tx: Prisma.TransactionClient,
    documentId: string,
    caseIds: string[],
    clientIds: string[],
  ): Promise<void> {
    const { workspaceId } = this.context;
    await tx.documentCase.deleteMany({ where: { documentId, workspaceId } });
    await tx.documentClient.deleteMany({ where: { documentId, workspaceId } });
    if (caseIds.length) {
      await tx.documentCase.createMany({
        data: caseIds.map((caseId) => ({ documentId, caseId, workspaceId })),
      });
    }
    if (clientIds.length) {
      await tx.documentClient.createMany({
        data: clientIds.map((clientId) => ({
          documentId,
          clientId,
          workspaceId,
        })),
      });
    }
  }

  private async log(
    tx: Prisma.TransactionClient,
    input: {
      action: string;
      entityId: string;
      caseId?: string;
      clientId?: string;
      metadata?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await tx.activityLog.create({
      data: {
        workspaceId: this.context.workspaceId,
        actorUserId: this.context.userId,
        action: input.action,
        entityType: "Document",
        entityId: input.entityId,
        caseId: input.caseId,
        clientId: input.clientId,
        metadata: input.metadata,
      },
    });
  }

  private requireTitle(value: string): string {
    const title = value?.trim() ?? "";
    if (!title) throw new BadRequestException("Title is required");
    if (title.length > TITLE_MAX) {
      throw new BadRequestException("Title must be at most 320 characters");
    }
    return title;
  }

  private requireCategory(value: string | null | undefined): string | null {
    if (value == null) return null;
    const category = value.trim();
    if (!category) return null;
    if (!isDocumentCategory(category)) {
      throw new BadRequestException("Category is invalid");
    }
    return category;
  }

  private toDetail(row: {
    id: string;
    title: string;
    category: string | null;
    archivedAt: Date | null;
    createdByUserId: string;
    updatedByUserId: string;
    createdAt: Date;
    updatedAt: Date;
    cases: { caseId: string }[];
    clients: { clientId: string }[];
    currentVersion: VersionRow | null;
  }): DocumentDetail {
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      archived: !!row.archivedAt,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      caseIds: row.cases.map((item) => item.caseId),
      clientIds: row.clients.map((item) => item.clientId),
      currentVersion: row.currentVersion
        ? this.toVersion(row.currentVersion)
        : null,
      createdByUserId: row.createdByUserId,
      updatedByUserId: row.updatedByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toVersion(row: VersionRow): DocumentVersionSummary {
    return {
      id: row.id,
      versionNumber: row.versionNumber,
      originalFilename: row.originalFilename,
      mimeType: row.storedFile.detectedMimeType ?? "application/octet-stream",
      sizeBytes: Number(row.storedFile.sizeBytes),
      sha256: row.storedFile.sha256,
      uploadedByUserId: row.uploadedByUserId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

type VersionRow = {
  id: string;
  versionNumber: number;
  originalFilename: string;
  storedFileId: string;
  uploadedByUserId: string;
  createdAt: Date;
  storedFile: {
    detectedMimeType: string | null;
    sizeBytes: bigint;
    sha256: string | null;
  };
};

function uniqueIds(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
