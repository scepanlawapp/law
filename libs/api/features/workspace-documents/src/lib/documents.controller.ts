import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { IncomingMessage } from "node:http";
import archiver = require("archiver");
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import {
  DocumentListQueryDto,
  DocumentFolderQueryDto,
  EnsureDocumentFoldersDto,
  DocumentVersionListQueryDto,
  UpdateDocumentDto,
  UpdateDocumentFolderDto,
} from "./documents.dto";
import {
  parseDocumentUpload,
  requireIdempotencyKey,
} from "./documents.multipart";
import { DocumentsService } from "./documents.service";

import { DocumentFoldersService } from "./document-folders.service";

@Controller("documents")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly folders: DocumentFoldersService,
  ) {}

  @Get("folders")
  browseFolders(@Query() query: DocumentFolderQueryDto) {
    return this.folders.browse(query);
  }

  @Post("folders/ensure")
  ensureFolders(@Body() body: EnsureDocumentFoldersDto) {
    return this.folders.ensure(body);
  }

  @Get("statistics")
  statistics() {
    return this.documents.statistics();
  }

  @Patch("folders/:id")
  updateFolder(@Param("id") id: string, @Body() body: UpdateDocumentFolderDto) {
    return this.folders.update(id, body);
  }

  @Post("folders/:id/archive")
  archiveFolder(@Param("id") id: string) {
    return this.folders.setArchived(id, true);
  }

  @Post("folders/:id/restore")
  restoreFolder(@Param("id") id: string) {
    return this.folders.setArchived(id, false);
  }

  @Get("folders/:id/download")
  async downloadFolder(@Param("id") id: string, @Res() response: Response) {
    const bundle = await this.folders.downloadEntries(id);
    response.setHeader("Content-Type", "application/zip");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(bundle.filename)}`,
    );
    const archive = archiver("zip", { zlib: { level: 5 } });
    const streams = new Set<NodeJS.ReadableStream>();
    archive.on("error", (error) => response.destroy(error));
    response.on("close", () => {
      archive.abort();
      for (const stream of streams)
        if ("destroy" in stream)
          (stream as import("node:stream").Readable).destroy();
    });
    archive.pipe(response);
    try {
      for (const directory of bundle.directories)
        archive.append("", { name: directory });
      for (const entry of bundle.entries) {
        if (response.destroyed) break;
        const file = await this.documents.openDownload(entry.id);
        streams.add(file.stream);
        file.stream.on("error", (error) => response.destroy(error));
        archive.append(file.stream, { name: entry.name });
      }
      await archive.finalize();
    } catch (error) {
      archive.abort();
      response.destroy(
        error instanceof Error ? error : new Error("Folder download failed"),
      );
    }
  }

  @Get()
  list(@Query() query: DocumentListQueryDto) {
    return this.documents.list(query);
  }

  @Post()
  async create(@Req() request: IncomingMessage) {
    const idempotencyKey = requireIdempotencyKey(
      request.headers["idempotency-key"],
    );
    const upload = await parseDocumentUpload(request);
    return this.documents.create({
      title: upload.title ?? "",
      folderId: upload.folderId,
      category: upload.category,
      caseIds: upload.caseIds,
      clientIds: upload.clientIds,
      originalFilename: upload.originalFilename,
      stream: upload.stream,
      idempotencyKey,
    });
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.documents.get(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateDocumentDto) {
    return this.documents.update(id, body);
  }

  @Post(":id/versions")
  async addVersion(@Param("id") id: string, @Req() request: IncomingMessage) {
    const idempotencyKey = requireIdempotencyKey(
      request.headers["idempotency-key"],
    );
    const upload = await parseDocumentUpload(request);
    return this.documents.addVersion({
      documentId: id,
      originalFilename: upload.originalFilename,
      stream: upload.stream,
      idempotencyKey,
    });
  }

  @Get(":id/versions")
  listVersions(
    @Param("id") id: string,
    @Query() query: DocumentVersionListQueryDto,
  ) {
    return this.documents.listVersions(id, query);
  }

  @Get(":id/download")
  async download(@Param("id") id: string, @Res() response: Response) {
    const file = await this.documents.openDownload(id);
    this.sendFile(response, file);
  }

  @Get(":id/versions/:versionId/download")
  async downloadVersion(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Res() response: Response,
  ) {
    const file = await this.documents.openDownload(id, versionId);
    this.sendFile(response, file);
  }

  @Post(":id/archive")
  archive(@Param("id") id: string) {
    return this.documents.archive(id);
  }

  @Post(":id/restore")
  restore(@Param("id") id: string) {
    return this.documents.restore(id);
  }

  private sendFile(
    response: Response,
    file: {
      stream: NodeJS.ReadableStream;
      mimeType: string;
      sizeBytes: number;
      filename: string;
    },
  ): void {
    response.setHeader("Content-Type", file.mimeType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.filename}"`,
    );
    response.setHeader("Content-Length", String(file.sizeBytes));
    file.stream.pipe(response);
  }
}
