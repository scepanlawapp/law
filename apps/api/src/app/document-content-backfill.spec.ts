import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
// The maintenance scripts live outside any Nx project; the spec exercises them.
/* eslint-disable @nx/enforce-module-boundaries */
import {
  backfillDocumentContent,
  type BackfillDeps,
} from "../../../../scripts/document-content-backfill";
import {
  parseReindexArgs,
  reindexDocumentContent,
} from "../../../../scripts/document-content-reindex";
/* eslint-enable @nx/enforce-module-boundaries */

const WS = "11111111-1111-4111-a111-111111111111";
const OTHER_WS = "22222222-2222-4222-a222-222222222222";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

type Row = Record<string, any>;

/**
 * In-memory stand-in for the handful of Prisma delegates the scripts use. It
 * understands only the where shapes the scripts issue.
 */
function createFakePrisma(seed: {
  storedFiles?: Row[];
  versions?: Row[];
  attachments?: Row[];
  documents?: Row[];
  contents?: Row[];
}) {
  const t = {
    storedFiles: seed.storedFiles ?? [],
    versions: seed.versions ?? [],
    attachments: seed.attachments ?? [],
    documents: seed.documents ?? [],
    contents: seed.contents ?? [],
  };
  let nextId = 1;
  const state = { failNextUpsertWithP2002: false };

  const matchScalar = (value: any, cond: any): boolean => {
    if (cond === null) return value === null || value === undefined;
    if (typeof cond !== "object" || cond instanceof Date) return value === cond;
    if ("not" in cond) {
      return cond.not === null
        ? value !== null && value !== undefined
        : value !== cond.not;
    }
    if ("in" in cond) return cond.in.includes(value);
    if ("gt" in cond) return value > cond.gt;
    if ("lt" in cond) return value < cond.lt;
    return false;
  };
  const matches = (row: Row, where: Row, resolve?: (r: Row) => Row): boolean =>
    Object.entries(where).every(([key, cond]) => {
      if (key === "OR") {
        return (cond as Row[]).some((c) => matches(row, c, resolve));
      }
      if (key === "document" && resolve) {
        const doc = t.documents.find((d) => d.id === row.documentId);
        return !!doc && matches(doc, cond as Row);
      }
      return matchScalar(row[key], cond);
    });
  const page = (rows: Row[], args: Row) => {
    let out = rows.filter((r) => matches(r, args.where ?? {}, (r) => r));
    out = [...out].sort((a, b) => (a.id < b.id ? -1 : 1));
    return args.take ? out.slice(0, args.take) : out;
  };

  const prisma = {
    documentVersion: {
      findMany: async (args: Row) =>
        page(t.versions, args).map((v) => ({
          ...v,
          storedFile: t.storedFiles.find((s) => s.id === v.storedFileId),
        })),
      update: async ({ where, data }: Row) => {
        Object.assign(t.versions.find((v) => v.id === where.id)!, data);
      },
    },
    chatAttachment: {
      findMany: async (args: Row) => page(t.attachments, args),
      update: async ({ where, data }: Row) => {
        Object.assign(t.attachments.find((a) => a.id === where.id)!, data);
      },
    },
    document: {
      updateMany: async ({ where, data }: Row) => {
        const rows = t.documents.filter((d) => matches(d, where));
        rows.forEach((d) => Object.assign(d, data));
        return { count: rows.length };
      },
    },
    documentContent: {
      findUniqueOrThrow: async ({ where }: Row) => {
        const key = where.workspaceId_sha256;
        return t.contents.find(
          (c) => c.workspaceId === key.workspaceId && c.sha256 === key.sha256,
        )!;
      },
      findUnique: async ({ where }: Row) => {
        const key = where.workspaceId_sha256;
        return (
          t.contents.find(
            (c) => c.workspaceId === key.workspaceId && c.sha256 === key.sha256,
          ) ?? null
        );
      },
      upsert: async ({ where, create }: Row) => {
        if (state.failNextUpsertWithP2002) {
          state.failNextUpsertWithP2002 = false;
          // Simulate a concurrent writer winning the race.
          t.contents.push({
            id: `race-${nextId++}`,
            status: "PENDING",
            extractedText: null,
            sourceScript: null,
            pipelineVersion: 0,
            error: null,
            ...create,
          });
          throw new Prisma.PrismaClientKnownRequestError("unique", {
            code: "P2002",
            clientVersion: "test",
          });
        }
        const key = where.workspaceId_sha256;
        const existing = t.contents.find(
          (c) => c.workspaceId === key.workspaceId && c.sha256 === key.sha256,
        );
        if (existing) return existing;
        const row = {
          id: `content-${nextId++}`,
          status: "PENDING",
          extractedText: null,
          sourceScript: null,
          pipelineVersion: 0,
          error: null,
          ...create,
        };
        t.contents.push(row);
        return row;
      },
      update: async ({ where, data }: Row) => {
        Object.assign(t.contents.find((c) => c.id === where.id)!, data);
      },
      findMany: async (args: Row) => page(t.contents, args),
    },
  };
  return { prisma: prisma as unknown as PrismaClient, tables: t, state };
}

function storedFile(id: string, sha256: string | null, workspaceId = WS): Row {
  return {
    id,
    workspaceId,
    sha256,
    sizeBytes: BigInt(10),
    detectedMimeType: "application/pdf",
  };
}
function version(id: string, storedFileId: string, extra: Row = {}): Row {
  return {
    id,
    workspaceId: WS,
    documentId: `doc-${id}`,
    storedFileId,
    contentId: null,
    extractionStatus: "PENDING",
    extractedText: null,
    sourceScript: null,
    extractionError: null,
    ...extra,
  };
}
function attachment(id: string, extra: Row = {}): Row {
  return {
    id,
    workspaceId: WS,
    sessionId: "session-1",
    storedName: id,
    mimeType: "application/pdf",
    sizeBytes: 5,
    sha256: null,
    contentId: null,
    documentId: null,
    extractionStatus: "PENDING",
    extractedText: null,
    sourceScript: null,
    extractionError: null,
    ...extra,
  };
}
function documentRow(id: string, aiAccess = false): Row {
  return {
    id,
    workspaceId: WS,
    aiAccess,
    aiAccessChangedAt: null,
    aiAccessChangedByUserId: null,
  };
}

function deps(over: Partial<BackfillDeps> = {}): BackfillDeps {
  return {
    readStoredFile: jest.fn(async () => Buffer.from("never read")),
    readChatAttachment: jest.fn(async () => Buffer.from("never read")),
    ...over,
  };
}

const ZERO = {
  versionsLinked: 0,
  attachmentsLinked: 0,
  contentsCreated: 0,
  textCopied: 0,
  documentsOptedIn: 0,
  markedUnsupported: 0,
  unreadable: 0,
};

describe("backfillDocumentContent", () => {
  it("links two versions with the same hash to one content row", async () => {
    const hash = sha("same bytes");
    const { prisma, tables } = createFakePrisma({
      storedFiles: [storedFile("s1", hash), storedFile("s2", hash)],
      versions: [version("v1", "s1"), version("v2", "s2")],
    });
    const d = deps();

    const result = await backfillDocumentContent(prisma, d);

    expect(tables.contents).toHaveLength(1);
    expect(tables.contents[0]).toMatchObject({
      workspaceId: WS,
      sha256: hash,
      mimeType: "application/pdf",
      sizeBytes: 10,
    });
    expect(tables.versions.map((v) => v.contentId)).toEqual([
      tables.contents[0].id,
      tables.contents[0].id,
    ]);
    expect(result).toEqual({
      ...ZERO,
      versionsLinked: 2,
      contentsCreated: 1,
    });
    expect(d.readStoredFile).not.toHaveBeenCalled();
  });

  it("hashes the bytes when StoredFile.sha256 is null", async () => {
    const { prisma, tables } = createFakePrisma({
      storedFiles: [storedFile("s1", null), storedFile("s2", null)],
      versions: [version("v1", "s1"), version("v2", "s2")],
    });
    const d = deps({
      readStoredFile: jest.fn(async () => Buffer.from("hello")),
    });

    const result = await backfillDocumentContent(prisma, d);

    expect(tables.contents).toHaveLength(1);
    expect(tables.contents[0].sha256).toBe(sha("hello"));
    expect(d.readStoredFile).toHaveBeenCalledWith(WS, "s1");
    expect(result.contentsCreated).toBe(1);
    expect(result.versionsLinked).toBe(2);
  });

  it("is idempotent: a second run changes nothing", async () => {
    const { prisma } = createFakePrisma({
      storedFiles: [storedFile("s1", sha("a"))],
      versions: [
        version("v1", "s1", {
          extractionStatus: "COMPLETED",
          extractedText: "text",
          sourceScript: "LATIN",
        }),
      ],
      attachments: [
        attachment("a1", { sha256: sha("b"), documentId: "doc-1" }),
      ],
      documents: [documentRow("doc-1")],
    });

    const first = await backfillDocumentContent(prisma, deps());
    expect(first).toEqual({
      ...ZERO,
      versionsLinked: 1,
      attachmentsLinked: 1,
      contentsCreated: 2,
      textCopied: 1,
      documentsOptedIn: 1,
    });

    expect(await backfillDocumentContent(prisma, deps())).toEqual(ZERO);
  });

  it("opts in only documents promoted from chat attachments", async () => {
    const { prisma, tables } = createFakePrisma({
      attachments: [
        attachment("a1", { sha256: sha("b"), documentId: "doc-promoted" }),
        attachment("a2", { sha256: sha("c"), documentId: null }),
      ],
      documents: [documentRow("doc-promoted"), documentRow("doc-other")],
    });

    const result = await backfillDocumentContent(prisma, deps());

    const promoted = tables.documents.find((d) => d.id === "doc-promoted")!;
    const other = tables.documents.find((d) => d.id === "doc-other")!;
    expect(promoted.aiAccess).toBe(true);
    expect(promoted.aiAccessChangedAt).toBeInstanceOf(Date);
    expect(promoted.aiAccessChangedByUserId).toBeNull();
    expect(other.aiAccess).toBe(false);
    expect(other.aiAccessChangedAt).toBeNull();
    expect(result.documentsOptedIn).toBe(1);
  });

  it("does not touch the access change time of documents already on", async () => {
    const changedAt = new Date("2026-01-01T00:00:00Z");
    const on = { ...documentRow("doc-on", true), aiAccessChangedAt: changedAt };
    const { prisma, tables } = createFakePrisma({
      attachments: [
        attachment("a1", { sha256: sha("b"), documentId: "doc-on" }),
      ],
      documents: [on],
    });

    const result = await backfillDocumentContent(prisma, deps());

    expect(result.documentsOptedIn).toBe(0);
    expect(tables.documents[0].aiAccessChangedAt).toBe(changedAt);
  });

  it("copies completed legacy text without a provider and leaves status PENDING", async () => {
    const { prisma, tables } = createFakePrisma({
      storedFiles: [storedFile("s1", sha("a"))],
      versions: [
        version("v1", "s1", {
          extractionStatus: "COMPLETED",
          extractedText: "Ime i prezime",
          sourceScript: "CYRILLIC",
        }),
      ],
    });
    const d = deps();

    const result = await backfillDocumentContent(prisma, d);

    expect(tables.contents[0]).toMatchObject({
      status: "PENDING",
      extractedText: "Ime i prezime",
      sourceScript: "CYRILLIC",
    });
    expect(result.textCopied).toBe(1);
    expect(d.readStoredFile).not.toHaveBeenCalled();
    expect(d.readChatAttachment).not.toHaveBeenCalled();
  });

  it("does not overwrite text the content row already has", async () => {
    const hash = sha("a");
    const { prisma, tables } = createFakePrisma({
      storedFiles: [storedFile("s1", hash)],
      versions: [
        version("v1", "s1", {
          extractionStatus: "COMPLETED",
          extractedText: "legacy",
          sourceScript: "LATIN",
        }),
      ],
      contents: [
        {
          id: "c1",
          workspaceId: WS,
          sha256: hash,
          mimeType: "application/pdf",
          sizeBytes: 1,
          status: "READY",
          extractedText: "current",
          sourceScript: "LATIN",
          pipelineVersion: 1,
        },
      ],
    });

    const result = await backfillDocumentContent(prisma, deps());

    expect(tables.contents[0].extractedText).toBe("current");
    expect(result.textCopied).toBe(0);
    expect(result.versionsLinked).toBe(1);
    expect(result.contentsCreated).toBe(0);
  });

  it("marks content UNSUPPORTED when the legacy extraction was unsupported", async () => {
    const { prisma, tables } = createFakePrisma({
      storedFiles: [storedFile("s1", sha("a"))],
      versions: [
        version("v1", "s1", {
          extractionStatus: "UNSUPPORTED",
          extractionError: "Nepodržan format",
        }),
      ],
    });

    const result = await backfillDocumentContent(prisma, deps());

    expect(tables.contents[0]).toMatchObject({
      status: "UNSUPPORTED",
      error: "Nepodržan format",
    });
    expect(result.markedUnsupported).toBe(1);
    expect(await backfillDocumentContent(prisma, deps())).toEqual(ZERO);
  });

  it("hashes chat attachments when sha256 is missing and stores the hash", async () => {
    const { prisma, tables } = createFakePrisma({
      attachments: [attachment("a1"), attachment("a2", { sha256: sha("x") })],
    });
    const d = deps({
      readChatAttachment: jest.fn(async () => Buffer.from("x")),
    });

    const result = await backfillDocumentContent(prisma, d);

    expect(d.readChatAttachment).toHaveBeenCalledTimes(1);
    expect(tables.attachments[0].sha256).toBe(sha("x"));
    expect(tables.contents).toHaveLength(1);
    expect(tables.attachments.map((a) => a.contentId)).toEqual([
      tables.contents[0].id,
      tables.contents[0].id,
    ]);
    expect(result.attachmentsLinked).toBe(2);
    expect(result.contentsCreated).toBe(1);
  });

  it("shares one content row between a version and an attachment", async () => {
    const hash = sha("shared");
    const { prisma, tables } = createFakePrisma({
      storedFiles: [storedFile("s1", hash)],
      versions: [version("v1", "s1")],
      attachments: [attachment("a1", { sha256: hash })],
    });

    const result = await backfillDocumentContent(prisma, deps());

    expect(tables.contents).toHaveLength(1);
    expect(result.contentsCreated).toBe(1);
    expect(result.versionsLinked).toBe(1);
    expect(result.attachmentsLinked).toBe(1);
  });

  it("never shares content across workspaces", async () => {
    const hash = sha("same");
    const { prisma, tables } = createFakePrisma({
      storedFiles: [storedFile("s1", hash), storedFile("s2", hash, OTHER_WS)],
      versions: [
        version("v1", "s1"),
        version("v2", "s2", { workspaceId: OTHER_WS }),
      ],
    });

    await backfillDocumentContent(prisma, deps());

    expect(tables.contents.map((c) => c.workspaceId).sort()).toEqual(
      [WS, OTHER_WS].sort(),
    );
  });

  it("reports unreadable files and leaves them unlinked without failing", async () => {
    const { prisma, tables } = createFakePrisma({
      storedFiles: [storedFile("s1", null), storedFile("s2", sha("ok"))],
      versions: [version("v1", "s1"), version("v2", "s2")],
    });
    const d = deps({
      readStoredFile: jest.fn(async () => {
        throw new Error("ENOENT");
      }),
    });

    const result = await backfillDocumentContent(prisma, d);

    expect(result).toEqual({
      ...ZERO,
      versionsLinked: 1,
      contentsCreated: 1,
      unreadable: 1,
    });
    expect(tables.versions.find((v) => v.id === "v1")!.contentId).toBeNull();
    expect(
      tables.versions.find((v) => v.id === "v2")!.contentId,
    ).not.toBeNull();
  });

  it("recovers from a unique-violation race on the content row", async () => {
    const hash = sha("race");
    const { prisma, tables, state } = createFakePrisma({
      storedFiles: [storedFile("s1", hash)],
      versions: [version("v1", "s1")],
    });
    state.failNextUpsertWithP2002 = true;

    const result = await backfillDocumentContent(prisma, deps());

    expect(tables.contents).toHaveLength(1);
    expect(tables.versions[0].contentId).toBe(tables.contents[0].id);
    expect(result.versionsLinked).toBe(1);
    expect(result.contentsCreated).toBe(0);
  });
});

describe("reindexDocumentContent", () => {
  const baseContent = (id: string, extra: Row = {}): Row => ({
    id,
    workspaceId: WS,
    sha256: sha(id),
    status: "PENDING",
    pipelineVersion: 0,
    ...extra,
  });

  function fixture() {
    return createFakePrisma({
      documents: [documentRow("doc-on", true), documentRow("doc-off", false)],
      versions: [
        version("v-on", "s", { documentId: "doc-on", contentId: "c-on" }),
        version("v-off", "s", { documentId: "doc-off", contentId: "c-off" }),
        version("v-ready", "s", {
          documentId: "doc-on",
          contentId: "c-ready",
        }),
        version("v-old", "s", { documentId: "doc-on", contentId: "c-old" }),
      ],
      attachments: [attachment("a1", { contentId: "c-chat" })],
      contents: [
        baseContent("c-on"),
        baseContent("c-off"),
        baseContent("c-chat"),
        baseContent("c-ready", { status: "READY", pipelineVersion: 99 }),
        baseContent("c-old", { status: "READY", pipelineVersion: 0 }),
        baseContent("c-orphan"),
      ],
    });
  }

  it("enqueues content of access-on documents and chat attachments only", async () => {
    const { prisma } = fixture();
    const enqueue = jest.fn(async () => undefined);

    const result = await reindexDocumentContent(prisma, enqueue, {
      pipelineVersionOnly: false,
      dryRun: false,
    });

    const ids = enqueue.mock.calls.map((c: any[]) => c[1]).sort();
    expect(ids).toEqual(["c-chat", "c-old", "c-on"]);
    expect(enqueue).toHaveBeenCalledWith(WS, "c-on");
    expect(result.enqueued).toBe(3);
  });

  it("with --pipeline-version only enqueues rows below the current version", async () => {
    const { prisma } = fixture();
    const enqueue = jest.fn(async () => undefined);

    await reindexDocumentContent(prisma, enqueue, {
      pipelineVersionOnly: true,
      dryRun: false,
    });

    const ids = enqueue.mock.calls.map((c: any[]) => c[1]).sort();
    expect(ids).toEqual(["c-chat", "c-old", "c-on"]);
  });

  it("with --pipeline-version skips READY content on the current version", async () => {
    const { prisma, tables } = fixture();
    tables.contents.find((c) => c.id === "c-old")!.pipelineVersion = 99;
    const enqueue = jest.fn(async () => undefined);

    await reindexDocumentContent(prisma, enqueue, {
      pipelineVersionOnly: true,
      dryRun: false,
    });

    const ids = enqueue.mock.calls.map((c: any[]) => c[1]);
    expect(ids).not.toContain("c-old");
    expect(ids).not.toContain("c-ready");
  });

  it("enqueues nothing on a dry run but reports the count", async () => {
    const { prisma } = fixture();
    const enqueue = jest.fn(async () => undefined);

    const result = await reindexDocumentContent(prisma, enqueue, {
      pipelineVersionOnly: false,
      dryRun: true,
    });

    expect(enqueue).not.toHaveBeenCalled();
    expect(result.enqueued).toBe(0);
    expect(result.candidates).toBe(3);
  });

  it("parses the CLI flags", () => {
    expect(parseReindexArgs([])).toEqual({
      pipelineVersionOnly: false,
      dryRun: false,
    });
    expect(
      parseReindexArgs(["--only-opted-in", "--pipeline-version", "--dry-run"]),
    ).toEqual({ pipelineVersionOnly: true, dryRun: true });
    expect(() => parseReindexArgs(["--everything"])).toThrow();
  });
});
