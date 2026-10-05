import { Injectable } from "@nestjs/common";
import { SefValidationIssue, SefValidationResult } from "@law/api-interfaces";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { verifyInvoiceMoney } from "./invoice-monetary-calculator";
import { SefUblBuilder } from "./sef-ubl-builder";
import {
  PreparedSefInvoice,
  SEF_VALIDATION_VERSION,
  SefInvoiceSnapshot,
  SefPartySnapshot,
} from "./sef.types";

const SUPPORTED_EXEMPTIONS = new Set(["Z", "E", "R", "O", "OE"]);

@Injectable()
export class SefInvoiceValidator {
  constructor(private readonly builder: SefUblBuilder) {}

  validate(
    snapshot: SefInvoiceSnapshot,
    initialIssues: SefValidationIssue[] = [],
  ): PreparedSefInvoice {
    const issues: SefValidationIssue[] = [...initialIssues];
    const error = (
      code: string,
      fieldPath: string,
      messageKey = `finance.sef.validation.${code}`,
      params?: Record<string, string | number>,
    ) => issues.push({ code, severity: "ERROR", fieldPath, messageKey, params });

    if (!snapshot.supplier.name) error("ISSUER_NAME_REQUIRED", "supplier.name");
    if (!/^\d{9}$/.test(snapshot.supplier.taxId))
      error("ISSUER_TAX_ID_INVALID", "supplier.taxId");
    if (!/^\d{8}$/.test(snapshot.supplier.registrationNumber))
      error("ISSUER_REGISTRATION_INVALID", "supplier.registrationNumber");
    this.validateAddress(snapshot.supplier, "supplier", error);

    if (!snapshot.customer.isDomestic)
      error("UNSUPPORTED_FOREIGN_CUSTOMER", "customer.isDomestic");
    if (snapshot.customer.isPublicSector)
      error("UNSUPPORTED_PUBLIC_SECTOR", "customer.isPublicSector", undefined, {
        jbkjs: snapshot.customer.jbkjs,
      });
    if (!snapshot.customer.name) error("RECIPIENT_NAME_REQUIRED", "customer.name");
    if (!/^\d{9}$/.test(snapshot.customer.taxId))
      error("RECIPIENT_TAX_ID_INVALID", "customer.taxId");
    if (!/^\d{8}$/.test(snapshot.customer.registrationNumber))
      error("RECIPIENT_REGISTRATION_INVALID", "customer.registrationNumber");
    this.validateAddress(snapshot.customer, "customer", error);

    if (snapshot.invoice.currency !== "RSD")
      error("UNSUPPORTED_CURRENCY", "invoice.currency");
    if (!snapshot.lines.length) error("LINES_REQUIRED", "invoice.lines");
    if (!snapshot.payment.accountNumber)
      error("PAYMENT_ACCOUNT_REQUIRED", "payment.accountNumber");
    if (!snapshot.invoice.methodOfPayment.trim())
      error("PAYMENT_METHOD_REQUIRED", "invoice.methodOfPayment");
    if (snapshot.invoice.supplyDate > snapshot.invoice.issueDate)
      error("SUPPLY_DATE_AFTER_ISSUE", "invoice.supplyDate");
    if (snapshot.invoice.dueDate < snapshot.invoice.issueDate)
      error("DUE_DATE_BEFORE_ISSUE", "invoice.dueDate");
    if (Number(snapshot.invoice.grossAmount) <= 0)
      error("POSITIVE_TOTAL_REQUIRED", "invoice.grossAmount");

    let hasStandardVat = false;
    snapshot.lines.forEach((line, index) => {
      const path = `invoice.lines.${index}`;
      if (line.pricingRequired) error("PRICING_REQUIRED", `${path}.pricingRequired`);
      if (line.currency !== snapshot.invoice.currency)
        error("LINE_CURRENCY_MISMATCH", `${path}.currency`);
      if (Number(line.netAmount) <= 0)
        error("POSITIVE_LINE_AMOUNT_REQUIRED", `${path}.netAmount`);
      const category = line.taxCategoryCode;
      if (!category) {
        error("TAX_CATEGORY_REQUIRED", `${path}.taxCategoryCode`);
        return;
      }
      if (category === "S10" || category === "S20") {
        hasStandardVat = true;
        const requiredRate = category === "S10" ? "10" : "20";
        if (Number(line.vatRate) !== Number(requiredRate))
          error("STANDARD_TAX_RATE_MISMATCH", `${path}.vatRate`, undefined, {
            category,
            rate: requiredRate,
          });
        if (line.taxExemptionReasonCode || line.taxExemptionReasonText)
          error("STANDARD_TAX_EXEMPTION_NOT_ALLOWED", `${path}.taxExemptionReasonCode`);
      } else if (SUPPORTED_EXEMPTIONS.has(category)) {
        if (Number(line.vatRate) !== 0)
          error("EXEMPTION_RATE_MUST_BE_ZERO", `${path}.vatRate`);
        if (!line.taxExemptionReasonCode?.trim())
          error("EXEMPTION_CODE_REQUIRED", `${path}.taxExemptionReasonCode`);
        if (!line.taxExemptionReasonText?.trim())
          error("EXEMPTION_TEXT_REQUIRED", `${path}.taxExemptionReasonText`);
      } else {
        error("UNSUPPORTED_TAX_CATEGORY", `${path}.taxCategoryCode`, undefined, {
          category,
        });
      }
    });

    if (hasStandardVat) {
      if (!snapshot.supplier.vatRegistered)
        error("ISSUER_NOT_VAT_REGISTERED", "supplier.vatRegistered");
      if (!["3", "35", "432"].includes(snapshot.invoice.vatLiabilityTimingCode ?? ""))
        error("VAT_TIMING_CODE_REQUIRED", "invoice.vatLiabilityTimingCode");
    } else if (snapshot.invoice.vatLiabilityTimingCode) {
      error("VAT_TIMING_CODE_NOT_ALLOWED", "invoice.vatLiabilityTimingCode");
    }

    try {
      verifyInvoiceMoney(snapshot.invoice, snapshot.lines);
    } catch (caught) {
      error("INCONSISTENT_AMOUNTS", "invoice.amounts", undefined, {
        reason: caught instanceof Error ? caught.message : "invalid totals",
      });
    }

    let xml: string | null = null;
    if (!issues.some((issue) => issue.severity === "ERROR")) {
      xml = this.builder.build(snapshot);
      const schemaIssue = this.validateXsd(xml);
      if (schemaIssue) issues.push(schemaIssue);
    }

    const validation: SefValidationResult = {
      valid: !issues.some((issue) => issue.severity === "ERROR"),
      issues,
      validationVersion: SEF_VALIDATION_VERSION,
    };
    return { snapshot, xml: validation.valid ? xml : null, validation };
  }

  private validateAddress(
    party: SefPartySnapshot,
    prefix: string,
    error: (code: string, path: string) => void,
  ): void {
    if (!party.addressLine) error("ADDRESS_REQUIRED", `${prefix}.addressLine`);
    if (!party.city) error("CITY_REQUIRED", `${prefix}.city`);
    if (!party.postalCode) error("POSTAL_CODE_REQUIRED", `${prefix}.postalCode`);
    if (party.countryCode !== "RS")
      error("UNSUPPORTED_COUNTRY", `${prefix}.countryCode`);
  }

  private validateXsd(xml: string): SefValidationIssue | null {
    const relative = join("sef", "ubl-2.1", "xsd", "maindoc", "UBL-Invoice-2.1.xsd");
    const candidates = [
      join(__dirname, "assets", relative),
      join(process.cwd(), "src", "assets", relative),
      join(process.cwd(), "apps", "api", "src", "assets", relative),
      join(process.cwd(), "dist", "apps", "api", "assets", relative),
    ];
    const schema = candidates.find((candidate) => existsSync(candidate));
    if (!schema)
      return {
        code: "VALIDATOR_ASSETS_MISSING",
        severity: "ERROR",
        fieldPath: "sef.validator",
        messageKey: "finance.sef.validation.VALIDATOR_ASSETS_MISSING",
      };
    const result = spawnSync(
      process.env.SEF_XMLLINT_PATH?.trim() || "xmllint",
      ["--nonet", "--noout", "--schema", schema, "-"],
      { input: xml, encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024 },
    );
    if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT")
      return {
        code: "VALIDATOR_EXECUTABLE_MISSING",
        severity: "ERROR",
        fieldPath: "sef.validator",
        messageKey: "finance.sef.validation.VALIDATOR_EXECUTABLE_MISSING",
      };
    if (result.error || result.status !== 0)
      return {
        code: "UBL_XSD_INVALID",
        severity: "ERROR",
        fieldPath: "invoice.xml",
        messageKey: "finance.sef.validation.UBL_XSD_INVALID",
        params: { diagnostic: (result.stderr || result.error?.message || "XSD validation failed").slice(0, 500) },
      };
    return null;
  }
}
