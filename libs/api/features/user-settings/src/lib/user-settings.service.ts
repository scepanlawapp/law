import { Injectable } from "@nestjs/common";
import { PrismaService } from "@law/core";
import {
  UserSettingsAccent,
  UserSettingsFinish,
  UserSettingsResponse,
} from "@law/api-interfaces";
import { UpdateUserSettingsDto } from "./user-settings.dto";

const DEFAULT_SETTINGS: UserSettingsRecord = {
  theme: "MIDNIGHT",
  language: "SR",
  accentColor: "GOLD",
  finish: "SOLID",
  workspaceNotifications: true,
  dateTimeFormat: "TWENTY_FOUR_HOUR",
  timeZone: "Europe/Belgrade",
};

@Injectable()
export class UserSettingsService {
  constructor(private readonly prisma: PrismaService) {}

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

  private toResponse(
    user: UserSettingsUser,
    settings: UserSettingsRecord,
  ): UserSettingsResponse {
    return {
      profile: {
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        phone: user.phone,
        jobTitle: user.jobTitle,
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
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  phone: string | null;
  jobTitle: string | null;
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
