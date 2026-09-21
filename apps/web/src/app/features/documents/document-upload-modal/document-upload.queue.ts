import {
  HttpErrorResponse,
  HttpEvent,
  HttpEventType,
} from "@angular/common/http";
import { FormControl, Validators } from "@angular/forms";
import { DocumentDetail } from "@law/api-interfaces";
import { Observable, Subscription } from "rxjs";
import {
  DOCUMENT_TITLE_MAX,
  DOCUMENT_UPLOAD_CONCURRENCY,
  DocumentUploadMode,
  DocumentUploadRow,
  FrozenCreatePayload,
} from "./document-upload.models";
import {
  clampPercent,
  hasAdvisoryDisallowedType,
  httpErrorText,
  newRowId,
  titleFromFilename,
  validateSize,
  validateTitle,
} from "./document-upload.utils";

export interface DocumentUploadTransport {
  create(
    body: FormData,
    idempotencyKey: string,
  ): Observable<HttpEvent<DocumentDetail>>;
  addVersion(
    documentId: string,
    body: FormData,
    idempotencyKey: string,
  ): Observable<HttpEvent<DocumentDetail>>;
}

export class DocumentUploadQueue {
  rows: DocumentUploadRow[] = [];
  private readonly inflight = new Map<string, Subscription>();

  constructor(
    private readonly transport: DocumentUploadTransport,
    private readonly mode: DocumentUploadMode,
    private readonly documentId: string | undefined,
    private readonly maxBytes: number,
    private readonly concurrency = DOCUMENT_UPLOAD_CONCURRENCY,
    private readonly onChange: () => void = () => undefined,
  ) {}

  get hasActiveRequests(): boolean {
    return this.rows.some((row) =>
      ["queued", "uploading", "processing"].includes(row.status),
    );
  }

  get hasUnknownOutcomes(): boolean {
    return this.rows.some((row) => row.status === "outcome_unknown");
  }

  get succeeded(): DocumentDetail[] {
    return this.rows
      .map((row) => row.result)
      .filter((item): item is DocumentDetail => !!item);
  }

  addFiles(files: FileList | File[]): void {
    const incoming = Array.from(files);
    const next = [...this.rows];
    for (const file of incoming) {
      if (this.mode === "version" && next.length >= 1) break;
      next.push(this.createRow(file));
    }
    this.rows = next;
    this.emit();
  }

  toggleExpanded(id: string): void {
    this.rows = this.rows.map((row) =>
      row.id === id ? { ...row, expanded: !row.expanded } : row,
    );
    this.emit();
  }

  canRemove(row: DocumentUploadRow): boolean {
    return (
      row.status === "ready" ||
      row.status === "invalid" ||
      row.status === "failed"
    );
  }

  remove(id: string): void {
    const row = this.rows.find((item) => item.id === id);
    if (!row || !this.canRemove(row)) return;
    this.rows = this.rows.filter((item) => item.id !== id);
    this.emit();
  }

  revalidate(id: string): void {
    const row = this.rows.find((item) => item.id === id);
    if (!row || row.frozenCreate || row.frozenVersion) return;
    this.patch(id, this.validationPatch(row));
  }

  setCategory(id: string, category: string | null): void {
    const row = this.rows.find((item) => item.id === id);
    if (!row || row.frozenCreate || row.frozenVersion) return;
    this.patch(id, { category });
  }

  startReady(caseIds: string[], clientIds: string[]): void {
    const next = this.rows.map((row) => {
      if (row.status !== "ready") return row;
      return this.queueRow(row, caseIds, clientIds);
    });
    this.rows = next;
    this.pump();
    this.emit();
  }

  retryFailed(): void {
    this.rows = this.rows.map((row) => {
      if (row.status !== "failed" || !row.idempotencyKey) return row;
      return { ...row, status: "queued" as const, errorText: null };
    });
    this.pump();
    this.emit();
  }

  retryRow(id: string): void {
    const row = this.rows.find((item) => item.id === id);
    if (!row || row.status !== "failed" || !row.idempotencyKey) return;
    this.patch(id, { status: "queued", errorText: null });
    this.pump();
  }

  destroy(): void {
    for (const subscription of this.inflight.values()) {
      subscription.unsubscribe();
    }
    this.inflight.clear();
  }

  private createRow(file: File): DocumentUploadRow {
    const derived = titleFromFilename(file.name);
    const control = new FormControl(derived, {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(DOCUMENT_TITLE_MAX),
      ],
    });
    const row: DocumentUploadRow = {
      id: newRowId(),
      file,
      titleControl: control,
      category: null,
      status: "ready",
      loaded: 0,
      total: null,
      percent: null,
      advisoryMimeWarning: hasAdvisoryDisallowedType(file),
      errorText: null,
      idempotencyKey: null,
      frozenCreate: null,
      frozenVersion: null,
      result: null,
      expanded: false,
    };
    return { ...row, ...this.validationPatch(row) };
  }

  private validationPatch(
    row: DocumentUploadRow,
  ): Pick<DocumentUploadRow, "status" | "errorText"> {
    const sizeError = validateSize(row.file.size, this.maxBytes);
    if (sizeError) return { status: "invalid", errorText: sizeError };
    if (this.mode === "create") {
      const titleError = validateTitle(row.titleControl.value);
      if (titleError) return { status: "invalid", errorText: titleError };
    }
    return { status: "ready", errorText: null };
  }

  private queueRow(
    row: DocumentUploadRow,
    caseIds: string[],
    clientIds: string[],
  ): DocumentUploadRow {
    const validated = { ...row, ...this.validationPatch(row) };
    if (validated.status === "invalid") return validated;
    if (this.mode === "version") {
      if (!this.documentId) {
        return {
          ...validated,
          status: "invalid",
          errorText: "documents.upload.errorGeneric",
        };
      }
      return {
        ...validated,
        status: "queued",
        idempotencyKey: validated.idempotencyKey ?? newRowId(),
        frozenVersion: {
          documentId: this.documentId,
          originalFilename: row.file.name,
        },
        errorText: null,
      };
    }
    const title = row.titleControl.value.trim();
    const frozen: FrozenCreatePayload = {
      title,
      category: row.category,
      caseIds: [...caseIds],
      clientIds: [...clientIds],
      originalFilename: row.file.name,
    };
    return {
      ...validated,
      status: "queued",
      idempotencyKey: validated.idempotencyKey ?? newRowId(),
      frozenCreate: frozen,
      errorText: null,
    };
  }

  private pump(): void {
    const active = this.rows.filter(
      (row) => row.status === "uploading" || row.status === "processing",
    ).length;
    const slots = this.concurrency - active;
    if (slots <= 0) return;
    const queued = this.rows.filter((row) => row.status === "queued");
    for (const row of queued.slice(0, slots)) {
      this.send(row.id);
    }
  }

  private send(id: string): void {
    if (this.inflight.has(id)) return;
    const row = this.rows.find((item) => item.id === id);
    if (!row || row.status !== "queued" || !row.idempotencyKey) return;

    this.patch(id, { status: "uploading", loaded: 0, percent: null });

    const request$ =
      this.mode === "version" && row.frozenVersion
        ? this.transport.addVersion(
            row.frozenVersion.documentId,
            this.versionBody(row),
            row.idempotencyKey,
          )
        : this.transport.create(this.createBody(row), row.idempotencyKey);

    const subscription = request$.subscribe({
      next: (event) => this.onEvent(id, event),
      error: (error) => this.onError(id, error),
    });
    this.inflight.set(id, subscription);
  }

  private createBody(row: DocumentUploadRow): FormData {
    const frozen = row.frozenCreate;
    const body = new FormData();
    body.append("title", frozen?.title ?? row.titleControl.value.trim());
    const category = frozen?.category ?? row.category;
    if (category) body.append("category", category);
    for (const caseId of frozen?.caseIds ?? []) body.append("caseIds", caseId);
    for (const clientId of frozen?.clientIds ?? []) {
      body.append("clientIds", clientId);
    }
    body.append("file", row.file, row.file.name);
    return body;
  }

  private versionBody(row: DocumentUploadRow): FormData {
    const body = new FormData();
    body.append("file", row.file, row.file.name);
    return body;
  }

  private onEvent(id: string, event: HttpEvent<DocumentDetail>): void {
    if (event.type === HttpEventType.UploadProgress) {
      const total = event.total ?? null;
      const loaded = event.loaded;
      const percent = total != null ? clampPercent(loaded, total) : null;
      const processing = total != null && loaded >= total;
      this.patch(id, {
        loaded,
        total,
        percent,
        status: processing ? "processing" : "uploading",
      });
      return;
    }
    if (event.type === HttpEventType.Response) {
      this.inflight.delete(id);
      this.patch(id, {
        status: "succeeded",
        result: event.body ?? null,
        percent: 100,
        errorText: null,
      });
      this.pump();
    }
  }

  private onError(id: string, error: unknown): void {
    this.inflight.delete(id);
    const unknown =
      error instanceof HttpErrorResponse &&
      error.status === 0 &&
      this.rows.find((row) => row.id === id)?.status === "processing";
    this.patch(id, {
      status: unknown ? "outcome_unknown" : "failed",
      errorText: httpErrorText(error),
    });
    this.pump();
  }

  private patch(id: string, patch: Partial<DocumentUploadRow>): void {
    this.rows = this.rows.map((row) =>
      row.id === id ? { ...row, ...patch } : row,
    );
    this.emit();
  }

  private emit(): void {
    this.onChange();
  }
}
