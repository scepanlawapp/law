import {
  IsArray,
  IsBoolean,
  IsInt,
  IsIn,
  Min,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { PaginationQueryDto } from "@law/core";
import {
  ChatMessageFeedback,
  ChatSessionScope,
  ChatSessionStateFilter,
  DocumentAnalysisKind,
  DocumentScript,
} from "@law/api-interfaces";

// Accepts repeated query keys or one comma-separated value.
const toArray = ({ value }: { value: unknown }): string[] | undefined =>
  value === undefined || value === ""
    ? undefined
    : (Array.isArray(value) ? value : [value])
        .flatMap((item) => String(item).split(","))
        .map((item) => item.trim())
        .filter(Boolean);

// Reads the raw value so `"false"` is not coerced to `true` first.
const toBoolean = ({
  obj,
  key,
}: {
  obj: Record<string, unknown>;
  key: string;
}): boolean | undefined => {
  const value = obj[key];
  return value === undefined || value === ""
    ? undefined
    : value === true || value === "true";
};

const SESSION_SCOPES: ChatSessionScope[] = ["mine", "team"];
const SESSION_STATES: ChatSessionStateFilter[] = [
  "pending",
  "draft",
  "analysis",
];
const ANALYSIS_KINDS: DocumentAnalysisKind[] = [
  "CONTRACT_REVIEW",
  "CASE_TIMELINE",
];

export class ChatSessionListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(SESSION_SCOPES)
  scope?: ChatSessionScope;

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(SESSION_STATES, { each: true })
  states?: ChatSessionStateFilter[];

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  archived?: boolean;

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsUUID("all", { each: true })
  caseIds?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsUUID("all", { each: true })
  clientIds?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsUUID("all", { each: true })
  authorIds?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(ANALYSIS_KINDS, { each: true })
  analysisKinds?: DocumentAnalysisKind[];

  @IsOptional()
  @IsIn(["date", "matter"])
  group?: "date" | "matter";
}

export class ChatSessionFacetsQueryDto {
  @IsOptional()
  @IsIn(SESSION_SCOPES)
  scope?: ChatSessionScope;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class CaseLinksQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  draftPage = 1;
}

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
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;
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

export class BriefApplyPreviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  clientRole?: string;
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

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string;
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

export class PendingActionDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
