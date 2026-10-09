import { Readable } from "node:stream";
import { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  ContentBytesReader,
  DocumentContentService,
  DocumentIngestionQueue,
  documentIngestJobId,
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
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: jest.fn(async () => ({
        id: "content-1",
        status: "READY",
        pipelineVersion: 1,
      })),
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
      { model: "model-a" } as never,
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

    it("returns the existing row when a concurrent upload wins the race", async () => {
      const { service, prisma } = setup();
      prisma.documentContent.upsert.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "test",
        }),
      );
      const result = await service.findOrCreate({
        workspaceId: "ws-1",
        sha256: "abc",
        mimeType: "application/pdf",
        sizeBytes: 10,
      });
      expect(prisma.documentContent.findUniqueOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId_sha256: { workspaceId: "ws-1", sha256: "abc" } },
        }),
      );
      expect(result).toEqual({
        id: "content-1",
        status: "READY",
        pipelineVersion: 1,
      });
    });

    it("rethrows other upsert errors", async () => {
      const { service, prisma } = setup();
      prisma.documentContent.upsert.mockRejectedValueOnce(new Error("down"));
      await expect(
        service.findOrCreate({
          workspaceId: "ws-1",
          sha256: "abc",
          mimeType: "application/pdf",
          sizeBytes: 10,
        }),
      ).rejects.toThrow("down");
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
        row: {
          status: "READY",
          pipelineVersion: 1,
          embeddingModel: "model-a",
        },
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

    it("re-enqueues READY content embedded by another model", async () => {
      const { service, queue } = setup({
        row: {
          status: "READY",
          pipelineVersion: 1,
          embeddingModel: "model-old",
        },
      });
      await service.requestIngestion("ws-1", "content-1");
      expect(queue.enqueue).toHaveBeenCalledWith("ws-1", "content-1");
    });

    it("does nothing when the content row does not exist", async () => {
      const { service, queue } = setup({ row: null });
      await service.requestIngestion("ws-1", "missing");
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it("never enqueues UNSUPPORTED content", async () => {
      const { service, queue } = setup({
        row: { status: "UNSUPPORTED", pipelineVersion: 0 },
      });
      await service.requestIngestion("ws-1", "content-1");
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it("re-enqueues READY content marked for retry", async () => {
      const { service, queue } = setup({
        row: {
          status: "READY",
          pipelineVersion: 1,
          failedStep: "CLASSIFYING",
          embeddingModel: "model-a",
        },
      });
      await service.requestIngestion("ws-1", "content-1");
      expect(queue.enqueue).toHaveBeenCalledWith("ws-1", "content-1");
    });
  });

  describe("requestIngestionSafely", () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
      warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
    });
    afterEach(() => warn.mockRestore());

    it("requests each distinct content once and skips empty ids", async () => {
      const { service, queue } = setup({
        row: { status: "PENDING", pipelineVersion: 0 },
      });
      await service.requestIngestionSafely("ws-1", [
        "content-1",
        "content-1",
        null,
        undefined,
        "content-2",
      ]);
      expect(queue.enqueue).toHaveBeenCalledTimes(2);
      expect(queue.enqueue).toHaveBeenCalledWith("ws-1", "content-1");
      expect(queue.enqueue).toHaveBeenCalledWith("ws-1", "content-2");
    });

    it("swallows a queue outage and keeps going", async () => {
      const { service, queue } = setup({
        row: { status: "PENDING", pipelineVersion: 0 },
      });
      queue.enqueue.mockRejectedValueOnce(new Error("redis down"));
      await expect(
        service.requestIngestionSafely("ws-1", ["content-1", "content-2"]),
      ).resolves.toBeUndefined();
      expect(queue.enqueue).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("redis down"));
    });

    describe("when the queue never answers", () => {
      beforeEach(() => jest.useFakeTimers());
      afterEach(() => jest.useRealTimers());

      it("stops waiting after three seconds and logs it", async () => {
        const { service, queue } = setup({
          row: { status: "PENDING", pipelineVersion: 0 },
        });
        queue.enqueue.mockImplementation(
          () => new Promise<void>(() => undefined),
        );

        let settled = false;
        const pending = service
          .requestIngestionSafely("ws-1", ["content-1", "content-2"])
          .then(() => {
            settled = true;
          });
        await jest.advanceTimersByTimeAsync(2_900);
        expect(settled).toBe(false);

        await jest.advanceTimersByTimeAsync(200);
        await pending;
        expect(settled).toBe(true);
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining("did not answer within 3000 ms"),
        );
      });

      it("leaves no timer behind when the queue answers in time", async () => {
        const { service } = setup({
          row: { status: "PENDING", pipelineVersion: 0 },
        });
        await service.requestIngestionSafely("ws-1", ["content-1"]);
        expect(jest.getTimerCount()).toBe(0);
        expect(warn).not.toHaveBeenCalled();
      });
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
      expect(prisma.documentContent.updateMany).not.toHaveBeenCalled();
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
      expect(prisma.documentContent.updateMany).toHaveBeenCalledWith({
        where: { id: "content-1", workspaceId: "ws-1" },
        data: { extractedText: "Izvucen tekst", sourceScript: "LATIN" },
      });
    });

    it("strips NUL bytes from extracted text before storing it", async () => {
      extract.mockResolvedValue({
        status: "COMPLETED",
        text: "Ugo\u0000vor \u0000o delu",
        sourceScript: "LATIN",
      });
      const { service, prisma } = setup({
        row: { id: "content-1", status: "PENDING", extractedText: null },
      });

      expect(await service.ensureText("ws-1", "content-1")).toEqual({
        status: "COMPLETED",
        text: "Ugovor o delu",
      });
      expect(prisma.documentContent.updateMany).toHaveBeenCalledWith({
        where: { id: "content-1", workspaceId: "ws-1" },
        data: { extractedText: "Ugovor o delu", sourceScript: "LATIN" },
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
      expect(prisma.documentContent.updateMany).toHaveBeenCalledWith({
        where: { id: "content-1", workspaceId: "ws-1" },
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
      expect(prisma.documentContent.updateMany).toHaveBeenCalledWith({
        where: { id: "content-1", workspaceId: "ws-1" },
        data: { error: "boom" },
      });
    });
  });
});

describe("documentIngestJobId", () => {
  it("is BullMQ-safe: no colon and not integer-only", () => {
    for (const id of ["0b9c1a52-7e1d-4a8a-9d55-2f1c7f0b6e11", "123456", "7"]) {
      const jobId = documentIngestJobId(id);
      expect(jobId).not.toContain(":");
      expect(jobId).not.toMatch(/^\d+$/);
    }
  });
});

describe("DocumentIngestionQueue", () => {
  const options = {
    jobId: "content-c-1",
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  };

  function queueWith(job: { state: string } | null) {
    const remove = jest.fn(async () => undefined);
    const add = jest.fn(async () => undefined);
    const getJob = jest.fn(async () =>
      job ? { getState: async () => job.state, remove } : undefined,
    );
    return {
      add,
      remove,
      getJob,
      queue: new DocumentIngestionQueue({ add, getJob } as never),
    };
  }

  it("adds a deduplicated ingest job with retry options", async () => {
    const { queue, add, getJob, remove } = queueWith(null);
    await queue.enqueue("ws-1", "c-1");
    expect(getJob).toHaveBeenCalledWith("content-c-1");
    expect(remove).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(
      "ingest",
      { workspaceId: "ws-1", contentId: "c-1" },
      options,
    );
  });

  it.each(["failed", "completed"])(
    "removes a %s job before re-adding it",
    async (state) => {
      const { queue, add, remove } = queueWith({ state });
      await queue.enqueue("ws-1", "c-1");
      expect(remove).toHaveBeenCalledTimes(1);
      expect(remove.mock.invocationCallOrder[0]).toBeLessThan(
        add.mock.invocationCallOrder[0],
      );
      expect(add).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["waiting", "active", "delayed"])(
    "leaves a %s job alone and does not add a duplicate",
    async (state) => {
      const { queue, add, remove } = queueWith({ state });
      await queue.enqueue("ws-1", "c-1");
      expect(remove).not.toHaveBeenCalled();
      expect(add).not.toHaveBeenCalled();
    },
  );
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

  it("falls through to the chat attachment when the stored file is unreadable", async () => {
    const {
      reader: r,
      files,
      chatStorage,
    } = reader({
      version: { storedFileId: "file-1" },
      attachment: {
        sessionId: "s-1",
        storedName: "att-1",
        mimeType: "text/plain",
      },
    });
    files.openDownload.mockRejectedValueOnce(new Error("gone"));
    expect(await r.read("ws-1", "c-1")).toEqual({
      buffer: Buffer.from("chat"),
      mimeType: "text/plain",
    });
    expect(chatStorage.read).toHaveBeenCalled();
  });

  it("returns null when every source is unreadable", async () => {
    const {
      reader: r,
      files,
      chatStorage,
    } = reader({
      version: { storedFileId: "file-1" },
      attachment: {
        sessionId: "s-1",
        storedName: "att-1",
        mimeType: "text/plain",
      },
    });
    files.openDownload.mockRejectedValueOnce(new Error("gone"));
    chatStorage.read.mockRejectedValueOnce(new Error("ENOENT"));
    expect(await r.read("ws-1", "c-1")).toBeNull();
  });

  it("returns null when nothing references the content", async () => {
    expect(await reader({}).reader.read("ws-1", "c-1")).toBeNull();
  });
});
