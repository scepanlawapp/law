import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  PaymentMethod,
  PaymentPurpose,
  PaymentQuery,
} from "@law/api-interfaces";
export class AllocationDto {
  @IsUUID("all", { message: "Izabrani zapis nije ispravan." })
  invoiceId!: string;
  @Matches(/^\d{1,16}(\.\d{1,2})?$/, {
    message: "Iznos mora imati najviše dve decimale.",
  })
  amount!: string;
}
export class SavePaymentDto {
  @IsOptional()
  @IsUUID("all", { message: "Izabrani zapis nije ispravan." })
  clientId?: string | null;
  @Matches(/^\d{1,16}(\.\d{1,2})?$/, {
    message: "Iznos mora imati najviše dve decimale.",
  })
  amount!: string;
  @Matches(/^[A-Z]{3}$/, { message: "Izaberite ispravnu valutu." })
  currency!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Unesite datum u obliku GGGG-MM-DD.",
  })
  receivedAt!: string;
  @IsIn(["BANK_TRANSFER", "CASH", "CARD", "OTHER"], {
    message: "Izabrana vrednost nije dozvoljena.",
  })
  paymentMethod!: PaymentMethod;
  @IsIn(["REGULAR", "ADVANCE"], {
    message: "Izabrana vrednost nije dozvoljena.",
  })
  purpose!: PaymentPurpose;
  @IsOptional()
  @IsString({ message: "Unesite tekst." })
  @MaxLength(250, { message: "Tekst je predugačak." })
  reference?: string | null;
  @IsOptional()
  @IsString({ message: "Unesite tekst." })
  @MaxLength(250, { message: "Tekst je predugačak." })
  payerName?: string | null;
  @IsOptional()
  @IsString({ message: "Unesite tekst." })
  @MaxLength(5000, { message: "Tekst je predugačak." })
  note?: string | null;
  @IsOptional()
  @IsUUID("all", { message: "Izabrani zapis nije ispravan." })
  bankAccountId?: string | null;
  @IsArray({ message: "Raspodele moraju biti lista." })
  @ArrayMaxSize(100, { message: "Dozvoljeno je najviše 100 raspodela." })
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations!: AllocationDto[];
  @IsOptional()
  @IsInt({ message: "Unesite ceo broj." })
  @Min(1, { message: "Vrednost mora biti najmanje 1." })
  version?: number;
}
export class VoidPaymentDto {
  @IsString({ message: "Unesite tekst." })
  @MaxLength(1000, { message: "Tekst je predugačak." })
  reason!: string;
  @IsInt({ message: "Unesite ceo broj." })
  @Min(1, { message: "Vrednost mora biti najmanje 1." })
  version!: number;
}
export class PaymentQueryDto implements PaymentQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Unesite ceo broj." })
  @Min(1, { message: "Vrednost mora biti najmanje 1." })
  page = 1;
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Unesite ceo broj." })
  @Min(1, { message: "Vrednost mora biti najmanje 1." })
  @Max(100, { message: "Dozvoljeno je najviše 100 redova." })
  pageSize = 25;
  @IsOptional()
  @IsString({ message: "Unesite tekst." })
  @MaxLength(250, { message: "Tekst je predugačak." })
  search?: string;
  @IsOptional()
  @IsUUID("all", { message: "Izabrani zapis nije ispravan." })
  clientId?: string;
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: "Izaberite ispravnu valutu." })
  currency?: string;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Unesite datum u obliku GGGG-MM-DD.",
  })
  from?: string;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Unesite datum u obliku GGGG-MM-DD.",
  })
  to?: string;
  @IsOptional()
  @IsIn(["BANK_TRANSFER", "CASH", "CARD", "OTHER"], {
    message: "Izabrana vrednost nije dozvoljena.",
  })
  paymentMethod?: PaymentMethod;
  @IsOptional()
  @IsIn(["REGULAR", "ADVANCE"], {
    message: "Izabrana vrednost nije dozvoljena.",
  })
  purpose?: PaymentPurpose;
  @IsOptional()
  @IsIn(["ACTIVE", "VOIDED"], { message: "Izabrana vrednost nije dozvoljena." })
  status?: "ACTIVE" | "VOIDED";
  @IsOptional()
  @IsIn(["UNALLOCATED", "PARTIAL", "FULL"], {
    message: "Izabrana vrednost nije dozvoljena.",
  })
  allocationState?: "UNALLOCATED" | "PARTIAL" | "FULL";
  @IsOptional()
  @IsUUID("all", { message: "Izabrani zapis nije ispravan." })
  bankAccountId?: string;
  @IsOptional()
  @IsIn(["receivedAt", "amount", "clientName", "unallocatedAmount"], {
    message: "Izabrana vrednost nije dozvoljena.",
  })
  sort?: PaymentQuery["sort"];
  @IsOptional()
  @IsIn(["asc", "desc"], { message: "Izabrana vrednost nije dozvoljena." })
  direction?: "asc" | "desc";
}
