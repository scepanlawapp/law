import { Readable } from "node:stream";
import {
  ContentBytesReader,
  DocumentContentService,
  DocumentIngestionQueue,
} from "@law/document-ingestion";
import { extractAttachmentText } from "@law/extraction";

jest.mock("@law/extraction", () => ({
  extractAttachmentText: jest.fn(),
}));

const extract = extractAttachmentText as jest.MockedFunction<
  typeof extractAttachmentText
>;

type Row = Record<string, unknown>;

function setup(options: { row?: Row | null; bytes?: unknown } = {}) {
  const prisma = {
    documentContent: {
      upsert: jest.fn(async () => ({
        id: "content-1",
        status: "PENDING",
        pipelineVersion: 0,
      })),
      findFirst: jest.fn(async () => options.row ?? null),
      update: jest.fn(async () => ({})),
    },
  };
  const queue = { enqueue: jest.fn(async () => undefined) };
  const reader = {
    read: jest.fn(async () =>
      options.bytes === undefined
        ? { buffer: Buffer.from("x"), mimeType: "application/pdf" }
        : options.bytes,
    ),
  };
  return {
    prisma,
    queue,
    reader,
    service: new DocumentContentService(
      prisma as never,
      queue as never,
      reader as never,
    ),
  };
}

describe("DocumentContentService", () => {
  beforeEach(() => extract.mockReset());

  describe("findOrCreate", () => {
    it("upserts on the workspace and hash key without updating", async () => {
      const { service, prisma } = setup();
      const result = await service.findOrCreate({
        workspaceId: "ws-1",
        sha256: "abc",
        mimeType: "application/pdf",
        sizeBytes: 10,
      });

      expect(prisma.documentContent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId_sha256: { workspaceId: "ws-1", sha256: "abc" } },
          update: {},
          create: {
            workspaceId: "ws-1",
            sha256: "abc",
            mimeType: "application/pdf",
            sizeBytes: 10,
          },
        }),
      );
      expect(result).toEqual({
        id: "content-1",
        status: "PENDING",
        pipelineVersion: 0,
      });
    });

    it("resolves concurrent calls for the same hash to the same id", async () => {
      const { service } = setup();
      const input = {
        workspaceId: "ws-1",
        sha256: "abc",
        mimeType: "application/pdf",
        sizeBytes: 10,
      };
      const [a, b] = await Promise.all([
        service.findOrCreate(input),
        service.findOrCreate(input),
      ]);
      expect(a.id).toBe(b.id);
    });
  });

  describe("requestIngestion", () => {
    it("enqueues once per call for the same content", async () => {
      const { service, queue } = setup({
        row: { status: "PENDING", pipelineVersion: 0 },
      });
      await Promise.all([
        service.requestIngestion("ws-1", "content-1"),
        service.requestIngestion("ws-1", "content-1"),
      ]);
      expect(queue.enqueue).toHaveBeenCalledTimes(2);
      expect(queue.enqueue).toHaveBeenNthCalledWith(1, "ws-1", "content-1");
      expect(queue.enqueue).toHaveBeenNthCalledWith(2, "ws-1", "content-1");
    });

    it("skips READY content on the current pipeline version", async () => {
      const { service, queue, prisma } = setup({
        row: { status: "READY", pipelineVersion: 1 },
      });
      await service.requestIngestion("ws-1", "content-1");
      expect(queue.enqueue).not.toHaveBeenCalled();
      expect(prisma.documentContent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "content-1", workspaceId: "ws-1" },
        }),
      );
    });

    it("re-enqueues READY content from an older pipeline version", async () => {
      const { service, queue } = setup({
        row: { status: "READY", pipelineVersion: 0 },
      });
      await service.requestIngestion("ws-1", "content-1");
      expect(queue.enqueue).toHaveBeenCalledWith("ws-1", "content-1");
    });

    it("does nothing when the content row does not exist", async () => {
      const { service, queue } = setup({ row: null });
      await service.requestIngestion("ws-1", "missing");
      expect(queue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe("ensureText", () => {
    it("returns stored text without reading bytes", async () => {
      const { service, reader } = setup({
        row: { id: "content-1", status: "READY", extractedText: "Tekst" },
      });
      expect(await service.ensureText("ws-1", "content-1")).toEqual({
        status: "COMPLETED",
        text: "Tekst",
      });
      expect(reader.read).not.toHaveBeenCalled();
    });

    it("returns UNSUPPORTED without reading bytes", async () => {
      const { service, reader } = setup({
        row: { id: "content-1", status: "UNSUPPORTED", extractedText: null },
      });
      expect(await service.ensureText("ws-1", "content-1")).toEqual({
        status: "UNSUPPORTED",
        text: null,
      });
      expect(reader.read).not.toHaveBeenCalled();
    });

    it("returns UNAVAILABLE for a missing row", async () => {
      const { service, prisma } = setup({ row: null });
      expect(await service.ensureText("ws-1", "nope")).toEqual({
        status: "UNAVAILABLE",
        text: null,
      });
      expect(prisma.documentContent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "nope", workspaceId: "ws-1" },
        }),
      );
    });

    it("returns UNAVAILABLE when the bytes cannot be found", async () => {
      const { service, prisma } = setup({
        row: { id: "content-1", status: "PENDING", extractedText: null },
        bytes: null,
      });
      expect(await service.ensureText("ws-1", "content-1")).toEqual({
        status: "UNAVAILABLE",
        text: null,
      });
      expect(prisma.documentContent.update).not.toHaveBeenCalled();
    });

    it("extracts from bytes and stores text and script, keeping status", async () => {
      extract.mockResolvedValue({
        status: "COMPLETED",
        text: "Izvucen tekst",
        sourceScript: "LATIN",
      });
      const { service, prisma, reader } = setup({
        row: { id: "content-1", status: "PENDING", extractedText: null },
      });

      expect(await service.ensureText("ws-1", "content-1")).toEqual({
        status: "COMPLETED",
        text: "Izvucen tekst",
      });
      expect(reader.read).toHaveBeenCalledWith("ws-1", "content-1");
      expect(extract).toHaveBeenCalledWith({
        mimeType: "application/pdf",
        buffer: Buffer.from("x"),
      });
      expect(prisma.documentContent.update).toHaveBeenCalledWith({
        where: { id: "content-1" },
        data: { extractedText: "Izvucen tekst", sourceScript: "LATIN" },
      });
    });

    it("marks content UNSUPPORTED when no extractor exists", async () => {
      extract.mockResolvedValue({ status: "UNSUPPORTED", error: "no" });
      const { service, prisma } = setup({
        row: { id: "content-1", status: "PENDING", extractedText: null },
      });

      expect(await service.ensureText("ws-1", "content-1")).toEqual({
        status: "UNSUPPORTED",
        text: null,
      });
      expect(prisma.documentContent.update).toHaveBeenCalledWith({
        where: { id: "content-1" },
        data: { status: "UNSUPPORTED", error: "no" },
      });
    });

    it("stores the error on FAILED without changing status", async () => {
      extract.mockResolvedValue({ status: "FAILED", error: "boom" });
      const { service, prisma } = setup({
        row: { id: "content-1", status: "PENDING", extractedText: null },
      });

      expect(await service.ensureText("ws-1", "content-1")).toEqual({
        status: "FAILED",
        text: null,
      });
      expect(prisma.documentContent.update).toHaveBeenCalledWith({
        where: { id: "content-1" },
        data: { error: "boom" },
      });
    });
  });
});

describe("DocumentIngestionQueue", () => {
  it("adds a deduplicated ingest job with retry options", async () => {
    const add = jest.fn(async () => undefined);
    await new DocumentIngestionQueue({ add } as never).enqueue("ws-1", "c-1");
    expect(add).toHaveBeenCalledWith(
      "ingest",
      { workspaceId: "ws-1", contentId: "c-1" },
      {
        jobId: "content:c-1",
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  });
});

describe("ContentBytesReader", () => {
  function reader(options: {
    version?: Record<string, unknown> | null;
    attachment?: Record<string, unknown> | null;
  }) {
    const prisma = {
      documentVersion: {
        findFirst: jest.fn(async () => options.version ?? null),
      },
      chatAttachment: {
        findFirst: jest.fn(async () => options.attachment ?? null),
      },
    };
    const files = {
      openDownload: jest.fn(async () => ({
        stream: Readable.from([Buffer.from("ab"), Buffer.from("cd")]),
        mimeType: "application/pdf",
        sizeBytes: 4,
      })),
    };
    const chatStorage = { read: jest.fn(async () => Buffer.from("chat")) };
    return {
      prisma,
      files,
      chatStorage,
      reader: new ContentBytesReader(
        prisma as never,
        files as never,
        chatStorage as never,
      ),
    };
  }

  it("reads a document version through FileService", async () => {
    const {
      reader: r,
      prisma,
      files,
    } = reader({
      version: { storedFileId: "file-1" },
    });
    const result = await r.read("ws-1", "c-1");
    expect(result).toEqual({
      buffer: Buffer.from("abcd"),
      mimeType: "application/pdf",
    });
    expect(prisma.documentVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contentId: "c-1", workspaceId: "ws-1" },
      }),
    );
    expect(files.openDownload).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      storedFileId: "file-1",
    });
  });

  it("falls back to a chat attachment with its own mime type", async () => {
    const {
      reader: r,
      prisma,
      chatStorage,
    } = reader({
      attachment: {
        sessionId: "s-1",
        storedName: "att-1",
        mimeType: "text/plain",
      },
    });
    expect(await r.read("ws-1", "c-1")).toEqual({
      buffer: Buffer.from("chat"),
      mimeType: "text/plain",
    });
    expect(prisma.chatAttachment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contentId: "c-1", workspaceId: "ws-1" },
      }),
    );
    expect(chatStorage.read).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      sessionId: "s-1",
      storedName: "att-1",
    });
  });

  it("returns null when nothing references the content", async () => {
    expect(await reader({}).reader.read("ws-1", "c-1")).toBeNull();
  });
});
