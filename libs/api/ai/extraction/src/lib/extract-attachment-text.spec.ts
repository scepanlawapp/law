import { extractAttachmentText } from "./extract-attachment-text";

jest.mock("./pdf-extractor", () => ({
  extractPdfText: jest.fn(),
}));
jest.mock("./docx-extractor", () => ({
  extractDocxText: jest.fn(),
}));
jest.mock("./spreadsheet-extractor", () => ({
  extractSpreadsheetText: jest.fn(),
}));
jest.mock("./ocr-extractor", () => ({
  extractImageText: jest.fn(),
}));

import { extractPdfText } from "./pdf-extractor";
import { extractDocxText } from "./docx-extractor";
import { extractSpreadsheetText } from "./spreadsheet-extractor";
import { extractImageText } from "./ocr-extractor";

describe("extractAttachmentText", () => {
  afterEach(() => jest.clearAllMocks());

  it("decodes plain text as UTF-8", async () => {
    const result = await extractAttachmentText({
      mimeType: "text/plain",
      buffer: Buffer.from("hello world", "utf-8"),
    });
    expect(result).toEqual({ status: "COMPLETED", text: "hello world" });
  });

  it("delegates PDF extraction to the pdf-parse wrapper", async () => {
    (extractPdfText as jest.Mock).mockResolvedValue("pdf text");
    const result = await extractAttachmentText({
      mimeType: "application/pdf",
      buffer: Buffer.from(""),
    });
    expect(result).toEqual({ status: "COMPLETED", text: "pdf text" });
  });

  it("delegates DOCX extraction to mammoth", async () => {
    (extractDocxText as jest.Mock).mockResolvedValue("docx text");
    const result = await extractAttachmentText({
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from(""),
    });
    expect(result).toEqual({ status: "COMPLETED", text: "docx text" });
  });

  it("delegates XLS/XLSX extraction to the spreadsheet extractor", async () => {
    (extractSpreadsheetText as jest.Mock).mockReturnValue("sheet text");
    const xls = await extractAttachmentText({
      mimeType: "application/vnd.ms-excel",
      buffer: Buffer.from(""),
    });
    const xlsx = await extractAttachmentText({
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(""),
    });
    expect(xls).toEqual({ status: "COMPLETED", text: "sheet text" });
    expect(xlsx).toEqual({ status: "COMPLETED", text: "sheet text" });
  });

  it("delegates image extraction to OCR", async () => {
    (extractImageText as jest.Mock).mockResolvedValue("ocr text");
    const result = await extractAttachmentText({
      mimeType: "image/png",
      buffer: Buffer.from(""),
    });
    expect(result).toEqual({ status: "COMPLETED", text: "ocr text" });
  });

  it("returns UNSUPPORTED for an unregistered MIME type", async () => {
    const result = await extractAttachmentText({
      mimeType: "application/zip",
      buffer: Buffer.from(""),
    });
    expect(result.status).toBe("UNSUPPORTED");
  });

  it("returns FAILED when an extractor throws", async () => {
    (extractPdfText as jest.Mock).mockRejectedValue(new Error("corrupt PDF"));
    const result = await extractAttachmentText({
      mimeType: "application/pdf",
      buffer: Buffer.from(""),
    });
    expect(result).toEqual({ status: "FAILED", error: "corrupt PDF" });
  });
});
