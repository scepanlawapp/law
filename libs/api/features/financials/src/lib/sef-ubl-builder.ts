import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { formatMoney } from "./invoice-monetary-calculator";
import { SefInvoiceSnapshot, SefPartySnapshot } from "./sef.types";

const text = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const element = (name: string, value: string, attrs = "") =>
  `<${name}${attrs}>${text(value)}</${name}>`;

const ublCategory = (code: string) =>
  code === "S10" || code === "S20"
    ? "S"
    : code === "AE10" || code === "AE20"
      ? "AE"
      : code;

@Injectable()
export class SefUblBuilder {
  build(snapshot: SefInvoiceSnapshot): string {
    const currency = snapshot.invoice.currency;
    const taxGroups = new Map<
      string,
      {
        code: string;
        rate: string;
        reasonCode: string | null;
        reasonText: string | null;
        taxable: Prisma.Decimal;
        tax: Prisma.Decimal;
      }
    >();
    for (const line of snapshot.lines) {
      const code = line.taxCategoryCode ?? "";
      const key = [code, line.vatRate, line.taxExemptionReasonCode ?? "", line.taxExemptionReasonText ?? ""].join("|");
      const current = taxGroups.get(key) ?? {
        code,
        rate: line.vatRate,
        reasonCode: line.taxExemptionReasonCode,
        reasonText: line.taxExemptionReasonText,
        taxable: new Prisma.Decimal(0),
        tax: new Prisma.Decimal(0),
      };
      current.taxable = current.taxable.add(line.netAmount);
      current.tax = current.tax.add(line.vatAmount);
      taxGroups.set(key, current);
    }

    const party = (tag: string, partySnapshot: SefPartySnapshot) =>
      `<${tag}><cac:Party>` +
      element("cbc:EndpointID", partySnapshot.taxId, ' schemeID="9948"') +
      `<cac:PartyName>${element("cbc:Name", partySnapshot.name)}</cac:PartyName>` +
      `<cac:PostalAddress>${element("cbc:StreetName", partySnapshot.addressLine)}${element("cbc:CityName", partySnapshot.city)}${element("cbc:PostalZone", partySnapshot.postalCode)}<cac:Country>${element("cbc:IdentificationCode", partySnapshot.countryCode)}</cac:Country></cac:PostalAddress>` +
      `<cac:PartyTaxScheme>${element("cbc:CompanyID", `RS${partySnapshot.taxId}`)}<cac:TaxScheme>${element("cbc:ID", "VAT")}</cac:TaxScheme></cac:PartyTaxScheme>` +
      `<cac:PartyLegalEntity>${element("cbc:RegistrationName", partySnapshot.name)}${element("cbc:CompanyID", partySnapshot.registrationNumber)}</cac:PartyLegalEntity>` +
      (partySnapshot.email
        ? `<cac:Contact>${element("cbc:ElectronicMail", partySnapshot.email)}</cac:Contact>`
        : "") +
      `</cac:Party></${tag}>`;

    const category = (group: {
      code: string;
      rate: string;
      reasonCode: string | null;
      reasonText: string | null;
    }) =>
      `<cac:TaxCategory>${element("cbc:ID", ublCategory(group.code))}` +
      element("cbc:Percent", group.rate) +
      (group.reasonCode
        ? element("cbc:TaxExemptionReasonCode", group.reasonCode)
        : "") +
      (group.reasonText
        ? element("cbc:TaxExemptionReason", group.reasonText)
        : "") +
      `<cac:TaxScheme>${element("cbc:ID", "VAT")}</cac:TaxScheme></cac:TaxCategory>`;

    const taxSubtotals = [...taxGroups.values()]
      .map(
        (group) =>
          `<cac:TaxSubtotal>` +
          element("cbc:TaxableAmount", formatMoney(group.taxable), ` currencyID="${currency}"`) +
          element("cbc:TaxAmount", formatMoney(group.tax), ` currencyID="${currency}"`) +
          category(group) +
          `</cac:TaxSubtotal>`,
      )
      .join("");

    const lines = snapshot.lines
      .map(
        (line, index) =>
          `<cac:InvoiceLine>${element("cbc:ID", String(index + 1))}` +
          element("cbc:InvoicedQuantity", "1", ' unitCode="H87"') +
          element("cbc:LineExtensionAmount", line.netAmount, ` currencyID="${currency}"`) +
          `<cac:Item>${element("cbc:Name", line.description)}<cac:ClassifiedTaxCategory>` +
          element("cbc:ID", ublCategory(line.taxCategoryCode ?? "")) +
          element("cbc:Percent", line.vatRate) +
          `<cac:TaxScheme>${element("cbc:ID", "VAT")}</cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>` +
          `<cac:Price>${element("cbc:PriceAmount", line.netAmount, ` currencyID="${currency}"`)}</cac:Price></cac:InvoiceLine>`,
      )
      .join("");

    const paymentReference = [snapshot.payment.model, snapshot.payment.reference]
      .filter(Boolean)
      .join(" ");

    return (
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">` +
      element("cbc:CustomizationID", "urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2022") +
      element("cbc:ID", snapshot.invoice.invoiceNumber) +
      element("cbc:IssueDate", snapshot.invoice.issueDate) +
      element("cbc:DueDate", snapshot.invoice.dueDate) +
      element("cbc:InvoiceTypeCode", "380") +
      (snapshot.invoice.comment ? element("cbc:Note", snapshot.invoice.comment) : "") +
      element("cbc:DocumentCurrencyCode", currency) +
      (snapshot.invoice.vatLiabilityTimingCode
        ? `<cac:InvoicePeriod>${element("cbc:DescriptionCode", snapshot.invoice.vatLiabilityTimingCode)}</cac:InvoicePeriod>`
        : "") +
      party("cac:AccountingSupplierParty", snapshot.supplier) +
      party("cac:AccountingCustomerParty", snapshot.customer) +
      `<cac:Delivery>${element("cbc:ActualDeliveryDate", snapshot.invoice.supplyDate)}</cac:Delivery>` +
      `<cac:PaymentMeans>${element("cbc:PaymentMeansCode", "30")}` +
      (paymentReference ? element("cbc:PaymentID", paymentReference) : "") +
      `<cac:PayeeFinancialAccount>${element("cbc:ID", snapshot.payment.accountNumber)}</cac:PayeeFinancialAccount></cac:PaymentMeans>` +
      `<cac:TaxTotal>${element("cbc:TaxAmount", snapshot.invoice.vatAmount, ` currencyID="${currency}"`)}${taxSubtotals}</cac:TaxTotal>` +
      `<cac:LegalMonetaryTotal>` +
      element("cbc:LineExtensionAmount", snapshot.invoice.netAmount, ` currencyID="${currency}"`) +
      element("cbc:TaxExclusiveAmount", snapshot.invoice.netAmount, ` currencyID="${currency}"`) +
      element("cbc:TaxInclusiveAmount", snapshot.invoice.grossAmount, ` currencyID="${currency}"`) +
      element("cbc:PayableAmount", snapshot.invoice.grossAmount, ` currencyID="${currency}"`) +
      `</cac:LegalMonetaryTotal>${lines}</Invoice>`
    );
  }
}
