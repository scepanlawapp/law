import { detectMimeType, isAllowedDocumentMime } from "@law/file-storage";

describe("document MIME detection", () => {
  it("detects PDF and plain text", () => {
    expect(detectMimeType(Buffer.from("%PDF-1.7"))).toBe("application/pdf");
    expect(detectMimeType(Buffer.from("Pozdrav"))).toBe("text/plain");
    expect(isAllowedDocumentMime("application/pdf")).toBe(true);
    expect(isAllowedDocumentMime("application/zip")).toBe(false);
  });
});
