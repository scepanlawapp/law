import { Injectable } from "@angular/core";
import { Invoice, OrganizationSettings } from "@law/api-interfaces";

export interface InvoicePaymentTemplateValues {
  invoiceNumber: string;
  customerName: string;
  amount: string;
  currency: string;
  dueDate: string;
}

@Injectable({ providedIn: "root" })
export class InvoicePaymentQrService {
  generate(
    invoice: Invoice,
    settings: OrganizationSettings | null | undefined,
  ): string | null {
    const qr = settings?.paymentQr;
    if (!settings || !qr?.enabled || qr.paymentStandard !== "NBS_IPS")
      return null;
    if (invoice.currency !== "RSD") return null;

    const account = settings.bankAccounts.find(
      (candidate) => candidate.id === qr.paymentAccountId && candidate.active,
    );
    const accountNumber = normalizeSerbianPaymentAccount(
      account?.accountNumber ?? null,
    );
    if (!account || account.currencyCode !== "RSD" || !accountNumber)
      return null;

    const amount = Number(invoice.grossAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999_999_999_999.99)
      return null;

    const recipient = cleanField(
      [
        settings.company.legalName || settings.company.displayName,
        settings.company.addressLine1,
        [settings.company.postalCode, settings.company.city]
          .filter(Boolean)
          .join(" "),
      ]
        .filter(Boolean)
        .join("\n"),
    );
    if (!recipient || recipient.length > 70) return null;

    const templateValues: InvoicePaymentTemplateValues = {
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.client.displayName,
      amount: amount.toFixed(2),
      currency: invoice.currency,
      dueDate: invoice.dateOfMaturity.slice(0, 10),
    };
    const purpose = cleanField(
      interpolateInvoicePaymentTemplate(
        qr.paymentPurposeTemplate,
        templateValues,
      ),
    );
    if (!purpose || purpose.length > 35) return null;

    const fields = [
      "K:PR",
      "V:01",
      "C:1",
      `R:${accountNumber}`,
      `N:${recipient}`,
      `I:RSD${amount.toFixed(2).replace(".", ",")}`,
      "SF:221",
      `S:${purpose}`,
    ];

    const reference = paymentReference(
      qr.referenceModel,
      qr.referenceTemplate,
      templateValues,
    );
    if (reference === false) return null;
    if (reference) fields.push(`RO:${reference}`);
    return fields.join("|");
  }
}

export function interpolateInvoicePaymentTemplate(
  template: string,
  values: InvoicePaymentTemplateValues,
): string {
  return template.replace(
    /\{\{(invoiceNumber|customerName|amount|currency|dueDate)\}\}/g,
    (_match, key: keyof InvoicePaymentTemplateValues) => values[key],
  );
}

export function normalizeSerbianPaymentAccount(
  value: string | null,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{18}$/.test(trimmed)) return trimmed;
  const formatted = /^(\d{3})-(\d{1,13})-(\d{2})$/.exec(trimmed);
  if (!formatted) return null;
  return `${formatted[1]}${formatted[2].padStart(13, "0")}${formatted[3]}`;
}

function paymentReference(
  model: string | null,
  template: string | null,
  values: InvoicePaymentTemplateValues,
): string | null | false {
  if (!model && !template) return null;
  if (!model || !template) return false;

  const value = cleanField(interpolateInvoicePaymentTemplate(template, values))
    .replace(/\s+/g, "")
    .replace(/-/g, "");
  if (!value) return false;
  if (model === "00") return /^\d{1,23}$/.test(value) ? `00${value}` : false;
  if (model !== "97" || !/^\d{1,21}$/.test(value)) return false;

  const control = String(98n - (BigInt(`${value}00`) % 97n)).padStart(2, "0");
  return `97${control}${value}`;
}

function cleanField(value: string): string {
  return value
    .replace(/\|/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}
