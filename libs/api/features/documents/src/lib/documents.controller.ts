import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import { DocumentListQueryDto, DocumentMetadataDto } from "./documents.dto";
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

  @Post("upload")
  @UseInterceptors(FileInterceptor("file"))
  upload(
    @UploadedFile()
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
    @Req() request: { body: DocumentMetadataDto },
  ) {
    return this.documents.upload(file, request.body);
  }

  @Get(":id/download")
  async download(@Param("id") id: string, @Res() response: Response) {
    const result = await this.documents.download(id);
    response.setHeader("Content-Type", result.document.mimeType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.document.originalFilename.replace(/"/g, "")}"`,
    );
    response.setHeader("Content-Length", String(result.buffer.length));
    response.send(result.buffer);
  }

  @Post(":id/archive")
  archive(@Param("id") id: string) {
    return this.documents.archive(id);
  }

  @Get("activity/:entityType/:entityId")
  activity(
    @Param("entityType") entityType: "CLIENT" | "MATTER",
    @Param("entityId") entityId: string,
  ) {
    return this.documents.activity(entityType, entityId);
  }
}
