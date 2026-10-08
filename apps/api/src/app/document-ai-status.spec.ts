import {
  contentAiStatus,
  documentAiStatus,
  isContentRetryable,
} from "@law/document-ingestion";

describe("document AI status mapping", () => {
  it("maps content pipeline states to the user-facing status", () => {
    expect(contentAiStatus(undefined)).toBe("QUEUED");
    expect(contentAiStatus(null)).toBe("QUEUED");
    expect(contentAiStatus({ status: "PENDING" })).toBe("QUEUED");
    expect(contentAiStatus({ status: "EXTRACTING" })).toBe("PROCESSING");
    expect(contentAiStatus({ status: "EMBEDDING" })).toBe("PROCESSING");
    expect(contentAiStatus({ status: "CLASSIFYING" })).toBe("PROCESSING");
    expect(contentAiStatus({ status: "READY" })).toBe("READY");
    expect(contentAiStatus({ status: "FAILED" })).toBe("FAILED");
    expect(contentAiStatus({ status: "UNSUPPORTED" })).toBe("UNSUPPORTED");
  });

  it("reports OFF for documents without AI access regardless of content", () => {
    expect(documentAiStatus(false, { status: "READY" })).toBe("OFF");
    expect(documentAiStatus(true, { status: "READY" })).toBe("READY");
    expect(documentAiStatus(true, null)).toBe("QUEUED");
  });
});

describe("isContentRetryable", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

  it("retries FAILED content", () => {
    expect(isContentRetryable({ status: "FAILED" }, now)).toBe(true);
  });

  it("retries PENDING content only after ten minutes", () => {
    expect(
      isContentRetryable({ status: "PENDING", updatedAt: ago(11) }, now),
    ).toBe(true);
    expect(
      isContentRetryable({ status: "PENDING", updatedAt: ago(9) }, now),
    ).toBe(false);
    expect(isContentRetryable({ status: "PENDING" }, now)).toBe(false);
  });

  it("retries READY content only when marked for retry", () => {
    expect(
      isContentRetryable({ status: "READY", failedStep: "FACTS" }, now),
    ).toBe(true);
    expect(isContentRetryable({ status: "READY", failedStep: null }, now)).toBe(
      false,
    );
  });

  it("never retries in-flight, unsupported or missing content", () => {
    for (const status of [
      "EXTRACTING",
      "EMBEDDING",
      "CLASSIFYING",
      "UNSUPPORTED",
    ]) {
      expect(isContentRetryable({ status, updatedAt: ago(120) }, now)).toBe(
        false,
      );
    }
    expect(isContentRetryable(null, now)).toBe(false);
    expect(isContentRetryable(undefined, now)).toBe(false);
  });
});
