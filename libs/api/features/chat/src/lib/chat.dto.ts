import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { PaginationQueryDto } from "@law/core";
import { ChatMessageFeedback, DocumentScript } from "@law/api-interfaces";

export class ChatSessionListQueryDto extends PaginationQueryDto {}

export class DraftQueryDto {
  @IsOptional()
  @IsIn(["latin", "cyrillic"])
  script?: DocumentScript;
}

export class DraftExportQueryDto {
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsOptional()
  @IsIn(["docx"])
  format?: "docx";

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

  @IsOptional()
  @IsUUID()
  caseId?: string;
}

export class LinkChatSessionCaseDto {
  @IsOptional()
  @IsUUID()
  caseId!: string | null;
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

export class BriefApplyClientDto {
  @IsIn(["existing", "create"])
  mode!: "existing" | "create";

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  lastName?: string;
}

export class BriefApplyDto {
  @ValidateNested()
  @Type(() => BriefApplyClientDto)
  client!: BriefApplyClientDto;

  @IsString()
  @MaxLength(40)
  caseNumber!: string;

  @IsString()
  @MaxLength(320)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsUUID()
  responsibleUserId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  opposingPartyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  opposingPartyAddress?: string;
}

export class BriefTaskApplyItemDto {
  @IsString()
  @MaxLength(40)
  key!: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  title?: string;

  @IsOptional()
  @IsUUID()
  assigneeUserId?: string;
}

export class BriefTaskApplyDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BriefTaskApplyItemDto)
  tasks!: BriefTaskApplyItemDto[];
}

export class UpdateMessageFeedbackDto {
  @IsOptional()
  @IsIn(["POSITIVE", "NEGATIVE"])
  feedback!: ChatMessageFeedback | null;
}
