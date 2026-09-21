import { Transform } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { PaginationQueryDto } from "@law/core";

const toArray = ({ value }: { value: unknown }): string[] | undefined =>
  value === undefined || value === ""
    ? undefined
    : Array.isArray(value)
      ? value.map(String)
      : [String(value)];

export class DocumentListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  caseId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsIn(["true", "false", "all"])
  archived?: "true" | "false" | "all";
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(320)
  title?: string;

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsUUID("4", { each: true })
  caseIds?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsUUID("4", { each: true })
  clientIds?: string[];
}

export class DocumentVersionListQueryDto extends PaginationQueryDto {}
