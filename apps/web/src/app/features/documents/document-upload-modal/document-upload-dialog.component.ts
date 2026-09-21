import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ReactiveFormsModule } from "@angular/forms";
import { HttpContext, HttpEvent } from "@angular/common/http";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideCheck,
  lucideChevronDown,
  lucideChevronRight,
  lucideTrash2,
  lucideUpload,
  lucideX,
} from "@ng-icons/lucide";
import {
  Observable,
  Subject,
  debounceTime,
  distinctUntilChanged,
  firstValueFrom,
} from "rxjs";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { DocumentDetail } from "@law/api-interfaces";
import {
  CasesApiClient,
  ClientsApiClient,
  DocumentsApiClient,
} from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmComboboxChip,
  HlmComboboxChipInput,
  HlmComboboxChips,
  HlmComboboxContent,
  HlmComboboxEmpty,
  HlmComboboxItem,
  HlmComboboxList,
  HlmComboboxMultiple,
  HlmComboboxPortal,
  HlmComboboxValues,
} from "@spartan-ng/helm/combobox";
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmField } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmProgressImports } from "@spartan-ng/helm/progress";
import {
  HlmTable,
  HlmTableContainer,
  HlmTBody,
  HlmTd,
  HlmTh,
  HlmTHead,
  HlmTr,
} from "@spartan-ng/helm/table";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { SKIP_GLOBAL_ERROR_TOAST } from "../../../core/http/api-error.interceptor";
import { LocalizationService } from "../../../core/localization/localization.service";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { ConfirmDialogService } from "../../../shared/ui/confirm-dialog/confirm-dialog.service";
import {
  DocumentUploadDialogContext,
  DocumentUploadDialogResult,
} from "./document-upload-dialog.models";
import {
  DOCUMENT_FILE_ACCEPT,
  DOCUMENT_UPLOAD_MAX_BYTES,
  DocumentUploadAssociation,
  DocumentUploadRow,
} from "./document-upload.models";
import { DocumentUploadQueue } from "./document-upload.queue";
import { formatFileSize } from "./document-upload.utils";

@Component({
  selector: "app-document-upload-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./document-upload-dialog.component.html",
  imports: [
    ReactiveFormsModule,
    NgIcon,
    HlmButton,
    HlmComboboxChip,
    HlmComboboxChipInput,
    HlmComboboxChips,
    HlmComboboxContent,
    HlmComboboxEmpty,
    HlmComboboxItem,
    HlmComboboxList,
    HlmComboboxMultiple,
    HlmComboboxPortal,
    HlmComboboxValues,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmField,
    HlmInput,
    HlmProgressImports,
    HlmTable,
    HlmTableContainer,
    HlmTBody,
    HlmTd,
    HlmTh,
    HlmTHead,
    HlmTr,
    HlmTooltip,
    TranslatePipe,
  ],
  providers: [
    provideIcons({
      lucideCheck,
      lucideChevronDown,
      lucideChevronRight,
      lucideTrash2,
      lucideUpload,
      lucideX,
    }),
  ],
})
export class DocumentUploadDialogComponent {
  private readonly context =
    injectBrnDialogContext<DocumentUploadDialogContext>();
  private readonly dialogRef = inject(BrnDialogRef<DocumentUploadDialogResult>);
  private readonly documentsApi = inject(DocumentsApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly localization = inject(LocalizationService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);

  readonly accept = DOCUMENT_FILE_ACCEPT;
  readonly maxBytes = DOCUMENT_UPLOAD_MAX_BYTES;
  readonly mode = this.context.mode ?? "create";
  readonly versionMode = this.mode === "version";
  readonly lockedCase = this.context.lockCase
    ? { id: this.context.caseId ?? "", label: this.context.caseLabel ?? "" }
    : null;
  readonly lockedClient = this.context.lockClient
    ? {
        id: this.context.clientId ?? "",
        label: this.context.clientLabel ?? "",
      }
    : null;
  readonly allowAssociationPickers =
    this.mode === "create" && !this.lockedCase && !this.lockedClient;

  readonly dragging = signal(false);
  readonly caseOptions = signal<DocumentUploadAssociation[]>([]);
  readonly clientOptions = signal<DocumentUploadAssociation[]>([]);
  readonly selectedCaseIds = signal<string[]>(
    this.context.caseId ? [this.context.caseId] : [],
  );
  readonly selectedClientIds = signal<string[]>(
    this.context.clientId ? [this.context.clientId] : [],
  );
  readonly rows = signal<DocumentUploadRow[]>([]);
  private readonly caseSearch = new Subject<string>();
  private readonly clientSearch = new Subject<string>();

  private readonly queue = new DocumentUploadQueue(
    {
      create: (body, key) => this.createUpload(body, key),
      addVersion: (documentId, body, key) =>
        this.versionUpload(documentId, body, key),
    },
    this.mode,
    this.context.documentId,
    this.maxBytes,
    undefined,
    () => this.rows.set([...this.queue.rows]),
  );

  readonly readyCount = computed(
    () => this.rows().filter((row) => row.status === "ready").length,
  );
  readonly invalidCount = computed(
    () => this.rows().filter((row) => row.status === "invalid").length,
  );
  readonly failedCount = computed(
    () => this.rows().filter((row) => row.status === "failed").length,
  );
  readonly succeededCount = computed(
    () => this.rows().filter((row) => row.status === "succeeded").length,
  );
  readonly selectedBytes = computed(() =>
    this.rows()
      .filter((row) => row.status === "ready" || row.status === "invalid")
      .reduce((sum, row) => sum + row.file.size, 0),
  );
  readonly busy = computed(() =>
    this.rows().some((row) =>
      ["queued", "uploading", "processing"].includes(row.status),
    ),
  );
  readonly hasUnknown = computed(() =>
    this.rows().some((row) => row.status === "outcome_unknown"),
  );
  readonly allDone = computed(() => {
    const rows = this.rows();
    const finished = rows.filter((row) =>
      ["succeeded", "failed", "outcome_unknown"].includes(row.status),
    );
    return (
      finished.length > 0 &&
      !this.busy() &&
      !rows.some((row) => row.status === "ready" || row.status === "queued")
    );
  });

  readonly caseItemToString = (value: string | null | undefined): string =>
    this.caseOptions().find((item) => item.id === value)?.label ?? value ?? "";
  readonly clientItemToString = (value: string | null | undefined): string =>
    this.clientOptions().find((item) => item.id === value)?.label ??
    value ??
    "";

  constructor() {
    this.destroyRef.onDestroy(() => this.queue.destroy());
    if (this.allowAssociationPickers) {
      this.searchCases("");
      this.searchClients("");
      this.caseSearch
        .pipe(
          debounceTime(250),
          distinctUntilChanged(),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((term) => this.searchCases(term));
      this.clientSearch
        .pipe(
          debounceTime(250),
          distinctUntilChanged(),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((term) => this.searchClients(term));
    }
  }

  @HostListener("window:beforeunload", ["$event"])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.busy() || this.hasUnknown()) {
      event.preventDefault();
    }
  }

  formatSize = formatFileSize;

  onCaseSearch(event: Event): void {
    this.caseSearch.next((event.target as HTMLInputElement).value);
  }

  onClientSearch(event: Event): void {
    this.clientSearch.next((event.target as HTMLInputElement).value);
  }

  setCaseIds(ids: string[]): void {
    this.selectedCaseIds.set(ids);
  }

  setClientIds(ids: string[]): void {
    this.selectedClientIds.set(ids);
  }

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) this.queue.addFiles(input.files);
    input.value = "";
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (event.dataTransfer?.files.length) {
      this.queue.addFiles(event.dataTransfer.files);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave(): void {
    this.dragging.set(false);
  }

  toggleExpanded(id: string): void {
    this.queue.toggleExpanded(id);
  }

  remove(id: string): void {
    this.queue.remove(id);
  }

  canRemove(row: DocumentUploadRow): boolean {
    return this.queue.canRemove(row);
  }

  canEditTitle(row: DocumentUploadRow): boolean {
    return (
      this.mode === "create" &&
      (row.status === "ready" || row.status === "invalid") &&
      !row.frozenCreate
    );
  }

  onTitleChange(id: string): void {
    this.queue.revalidate(id);
  }

  startUpload(): void {
    if (this.busy()) return;
    this.queue.startReady(this.effectiveCaseIds(), this.effectiveClientIds());
  }

  retryFailed(): void {
    this.queue.retryFailed();
  }

  retryRow(id: string): void {
    this.queue.retryRow(id);
  }

  statusLabel(row: DocumentUploadRow): string {
    switch (row.status) {
      case "ready":
        return this.t("documents.upload.statusReady");
      case "invalid":
        return this.t("documents.upload.statusInvalid");
      case "queued":
        return this.t("documents.upload.statusQueued");
      case "uploading":
        return row.percent != null
          ? this.t("documents.upload.statusUploadingPercent", {
              percent: row.percent,
            })
          : this.t("documents.upload.statusUploading");
      case "processing":
        return this.t("documents.upload.statusProcessing");
      case "succeeded":
        return this.t("documents.upload.statusUploaded");
      case "failed":
        return this.t("documents.upload.statusFailed");
      case "outcome_unknown":
        return this.t("documents.upload.statusUnknown");
    }
  }

  errorLabel(row: DocumentUploadRow): string {
    if (!row.errorText) return "";
    if (row.errorText.startsWith("documents.")) {
      return this.t(row.errorText);
    }
    return row.errorText;
  }

  async requestClose(): Promise<void> {
    if (this.busy() || this.hasUnknown()) return;
    const unsent = this.rows().some(
      (row) => row.status === "ready" || row.status === "invalid",
    );
    if (unsent) {
      const confirmed = await firstValueFrom(
        this.confirm.confirm({
          title: this.t("documents.upload.discardTitle"),
          message: this.t("documents.upload.discardMessage"),
          confirmText: this.t("documents.upload.discardConfirm"),
          cancelText: this.t("common.cancel"),
          variant: "warning",
        }),
      );
      if (!confirmed) return;
    }
    this.dialogRef.close({ documents: this.queue.succeeded });
  }

  private effectiveCaseIds(): string[] {
    if (this.lockedCase?.id) return [this.lockedCase.id];
    return this.selectedCaseIds();
  }

  private effectiveClientIds(): string[] {
    if (this.lockedClient?.id) return [this.lockedClient.id];
    return this.selectedClientIds();
  }

  private searchCases(term: string): void {
    this.casesApi
      .list({ search: term || undefined, pageSize: 20, page: 1 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) =>
          this.caseOptions.set(
            response.items.map((item) => ({
              id: item.id,
              label: `${item.caseNumber} ${item.name}`.trim(),
            })),
          ),
      });
  }

  private searchClients(term: string): void {
    this.clientsApi
      .list({ search: term || undefined, pageSize: 20, page: 1 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) =>
          this.clientOptions.set(
            response.items.map((item) => ({
              id: item.id,
              label: item.displayName,
            })),
          ),
      });
  }

  private createUpload(
    body: FormData,
    idempotencyKey: string,
  ): Observable<HttpEvent<DocumentDetail>> {
    return this.documentsApi.create(body, idempotencyKey, {
      context: new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true),
    });
  }

  private versionUpload(
    documentId: string,
    body: FormData,
    idempotencyKey: string,
  ): Observable<HttpEvent<DocumentDetail>> {
    return this.documentsApi.addVersion(documentId, body, idempotencyKey, {
      context: new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true),
    });
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.localization.translate(key, params);
  }
}
