import { Type } from "class-transformer";
import { IsInt, IsString, Max, MaxLength, Min } from "class-validator";

export class UserSearchQueryDto {
  @IsString()
  @MaxLength(120)
  q!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
