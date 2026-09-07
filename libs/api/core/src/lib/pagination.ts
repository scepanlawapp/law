import { Type } from "class-transformer";
import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import {
  PaginationMeta,
  PaginationSort,
  SortDirection,
} from "@law/api-interfaces";

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize = DEFAULT_PAGE_SIZE;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export function parseSort(
  value: string | undefined,
  allowedFields: readonly string[],
  fallback: PaginationSort[],
): PaginationSort[] {
  if (!value?.trim()) return fallback;

  const allowed = new Set(allowedFields);
  const parsed = value.split(",").flatMap((part) => {
    const [field, rawDirection = "asc"] = part.trim().split(":");
    const direction: SortDirection =
      rawDirection.toLowerCase() === "desc" ? "desc" : "asc";
    return field && allowed.has(field) ? [{ field, direction }] : [];
  });
  return parsed.length ? parsed : fallback;
}

export function paginationMeta(
  page: number,
  pageSize: number,
  totalItems: number,
  sort: PaginationSort[],
): PaginationMeta {
  const totalPages = Math.ceil(totalItems / pageSize);
  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
    sort,
  };
}
