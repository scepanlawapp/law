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
  Sse,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { concat, from, map, Observable } from "rxjs";
import { AuthGuard, AuthenticatedRequest, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import {
  ChatSendMessageResponse,
  ChatSessionDetail,
  ChatSessionListResponse,
  ChatSessionSummary,
  ChatStreamEvent,
  DraftResultResponse,
} from "@law/api-interfaces";
import {
  ChatSessionListQueryDto,
  CreateChatSessionDto,
  DraftQueryDto,
  UpdateChatSessionDto,
} from "./chat.dto";
import { ChatService, UploadedChatFile } from "./chat.service";

interface WorkspaceRequest extends AuthenticatedRequest {
  workspace?: { workspaceId: string };
}

@Controller("chat")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get("sessions")
  listSessions(
    @Req() request: WorkspaceRequest,
    @Query() query: ChatSessionListQueryDto,
  ): Promise<ChatSessionListResponse> {
    return this.chat.listSessions(request.workspace!.workspaceId, query);
  }

  @Post("sessions")
  createSession(
    @Req() request: WorkspaceRequest,
    @Body() body: CreateChatSessionDto,
  ): Promise<ChatSessionSummary> {
    return this.chat.createSession(
      request.workspace!.workspaceId,
      request.auth!.user.id,
      body.title,
    );
  }

  @Patch("sessions/:sessionId")
  updateSession(
    @Req() request: WorkspaceRequest,
    @Param("sessionId") sessionId: string,
    @Body() body: UpdateChatSessionDto,
  ): Promise<ChatSessionSummary> {
    return this.chat.updateSession(
      request.workspace!.workspaceId,
      sessionId,
      body.title,
    );
  }

  @Get("sessions/:sessionId")
  getSession(
    @Req() request: WorkspaceRequest,
    @Param("sessionId") sessionId: string,
  ): Promise<ChatSessionDetail> {
    return this.chat.getSession(request.workspace!.workspaceId, sessionId);
  }

  @Post("sessions/:sessionId/messages")
  @UseInterceptors(FilesInterceptor("files", 5))
  sendMessage(
    @Req() request: WorkspaceRequest,
    @Param("sessionId") sessionId: string,
    @Body("content") content: string | undefined,
    @UploadedFiles() files: UploadedChatFile[] | undefined,
  ): Promise<ChatSendMessageResponse> {
    return this.chat.sendMessage({
      workspaceId: request.workspace!.workspaceId,
      sessionId,
      userId: request.auth!.user.id,
      content: content ?? "",
      files: files ?? [],
    });
  }

  @Sse("sessions/:sessionId/events")
  async events(
    @Req() request: WorkspaceRequest,
    @Param("sessionId") sessionId: string,
    @Query("after") after?: string,
  ): Promise<Observable<{ data: ChatStreamEvent }>> {
    const replay = await this.chat.replayEvents(
      request.workspace!.workspaceId,
      sessionId,
      after,
    );
    return concat(from(replay), this.chat.stream(sessionId)).pipe(
      map((event) => ({ data: event })),
    );
  }

  @Get("attachments/:attachmentId")
  async downloadAttachment(
    @Req() request: WorkspaceRequest,
    @Param("attachmentId") attachmentId: string,
    @Res() response: Response,
  ): Promise<void> {
    const { attachment, buffer } = await this.chat.getAttachment(
      request.workspace!.workspaceId,
      attachmentId,
    );
    response.setHeader("Content-Type", attachment.mimeType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${attachment.originalName.replace(/"/g, "")}"`,
    );
    response.setHeader("Content-Length", String(buffer.length));
    response.send(buffer);
  }

  @Get("jobs/:jobId/draft")
  getDraft(
    @Req() request: WorkspaceRequest,
    @Param("jobId") jobId: string,
    @Query() query: DraftQueryDto,
  ): Promise<DraftResultResponse> {
    return this.chat.getDraft(
      request.workspace!.workspaceId,
      jobId,
      query.script ?? "latin",
    );
  }
}
