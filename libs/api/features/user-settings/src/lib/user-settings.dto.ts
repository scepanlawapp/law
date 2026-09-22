import { Type } from "class-transformer";
import { UserProfileGender } from "@law/api-interfaces";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
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

export class UpdatePreferencesDto {
  @IsOptional() @IsIn(themes) theme?: (typeof themes)[number];
  @IsOptional() @IsIn(languages) language?: (typeof languages)[number];
  @IsOptional() @IsIn(accentColors) accentColor?: (typeof accentColors)[number];
  @IsOptional() @IsIn(finishes) finish?: (typeof finishes)[number];
  @IsOptional() @IsBoolean() workspaceNotifications?: boolean;
  @IsOptional()
  @IsIn(dateTimeFormats)
  dateTimeFormat?: (typeof dateTimeFormats)[number];
  @IsOptional() @IsString() @MaxLength(80) timeZone?: string;
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
