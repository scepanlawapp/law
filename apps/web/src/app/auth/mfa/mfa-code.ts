import { HttpErrorResponse } from "@angular/common/http";

/** Removes every whitespace character from a typed or pasted code. */
export function stripSpaces(value: string): string {
  return value.replace(/\s+/g, "");
}

/** Six digits: authenticator and e-mail codes. */
export function isSixDigitCode(value: string): boolean {
  return /^\d{6}$/.test(stripSpaces(value));
}

/** `xxxx-xxxx`, with or without the dash. */
export function isRecoveryCode(value: string): boolean {
  return /^[a-z0-9]{4}-?[a-z0-9]{4}$/i.test(stripSpaces(value));
}

/**
 * Machine-readable code of an MFA 401. Nest places the exception description
 * in `error`; `code` is accepted too in case a filter ever maps it.
 */
export function mfaErrorCode(error: HttpErrorResponse): string | undefined {
  const body: unknown = error.error;
  if (typeof body !== "object" || body === null) return undefined;
  const { code, error: description } = body as {
    code?: unknown;
    error?: unknown;
  };
  if (typeof code === "string") return code;
  return typeof description === "string" ? description : undefined;
}

/** Applies a pasted code, dropping spaces before the field's maxlength cuts it. */
export function pastedCode(event: ClipboardEvent, maxLength: number): string {
  return stripSpaces(event.clipboardData?.getData("text") ?? "").slice(
    0,
    maxLength,
  );
}

export const RECOVERY_CODES_FILE_NAME = "law-recovery-codes.txt";

/** Plain-text body of the downloadable recovery-codes file. */
export function recoveryCodesFileText(
  codes: readonly string[],
  header: string,
  now: Date = new Date(),
): string {
  return [header, now.toISOString().slice(0, 10), "", ...codes, ""].join("\n");
}

/** Hands `text` to the browser as a downloaded file. */
export function downloadTextFile(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Copies `text` to the clipboard; resolves `false` when the browser refuses. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
