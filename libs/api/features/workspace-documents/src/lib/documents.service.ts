import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  BulkDocumentAiAccessRequest,
  BulkDocumentAiAccessResponse,
  CaseReference,
  ClientReference,
  DocumentDetail,
  DocumentKind,
  DocumentStatistics,
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
import {
  DocumentContentService,
  documentAiStatus,
} from "@law/document-ingestion";
import { FileService, uploadFingerprint } from "@law/file-storage";
import { Readable } from "node:stream";
import {
  BULK_AI_ACCESS_MAX,
  DocumentListQueryDto,
  DocumentVersionListQueryDto,
  UpdateDocumentDto,
} from "./documents.dto";
import { sanitizeDownloadFilename } from "./documents.multipart";

const TITLE_MAX = 320;
const DOCUMENT_SORT = ["updatedAt", "createdAt", "title"] as const;

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly files: FileService,
    private readonly content: DocumentContentService,
  ) {}

  private get context() {
    return WorkspaceContextService.required;
  }

  async create(input: {
    title: string;
    folderId?: string;
    category?: string;
    caseIds: string[];
    clientIds: string[];
    originalFilename: string;
    stream: Readable;
    idempotencyKey: string;
    /** Let the assistant read this document; defaults to off. */
    aiAccess?: boolean;
    /** Existing content row to link instead of deriving one from the bytes. */
    contentId?: string;
    /** Origin recorded on the DOCUMENT_CREATED activity row. */
    source?: "CHAT_ATTACHMENT";
  }): Promise<DocumentDetail> {
    let title: string;
    let category: string | null;
    const caseIds = uniqueIds(input.caseIds);
    const clientIds = uniqueIds(input.clientIds);
    try {
      title = this.requireTitle(input.title);
      category = this.requireCategory(input.category);
      await this.requireLinks(caseIds, clientIds);
      if (
        input.folderId &&
        !(await this.prisma.documentFolder.findFirst({
          where: {
            id: input.folderId,
            workspaceId: this.context.workspaceId,
            archivedAt: null,
          },
        }))
      ) {
        throw new BadRequestException("Folder is unavailable");
      }
    } catch (error) {
      input.stream.resume();
      throw error;
    }

    const aiAccess = input.aiAccess ?? false;
    const ingest = await this.files.ingest({
      workspaceId: this.context.workspaceId,
      actorUserId: this.context.userId,
      idempotencyKey: input.idempotencyKey,
      purpose: "CREATE_DOCUMENT",
      fingerprint: uploadFingerprint({
        purpose: "CREATE_DOCUMENT",
        folderId: input.folderId,
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

    const contentId = await this.resolveContent(ingest, input.contentId);

    const created = await this.prisma.$transaction(async (tx) => {
      if (input.folderId) {
        const workspaceId = this.context.workspaceId;
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`,
        );
        if (
          !(await tx.documentFolder.findFirst({
            where: { id: input.folderId, workspaceId, archivedAt: null },
          }))
        ) {
          throw new BadRequestException("Folder is unavailable");
        }
      }
      const document = await tx.document.create({
        data: {
          workspaceId: this.context.workspaceId,
          title,
          folderId: input.folderId ?? null,
          category,
          aiAccess,
          ...(aiAccess ? this.aiAccessAudit() : {}),
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
          contentId,
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
        metadata: {
          caseIds,
          clientIds,
          category,
          aiAccess,
          versionId: version.id,
          ...(input.source ? { source: input.source } : {}),
        },
      });
      return { documentId: document.id, versionId: version.id };
    });

    await this.files.commitAvailable({
      operationId: ingest.operationId,
      workspaceId: this.context.workspaceId,
      documentId: created.documentId,
      documentVersionId: created.versionId,
    });
    if (aiAccess) await this.tryRequestIngestion([contentId]);
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

    const contentId = await this.resolveContent(ingest);
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
          contentId,
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
    if (existing.aiAccess) await this.tryRequestIngestion([contentId]);
    return this.get(existing.id);
  }

  async list(query: DocumentListQueryDto): Promise<DocumentListResponse> {
    const { workspaceId } = this.context;
    const archived = query.archived ?? "false";
    const sort = parseSort(query.sort, DOCUMENT_SORT, [
      { field: "updatedAt", direction: "desc" },
    ]);
    const where: Prisma.DocumentWhereInput = { workspaceId };
    if (query.folderId !== undefined)
      where.folderId = query.folderId === "root" ? null : query.folderId;
    if (query.view === "recent")
      where.updatedAt = { gte: new Date(Date.now() - 30 * 86400000) };
    if (query.view === "needs-linking") {
      where.cases = { none: {} };
      where.clients = { none: {} };
    }
    if (archived === "false") where.archivedAt = null;
    if (archived === "true") where.archivedAt = { not: null };
    if (query.category && query.uncategorized) {
      throw new BadRequestException(
        "category and uncategorized cannot be combined",
      );
    }
    const caseIds = [
      ...new Set([
        ...(query.caseIds ?? []),
        ...(query.caseId ? [query.caseId] : []),
      ]),
    ];
    if (caseIds.length)
      where.AND = [{ cases: { some: { caseId: { in: caseIds } } } }];
    if (query.clientId)
      where.clients = { ...where.clients, some: { clientId: query.clientId } };
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

  async statistics(): Promise<DocumentStatistics> {
    const { workspaceId } = this.context;
    const now = new Date();
    const month = new Date(now.getFullYear(), now.getMonth(), 1);
    const [active, addedThisMonth, needsLinking, archived] =
      await this.prisma.$transaction([
        this.prisma.document.count({
          where: { workspaceId, archivedAt: null },
        }),
        this.prisma.document.count({
          where: { workspaceId, createdAt: { gte: month } },
        }),
        this.prisma.document.count({
          where: {
            workspaceId,
            archivedAt: null,
            cases: { none: {} },
            clients: { none: {} },
          },
        }),
        this.prisma.document.count({
          where: { workspaceId, archivedAt: { not: null } },
        }),
      ]);
    return { active, addedThisMonth, needsLinking, archived };
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
    const aiAccessChanged =
      body.aiAccess !== undefined && body.aiAccess !== existing.aiAccess;

    await this.prisma.$transaction(async (tx) => {
      const workspaceId = this.context.workspaceId;
      if (body.folderId !== undefined) {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`,
        );
        if (
          body.folderId &&
          !(await tx.documentFolder.findFirst({
            where: { id: body.folderId, workspaceId, archivedAt: null },
          }))
        ) {
          throw new BadRequestException("Destination folder not found");
        }
      }
      await tx.document.update({
        where: { id: existing.id, workspaceId },
        data: {
          title,
          category,
          folderId: body.folderId,
          updatedByUserId: this.context.userId,
          ...(aiAccessChanged
            ? { aiAccess: body.aiAccess, ...this.aiAccessAudit() }
            : {}),
        },
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
        metadata: {
          caseIds,
          clientIds,
          category,
          ...(body.folderId !== undefined ? { folderId: body.folderId } : {}),
        },
      });
      if (aiAccessChanged) {
        await this.logAiAccess(tx, existing.id, body.aiAccess === true, {
          caseId: caseIds[0],
          clientId: clientIds[0],
        });
      }
    });
    if (aiAccessChanged && body.aiAccess) {
      await this.tryRequestIngestion([existing.currentVersion?.contentId]);
    }
    return this.get(id);
  }

  async setAiAccess(id: string, aiAccess: boolean): Promise<DocumentDetail> {
    const existing = await this.requireDocument(id);
    if (existing.aiAccess === aiAccess) return this.toDetail(existing);
    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: existing.id, workspaceId: this.context.workspaceId },
        data: {
          aiAccess,
          ...this.aiAccessAudit(),
          updatedByUserId: this.context.userId,
        },
      });
      await this.logAiAccess(tx, existing.id, aiAccess, {
        caseId: existing.cases[0]?.caseId,
        clientId: existing.clients[0]?.clientId,
      });
    });
    if (aiAccess) {
      await this.tryRequestIngestion([existing.currentVersion?.contentId]);
    }
    return this.get(id);
  }

  async setAiAccessBulk(
    body: BulkDocumentAiAccessRequest,
  ): Promise<BulkDocumentAiAccessResponse> {
    const { workspaceId } = this.context;
    const documentIds = uniqueIds(body.documentIds);
    if (documentIds.length > BULK_AI_ACCESS_MAX) {
      throw new BadRequestException(
        `At most ${BULK_AI_ACCESS_MAX} documents can be updated at once`,
      );
    }
    const rows = await this.prisma.document.findMany({
      where: { id: { in: documentIds }, workspaceId, archivedAt: null },
      select: {
        id: true,
        aiAccess: true,
        currentVersion: { select: { contentId: true } },
        cases: { select: { caseId: true }, take: 1 },
        clients: { select: { clientId: true }, take: 1 },
      },
    });
    const changed = rows.filter((row) => row.aiAccess !== body.aiAccess);
    if (!changed.length) return { updated: 0 };

    await this.prisma.$transaction(async (tx) => {
      await tx.document.updateMany({
        where: { id: { in: changed.map((row) => row.id) }, workspaceId },
        data: {
          aiAccess: body.aiAccess,
          ...this.aiAccessAudit(),
          updatedByUserId: this.context.userId,
        },
      });
      for (const row of changed) {
        await this.logAiAccess(tx, row.id, body.aiAccess, {
          caseId: row.cases[0]?.caseId,
          clientId: row.clients[0]?.clientId,
        });
      }
    });
    if (body.aiAccess) {
      await this.tryRequestIngestion(
        changed.map((row) => row.currentVersion?.contentId),
      );
    }
    return { updated: changed.length };
  }

  async reprocess(id: string): Promise<DocumentDetail> {
    const existing = await this.requireDocument(id);
    const contentId = existing.currentVersion?.contentId;
    if (!contentId || existing.currentVersion?.content?.status !== "FAILED") {
      throw new ConflictException(
        "Only documents whose processing failed can be reprocessed",
      );
    }
    await this.content.requestIngestion(this.context.workspaceId, contentId);
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
        const workspaceId = this.context.workspaceId;
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`,
        );
        if (
          existing.folderId &&
          !(await tx.documentFolder.findFirst({
            where: { id: existing.folderId, workspaceId, archivedAt: null },
          }))
        ) {
          throw new BadRequestException("Restore the parent folder first");
        }
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
      cases: { include: { case: true } },
      clients: { include: { client: true } },
      versions: { include: { storedFile: true } },
      currentVersion: {
        include: {
          storedFile: true,
          content: { select: { status: true, documentKind: true } },
        },
      },
      chatAttachments: { select: { id: true }, take: 1 },
    } as const;
  }

  private aiAccessAudit() {
    return {
      aiAccessChangedAt: new Date(),
      aiAccessChangedByUserId: this.context.userId,
    };
  }

  private async logAiAccess(
    tx: Prisma.TransactionClient,
    documentId: string,
    aiAccess: boolean,
    links: { caseId?: string; clientId?: string },
  ): Promise<void> {
    await this.log(tx, {
      action: aiAccess
        ? "DOCUMENT_AI_ACCESS_ENABLED"
        : "DOCUMENT_AI_ACCESS_DISABLED",
      entityId: documentId,
      ...links,
      metadata: { aiAccess },
    });
  }

  /**
   * Content for a freshly ingested file, outside the main transaction: the
   * row is keyed by bytes, so linking it is idempotent and safe to repeat.
   */
  private async resolveContent(
    ingest: { sha256: string; mimeType: string; sizeBytes: number },
    contentId?: string,
  ): Promise<string> {
    const { workspaceId } = this.context;
    if (contentId) {
      const found = await this.prisma.documentContent.findFirst({
        where: { id: contentId, workspaceId },
        select: { id: true },
      });
      if (!found) throw new BadRequestException("Content is unavailable");
      return found.id;
    }
    const content = await this.content.findOrCreate({
      workspaceId,
      sha256: ingest.sha256,
      mimeType: ingest.mimeType,
      sizeBytes: ingest.sizeBytes,
    });
    return content.id;
  }

  /**
   * Best effort: the database state is already correct, so a queue outage
   * must not fail the request. Unprocessed content stays PENDING (QUEUED) and
   * is recovered by reprocess or the reindex command.
   */
  private async tryRequestIngestion(
    contentIds: (string | null | undefined)[],
  ): Promise<void> {
    const { workspaceId } = this.context;
    for (const contentId of new Set(contentIds)) {
      if (!contentId) continue;
      try {
        await this.content.requestIngestion(workspaceId, contentId);
      } catch (error) {
        this.logger.warn(
          `Ingestion of content ${contentId} was not queued: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
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
    folderId?: string | null;
    title: string;
    category: string | null;
    archivedAt: Date | null;
    aiAccess: boolean;
    createdByUserId: string;
    updatedByUserId: string;
    createdAt: Date;
    updatedAt: Date;
    chatAttachments: { id: string }[];
    cases: { case: CaseReference }[];
    clients: { client: ClientReference }[];
    currentVersion: VersionRow | null;
  }): DocumentDetail {
    return {
      id: row.id,
      folderId: row.folderId ?? null,
      title: row.title,
      category: row.category,
      archived: !!row.archivedAt,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      aiAccess: row.aiAccess,
      aiStatus: documentAiStatus(row.aiAccess, row.currentVersion?.content),
      documentKind:
        (row.currentVersion?.content?.documentKind as DocumentKind | null) ??
        null,
      fromAssistantChat: row.chatAttachments.length > 0,
      cases: row.cases.map((item) => this.caseReference(item.case)),
      clients: row.clients.map((item) => this.clientReference(item.client)),
      currentVersion: row.currentVersion
        ? this.toVersion(row.currentVersion)
        : null,
      createdByUserId: row.createdByUserId,
      updatedByUserId: row.updatedByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private caseReference(row: CaseReference): CaseReference {
    return {
      id: row.id,
      caseNumber: row.caseNumber,
      name: row.name,
      status: row.status,
      priority: row.priority,
    };
  }

  private clientReference(row: ClientReference): ClientReference {
    return {
      id: row.id,
      clientNumber: row.clientNumber,
      type: row.type,
      displayName: row.displayName,
      status: row.status,
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
  contentId?: string | null;
  content?: { status: string; documentKind: string | null } | null;
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
