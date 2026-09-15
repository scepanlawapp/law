import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  DocumentListQuery,
  DocumentSummary,
  ActivityEventSummary,
} from "@law/api-interfaces";
import { paginationMeta, parseSort, TenantContextService } from "@law/core";
import {
  Prisma,
  PrismaClient as TenantPrismaClient,
} from "@prisma/tenant-client";
import { LegalDocumentStorage } from "./documents.storage";

@Injectable()
export class DocumentsService {
  constructor(private readonly storage: LegalDocumentStorage) {}

  private get db(): TenantPrismaClient {
    return TenantContextService.required.prisma;
  }
  private get workspaceId(): string {
    return TenantContextService.required.workspaceId;
  }
  private get actorId(): string {
    return TenantContextService.required.userId;
  }

  async list(query: DocumentListQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sort = parseSort(
      query.sort,
      ["createdAt", "documentDate", "title"],
      [{ field: "createdAt", direction: "desc" }],
    );
    const search = query.search?.trim();
    const where: Prisma.DocumentWhereInput = {
      workspaceId: this.workspaceId,
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.clientId
        ? { clientLinks: { some: { clientId: query.clientId } } }
        : {}),
      ...(query.matterId
        ? { matterLinks: { some: { matterId: query.matterId } } }
        : {}),
      ...(search
        ? {
            OR: [
              { originalFilename: { contains: search, mode: "insensitive" } },
              { title: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, totalItems] = await Promise.all([
      this.db.document.findMany({
        where,
        orderBy: sort.map((item) => ({ [item.field]: item.direction })),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { category: true },
      }),
      this.db.document.count({ where }),
    ]);
    return {
      items: rows.map((row) => this.toSummary(row)),
      meta: paginationMeta(page, pageSize, totalItems, sort),
    };
  }

  async upload(
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
    input: {
      title?: string;
      categoryId?: string;
      documentDate?: string;
      description?: string;
      visibility?: "INTERNAL" | "CLIENT_SHARED";
      clientId?: string;
      matterId?: string;
    },
  ): Promise<DocumentSummary> {
    if (!file?.buffer?.length)
      throw new BadRequestException("A file is required");
    if (file.size > 25_000_000)
      throw new BadRequestException("Document exceeds the size limit");
    if (input.categoryId) await this.requireCategory(input.categoryId);
    if (input.clientId) await this.requireClient(input.clientId);
    if (input.matterId) await this.requireMatter(input.matterId);
    const id = randomUUID();
    const stored = await this.storage.save(
      this.workspaceId,
      id,
      file.originalname,
      file.buffer,
    );
    const document = await this.db.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          id,
          workspaceId: this.workspaceId,
          originalFilename: file.originalname,
          storageKey: stored.storageKey,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          checksum: stored.checksum,
          title: input.title,
          categoryId: input.categoryId,
          documentDate: input.documentDate
            ? new Date(input.documentDate)
            : undefined,
          description: input.description,
          visibility: input.visibility ?? "INTERNAL",
          uploadedByUserId: this.actorId,
          clientLinks: input.clientId
            ? { create: { clientId: input.clientId } }
            : undefined,
          matterLinks: input.matterId
            ? { create: { matterId: input.matterId } }
            : undefined,
        },
        include: { category: true },
      });
      await tx.activityEvent.create({
        data: {
          workspaceId: this.workspaceId,
          actorUserId: this.actorId,
          entityType: "DOCUMENT",
          entityId: created.id,
          eventType: "DOCUMENT_UPLOADED",
          documentId: created.id,
          payload: { originalFilename: created.originalFilename },
        },
      });
      return created;
    });
    return this.toSummary(document);
  }

  async download(
    id: string,
  ): Promise<{ document: DocumentSummary; buffer: Buffer }> {
    const document = await this.require(id);
    return {
      document: this.toSummary(document),
      buffer: await this.storage.read(
        this.workspaceId,
        document.id,
        document.storageKey,
      ),
    };
  }

  async archive(id: string): Promise<DocumentSummary> {
    const document = await this.require(id);
    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.document.update({
        where: { id: document.id },
        data: { archivedAt: new Date() },
        include: { category: true },
      });
      await tx.activityEvent.create({
        data: {
          workspaceId: this.workspaceId,
          actorUserId: this.actorId,
          entityType: "DOCUMENT",
          entityId: id,
          eventType: "DOCUMENT_ARCHIVED",
          documentId: id,
        },
      });
      return result;
    });
    return this.toSummary(updated);
  }

  async activity(
    entityType: "CLIENT" | "MATTER",
    entityId: string,
  ): Promise<ActivityEventSummary[]> {
    const events = await this.db.activityEvent.findMany({
      where: { workspaceId: this.workspaceId, entityType, entityId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return events.map((event) => ({
      id: event.id,
      entityType: event.entityType,
      entityId: event.entityId,
      eventType: event.eventType,
      payload: event.payload as Record<string, unknown> | null,
      actorUserId: event.actorUserId,
      createdAt: event.createdAt.toISOString(),
    }));
  }

  private async require(id: string) {
    const document = await this.db.document.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: { category: true },
    });
    if (!document) throw new NotFoundException("Document not found");
    return document;
  }
  private async requireCategory(id: string) {
    const row = await this.db.documentCategory.findFirst({
      where: { id, workspaceId: this.workspaceId },
    });
    if (!row) throw new BadRequestException("Document category not found");
  }
  private async requireClient(id: string) {
    const row = await this.db.client.findFirst({
      where: { id, workspaceId: this.workspaceId },
    });
    if (!row) throw new BadRequestException("Client not found");
  }
  private async requireMatter(id: string) {
    const row = await this.db.matter.findFirst({
      where: { id, workspaceId: this.workspaceId },
    });
    if (!row) throw new BadRequestException("Matter not found");
  }
  private toSummary(row: any): DocumentSummary {
    return {
      id: row.id,
      originalFilename: row.originalFilename,
      title: row.title,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      category: row.category
        ? {
            id: row.category.id,
            code: row.category.code,
            name: row.category.name,
            isActive: row.category.isActive,
            sortOrder: row.category.sortOrder,
          }
        : null,
      documentDate: row.documentDate?.toISOString() ?? null,
      source: row.source,
      visibility: row.visibility,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
