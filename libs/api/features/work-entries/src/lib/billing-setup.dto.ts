import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import type {
  ClientBillingProfile,
  RetainerRule,
  UserRate,
  WorkspaceBillingConfig,
} from "@law/api-interfaces";

export const RETAINER_RULES = ["HOURLY", "AT", "ABSORBED"] as const;

/** Decimal string with at most two fraction digits, matching Decimal(18, 2). */
export const MONEY_PATTERN = /^\d{1,16}(\.\d{1,2})?$/;
const MONEY_MESSAGE = "must be a non-negative decimal with up to 2 decimals";
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const CURRENCY_MESSAGE = "currency must be a 3-letter uppercase ISO code";

export class CreateServiceCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  order?: number;
}

export class UpdateServiceCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  order?: number;
}

/** Body of POST/PATCH retainers; the client comes from the route or record. */
export class RetainerAgreementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @Matches(MONEY_PATTERN, { message: `monthlyFee ${MONEY_MESSAGE}` })
  monthlyFee!: string;

  @IsString()
  @Length(3, 3)
  @Matches(CURRENCY_PATTERN, { message: CURRENCY_MESSAGE })
  currency!: string;

  @IsISO8601()
  validFrom!: string;

  @IsOptional()
  @IsISO8601()
  validTo!: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  includedMinutes!: number | null;

  @IsArray()
  @IsUUID(undefined, { each: true })
  coveredCategoryIds!: string[];

  @IsIn(RETAINER_RULES)
  overageRule!: RetainerRule;

  @IsOptional()
  @Matches(MONEY_PATTERN, { message: `overageHourlyRate ${MONEY_MESSAGE}` })
  overageHourlyRate!: string | null;

  @IsIn(RETAINER_RULES)
  outOfScopeRule!: RetainerRule;

  @IsOptional()
  @Matches(MONEY_PATTERN, {
    message: `outOfScopeHourlyRate ${MONEY_MESSAGE}`,
  })
  outOfScopeHourlyRate!: string | null;
}

export class UpsertClientBillingProfileDto
  implements Omit<ClientBillingProfile, "clientId">
{
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: `hourlyRate ${MONEY_MESSAGE}` })
  hourlyRate!: string | null;

  @IsString()
  @Length(3, 3)
  @Matches(CURRENCY_PATTERN, { message: CURRENCY_MESSAGE })
  currency!: string;
}

export class CreateUserRateDto implements Omit<UserRate, "id"> {
  @IsUUID()
  userId!: string;

  @Matches(MONEY_PATTERN, { message: `hourlyValue ${MONEY_MESSAGE}` })
  hourlyValue!: string;

  @IsString()
  @Length(3, 3)
  @Matches(CURRENCY_PATTERN, { message: CURRENCY_MESSAGE })
  currency!: string;

  @IsISO8601()
  effectiveFrom!: string;
}

export class RateQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class UpdateWorkspaceBillingConfigDto implements WorkspaceBillingConfig {
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: `targetHourlyRate ${MONEY_MESSAGE}` })
  targetHourlyRate!: string | null;

  @IsString()
  @Length(3, 3)
  @Matches(CURRENCY_PATTERN, { message: CURRENCY_MESSAGE })
  internalCurrency!: string;

  @Matches(/^\d{1,3}(\.\d{1,2})?$/, {
    message: "defaultVatRate must be a decimal with up to 2 decimals",
  })
  defaultVatRate!: string;

  @IsInt()
  @Min(0)
  @Max(365)
  paymentTermDays!: number;
}
