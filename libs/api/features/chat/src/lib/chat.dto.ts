import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { PaginationQueryDto } from "@law/core";

export class ChatSessionListQueryDto extends PaginationQueryDto {}

export class CreateChatSessionDto {
  @IsUUID()
  workspaceId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
