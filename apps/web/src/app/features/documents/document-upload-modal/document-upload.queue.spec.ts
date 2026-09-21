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
    caseIds: [],
    clientIds: [],
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
    const create = jest.fn((body: FormData) => {
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
