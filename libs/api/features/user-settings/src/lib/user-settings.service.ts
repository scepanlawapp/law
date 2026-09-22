import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@law/core";
import {
  UserAvatarResponse,
  UserSettingsAccent,
  UserSettingsFinish,
  UserSettingsResponse,
} from "@law/api-interfaces";
import {
  detectMimeType,
  FileStorageConfig,
  LocalStorageAdapter,
} from "@law/file-storage";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { UpdateUserSettingsDto } from "./user-settings.dto";

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

const DEFAULT_SETTINGS: UserSettingsRecord = {
  theme: "CHARCOAL",
  language: "SR",
  accentColor: "GOLD",
  finish: "METALLIC",
  workspaceNotifications: true,
  dateTimeFormat: "TWENTY_FOUR_HOUR",
  timeZone: "Europe/Belgrade",
};

@Injectable()
export class UserSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageAdapter: LocalStorageAdapter,
    private readonly storageConfig: FileStorageConfig,
  ) {}

  async get(userId: string): Promise<UserSettingsResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { settings: true },
    });
    // A user without a settings row simply uses the defaults until they save changes.
    return this.toResponse(user, user.settings ?? DEFAULT_SETTINGS);
  }

  async update(
    userId: string,
    input: UpdateUserSettingsDto,
  ): Promise<UserSettingsResponse> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: input.profile ?? {},
      include: { settings: true },
    });
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...(input.preferences ?? {}) },
      update: input.preferences ?? {},
    });
    return this.toResponse(user, settings);
  }

  async uploadAvatar(
    userId: string,
    file: {
      buffer: Buffer;
      mimetype?: string;
      originalname?: string;
      size?: number;
    },
  ): Promise<UserAvatarResponse> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException("An image file is required");
    }

    const size = file.size ?? file.buffer.length;
    if (size > MAX_AVATAR_BYTES) {
      throw new BadRequestException("Avatar image exceeds the 5MB size limit");
    }

    const detectedMime = detectMimeType(file.buffer);
    const mime = detectedMime ?? file.mimetype ?? "";
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mime)) {
      throw new BadRequestException(
        "Invalid image format. Allowed formats: JPEG, PNG, WebP, GIF",
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, avatarUrl: true },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    let extension = ".png";
    if (mime === "image/jpeg") extension = ".jpg";
    else if (mime === "image/webp") extension = ".webp";
    else if (mime === "image/gif") extension = ".gif";
    else if (file.originalname) {
      const ext = extname(file.originalname).toLowerCase();
      if (ext) extension = ext;
    }

    const filename = `${userId}-${randomUUID()}${extension}`;
    const storageKey = `avatars/${filename}`;

    await this.storageAdapter.write(storageKey, Readable.from(file.buffer), {
      maxBytes: MAX_AVATAR_BYTES,
      tempSuffix: randomUUID(),
    });

    const oldAvatarUrl = user.avatarUrl;
    const avatarUrl = `/api/users/me/avatar/${filename}`;

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    if (oldAvatarUrl) {
      await this.deleteAvatarFile(oldAvatarUrl);
    }

    return { avatarUrl };
  }

  async deleteAvatar(userId: string): Promise<UserAvatarResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, avatarUrl: true },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const oldAvatarUrl = user.avatarUrl;

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });

    if (oldAvatarUrl) {
      await this.deleteAvatarFile(oldAvatarUrl);
    }

    return { avatarUrl: null };
  }

  async getAvatarFile(filename: string): Promise<{
    stream: Readable;
    contentType: string;
    sizeBytes: number;
  }> {
    if (
      !filename ||
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\0")
    ) {
      throw new BadRequestException("Invalid filename");
    }

    const storageKey = `avatars/${filename}`;
    try {
      const stat = await this.storageAdapter.stat(storageKey);
      const stream = await this.storageAdapter.read(storageKey);
      const ext = extname(filename).toLowerCase();
      let contentType = "application/octet-stream";
      if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
      else if (ext === ".png") contentType = "image/png";
      else if (ext === ".webp") contentType = "image/webp";
      else if (ext === ".gif") contentType = "image/gif";

      return {
        stream,
        contentType,
        sizeBytes: stat.bytes,
      };
    } catch {
      throw new NotFoundException("Avatar not found");
    }
  }

  private async deleteAvatarFile(avatarUrl: string): Promise<void> {
    const prefix = "/api/users/me/avatar/";
    if (!avatarUrl.startsWith(prefix)) {
      return;
    }
    const filename = avatarUrl.slice(prefix.length);
    if (
      !filename ||
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\0")
    ) {
      return;
    }
    const storageKey = `avatars/${filename}`;
    try {
      await this.storageAdapter.delete(storageKey);
    } catch {
      // Ignore cleanup error if already missing
    }
  }

  private toResponse(
    user: UserSettingsUser,
    settings: UserSettingsRecord,
  ): UserSettingsResponse {
    return {
      profile: {
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        phone: user.phone,
        jobTitle: user.jobTitle,
        gender: user.gender,
        avatarUrl: user.avatarUrl,
      },
      preferences: {
        theme: settings.theme,
        language: settings.language,
        accentColor: normalizeAccent(settings.accentColor),
        finish: normalizeFinish(settings.finish),
        workspaceNotifications: settings.workspaceNotifications,
        dateTimeFormat: settings.dateTimeFormat,
        timeZone: settings.timeZone,
      },
    };
  }
}

type UserSettingsUser = Pick<UserSettingsResponse["profile"], never> & {
  email: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  phone: string | null;
  jobTitle: string | null;
  gender: UserSettingsResponse["profile"]["gender"];
  avatarUrl: string | null;
};
type UserSettingsRecord = Omit<
  UserSettingsResponse["preferences"],
  "accentColor" | "finish"
> & {
  accentColor: string;
  finish: string;
};

const accents = [
  "GOLD",
  "EMERALD",
  "ROYAL_BLUE",
  "COPPER",
  "ICE_BLUE",
  "BURGUNDY",
  "PURPLE",
  "IVORY",
] as const;

function normalizeAccent(value: string): UserSettingsAccent {
  return accents.includes(value as (typeof accents)[number])
    ? (value as UserSettingsAccent)
    : "GOLD";
}

const finishes = ["SOLID", "METALLIC", "BRUSHED", "MATTE", "LUXURY"] as const;

function normalizeFinish(value: string): UserSettingsFinish {
  return finishes.includes(value as (typeof finishes)[number])
    ? (value as UserSettingsFinish)
    : "SOLID";
}
