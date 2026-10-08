import { contentAiStatus, documentAiStatus } from "@law/document-ingestion";

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
