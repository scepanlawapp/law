import { Transform } from "class-transformer";
import {
  IsArray,
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from "class-validator";
import { DOCUMENT_CATEGORIES } from "@law/api-interfaces";
import { PaginationQueryDto } from "@law/core";

const toArray = ({ value }: { value: unknown }): string[] | undefined =>
  value === undefined || value === ""
    ? undefined
    : Array.isArray(value)
      ? value.map(String)
      : [String(value)];

const toBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === "") return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return value as never;
};

export class DocumentListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== "root")
  @IsUUID()
  folderId?: string;

  @IsOptional()
  @IsIn(["recent", "needs-linking"])
  view?: "recent" | "needs-linking";

  @IsOptional()
  @IsUUID()
  caseId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsIn(["true", "false", "all"])
  archived?: "true" | "false" | "all";

  @IsOptional()
  @IsIn(DOCUMENT_CATEGORIES)
  category?: (typeof DOCUMENT_CATEGORIES)[number];

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  uncategorized?: boolean;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(320)
  title?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(DOCUMENT_CATEGORIES)
  category?: (typeof DOCUMENT_CATEGORIES)[number] | null;

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

export class DocumentFolderQueryDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  search?: string;
}
export class EnsureDocumentFoldersDto {
  @IsOptional()
  @IsUUID()
  targetParentFolderId?: string | null;

  @IsArray()
  @ArrayMaxSize(2000)
  @IsString({ each: true })
  @MaxLength(1024, { each: true })
  paths!: string[];
}
