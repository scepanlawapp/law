import { Readable } from "node:stream";
import { DocumentTextService } from "@law/workspace-documents";
import { extractAttachmentText } from "@law/extraction";

jest.mock("@law/extraction", () => ({
  extractAttachmentText: jest.fn(),
}));

const extract = extractAttachmentText as jest.MockedFunction<
  typeof extractAttachmentText
>;

function setup(version: Record<string, unknown> | null) {
  const prisma = {
    documentVersion: {
      findFirst: jest.fn(async () => version),
      update: jest.fn(async () => ({})),
    },
  };
  const files = {
    openDownload: jest.fn(async () => ({
      stream: Readable.from([Buffer.from("%PDF-1.7")]),
      mimeType: "application/pdf",
      sizeBytes: 8,
    })),
  };
  return {
    prisma,
    files,
    service: new DocumentTextService(prisma as never, files as never),
  };
}

describe("DocumentTextService", () => {
  beforeEach(() => extract.mockReset());

  it("reuses stored text without touching the file", async () => {
    const { service, files, prisma } = setup({
      id: "version-1",
      storedFileId: "file-1",
      extractionStatus: "COMPLETED",
      extractedText: "Tekst",
    });

    expect(await service.ensureText("workspace-1", "version-1")).toEqual({
      status: "COMPLETED",
      text: "Tekst",
    });
    expect(prisma.documentVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "version-1", workspaceId: "workspace-1" },
      }),
    );
    expect(files.openDownload).not.toHaveBeenCalled();
  });

  it("extracts pending text once and stores it", async () => {
    const { service, files, prisma } = setup({
      id: "version-1",
      storedFileId: "file-1",
      extractionStatus: "PENDING",
      extractedText: null,
    });
    extract.mockResolvedValue({
      status: "COMPLETED",
      text: "Ugovor",
      sourceScript: "CYRILLIC",
    });

    const result = await service.ensureText("workspace-1", "version-1");

    expect(files.openDownload).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      storedFileId: "file-1",
    });
    expect(extract).toHaveBeenCalledWith({
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7"),
    });
    expect(prisma.documentVersion.update).toHaveBeenCalledWith({
      where: { id: "version-1" },
      data: expect.objectContaining({
        extractionStatus: "COMPLETED",
        extractedText: "Ugovor",
        sourceScript: "CYRILLIC",
      }),
    });
    expect(result).toEqual({ status: "COMPLETED", text: "Ugovor" });
  });

  it("records a failure when the file cannot be read", async () => {
    const { service, files, prisma } = setup({
      id: "version-1",
      storedFileId: "file-1",
      extractionStatus: "FAILED",
      extractedText: null,
    });
    files.openDownload.mockRejectedValue(
      new Error("File content is unavailable"),
    );

    expect(await service.ensureText("workspace-1", "version-1")).toEqual({
      status: "FAILED",
      text: null,
    });
    expect(prisma.documentVersion.update).toHaveBeenCalledWith({
      where: { id: "version-1" },
      data: expect.objectContaining({ extractionStatus: "FAILED" }),
    });
  });

  it("returns UNAVAILABLE for versions outside the workspace", async () => {
    const { service } = setup(null);
    expect(await service.ensureText("workspace-1", "version-x")).toEqual({
      status: "UNAVAILABLE",
      text: null,
    });
  });
});
