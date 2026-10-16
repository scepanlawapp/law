import {
  DocumentUploadCandidate,
  uploadCandidate,
} from "./document-upload-candidates";
import {
  HttpErrorResponse,
  HttpEvent,
  HttpEventType,
} from "@angular/common/http";
import { FormControl, Validators } from "@angular/forms";
import { DocumentCategory, DocumentDetail } from "@law/api-interfaces";
import { Observable, Subscription } from "rxjs";
import {
  ACTIVE_UPLOAD_STATUSES,
  DOCUMENT_TITLE_MAX,
  DOCUMENT_UPLOAD_CONCURRENCY,
  DocumentUploadMode,
  DocumentUploadRow,
  DocumentUploadRowStatus,
  FrozenCreatePayload,
  PENDING_UPLOAD_STATUSES,
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
  /** Dialog-level AI access applied to rows added later. */
  aiAccessDefault = false;
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
    return this.rows.some((row) => ACTIVE_UPLOAD_STATUSES.includes(row.status));
  }

  get hasUnknownOutcomes(): boolean {
    return this.rows.some(
      (row) => row.status === DocumentUploadRowStatus.OUTCOME_UNKNOWN,
    );
  }

  get succeeded(): DocumentDetail[] {
    return this.rows
      .map((row) => row.result)
      .filter((item): item is DocumentDetail => !!item);
  }

  addFiles(files: FileList | File[]): void {
    this.addCandidates(Array.from(files).map((file) => uploadCandidate(file)));
  }

  addCandidates(incoming: DocumentUploadCandidate[]): void {
    const next = [...this.rows];
    for (const candidate of incoming) {
      if (this.mode === DocumentUploadMode.VERSION && next.length >= 1) break;
      next.push(this.createRow(candidate));
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
      PENDING_UPLOAD_STATUSES.includes(row.status) ||
      row.status === DocumentUploadRowStatus.FAILED
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

  setCategory(id: string, category: DocumentCategory | null): void {
    const row = this.rows.find((item) => item.id === id);
    if (!row || row.frozenCreate || row.frozenVersion) return;
    this.patch(id, { category });
  }

  setAiAccess(id: string, aiAccess: boolean): void {
    const row = this.rows.find((item) => item.id === id);
    if (!row || !this.canChangeAiAccess(row)) return;
    this.patch(id, { aiAccess });
  }

  setAllAiAccess(aiAccess: boolean): void {
    if (this.mode !== DocumentUploadMode.CREATE) return;
    this.aiAccessDefault = aiAccess;
    this.rows = this.rows.map((row) =>
      this.canChangeAiAccess(row) ? { ...row, aiAccess } : row,
    );
    this.emit();
  }

  canChangeAiAccess(row: DocumentUploadRow): boolean {
    return (
      this.mode === DocumentUploadMode.CREATE &&
      !row.frozenCreate &&
      !row.frozenVersion &&
      PENDING_UPLOAD_STATUSES.includes(row.status)
    );
  }

  resolveFolders(
    mapping: ReadonlyMap<string, string>,
    targetFolderId: string | null,
  ): void {
    this.rows = this.rows.map((row) =>
      row.frozenCreate || row.frozenVersion
        ? row
        : {
            ...row,
            folderId: row.relativeDirectoryPath
              ? (mapping.get(row.relativeDirectoryPath) ?? null)
              : targetFolderId,
          },
    );
    this.emit();
  }

  startReady(caseIds: string[], clientIds: string[]): void {
    const next = this.rows.map((row) => {
      if (row.status !== DocumentUploadRowStatus.READY) return row;
      return this.queueRow(row, caseIds, clientIds);
    });
    this.rows = next;
    this.pump();
    this.emit();
  }

  retryFailed(): void {
    this.rows = this.rows.map((row) => {
      if (row.status !== DocumentUploadRowStatus.FAILED || !row.idempotencyKey)
        return row;
      return {
        ...row,
        status: DocumentUploadRowStatus.QUEUED,
        errorText: null,
      };
    });
    this.pump();
    this.emit();
  }

  retryRow(id: string): void {
    const row = this.rows.find((item) => item.id === id);
    if (
      !row ||
      row.status !== DocumentUploadRowStatus.FAILED ||
      !row.idempotencyKey
    )
      return;
    this.patch(id, { status: DocumentUploadRowStatus.QUEUED, errorText: null });
    this.pump();
  }

  destroy(): void {
    for (const subscription of this.inflight.values()) {
      subscription.unsubscribe();
    }
    this.inflight.clear();
  }

  private createRow(candidate: DocumentUploadCandidate): DocumentUploadRow {
    const { file, relativePath, relativeDirectoryPath } = candidate;
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
      relativePath,
      relativeDirectoryPath,
      folderId: null,
      titleControl: control,
      category: null,
      aiAccess: this.mode === DocumentUploadMode.CREATE && this.aiAccessDefault,
      status: DocumentUploadRowStatus.READY,
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
    if (sizeError)
      return { status: DocumentUploadRowStatus.INVALID, errorText: sizeError };
    if (this.mode === DocumentUploadMode.CREATE) {
      const titleError = validateTitle(row.titleControl.value);
      if (titleError)
        return {
          status: DocumentUploadRowStatus.INVALID,
          errorText: titleError,
        };
    }
    return { status: DocumentUploadRowStatus.READY, errorText: null };
  }

  private queueRow(
    row: DocumentUploadRow,
    caseIds: string[],
    clientIds: string[],
  ): DocumentUploadRow {
    const validated = { ...row, ...this.validationPatch(row) };
    if (validated.status === DocumentUploadRowStatus.INVALID) return validated;
    if (this.mode === DocumentUploadMode.VERSION) {
      if (!this.documentId) {
        return {
          ...validated,
          status: DocumentUploadRowStatus.INVALID,
          errorText: "documents.upload.errorGeneric",
        };
      }
      return {
        ...validated,
        status: DocumentUploadRowStatus.QUEUED,
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
      folderId: row.folderId,
      title,
      category: row.category,
      caseIds: [...caseIds],
      clientIds: [...clientIds],
      aiAccess: row.aiAccess,
      originalFilename: row.file.name,
    };
    return {
      ...validated,
      status: DocumentUploadRowStatus.QUEUED,
      idempotencyKey: validated.idempotencyKey ?? newRowId(),
      frozenCreate: frozen,
      errorText: null,
    };
  }

  private pump(): void {
    const active = this.rows.filter(
      (row) =>
        row.status === DocumentUploadRowStatus.UPLOADING ||
        row.status === DocumentUploadRowStatus.PROCESSING,
    ).length;
    const slots = this.concurrency - active;
    if (slots <= 0) return;
    const queued = this.rows.filter(
      (row) => row.status === DocumentUploadRowStatus.QUEUED,
    );
    for (const row of queued.slice(0, slots)) {
      this.send(row.id);
    }
  }

  private send(id: string): void {
    if (this.inflight.has(id)) return;
    const row = this.rows.find((item) => item.id === id);
    if (
      !row ||
      row.status !== DocumentUploadRowStatus.QUEUED ||
      !row.idempotencyKey
    )
      return;

    this.patch(id, {
      status: DocumentUploadRowStatus.UPLOADING,
      loaded: 0,
      percent: null,
    });

    const request$ =
      this.mode === DocumentUploadMode.VERSION && row.frozenVersion
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
    if (frozen?.folderId) body.append("folderId", frozen.folderId);
    body.append("title", frozen?.title ?? row.titleControl.value.trim());
    const category = frozen?.category ?? row.category;
    if (category) body.append("category", category);
    for (const caseId of frozen?.caseIds ?? []) body.append("caseIds", caseId);
    for (const clientId of frozen?.clientIds ?? []) {
      body.append("clientIds", clientId);
    }
    // The API only honors text fields that arrive before the file part.
    body.append("aiAccess", String(frozen?.aiAccess ?? row.aiAccess));
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
        status: processing
          ? DocumentUploadRowStatus.PROCESSING
          : DocumentUploadRowStatus.UPLOADING,
      });
      return;
    }
    if (event.type === HttpEventType.Response) {
      this.inflight.delete(id);
      this.patch(id, {
        status: DocumentUploadRowStatus.SUCCEEDED,
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
      this.rows.find((row) => row.id === id)?.status ===
        DocumentUploadRowStatus.PROCESSING;
    this.patch(id, {
      status: unknown
        ? DocumentUploadRowStatus.OUTCOME_UNKNOWN
        : DocumentUploadRowStatus.FAILED,
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
