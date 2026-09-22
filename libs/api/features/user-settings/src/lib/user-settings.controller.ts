import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { Response } from "express";
import { AuthGuard, AuthenticatedRequest, CsrfOriginGuard } from "@law/auth";
import { UserSettingsService } from "./user-settings.service";
import { UpdateUserSettingsDto } from "./user-settings.dto";
import { PlatformPrismaService } from "@law/core";

@Controller("users/me")
export class UserSettingsController {
  constructor(
    private readonly settings: UserSettingsService,
    private readonly prisma: PlatformPrismaService,
  ) {}

  @Get("settings")
  @UseGuards(CsrfOriginGuard, AuthGuard)
  get(@Req() request: AuthenticatedRequest) {
    return this.settings.get(this.getUserId(request));
  }

  @Patch("settings")
  @UseGuards(CsrfOriginGuard, AuthGuard)
  update(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateUserSettingsDto,
  ) {
    return this.settings.update(this.getUserId(request), body);
  }

  @Post("avatar")
  @UseGuards(CsrfOriginGuard, AuthGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadAvatar(
    @Req() request: AuthenticatedRequest,
    @UploadedFile()
    file:
      | {
          buffer: Buffer;
          mimetype?: string;
          originalname?: string;
          size?: number;
        }
      | undefined,
  ) {
    if (!file) {
      throw new BadRequestException("An image file is required");
    }
    return this.settings.uploadAvatar(this.getUserId(request), file);
  }

  @Delete("avatar")
  @UseGuards(CsrfOriginGuard, AuthGuard)
  deleteAvatar(@Req() request: AuthenticatedRequest) {
    return this.settings.deleteAvatar(this.getUserId(request));
  }

  @Get("avatar/:filename")
  async getAvatar(
    @Param("filename") filename: string,
    @Res() response: Response,
  ) {
    const file = await this.settings.getAvatarFile(filename);
    response.setHeader("Content-Type", file.contentType);
    response.setHeader("Content-Length", String(file.sizeBytes));
    response.setHeader("Cache-Control", "public, max-age=86400");
    file.stream.pipe(response);
  }

  @Delete("conversations")
  @UseGuards(CsrfOriginGuard, AuthGuard)
  async clearConversationHistory(
    @Req()
    request: AuthenticatedRequest & {
      workspace?: { workspaceId: string };
    },
  ) {
    const workspaceId = request.workspace?.workspaceId;
    if (!workspaceId) return { deleted: 0 };

    const result = await this.prisma.chatSession.updateMany({
      where: {
        createdByUserId: this.getUserId(request),
        workspaceId,
      },
      data: { isDeleted: true },
    });
    return { deleted: result.count };
  }

  private getUserId(request: AuthenticatedRequest): string {
    const userId = request.auth?.user.id;
    if (!userId) {
      throw new BadRequestException("User ID is missing from session");
    }
    return userId;
  }
}
