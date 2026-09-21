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
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import {
  DocumentListQueryDto,
  DocumentVersionListQueryDto,
  UpdateDocumentDto,
} from "./documents.dto";
import {
  parseDocumentUpload,
  requireIdempotencyKey,
} from "./documents.multipart";
import { DocumentsService } from "./documents.service";

@Controller("documents")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

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
