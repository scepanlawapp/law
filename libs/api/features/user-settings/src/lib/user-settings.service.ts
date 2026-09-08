import { Injectable } from "@nestjs/common";
import { PrismaService } from "@law/core";
import {
  UserSettingsResponse,
  UserSettingsUpdateRequest,
} from "@law/api-interfaces";
import { UpdateUserSettingsDto } from "./user-settings.dto";

@Injectable()
export class UserSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<UserSettingsResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { settings: true },
    });
    const settings =
      user.settings ??
      (await this.prisma.userSettings.create({ data: { userId } }));
    return this.toResponse(user, settings);
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
        accentColor: settings.accentColor,
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
type UserSettingsRecord = UserSettingsResponse["preferences"];
