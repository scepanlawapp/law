import {
  Body,
  Controller,
  Delete,
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
  BriefApplyPreview,
  BriefApplyResponse,
  BriefTaskApplyResponse,
  BriefTaskPreview,
  ChatSessionSummary,
  ChatStreamEvent,
  DraftResultResponse,
  WorkspaceRole,
} from "@law/api-interfaces";
import {
  ChatSessionListQueryDto,
  BriefApplyDto,
  BriefTaskApplyDto,
  CreateChatSessionDto,
  DraftExportQueryDto,
  LinkChatSessionCaseDto,
  DraftQueryDto,
  ReviewDraftDto,
  UpdateChatSessionDto,
  UpdateDraftDto,
  UpdateMessageFeedbackDto,
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
      body.caseId,
    );
  }

  @Post("sessions/:sessionId/case")
  linkSessionCase(
    @Req() request: WorkspaceRequest,
    @Param("sessionId") sessionId: string,
    @Body() body: LinkChatSessionCaseDto,
  ): Promise<ChatSessionSummary> {
    return this.chat.linkSessionCase(
      request.workspace!.workspaceId,
      request.auth!.user.id,
      sessionId,
      body.caseId,
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

  @Post("sessions/:sessionId/briefs/:briefId/preview")
  previewBrief(
    @Req() request: WorkspaceRequest,
    @Param("sessionId") sessionId: string,
    @Param("briefId") briefId: string,
  ): Promise<BriefApplyPreview> {
    return this.chat.previewBrief(
      request.workspace!.workspaceId,
      request.auth!.user.id,
      sessionId,
      briefId,
    );
  }

  @Post("sessions/:sessionId/briefs/:briefId/apply")
  applyBrief(
    @Req() request: WorkspaceRequest,
    @Param("sessionId") sessionId: string,
    @Param("briefId") briefId: string,
    @Body() body: BriefApplyDto,
  ): Promise<BriefApplyResponse> {
    return this.chat.applyBrief(
      request.workspace!.workspaceId,
      request.auth!.user.id,
      sessionId,
      briefId,
      body,
    );
  }

  @Post("sessions/:sessionId/briefs/:briefId/task-preview")
  previewBriefTasks(
    @Req() request: WorkspaceRequest,
    @Param("sessionId") sessionId: string,
    @Param("briefId") briefId: string,
  ): Promise<BriefTaskPreview> {
    return this.chat.previewBriefTasks(
      request.workspace!.workspaceId,
      sessionId,
      briefId,
    );
  }

  @Post("sessions/:sessionId/briefs/:briefId/tasks")
  applyBriefTasks(
    @Req() request: WorkspaceRequest,
    @Param("sessionId") sessionId: string,
    @Param("briefId") briefId: string,
    @Body() body: BriefTaskApplyDto,
  ): Promise<BriefTaskApplyResponse> {
    return this.chat.applyBriefTasks(
      request.workspace!.workspaceId,
      request.auth!.user.id,
      sessionId,
      briefId,
      body,
    );
  }

  @Get("cases/:caseId/links")
  caseLinks(@Req() request: WorkspaceRequest, @Param("caseId") caseId: string) {
    return this.chat.caseLinks(request.workspace!.workspaceId, caseId);
  }

  @Delete("sessions/:sessionId")
  deleteSession(
    @Req() request: WorkspaceRequest,
    @Param("sessionId") sessionId: string,
  ): Promise<ChatSessionSummary> {
    return this.chat.deleteSession(request.workspace!.workspaceId, sessionId);
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

  @Sse("events")
  workspaceEvents(
    @Req() request: WorkspaceRequest,
  ): Observable<{ data: ChatStreamEvent }> {
    return this.chat
      .streamWorkspace(request.workspace!.workspaceId)
      .pipe(map((event) => ({ data: event })));
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

  @Post("jobs/:jobId/retry")
  retryJob(@Req() request: WorkspaceRequest, @Param("jobId") jobId: string) {
    return this.chat.retryJob(request.workspace!.workspaceId, jobId);
  }

  @Patch("messages/:messageId/feedback")
  updateMessageFeedback(
    @Req() request: WorkspaceRequest,
    @Param("messageId") messageId: string,
    @Body() body: UpdateMessageFeedbackDto,
  ) {
    return this.chat.updateMessageFeedback(
      request.workspace!.workspaceId,
      messageId,
      body.feedback ?? null,
    );
  }

  @Post("messages/:messageId/regenerate")
  regenerateAnswer(
    @Req() request: WorkspaceRequest,
    @Param("messageId") messageId: string,
  ) {
    return this.chat.regenerateAnswer(
      request.workspace!.workspaceId,
      messageId,
    );
  }

  @Get("drafts")
  listDrafts(
    @Req() request: WorkspaceRequest,
    @Query("sessionId") sessionId?: string,
  ): Promise<DraftResultResponse[]> {
    return this.chat.listDrafts(request.workspace!.workspaceId, sessionId);
  }

  @Get("drafts/:draftId/export")
  async exportDraft(
    @Req() request: WorkspaceRequest,
    @Param("draftId") draftId: string,
    @Query() query: DraftExportQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.chat.exportDraft(
      request.workspace!.workspaceId,
      draftId,
      request.auth!.user.id,
      query.script ?? "cyrillic",
    );
    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    response.setHeader("Content-Length", String(buffer.length));
    response.send(buffer);
  }

  @Patch("drafts/:draftId")
  updateDraft(
    @Req() request: WorkspaceRequest,
    @Param("draftId") draftId: string,
    @Body() body: UpdateDraftDto,
  ): Promise<DraftResultResponse> {
    return this.chat.updateDraft(
      request.workspace!.workspaceId,
      draftId,
      body.finalDocumentText,
      request.auth!.user.id,
    );
  }

  @Post("drafts/:draftId/approve")
  @WorkspaceAccess(WorkspaceRole.LAWYER)
  approveDraft(
    @Req() request: WorkspaceRequest,
    @Param("draftId") draftId: string,
    @Body() body: ReviewDraftDto,
  ): Promise<DraftResultResponse> {
    return this.chat.approveDraft(
      request.workspace!.workspaceId,
      draftId,
      request.auth!.user.id,
      body.note,
    );
  }

  @Post("drafts/:draftId/reject")
  @WorkspaceAccess(WorkspaceRole.LAWYER)
  rejectDraft(
    @Req() request: WorkspaceRequest,
    @Param("draftId") draftId: string,
    @Body() body: ReviewDraftDto,
  ): Promise<DraftResultResponse> {
    return this.chat.rejectDraft(
      request.workspace!.workspaceId,
      draftId,
      request.auth!.user.id,
      body.note,
    );
  }

  @Post("drafts/:draftId/request-changes")
  @WorkspaceAccess(WorkspaceRole.LAWYER)
  requestChangesDraft(
    @Req() request: WorkspaceRequest,
    @Param("draftId") draftId: string,
    @Body() body: ReviewDraftDto,
  ): Promise<DraftResultResponse> {
    return this.chat.requestChangesDraft(
      request.workspace!.workspaceId,
      draftId,
      request.auth!.user.id,
      body.note,
    );
  }
}
