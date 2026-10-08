import { Logger } from "@nestjs/common";
import { FakeChatModelProvider, type ChatModelProvider } from "@law/llm";
import {
  CURRENT_PIPELINE_VERSION,
  DocumentContentEvents,
  DocumentContentService,
  DocumentIngestionPipeline,
  DocumentIngestionProcessor,
} from "@law/document-ingestion";
import { extractAttachmentText } from "@law/extraction";

jest.mock("@law/extraction", () => ({
  extractAttachmentText: jest.fn(),
}));

const extract = extractAttachmentText as jest.MockedFunction<
  typeof extractAttachmentText
>;

type Row = Record<string, unknown>;

const WORKSPACE = "ws-1";
const CONTENT = "content-1";
const ID_CARD_TEXT = "LIČNA KARTA\nIme: Petar Petrović\nMesto rođenja: Niš";

const ID_CARD_FACTS = {
  subjects: [
    {
      subjectKey: "holder",
      subjectType: "PERSON",
      subjectRole: null,
      facts: [
        {
          field: "fullName",
          value: "Petar Petrović",
          quote: "Ime: Petar Petrović",
          confidence: 0.95,
        },
      ],
    },
  ],
};

function embeddingProvider(model = "BAAI/bge-m3") {
  return {
    model,
    dimensions: 1024,
    embed: jest.fn(async (texts: readonly string[]) =>
      texts.map(() => new Array<number>(1024).fill(0.5)),
    ),
  };
}

function countingModel(inner: ChatModelProvider) {
  const completeStructured = jest.fn((request) =>
    inner.completeStructured(request),
  );
  const provider: ChatModelProvider = {
    completeStructured: completeStructured as never,
    streamText: (request) => inner.streamText(request),
  };
  return { provider, completeStructured };
}

function setup(
  options: {
    row?: Row;
    model?: ChatModelProvider;
    embeddings?: ReturnType<typeof embeddingProvider>;
    maxChars?: number;
    chunkCount?: number;
    factCount?: number;
    bytes?: unknown;
  } = {},
) {
  const row: Row = {
    id: CONTENT,
    workspaceId: WORKSPACE,
    status: "PENDING",
    pipelineVersion: 0,
    extractedText: null,
    truncated: false,
    documentKind: null,
    kindConfidence: null,
    ...options.row,
  };
  const statuses: unknown[] = [];
  let chunkCount = options.chunkCount ?? 0;
  let factCount = options.factCount ?? 0;

  const tx = {
    $executeRaw: jest.fn(async () => 1),
    documentContentChunk: {
      deleteMany: jest.fn(async () => {
        chunkCount = 0;
        return { count: 0 };
      }),
    },
    documentFact: {
      deleteMany: jest.fn(async () => {
        factCount = 0;
        return { count: 0 };
      }),
      createMany: jest.fn(async ({ data }: { data: unknown[] }) => {
        factCount = data.length;
        return { count: data.length };
      }),
    },
  };
  tx.$executeRaw.mockImplementation(async () => {
    chunkCount += 1;
    return 1;
  });

  const prisma = {
    documentContent: {
      findFirst: jest.fn(async ({ where }: { where: Row }) =>
        where["id"] === row["id"] && where["workspaceId"] === row["workspaceId"]
          ? { ...row }
          : null,
      ),
      updateMany: jest.fn(
        async ({ where, data }: { where: Row; data: Row }) => {
          if (
            where["id"] !== row["id"] ||
            where["workspaceId"] !== row["workspaceId"]
          ) {
            return { count: 0 };
          }
          Object.assign(row, data);
          if (data["status"]) statuses.push(data["status"]);
          return { count: 1 };
        },
      ),
    },
    documentContentChunk: {
      count: jest.fn(async () => chunkCount),
      deleteMany: tx.documentContentChunk.deleteMany,
    },
    documentFact: {
      count: jest.fn(async () => factCount),
      deleteMany: tx.documentFact.deleteMany,
    },
    $transaction: jest.fn(async (callback: (t: typeof tx) => unknown) =>
      callback(tx),
    ),
  };

  const queue = { enqueue: jest.fn(async () => undefined) };
  const reader = {
    read: jest.fn(async () =>
      options.bytes === undefined
        ? { buffer: Buffer.from("x"), mimeType: "image/png" }
        : options.bytes,
    ),
  };
  const contents = new DocumentContentService(
    prisma as never,
    queue as never,
    reader as never,
  );
  const embeddings = options.embeddings ?? embeddingProvider();
  const counted = countingModel(
    options.model ??
      new FakeChatModelProvider([
        { kind: "ID_CARD", confidence: 0.95 },
        ID_CARD_FACTS,
      ]),
  );
  const events = new DocumentContentEvents();
  const emitted: { workspaceId: string; contentId: string; status: string }[] =
    [];
  events.stream$.subscribe((event) => emitted.push(event));

  const pipeline = new DocumentIngestionPipeline(
    prisma as never,
    contents,
    embeddings,
    counted.provider,
    {
      documentKindMinConfidence: 0.6,
      documentEmbedMaxChars: options.maxChars ?? 200_000,
    },
    events,
  );
  return {
    row,
    prisma,
    tx,
    pipeline,
    embeddings,
    model: counted.completeStructured,
    emitted,
    statuses,
    reader,
    events,
  };
}

function textExtracted(text = ID_CARD_TEXT) {
  extract.mockResolvedValue({
    status: "COMPLETED",
    text,
    sourceScript: "LATIN",
  } as never);
}

describe("DocumentIngestionPipeline", () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    extract.mockReset();
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
  });
  afterEach(() => warn.mockRestore());

  it("runs an ID card through every step to READY", async () => {
    textExtracted();
    const s = setup();

    await s.pipeline.run(WORKSPACE, CONTENT);

    expect(s.statuses).toEqual([
      "EXTRACTING",
      "EMBEDDING",
      "CLASSIFYING",
      "READY",
    ]);
    expect(s.row).toMatchObject({
      status: "READY",
      extractedText: ID_CARD_TEXT,
      documentKind: "ID_CARD",
      kindConfidence: 0.95,
      pipelineVersion: CURRENT_PIPELINE_VERSION,
      embeddingModel: "BAAI/bge-m3",
      embeddingDimensions: 1024,
      truncated: false,
      failedStep: null,
      error: null,
    });
    expect(s.row["processedAt"]).toBeInstanceOf(Date);

    // One chunk inserted through a raw vector statement inside a transaction.
    expect(s.prisma.$transaction).toHaveBeenCalled();
    expect(s.tx.documentContentChunk.deleteMany).toHaveBeenCalledWith({
      where: { contentId: CONTENT, workspaceId: WORKSPACE },
    });
    expect(s.tx.$executeRaw).toHaveBeenCalledTimes(1);
    const sql = s.tx.$executeRaw.mock.calls[0] as unknown[];
    expect(JSON.stringify(sql)).toContain("::vector");
    expect(JSON.stringify(sql)).toContain("DocumentContentChunk");

    expect(s.tx.documentFact.deleteMany).toHaveBeenCalledWith({
      where: { contentId: CONTENT, workspaceId: WORKSPACE },
    });
    expect(s.tx.documentFact.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          workspaceId: WORKSPACE,
          contentId: CONTENT,
          subjectKey: "holder",
          subjectType: "PERSON",
          field: "fullName",
          value: "Petar Petrović",
        }),
      ],
    });

    expect(s.emitted.at(-1)).toEqual({
      workspaceId: WORKSPACE,
      contentId: CONTENT,
      status: "READY",
    });
  });

  it("embeds in batches of 32", async () => {
    // 60 paragraphs of ~1,400 chars: well over 32 chunks.
    const text = Array.from(
      { length: 60 },
      (_, i) => `${i} ${"a".repeat(1400)}`,
    ).join("\n\n");
    textExtracted(text);
    const s = setup({
      model: new FakeChatModelProvider({ kind: "OTHER", confidence: 0.9 }),
    });

    await s.pipeline.run(WORKSPACE, CONTENT);

    const sizes = s.embeddings.embed.mock.calls.map((call) => call[0].length);
    expect(sizes.length).toBeGreaterThan(1);
    expect(sizes.slice(0, -1).every((size) => size === 32)).toBe(true);
    expect(sizes.every((size) => size <= 32)).toBe(true);
  });

  it("marks unsupported content without embedding or model calls", async () => {
    extract.mockResolvedValue({
      status: "UNSUPPORTED",
      error: "nope",
    } as never);
    const s = setup();

    await s.pipeline.run(WORKSPACE, CONTENT);

    expect(s.row["status"]).toBe("UNSUPPORTED");
    expect(s.statuses).not.toContain("READY");
    expect(s.embeddings.embed).not.toHaveBeenCalled();
    expect(s.model).not.toHaveBeenCalled();
    expect(s.emitted.at(-1)?.status).toBe("UNSUPPORTED");
  });

  it("throws when the text cannot be extracted so BullMQ retries", async () => {
    extract.mockResolvedValue({ status: "FAILED", error: "ocr down" } as never);
    const s = setup();
    await expect(s.pipeline.run(WORKSPACE, CONTENT)).rejects.toThrow();
    expect(s.row["status"]).toBe("EXTRACTING");
  });

  it("throws when the bytes are unavailable", async () => {
    const s = setup({ bytes: null });
    await expect(s.pipeline.run(WORKSPACE, CONTENT)).rejects.toThrow();
    expect(extract).not.toHaveBeenCalled();
  });

  it("resumes after an embedding failure without extracting again", async () => {
    textExtracted();
    const embeddings = embeddingProvider();
    embeddings.embed.mockRejectedValueOnce(new Error("provider down"));
    const s = setup({ embeddings });

    await expect(s.pipeline.run(WORKSPACE, CONTENT)).rejects.toThrow(
      "provider down",
    );
    expect(s.row["status"]).toBe("EMBEDDING");
    expect(extract).toHaveBeenCalledTimes(1);

    await s.pipeline.run(WORKSPACE, CONTENT);

    expect(extract).toHaveBeenCalledTimes(1);
    expect(s.row["status"]).toBe("READY");
  });

  it("does not embed again when chunks exist for the current model", async () => {
    const s = setup({
      row: {
        extractedText: ID_CARD_TEXT,
        embeddingModel: "BAAI/bge-m3",
        status: "CLASSIFYING",
      },
      chunkCount: 3,
    });
    // A chunk is only trusted when it carries the provider's model.
    s.prisma.documentContentChunk.count.mockImplementation((async (args: {
      where: Row;
    }) => (args.where["embeddingModel"] === "BAAI/bge-m3" ? 3 : 0)) as never);

    await s.pipeline.run(WORKSPACE, CONTENT);

    expect(s.prisma.documentContentChunk.count).toHaveBeenCalledWith({
      where: {
        contentId: CONTENT,
        workspaceId: WORKSPACE,
        embeddingModel: "BAAI/bge-m3",
      },
    });
    expect(s.embeddings.embed).not.toHaveBeenCalled();
    expect(s.statuses).not.toContain("EMBEDDING");
    expect(s.row["status"]).toBe("READY");
  });

  it("re-embeds when the stored chunks come from another model", async () => {
    const s = setup({
      row: { extractedText: ID_CARD_TEXT },
      chunkCount: 3,
    });
    s.prisma.documentContentChunk.count.mockResolvedValue(0);

    await s.pipeline.run(WORKSPACE, CONTENT);

    expect(s.embeddings.embed).toHaveBeenCalled();
  });

  it("skips classification when the kind is already set", async () => {
    const s = setup({
      row: {
        extractedText: ID_CARD_TEXT,
        documentKind: "ID_CARD",
        kindConfidence: 0.9,
      },
      model: new FakeChatModelProvider(ID_CARD_FACTS),
    });

    await s.pipeline.run(WORKSPACE, CONTENT);

    // Only the fact call remains.
    expect(s.model).toHaveBeenCalledTimes(1);
    expect(s.row["documentKind"]).toBe("ID_CARD");
  });

  it("skips fact extraction when facts already exist", async () => {
    const s = setup({
      row: { extractedText: ID_CARD_TEXT, documentKind: "ID_CARD" },
      factCount: 2,
    });

    await s.pipeline.run(WORKSPACE, CONTENT);

    expect(s.model).not.toHaveBeenCalled();
    expect(s.tx.documentFact.createMany).not.toHaveBeenCalled();
    expect(s.row["status"]).toBe("READY");
  });

  it("reaches READY with no kind and no facts when classification throws", async () => {
    textExtracted();
    const s = setup({
      model: {
        completeStructured: jest.fn(async () => {
          throw new Error("model down");
        }),
        streamText: jest.fn(),
      } as never,
    });

    await s.pipeline.run(WORKSPACE, CONTENT);

    expect(s.row["status"]).toBe("READY");
    expect(s.row["documentKind"] ?? null).toBeNull();
    expect(s.tx.documentFact.createMany).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("reaches READY with the kind and no facts when fact extraction throws", async () => {
    textExtracted();
    const s = setup({
      model: {
        completeStructured: jest
          .fn()
          .mockResolvedValueOnce({ kind: "ID_CARD", confidence: 0.95 })
          .mockRejectedValueOnce(new Error("model down")),
        streamText: jest.fn(),
      } as never,
    });

    await s.pipeline.run(WORKSPACE, CONTENT);

    expect(s.row).toMatchObject({ status: "READY", documentKind: "ID_CARD" });
    expect(s.tx.documentFact.createMany).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("does not extract facts for kind OTHER", async () => {
    textExtracted();
    const s = setup({
      model: new FakeChatModelProvider({ kind: "OTHER", confidence: 0.9 }),
    });

    await s.pipeline.run(WORKSPACE, CONTENT);

    expect(s.model).toHaveBeenCalledTimes(1);
    expect(s.row).toMatchObject({ status: "READY", documentKind: "OTHER" });
  });

  it("chunks only the first N characters and flags truncation", async () => {
    const text = "a".repeat(5000);
    textExtracted(text);
    const s = setup({
      maxChars: 1000,
      model: new FakeChatModelProvider({ kind: "OTHER", confidence: 0.9 }),
    });

    await s.pipeline.run(WORKSPACE, CONTENT);

    const embedded = s.embeddings.embed.mock.calls.flatMap((call) => call[0]);
    expect(embedded.join("").length).toBeLessThanOrEqual(1200);
    expect(embedded.every((chunk) => chunk.length <= 1000)).toBe(true);
    expect(s.row["truncated"]).toBe(true);
  });

  it("extracts facts from the full text, not the truncated prefix", async () => {
    const text = `${"a".repeat(3000)}\n\nIme: Petar Petrović`;
    textExtracted(text);
    const s = setup({ maxChars: 1000 });

    await s.pipeline.run(WORKSPACE, CONTENT);

    expect(s.tx.documentFact.createMany).toHaveBeenCalled();
  });

  it("does nothing for content already READY on the current version", async () => {
    const s = setup({
      row: { status: "READY", pipelineVersion: CURRENT_PIPELINE_VERSION },
    });
    await s.pipeline.run(WORKSPACE, CONTENT);
    expect(s.prisma.documentContent.updateMany).not.toHaveBeenCalled();
    expect(s.embeddings.embed).not.toHaveBeenCalled();
  });

  it("reprocesses READY content from an older pipeline version", async () => {
    const s = setup({
      row: {
        status: "READY",
        pipelineVersion: 0,
        extractedText: ID_CARD_TEXT,
        documentKind: "ID_CARD",
      },
      chunkCount: 2,
      factCount: 1,
    });

    await s.pipeline.run(WORKSPACE, CONTENT);

    expect(s.embeddings.embed).toHaveBeenCalled();
    expect(s.row["pipelineVersion"]).toBe(CURRENT_PIPELINE_VERSION);
  });

  it("ignores content from another workspace", async () => {
    const s = setup();
    await s.pipeline.run("ws-other", CONTENT);
    expect(s.prisma.documentContent.updateMany).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
  });
});

describe("DocumentContentEvents", () => {
  it("delivers emitted events to subscribers", () => {
    const events = new DocumentContentEvents();
    const received: unknown[] = [];
    events.stream$.subscribe((event) => received.push(event));
    events.emit({ workspaceId: "w", contentId: "c", status: "READY" });
    expect(received).toEqual([
      { workspaceId: "w", contentId: "c", status: "READY" },
    ]);
  });
});

describe("DocumentIngestionProcessor", () => {
  function processorSetup(row: Row | null) {
    const prisma = {
      documentContent: {
        findFirst: jest.fn(async () => row),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const pipeline = { run: jest.fn(async () => undefined) };
    const events = new DocumentContentEvents();
    const emitted: unknown[] = [];
    events.stream$.subscribe((event) => emitted.push(event));
    const contexts: unknown[] = [];
    const workspaceContext = {
      run: jest.fn((context: unknown, fn: () => unknown) => {
        contexts.push(context);
        return fn();
      }),
    };
    const processor = new DocumentIngestionProcessor(
      pipeline as never,
      prisma as never,
      events,
      workspaceContext as never,
    );
    return { prisma, pipeline, emitted, contexts, processor };
  }

  const job = (attemptsMade: number, attempts = 3) =>
    ({
      data: { workspaceId: WORKSPACE, contentId: CONTENT },
      attemptsMade,
      opts: { attempts },
    }) as never;

  it("runs the pipeline inside a system workspace context", async () => {
    const s = processorSetup(null);
    await s.processor.process(job(0));
    expect(s.pipeline.run).toHaveBeenCalledWith(WORKSPACE, CONTENT);
    expect(s.contexts).toEqual([
      expect.objectContaining({ workspaceId: WORKSPACE }),
    ]);
  });

  it("does not record a failure while retries remain", async () => {
    const s = processorSetup({ status: "EMBEDDING" });
    await s.processor.onFailed(job(1), new Error("boom"));
    expect(s.prisma.documentContent.updateMany).not.toHaveBeenCalled();
  });

  it("records the active step and error after the last attempt", async () => {
    const s = processorSetup({ status: "EMBEDDING" });
    await s.processor.onFailed(job(3), new Error("boom"));
    expect(s.prisma.documentContent.updateMany).toHaveBeenCalledWith({
      where: { id: CONTENT, workspaceId: WORKSPACE },
      data: { status: "FAILED", failedStep: "EMBEDDING", error: "boom" },
    });
    expect(s.emitted).toEqual([
      { workspaceId: WORKSPACE, contentId: CONTENT, status: "FAILED" },
    ]);
  });

  it("leaves READY and UNSUPPORTED content alone on a late failure", async () => {
    const s = processorSetup({ status: "READY" });
    await s.processor.onFailed(job(3), new Error("boom"));
    expect(s.prisma.documentContent.updateMany).not.toHaveBeenCalled();
  });
});
