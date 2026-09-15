import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { PaginationQueryDto } from "@law/core";
import type {
  LegalClientStatus,
  LegalPartyType,
  PartyAddressType,
  PartyContactPointType,
  PartyIdentifierType,
} from "@law/api-interfaces";
import {} from "@law/api-interfaces";

export class PartyContactPointDto {
  @IsIn(["EMAIL", "PHONE", "MOBILE", "FAX", "WEBSITE", "OTHER"])
  type!: PartyContactPointType;

  @IsString()
  @MaxLength(500)
  value!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class PartyIdentifierDto {
  @IsIn([
    "NATIONAL_ID",
    "TAX_ID",
    "REGISTRATION_ID",
    "PASSPORT",
    "ID_CARD",
    "VAT_ID",
    "OTHER",
  ])
  type!: PartyIdentifierType;

  @IsString()
  @MaxLength(200)
  value!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  issuer?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class PartyAddressDto {
  @IsOptional()
  @IsIn(["PRIMARY", "REGISTERED", "MAILING", "BILLING", "OTHER"])
  type?: PartyAddressType;

  @IsString()
  @MaxLength(300)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  countryCode?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateClientDto {
  @IsIn(["PERSON", "ORGANIZATION"])
  type!: LegalPartyType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  tradeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartyContactPointDto)
  contactPoints?: PartyContactPointDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartyIdentifierDto)
  identifiers?: PartyIdentifierDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartyAddressDto)
  addresses?: PartyAddressDto[];
}

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  tradeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsUUID()
  responsibleUserId?: string | null;

  @IsOptional()
  @IsIn(["ACTIVE", "INACTIVE"])
  status?: LegalClientStatus;
}

export class ClientListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(["ACTIVE", "INACTIVE"])
  status?: LegalClientStatus;
}

export class CreateOrganizationContactDto {
  @IsOptional()
  @IsUUID()
  existingPartyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsUUID()
  relationshipTypeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  department?: string;

  @IsOptional()
  @IsBoolean()
  isPrimaryContact?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartyContactPointDto)
  contactPoints?: PartyContactPointDto[];
}

export class AutocompleteQueryDto {
  @IsString()
  @MaxLength(120)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
