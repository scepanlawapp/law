import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from "class-validator";

const themes = ["SYSTEM", "LIGHT", "DARK"] as const;
const languages = ["SR", "EN"] as const;
const dateTimeFormats = ["TWELVE_HOUR", "TWENTY_FOUR_HOUR"] as const;
const accentColors = ["BLUE", "TEAL", "CORAL", "VIOLET"] as const;

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @IsOptional() @IsString() @MaxLength(50) username?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) jobTitle?: string;
  @IsOptional()
  @IsUrl({ protocols: ["http", "https"] })
  @MaxLength(500)
  avatarUrl?: string;
}

export class UpdatePreferencesDto {
  @IsOptional() @IsIn(themes) theme?: (typeof themes)[number];
  @IsOptional() @IsIn(languages) language?: (typeof languages)[number];
  @IsOptional() @IsIn(accentColors) accentColor?: (typeof accentColors)[number];
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
