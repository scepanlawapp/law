import { Injectable } from "@nestjs/common";
import { SefApiError, SefUploadIdentifiers } from "./sef.types";

const DEMO_BASE_URL = "https://efakturadev.mfin.gov.rs";
const IDENTIFIER_KEYS = ["InvoiceId", "SalesInvoiceId", "PurchaseInvoiceId"];

function parsePrecisionSafeJson(raw: string): Record<string, unknown> {
  let protectedJson = raw;
  for (const key of IDENTIFIER_KEYS) {
    protectedJson = protectedJson.replace(
      new RegExp(`("${key}"\\s*:\\s*)(-?\\d+)`, "gi"),
      '$1"$2"',
    );
  }
  const parsed = JSON.parse(protectedJson) as Record<string, unknown>;
  return JSON.parse(JSON.stringify(parsed, (key, value) =>
    /apikey|ciphertext|authtag|\biv\b/i.test(key) ? undefined : value,
  )) as Record<string, unknown>;
}

function value(record: Record<string, unknown>, key: string): string | null {
  const entry = Object.entries(record).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1];
  return typeof entry === "string" || typeof entry === "number" ? String(entry) : null;
}

@Injectable()
export class SefApiClient {
  async upload(input: {
    apiKey: string;
    requestId: string;
    invoiceNumber: string;
    xml: string;
  }): Promise<SefUploadIdentifiers> {
    const url = new URL("/api/publicApi/sales-invoice/ubl/upload", DEMO_BASE_URL);
    url.searchParams.set("requestId", input.requestId);
    url.searchParams.set("executeValidation", "true");
    url.searchParams.set("sendToCir", "No");
    const form = new FormData();
    form.append(
      "ublFile",
      new Blob([input.xml], { type: "application/xml" }),
      `${input.invoiceNumber.replace(/[^a-zA-Z0-9._-]+/g, "_") || "invoice"}.xml`,
    );
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { ApiKey: input.apiKey, Accept: "application/json, text/plain" },
        body: form,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (caught) {
      throw new SefApiError(
        "SEF_UPLOAD_OUTCOME_UNKNOWN",
        caught instanceof Error ? caught.message : "SEF upload connection failed",
        null,
        "UNKNOWN",
      );
    }
    const raw = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = raw ? parsePrecisionSafeJson(raw) : {};
    } catch {
      throw new SefApiError(
        "SEF_UPLOAD_RESPONSE_UNREADABLE",
        "SEF returned an unreadable upload response",
        response.status,
        "UNKNOWN",
      );
    }
    if (!response.ok) {
      const knownFailure = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
      throw new SefApiError(
        value(body, "ErrorCode") ?? "SEF_UPLOAD_REJECTED",
        value(body, "Message") ?? `SEF upload failed with HTTP ${response.status}`,
        response.status,
        knownFailure ? "FAILED" : "UNKNOWN",
        body,
      );
    }
    const invoiceId = value(body, "InvoiceId");
    const salesInvoiceId = value(body, "SalesInvoiceId");
    const purchaseInvoiceId = value(body, "PurchaseInvoiceId");
    if (!invoiceId || !salesInvoiceId || !purchaseInvoiceId)
      throw new SefApiError(
        "SEF_UPLOAD_IDENTIFIERS_MISSING",
        "SEF returned success without all documented identifiers",
        response.status,
        "UNKNOWN",
        body,
      );
    return { invoiceId, salesInvoiceId, purchaseInvoiceId, sanitizedResponse: body };
  }

  async status(apiKey: string, salesInvoiceId: string): Promise<{ status: string; response: Record<string, unknown> }> {
    const url = new URL("/api/publicApi/sales-invoice", DEMO_BASE_URL);
    url.searchParams.set("invoiceId", salesInvoiceId);
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(url, {
          headers: { ApiKey: apiKey, Accept: "application/json, text/plain" },
          signal: AbortSignal.timeout(15_000),
        });
        const raw = await response.text();
        const body = raw ? parsePrecisionSafeJson(raw) : {};
        if (!response.ok)
          throw new SefApiError(
            value(body, "ErrorCode") ?? "SEF_STATUS_FAILED",
            value(body, "Message") ?? `SEF status failed with HTTP ${response.status}`,
            response.status,
            "FAILED",
            body,
          );
        const status = value(body, "Status");
        if (!status) throw new Error("SEF status response omitted Status");
        return { status, response: body };
      } catch (caught) {
        lastError = caught;
      }
    }
    if (lastError instanceof SefApiError) throw lastError;
    throw new SefApiError(
      "SEF_STATUS_UNAVAILABLE",
      lastError instanceof Error ? lastError.message : "SEF status is unavailable",
      null,
      "FAILED",
    );
  }
}

export const sefApiInternals = { parsePrecisionSafeJson, DEMO_BASE_URL };
