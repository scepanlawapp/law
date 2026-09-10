import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { PaginationQueryDto } from "@law/core";
import { DocumentScript } from "@law/api-interfaces";

export class ChatSessionListQueryDto extends PaginationQueryDto {}

export class DraftQueryDto {
  @IsOptional()
  @IsIn(["latin", "cyrillic"])
  script?: DocumentScript;
}

export class CreateChatSessionDto {
  @IsUUID()
  workspaceId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}

export class UpdateChatSessionDto {
  @IsString()
  @MaxLength(200)
  title!: string;
}

export class UpdateDraftDto {
  @IsString()
  finalDocumentText!: string;
}

export class ReviewDraftDto {
  @IsOptional()
  @IsString()
  note?: string;
}
