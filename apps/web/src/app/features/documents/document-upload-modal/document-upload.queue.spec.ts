import {
  HttpErrorResponse,
  HttpEvent,
  HttpEventType,
  HttpResponse,
} from "@angular/common/http";
import { DocumentDetail } from "@law/api-interfaces";
import { Subject } from "rxjs";
import { DocumentUploadQueue } from "./document-upload.queue";

function file(name = "a.pdf", size = 12): File {
  return new File([new Uint8Array(size)], name, { type: "application/pdf" });
}

function documentDetail(id: string): DocumentDetail {
  return {
    id,
    title: id,
    category: null,
    archived: false,
    archivedAt: null,
    aiAccess: false,
    aiStatus: "OFF",
    aiRetryable: false,
    documentKind: null,
    fromAssistantChat: false,
    cases: [],
    clients: [],
    currentVersion: null,
    createdByUserId: "user",
    updatedByUserId: "user",
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
  };
}

describe("DocumentUploadQueue", () => {
  it("uploads ready rows with bounded concurrency and per-row errors", () => {
    const streams = new Map<string, Subject<HttpEvent<DocumentDetail>>>();
    const create = jest.fn((body: FormData, _key: string) => {
      void _key;
      const title = String(body.get("title"));
      const subject = new Subject<HttpEvent<DocumentDetail>>();
      streams.set(title, subject);
      return subject.asObservable();
    });
    const queue = new DocumentUploadQueue(
      { create, addVersion: jest.fn() },
      "create",
      undefined,
      25_000_000,
      2,
    );

    queue.addFiles([file("one.pdf"), file("two.pdf"), file("three.pdf")]);
    queue.setCategory(queue.rows[0].id, "EVIDENCE");
    queue.startReady(["case-1"], []);

    expect(create).toHaveBeenCalledTimes(2);
    expect(queue.rows.map((row) => row.status)).toEqual([
      "uploading",
      "uploading",
      "queued",
    ]);
    const firstKey = queue.rows[0].idempotencyKey;

    const first = streams.get("one");
    const second = streams.get("two");
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) {
      return;
    }
    first.next({
      type: HttpEventType.UploadProgress,
      loaded: 6,
      total: 12,
    });
    expect(queue.rows[0].status).toBe("uploading");
    expect(queue.rows[0].percent).toBe(50);
    first.next({
      type: HttpEventType.UploadProgress,
      loaded: 12,
      total: 12,
    });
    expect(queue.rows[0].status).toBe("processing");
    first.next(new HttpResponse({ body: documentDetail("doc-1") }));
    first.complete();
    expect(queue.rows[0].status).toBe("succeeded");
    expect(create).toHaveBeenCalledTimes(3);

    second.error(
      new HttpErrorResponse({ status: 400, error: { message: "bad" } }),
    );
    expect(queue.rows[1].status).toBe("failed");
    expect(queue.rows[1].errorText).toBe("bad");

    const failedKey = queue.rows[1].idempotencyKey;
    queue.retryFailed();
    expect(queue.rows[1].status).toBe("uploading");
    expect(queue.rows[1].idempotencyKey).toBe(failedKey);
    expect(create).toHaveBeenCalledTimes(4);
    expect(create.mock.calls[3]?.[1]).toBe(failedKey);

    queue.rows[0].titleControl.setValue("changed");
    queue.setCategory(queue.rows[0].id, "OTHER");
    expect(queue.rows[0].frozenCreate?.title).toBe("one");
    expect(queue.rows[0].frozenCreate?.category).toBe("EVIDENCE");
    expect(queue.rows[0].category).toBe("EVIDENCE");
    expect(firstKey).toBe(queue.rows[0].idempotencyKey);
    expect(create.mock.calls[0]?.[0].get("category")).toBe("EVIDENCE");
  });

  it("keeps invalid oversized rows and still uploads valid siblings", () => {
    const create = jest.fn(() =>
      new Subject<HttpEvent<DocumentDetail>>().asObservable(),
    );
    const queue = new DocumentUploadQueue(
      { create, addVersion: jest.fn() },
      "create",
      undefined,
      10,
      2,
    );
    queue.addFiles([file("ok.pdf", 8), file("big.pdf", 11)]);
    expect(queue.rows[1].status).toBe("invalid");
    queue.startReady([], []);
    expect(create).toHaveBeenCalledTimes(1);
    expect(queue.rows[1].status).toBe("invalid");
  });

  it("does not remove succeeded rows via remove()", () => {
    const queue = new DocumentUploadQueue(
      { create: jest.fn(), addVersion: jest.fn() },
      "create",
      undefined,
      25_000_000,
      2,
    );
    queue.addFiles([file("ok.pdf")]);
    queue.rows[0].status = "succeeded";
    queue.remove(queue.rows[0].id);
    expect(queue.rows).toHaveLength(1);
  });
});

describe("folder upload destinations", () => {
  it("freezes each resolved folder and idempotency key across retry", () => {
    const streams: Subject<HttpEvent<DocumentDetail>>[] = [];
    const create = jest.fn((_body: FormData, _key: string) => {
      void _body;
      void _key;
      const stream = new Subject<HttpEvent<DocumentDetail>>();
      streams.push(stream);
      return stream;
    });
    const queue = new DocumentUploadQueue(
      { create, addVersion: jest.fn() },
      "create",
      undefined,
      100,
    );
    const nested = file();
    Object.defineProperty(nested, "webkitRelativePath", {
      value: "Legal/Contracts/a.pdf",
    });
    queue.addFiles([nested, file("root.pdf")]);
    queue.resolveFolders(
      new Map([["Legal/Contracts", "nested-id"]]),
      "target-id",
    );
    queue.startReady(["case"], ["client"]);
    expect(create.mock.calls[0][0].get("folderId")).toBe("nested-id");
    expect(create.mock.calls[1][0].get("folderId")).toBe("target-id");
    streams[0].error(new HttpErrorResponse({ status: 500 }));
    queue.resolveFolders(new Map([["Legal/Contracts", "changed"]]), "changed");
    queue.retryRow(queue.rows[0].id);
    expect(create.mock.calls[2][0].get("folderId")).toBe("nested-id");
    expect(create.mock.calls[2][1]).toBe(create.mock.calls[0][1]);
    expect(create.mock.calls[2][0].getAll("caseIds")).toEqual(["case"]);
  });
  it("keeps version mode single-file and omits folder metadata", () => {
    const addVersion = jest.fn(() => new Subject<HttpEvent<DocumentDetail>>());
    const queue = new DocumentUploadQueue(
      { create: jest.fn(), addVersion },
      "version",
      "document",
      100,
    );
    queue.addFiles([file(), file("second.pdf")]);
    queue.resolveFolders(new Map(), "target");
    queue.startReady([], []);
    expect(queue.rows).toHaveLength(1);
    expect(addVersion.mock.calls[0]).toEqual([
      "document",
      expect.any(FormData),
      expect.any(String),
    ]);
    expect(queue.rows[0].frozenCreate).toBeNull();
  });
  it("preserves unknown-outcome protection after all bytes are sent", () => {
    const stream = new Subject<HttpEvent<DocumentDetail>>();
    const queue = new DocumentUploadQueue(
      { create: () => stream, addVersion: jest.fn() },
      "create",
      undefined,
      100,
    );
    queue.addFiles([file()]);
    queue.startReady([], []);
    stream.next({ type: HttpEventType.UploadProgress, loaded: 12, total: 12 });
    stream.error(new HttpErrorResponse({ status: 0 }));
    queue.retryFailed();
    expect(queue.hasUnknownOutcomes).toBe(true);
    expect(queue.canRemove(queue.rows[0])).toBe(false);
  });

  describe("AI access", () => {
    function createQueue() {
      const streams: Subject<HttpEvent<DocumentDetail>>[] = [];
      const create = jest.fn((_body: FormData, _key: string) => {
        void _key;
        const subject = new Subject<HttpEvent<DocumentDetail>>();
        streams.push(subject);
        return subject.asObservable();
      });
      const addVersion = jest.fn(
        () => new Subject<HttpEvent<DocumentDetail>>(),
      );
      const queue = new DocumentUploadQueue(
        { create, addVersion },
        "create",
        undefined,
        25_000_000,
        1,
      );
      return { queue, create, streams, addVersion };
    }

    it("defaults new rows to off and sends aiAccess=false", () => {
      const { queue, create } = createQueue();
      queue.addFiles([file("one.pdf")]);
      expect(queue.rows[0].aiAccess).toBe(false);
      queue.startReady([], []);
      expect(create.mock.calls[0][0].get("aiAccess")).toBe("false");
    });

    it("sends aiAccess=true for a row switched on", () => {
      const { queue, create } = createQueue();
      queue.addFiles([file("one.pdf")]);
      queue.setAiAccess(queue.rows[0].id, true);
      queue.startReady([], []);
      expect(create.mock.calls[0][0].get("aiAccess")).toBe("true");
    });

    it("appends aiAccess before the file part", () => {
      const { queue, create } = createQueue();
      queue.addFiles([file("one.pdf")]);
      queue.setAiAccess(queue.rows[0].id, true);
      queue.startReady([], []);
      const keys = Array.from(create.mock.calls[0][0].keys());
      expect(keys.indexOf("aiAccess")).toBeGreaterThanOrEqual(0);
      expect(keys.indexOf("aiAccess")).toBeLessThan(keys.indexOf("file"));
    });

    it("applies the dialog-level value to existing and new rows", () => {
      const { queue } = createQueue();
      queue.addFiles([file("one.pdf")]);
      queue.setAllAiAccess(true);
      expect(queue.rows[0].aiAccess).toBe(true);
      queue.addFiles([file("two.pdf")]);
      expect(queue.rows[1].aiAccess).toBe(true);
      queue.setAllAiAccess(false);
      expect(queue.rows.map((row) => row.aiAccess)).toEqual([false, false]);
    });

    it("setAllAiAccess leaves uploaded and in-flight rows untouched", () => {
      const { queue, streams } = createQueue();
      queue.addFiles([file("one.pdf"), file("two.pdf"), file("three.pdf")]);
      queue.startReady([], []);
      streams[0].next(new HttpResponse({ body: documentDetail("doc-1") }));
      expect(queue.rows.map((row) => row.status)).toEqual([
        "succeeded",
        "uploading",
        "queued",
      ]);
      queue.setAllAiAccess(true);
      expect(queue.rows.map((row) => row.aiAccess)).toEqual([
        false,
        false,
        false,
      ]);
    });

    it("keeps the original value in the frozen retry payload", () => {
      const { queue } = createQueue();
      queue.addFiles([file("one.pdf")]);
      queue.setAiAccess(queue.rows[0].id, true);
      queue.startReady([], []);
      expect(queue.rows[0].frozenCreate?.aiAccess).toBe(true);
      queue.setAiAccess(queue.rows[0].id, false);
      queue.setAllAiAccess(false);
      expect(queue.rows[0].aiAccess).toBe(true);
      expect(queue.rows[0].frozenCreate?.aiAccess).toBe(true);
    });

    it("retry resends the frozen aiAccess value", () => {
      const { queue, create, streams } = createQueue();
      queue.addFiles([file("one.pdf")]);
      queue.setAiAccess(queue.rows[0].id, true);
      queue.startReady([], []);
      streams[0].error(new HttpErrorResponse({ status: 400 }));
      queue.setAllAiAccess(false);
      queue.retryFailed();
      expect(create).toHaveBeenCalledTimes(2);
      expect(create.mock.calls[1][0].get("aiAccess")).toBe("true");
    });

    it("never sends aiAccess for version uploads", () => {
      const addVersion = jest.fn(
        (_id: string, _body: FormData, _key: string) => {
          void _id;
          void _key;
          return new Subject<HttpEvent<DocumentDetail>>();
        },
      );
      const queue = new DocumentUploadQueue(
        { create: jest.fn(), addVersion },
        "version",
        "document",
        100,
      );
      queue.addFiles([file()]);
      queue.setAiAccess(queue.rows[0].id, true);
      queue.setAllAiAccess(true);
      queue.startReady([], []);
      expect(queue.rows[0].aiAccess).toBe(false);
      expect(addVersion.mock.calls[0][1].has("aiAccess")).toBe(false);
    });
  });
});
