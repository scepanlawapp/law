import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class ReferenceDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsString() @MaxLength(32) color?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
