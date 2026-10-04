import { Type } from "class-transformer";
import {
  NotificationPreferences,
  UserProfileGender,
} from "@law/api-interfaces";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";

const themes = [
  "MIDNIGHT",
  "DEEP_NAVY",
  "CHARCOAL",
  "DARK_TEAL",
  "BURGUNDY",
  "IVORY",
] as const;
const languages = ["SR", "EN"] as const;
const dateTimeFormats = ["TWELVE_HOUR", "TWENTY_FOUR_HOUR"] as const;
const accentColors = [
  "GOLD",
  "EMERALD",
  "ROYAL_BLUE",
  "COPPER",
  "ICE_BLUE",
  "BURGUNDY",
  "PURPLE",
  "IVORY",
] as const;
const finishes = ["SOLID", "METALLIC", "BRUSHED", "MATTE", "LUXURY"] as const;
const genders = [
  "MALE",
  "FEMALE",
] as const satisfies readonly UserProfileGender[];

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @IsOptional() @IsString() @MaxLength(50) username?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) jobTitle?: string;
  @IsOptional() @IsIn(genders) gender?: UserProfileGender | null;
  @IsOptional()
  @IsUrl({ protocols: ["http", "https"] })
  @MaxLength(500)
  avatarUrl?: string;
}

export class NotificationPreferencesDto
  implements Partial<NotificationPreferences>
{
  @IsOptional() @IsBoolean() deadlineAssigned?: boolean;
  @IsOptional() @IsBoolean() deadlineDueSoon?: boolean;
  @IsOptional() @IsBoolean() deadlineDueToday?: boolean;
  @IsOptional() @IsBoolean() deadlineOverdue?: boolean;
  @IsOptional() @IsBoolean() deadlineChanged?: boolean;
  @IsOptional() @IsBoolean() taskAssigned?: boolean;
  @IsOptional() @IsBoolean() taskDueSoon?: boolean;
  @IsOptional() @IsBoolean() taskDueToday?: boolean;
  @IsOptional() @IsBoolean() taskOverdue?: boolean;
  @IsOptional() @IsBoolean() eventUpcoming?: boolean;
  @IsOptional() @IsBoolean() eventChanged?: boolean;
  @IsOptional() @IsBoolean() eventCancelled?: boolean;
  @IsOptional() @IsBoolean() timerRunningLong?: boolean;
  @IsOptional() @IsBoolean() timeReviewReminder?: boolean;
  @IsOptional() @IsBoolean() retainerUsage?: boolean;
}

export class UpdatePreferencesDto {
  @IsOptional() @IsIn(themes) theme?: (typeof themes)[number];
  @IsOptional() @IsIn(languages) language?: (typeof languages)[number];
  @IsOptional() @IsIn(accentColors) accentColor?: (typeof accentColors)[number];
  @IsOptional() @IsIn(finishes) finish?: (typeof finishes)[number];
  @IsOptional() @IsBoolean() workspaceNotifications?: boolean;
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationPreferencesDto)
  notificationPreferences?: NotificationPreferencesDto;
  @IsOptional()
  @IsIn(dateTimeFormats)
  dateTimeFormat?: (typeof dateTimeFormats)[number];
  @IsOptional() @IsString() @MaxLength(80) timeZone?: string;
  @IsOptional() @IsBoolean() timeReviewReminderEnabled?: boolean;
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  timeReviewReminderTime?: string;
}

export class UpdateUserSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateProfileDto)
  profile?: UpdateProfileDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdatePreferencesDto)
  preferences?: UpdatePreferencesDto;
}
