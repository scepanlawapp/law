import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateChatSessionDto {
  @IsUUID()
  workspaceId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
