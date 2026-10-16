import { formatFileSize } from "./document-upload-modal/document-upload.utils";
import {
  DOCUMENT_TITLE_MAX,
  DocumentUploadMode,
} from "./document-upload-modal/document-upload.models";
import {
  catchError,
  concatMap,
  forkJoin,
  from,
  map,
  Observable,
  of,
  finalize,
  Subscription,
  toArray,
} from "rxjs";
import { NgTemplateOutlet } from "@angular/common";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import {
  DocumentMoveDialogComponent,
  DocumentMoveContext,
} from "./document-move-dialog.component";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import {
  Component,
  DestroyRef,
  computed,
  effect,
  OnInit,
  inject,
  input,
  output,
  signal,
  viewChild,
  ElementRef,
  Injector,
  afterNextRender,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideFolder,
  lucideFile,
  lucideFileType,
  lucideFileSpreadsheet,
  lucideImage,
  lucideArchive,
  lucideArrowDownToLine,
  lucideCheck,
  lucideEyeOff,
  lucideFileText,
  lucideGrid2x2,
  lucideInfo,
  lucideLink2,
  lucideList,
  lucideMoreHorizontal,
  lucideRefreshCw,
  lucideSearch,
  lucideSparkles,
  lucideUpload,
  lucideX,
  lucidePencil,
  lucideFolderInput,
} from "@ng-icons/lucide";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmCombobox,
  HlmComboboxContent,
  HlmComboboxEmpty,
  HlmComboboxInput,
  HlmComboboxItem,
  HlmComboboxList,
  HlmComboboxMultiple,
  HlmComboboxPortal,
  HlmComboboxTrigger,
  HlmComboboxValue,
} from "@spartan-ng/helm/combobox";
import {
  HlmEmpty,
  HlmEmptyContent,
  HlmEmptyDescription,
  HlmEmptyHeader,
  HlmEmptyTitle,
} from "@spartan-ng/helm/empty";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmLabel } from "@spartan-ng/helm/label";
import { PaginationComponent } from "../../shared/ui/pagination/pagination.component";
import { PageState, FIRST_PAGE } from "../../shared/pagination/paginated-list";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmSwitch } from "@spartan-ng/helm/switch";
import {
  HlmTable,
  HlmTableContainer,
  HlmTBody,
  HlmTd,
  HlmTh,
  HlmTHead,
  HlmTr,
} from "@spartan-ng/helm/table";
import {
  CasesApiClient,
  ClientsApiClient,
  DocumentsApiClient,
} from "@law/api-clients";
import {
  DocumentAiStatus,
  DocumentArchivedFilter,
  DocumentCategory,
  DocumentDetail,
  DocumentListView,
  DocumentSummary,
  DocumentFolderSummary,
  DocumentStatistics,
  DocumentListQuery,
  DocumentVersionSummary,
  isDocumentCategory,
} from "@law/api-interfaces";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ComboboxSelectAllComponent } from "../../shared/ui/combobox-select-all/combobox-select-all.component";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { DocumentUploadDialogService } from "./document-upload-modal/document-upload-dialog.service";
import { DocumentAssociationsDialogService } from "./document-associations/document-associations-dialog.service";
import { DocumentAiStatusComponent } from "../../shared/components/document-ai-status/document-ai-status.component";
import {
  ALL_OPTION_VALUE,
  AllOptionValue,
  createSelectItemToString,
  DOCUMENT_AI_IN_PROGRESS_STATUSES,
  DOCUMENT_AI_STATUS_LABELS,
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_KIND_LABELS,
  filterOptionsFrom,
  LabelMap,
  labelOf,
  OFFICE_TIME_ZONE,
  optionsFrom,
} from "../../shared/models";

export const DocumentsViewMode = {
  LIST: "list",
  GRID: "grid",
} as const;
export type DocumentsViewMode =
  (typeof DocumentsViewMode)[keyof typeof DocumentsViewMode];

export const DocumentsTab = {
  ALL: "all",
  RECENT: "recent",
  NEEDS_LINKING: "needs-linking",
  ARCHIVED: "archived",
} as const;
export type DocumentsTab = (typeof DocumentsTab)[keyof typeof DocumentsTab];

export const DocumentSelectionKind = {
  FILE: "file",
  FOLDER: "folder",
} as const;
export type DocumentSelectionKind =
  (typeof DocumentSelectionKind)[keyof typeof DocumentSelectionKind];

export interface DocumentSelection {
  id: string;
  kind: DocumentSelectionKind;
}

const DOCUMENTS_TAB_LABELS: LabelMap<DocumentsTab> = {
  [DocumentsTab.ALL]: "documents.tabs.all",
  [DocumentsTab.RECENT]: "documents.tabs.recent",
  [DocumentsTab.NEEDS_LINKING]: "documents.tabs.needsLinking",
  [DocumentsTab.ARCHIVED]: "documents.tabs.archived",
};

/** List `view` sent for each tab; tabs without one list every document. */
const TAB_VIEWS: Partial<Record<DocumentsTab, DocumentListQuery["view"]>> = {
  [DocumentsTab.RECENT]: DocumentListView.RECENT,
  [DocumentsTab.NEEDS_LINKING]: DocumentListView.NEEDS_LINKING,
};

/** `folderId` value that lists only files directly in the root. */
const ROOT_FOLDER_ID = "root";
const FOLDER_NAME_MAX = 255;

const AI_POLL_INTERVAL_MS = 5000;
/**
 * Polls in a row that changed nothing before polling gives up (10 minutes).
 * Something that stuck cannot finish by itself; a reload or an AI action on
 * the document starts polling again.
 */
const AI_POLL_MAX_IDLE = 120;

const isAiInProgress = (status: DocumentAiStatus | undefined): boolean =>
  !!status && DOCUMENT_AI_IN_PROGRESS_STATUSES.includes(status);

/** In progress and not yet offered a manual retry: worth watching. */
const isAiWatched = (
  item:
    | { aiStatus?: DocumentAiStatus; aiRetryable?: boolean }
    | null
    | undefined,
): boolean => isAiInProgress(item?.aiStatus) && !item?.aiRetryable;

@Component({
  selector: "law-documents",
  standalone: true,
  templateUrl: "./documents.component.html",
  host: { class: "block h-full min-h-0 min-w-0" },
  imports: [
    ReactiveFormsModule,
    NgTemplateOutlet,
    NgIcon,
    HlmButton,
    HlmCombobox,
    HlmComboboxContent,
    HlmComboboxEmpty,
    HlmComboboxInput,
    HlmComboboxItem,
    HlmComboboxList,
    HlmComboboxMultiple,
    HlmComboboxPortal,
    HlmComboboxTrigger,
    HlmComboboxValue,
    HlmTooltip,
    HlmEmpty,
    HlmEmptyContent,
    HlmEmptyDescription,
    HlmEmptyHeader,
    HlmInput,
    HlmLabel,
    PaginationComponent,
    HlmSelectImports,
    HlmSpinner,
    HlmSwitch,
    HlmTable,
    HlmTableContainer,
    HlmTBody,
    HlmTd,
    HlmTh,
    HlmTHead,
    HlmTr,
    HlmEmptyTitle,
    DocumentAiStatusComponent,
    TranslatePipe,
    ComboboxSelectAllComponent,
  ],
  providers: [
    provideIcons({
      lucideFolder,
      lucideFile,
      lucideFileType,
      lucideFileSpreadsheet,
      lucideImage,
      lucideArchive,
      lucideArrowDownToLine,
      lucideCheck,
      lucideEyeOff,
      lucideFileText,
      lucideGrid2x2,
      lucideInfo,
      lucideLink2,
      lucideList,
      lucideMoreHorizontal,
      lucideRefreshCw,
      lucideSearch,
      lucideSparkles,
      lucideUpload,
      lucideX,
      lucidePencil,
      lucideFolderInput,
    }),
  ],
})
export class DocumentsComponent implements OnInit {
  private readonly uploadDialog = inject(DocumentUploadDialogService);
  private readonly associationsDialog = inject(
    DocumentAssociationsDialogService,
  );
  private readonly documentsApi = inject(DocumentsApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly localization = inject(LocalizationService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(HlmDialogService);
  private readonly injector = inject(Injector);
  readonly renameInput = viewChild<ElementRef<HTMLInputElement>>("renameInput");

  readonly Tab = DocumentsTab;
  readonly ViewMode = DocumentsViewMode;
  readonly Kind = DocumentSelectionKind;
  readonly aiStatusLabels = DOCUMENT_AI_STATUS_LABELS;
  readonly documentKindLabels = DOCUMENT_KIND_LABELS;
  readonly embedded = input(false);
  readonly fixedCaseId = input<string>();
  readonly fixedClientId = input<string>();
  readonly documentsChanged = output<void>();
  readonly searchControl = new FormControl("", { nonNullable: true });
  readonly selectedTab = signal<DocumentsTab>(DocumentsTab.ALL);
  readonly viewMode = signal<DocumentsViewMode>(DocumentsViewMode.LIST);
  readonly selectedCaseIds = signal<string[]>([]);
  readonly selectedClientId = new FormControl("", { nonNullable: true });
  readonly selectedCategory = new FormControl<
    DocumentCategory | AllOptionValue
  >(ALL_OPTION_VALUE, { nonNullable: true });
  readonly currentFolderId = signal<string | null>(null);
  readonly folders = signal<DocumentFolderSummary[]>([]);
  readonly selection = signal<DocumentSelection[]>([]);
  private selectionAnchor: string | null = null;
  readonly bulkPending = signal(false);
  readonly bulkError = signal(false);
  readonly renaming = signal<DocumentSelection | null>(null);
  readonly renameControl = new FormControl("", { nonNullable: true });
  readonly renamePending = signal(false);
  readonly renameError = signal(false);
  readonly breadcrumbs = signal<DocumentFolderSummary[]>([]);
  readonly stats = signal<DocumentStatistics | null>(null);
  private listSubscription?: Subscription;
  private pollSubscription?: Subscription;
  private pollInFlight = false;
  /** Bumped when an AI mutation starts and ends; older poll responses are dropped. */
  private aiMutationGeneration = 0;
  private aiConfirmPending = false;
  /** Statuses seen by the last poll, to tell whether a poll changed anything. */
  private lastAiSignature: string | null = null;
  private idleAiPolls = 0;
  private readonly aiPollingExhausted = signal(false);
  readonly documents = signal<DocumentSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly pagination = new PageState({
    loading: this.loading,
    onChange: () => this.load(),
  });
  readonly caseOptions = signal<Array<{ id: string; label: string }>>([]);
  readonly clientOptions = signal<Array<{ id: string; label: string }>>([]);
  readonly detailDocument = signal<DocumentDetail | null>(null);
  readonly detailVersions = signal<DocumentVersionSummary[]>([]);
  readonly detailLoading = signal(false);
  readonly detailOpen = signal(false);
  readonly detailEditing = signal(false);
  readonly aiPending = signal(false);
  readonly aiAccessControl = new FormControl(false, { nonNullable: true });
  private readonly aiPollingNeeded = computed(
    () =>
      !this.aiPollingExhausted() &&
      (this.documents().some(isAiWatched) ||
        isAiWatched(this.detailDocument())),
  );
  readonly detailForm = new FormGroup({
    title: new FormControl("", { nonNullable: true }),
    category: new FormControl<DocumentCategory | AllOptionValue>(
      ALL_OPTION_VALUE,
      { nonNullable: true },
    ),
    caseIds: new FormControl<string[]>([], { nonNullable: true }),
    clientIds: new FormControl<string[]>([], { nonNullable: true }),
  });

  readonly tabOptions = optionsFrom(DOCUMENTS_TAB_LABELS);

  readonly tabItemToString = createSelectItemToString(this.tabOptions, (key) =>
    this.localization.translate(key),
  );

  readonly categoryOptions = filterOptionsFrom(
    DOCUMENT_CATEGORY_LABELS,
    "documents.filters.allCategories",
  );

  readonly categoryItemToString = createSelectItemToString(
    this.categoryOptions,
    (key) => this.localization.translate(key),
  );
  readonly caseItemToString = (value: string | null | undefined): string => {
    const option = this.caseOptions().find((item) => item.id === value);
    return (
      option?.label ??
      value ??
      this.localization.translate("documents.filters.allCases")
    );
  };
  readonly clientItemToString = (value: string | null | undefined): string => {
    const option = this.clientOptions().find((item) => item.id === value);
    return (
      option?.label ??
      value ??
      this.localization.translate("documents.filters.allClients")
    );
  };

  constructor() {
    this.searchControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.resetPageAndLoad());

    this.selectedClientId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.resetPageAndLoad());

    this.selectedCategory.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.resetPageAndLoad());

    this.aiAccessControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.toggleDetailAi(value));

    effect((onCleanup) => {
      if (!this.aiPollingNeeded()) return;
      const handle = setInterval(
        () => this.refreshAiStatus(),
        AI_POLL_INTERVAL_MS,
      );
      onCleanup(() => clearInterval(handle));
    });
  }

  ngOnInit(): void {
    this.loadReferenceData();
    this.load();
  }

  isNeedsLinking(document: DocumentSummary): boolean {
    return !document.cases.length && !document.clients.length;
  }

  showCaseFilter(): boolean {
    return !this.fixedCaseId();
  }

  showClientFilter(): boolean {
    return !this.fixedCaseId() && !this.fixedClientId();
  }

  openUpload(): void {
    this.uploadDialog
      .open({
        targetFolderId: this.currentFolderId(),
        caseId: this.fixedCaseId(),
        caseLabel: this.caseOptions().find(
          (option) => option.id === this.fixedCaseId(),
        )?.label,
        clientId: this.fixedClientId(),
        clientLabel: this.clientOptions().find(
          (option) => option.id === this.fixedClientId(),
        )?.label,
        lockCase: !!this.fixedCaseId(),
        lockClient: !!this.fixedClientId(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        this.load();
        if (result?.documents.length) this.documentsChanged.emit();
      });
  }

  openAssociations(document: DocumentSummary): void {
    this.associationsDialog
      .open({
        documentId: document.id,
        documentTitle: this.documentTitle(document),
        caseOptions: document.cases.map((item) => ({
          id: item.id,
          label: `${item.caseNumber} — ${item.name}`,
        })),
        clientOptions: document.clients.map((item) => ({
          id: item.id,
          label: item.displayName,
        })),
        fixedCaseId: this.fixedCaseId(),
        fixedClientId: this.fixedClientId(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (!result) return;
        this.toast.success(this.localization.translate("documents.saved"));
        this.load();
        this.documentsChanged.emit();
      });
  }

  openFolder(id: string | null): void {
    this.currentFolderId.set(id);
    this.pagination.page.set(1);
    this.load();
  }

  visibleItems(): DocumentSelection[] {
    return [
      ...this.folders().map(({ id }) => ({
        id,
        kind: DocumentSelectionKind.FOLDER,
      })),
      ...this.documents().map(({ id }) => ({
        id,
        kind: DocumentSelectionKind.FILE,
      })),
    ];
  }

  isSelected(id: string): boolean {
    return this.selection().some((item) => item.id === id);
  }

  selectItem(
    item: DocumentSelection,
    event: Pick<MouseEvent, "ctrlKey" | "metaKey" | "shiftKey">,
    toggle = false,
  ): void {
    if (this.bulkPending() || this.renamePending()) return;
    const items = this.visibleItems();
    const anchor = items.findIndex(({ id }) => id === this.selectionAnchor);
    const index = items.findIndex(({ id }) => id === item.id);
    if (event.shiftKey && anchor >= 0 && index >= 0) {
      const range = items.slice(
        Math.min(anchor, index),
        Math.max(anchor, index) + 1,
      );
      this.selection.set(
        event.ctrlKey || event.metaKey
          ? [
              ...this.selection().filter(
                (selected) => !range.some(({ id }) => id === selected.id),
              ),
              ...range,
            ]
          : range,
      );
    } else if (toggle || event.ctrlKey || event.metaKey) {
      this.selection.set(
        this.isSelected(item.id)
          ? this.selection().filter(({ id }) => id !== item.id)
          : [...this.selection(), item],
      );
      this.selectionAnchor = item.id;
    } else {
      this.selection.set([item]);
      this.selectionAnchor = item.id;
    }
  }

  selectionCount(kind: DocumentSelectionKind): number {
    return this.selection().filter((item) => item.kind === kind).length;
  }

  clearSelection(): void {
    if (this.bulkPending()) return;
    this.selection.set([]);
    this.selectionAnchor = null;
  }

  toggleAll(): void {
    if (this.bulkPending()) return;
    this.selection.set(
      this.selection().length === this.visibleItems().length
        ? []
        : this.visibleItems(),
    );
  }

  rowKey(event: KeyboardEvent, item: DocumentSelection): void {
    if (event.target !== event.currentTarget) return;
    if (event.key === " ") {
      event.preventDefault();
      this.selectItem(item, event, true);
    } else if (event.key === "Enter") {
      event.preventDefault();
      this.openItem(item);
    } else if (event.key === "F2") {
      event.preventDefault();
      this.startRename(item);
    }
  }

  openItem(item: DocumentSelection): void {
    if (this.bulkPending() || this.renamePending()) return;
    if (item.kind === DocumentSelectionKind.FOLDER) this.openFolder(item.id);
    else {
      const document = this.documents().find(({ id }) => id === item.id);
      if (document) this.openDocumentDetail(document);
    }
  }

  itemNameText(item: DocumentSelection): string {
    return item.kind === DocumentSelectionKind.FOLDER
      ? (this.folders().find(({ id }) => id === item.id)?.name ?? "")
      : (this.documents().find(({ id }) => id === item.id)?.title ?? "");
  }

  startRename(item: DocumentSelection): void {
    if (
      this.bulkPending() ||
      this.renamePending() ||
      this.selectedTab() === DocumentsTab.ARCHIVED
    )
      return;
    this.renaming.set(item);
    this.renameControl.setValue(this.itemNameText(item));
    this.renameError.set(false);
    afterNextRender(
      () => {
        this.renameInput()?.nativeElement.focus();
        this.renameInput()?.nativeElement.select();
      },
      { injector: this.injector },
    );
  }

  cancelRename(): void {
    if (!this.renamePending()) {
      this.renaming.set(null);
      this.renameError.set(false);
    }
  }

  saveRename(): void {
    const item = this.renaming();
    const name = this.renameControl.value.trim();
    if (!item || this.renamePending()) return;
    const isFolder = item.kind === DocumentSelectionKind.FOLDER;
    if (
      !name ||
      name.length > (isFolder ? FOLDER_NAME_MAX : DOCUMENT_TITLE_MAX)
    ) {
      this.renameError.set(true);
      return;
    }
    this.renamePending.set(true);
    this.renameError.set(false);
    const request: Observable<DocumentFolderSummary | DocumentDetail> = isFolder
      ? this.documentsApi.updateFolder(item.id, { name })
      : this.documentsApi.update(item.id, { title: name });
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        if ("name" in saved)
          this.folders.update((rows) =>
            rows.map((row) => (row.id === item.id ? saved : row)),
          );
        else {
          this.documents.update((rows) =>
            rows.map((row) => (row.id === item.id ? saved : row)),
          );
          if (this.detailDocument()?.id === saved.id) {
            this.detailDocument.set(saved);
            this.syncDetailForm(saved);
          }
        }
        this.renamePending.set(false);
        this.renaming.set(null);
        this.documentsChanged.emit();
      },
      error: () => {
        this.renamePending.set(false);
        this.renameError.set(true);
      },
    });
  }

  moveSelected(): void {
    if (!this.selection().length || this.bulkPending() || this.renamePending())
      return;
    this.dialog
      .open<{ folderId: string | null }, DocumentMoveContext>(
        DocumentMoveDialogComponent,
        {
          context: {
            excludedFolderIds: this.selection()
              .filter(({ kind }) => kind === DocumentSelectionKind.FOLDER)
              .map(({ id }) => id),
            sourceFolderId: this.currentFolderId(),
          },
          contentClass: "sm:max-w-lg",
          showCloseButton: false,
        },
      )
      .closed$.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result)
          this.runBulk((item) =>
            item.kind === DocumentSelectionKind.FOLDER
              ? this.documentsApi.updateFolder(item.id, {
                  parentId: result.folderId,
                })
              : this.documentsApi.update(item.id, {
                  folderId: result.folderId,
                }),
          );
      });
  }

  archiveSelected(): void {
    if (!this.selection().length || this.bulkPending() || this.renamePending())
      return;
    this.bulkPending.set(true);
    this.confirmDialog
      .confirm({
        title: this.localization.translate("documents.archiveTitle"),
        message: this.localization.translate("documents.bulk.archiveMessage", {
          files: this.selectionCount(DocumentSelectionKind.FILE),
          folders: this.selectionCount(DocumentSelectionKind.FOLDER),
        }),
        confirmText: this.localization.translate("documents.archiveConfirm"),
        cancelText: this.localization.translate("common.cancel"),
        variant: "warning",
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        this.bulkPending.set(false);
        if (confirmed)
          this.runBulk((item) =>
            item.kind === DocumentSelectionKind.FOLDER
              ? this.documentsApi.archiveFolder(item.id)
              : this.documentsApi.archive(item.id),
          );
      });
  }

  restoreSelected(): void {
    this.runBulk((item) =>
      item.kind === DocumentSelectionKind.FOLDER
        ? this.documentsApi.restoreFolder(item.id)
        : this.documentsApi.restore(item.id),
    );
  }

  runBulk(action: (item: DocumentSelection) => Observable<unknown>): void {
    if (!this.selection().length || this.bulkPending() || this.renamePending())
      return;
    const selected = [...this.selection()];
    this.bulkPending.set(true);
    this.bulkError.set(false);
    from(selected)
      .pipe(
        concatMap((item) =>
          action(item).pipe(
            map(() => ({ item, success: true })),
            catchError(() => of({ item, success: false })),
          ),
        ),
        toArray(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => {
        const failed = results
          .filter(({ success }) => !success)
          .map(({ item }) => item);
        this.selection.set(failed);
        this.bulkPending.set(false);
        this.bulkError.set(failed.length > 0);
        if (results.some(({ success }) => success)) {
          this.load(true);
          this.closeDetail();
          this.documentsChanged.emit();
        }
        if (failed.length)
          this.toast.error(
            this.localization.translate("documents.bulk.error", {
              count: failed.length,
            }),
          );
        else this.toast.success(this.localization.translate("documents.saved"));
      });
  }

  private selectedFileIds(): string[] {
    return this.selection()
      .filter(({ kind }) => kind === DocumentSelectionKind.FILE)
      .map(({ id }) => id);
  }

  enableAiSelected(): void {
    this.runBulkAi(true);
  }

  disableAiSelected(): void {
    if (
      !this.selectedFileIds().length ||
      this.bulkPending() ||
      this.renamePending()
    )
      return;
    this.bulkPending.set(true);
    this.confirmDialog
      .confirm({
        title: this.localization.translate("documents.ai.disableSelected"),
        message: this.localization.translate("documents.ai.confirmDisable"),
        confirmText: this.localization.translate(
          "documents.ai.disableSelected",
        ),
        cancelText: this.localization.translate("common.cancel"),
        variant: "warning",
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        this.bulkPending.set(false);
        if (confirmed) this.runBulkAi(false);
      });
  }

  private runBulkAi(aiAccess: boolean): void {
    const documentIds = this.selectedFileIds();
    if (!documentIds.length || this.bulkPending() || this.renamePending())
      return;
    this.bulkPending.set(true);
    this.bulkError.set(false);
    this.beginAiMutation();
    this.documentsApi
      .setAiAccessBulk({ documentIds, aiAccess })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ updated }) => {
          this.aiMutationGeneration++;
          this.bulkPending.set(false);
          this.toast.success(
            this.localization.translate("documents.ai.bulkUpdated", {
              count: updated,
            }),
          );
          this.load(true);
          const openId = this.detailDocument()?.id;
          if (openId && documentIds.includes(openId)) this.reloadDetail(openId);
        },
        error: () => {
          this.aiMutationGeneration++;
          this.bulkPending.set(false);
          this.toast.error(this.localization.translate("documents.saveError"));
        },
      });
  }

  /** Cancels any in-flight poll so a stale response cannot overwrite the mutation result. */
  private beginAiMutation(): void {
    this.resumeAiPolling();
    this.aiMutationGeneration++;
    this.pollSubscription?.unsubscribe();
    this.pollInFlight = false;
  }

  toggleDetailAi(value: boolean): void {
    const document = this.detailDocument();
    if (!document || this.aiPending() || document.aiAccess === value) return;
    if (value) {
      this.applyDetailAi(this.documentsApi.setAiAccess(document.id, true));
      return;
    }
    this.aiConfirmPending = true;
    this.confirmDialog
      .confirm({
        title: this.localization.translate("documents.ai.access"),
        message: this.localization.translate("documents.ai.confirmDisable"),
        confirmText: this.localization.translate(
          "documents.ai.disableSelected",
        ),
        cancelText: this.localization.translate("common.cancel"),
        variant: "warning",
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        this.aiConfirmPending = false;
        if (confirmed)
          this.applyDetailAi(this.documentsApi.setAiAccess(document.id, false));
        else this.aiAccessControl.setValue(true, { emitEvent: false });
      });
  }

  reprocessDetailAi(): void {
    const document = this.detailDocument();
    if (!document?.aiRetryable || this.aiPending()) return;
    this.applyDetailAi(this.documentsApi.reprocessAi(document.id));
  }

  private applyDetailAi(request: Observable<DocumentDetail>): void {
    const previous = this.detailDocument();
    this.aiPending.set(true);
    this.aiAccessControl.disable({ emitEvent: false });
    this.beginAiMutation();
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => {
        this.aiMutationGeneration++;
        this.documents.update((rows) =>
          rows.map((row) => (row.id === updated.id ? updated : row)),
        );
        if (this.detailDocument()?.id === updated.id) {
          this.detailDocument.set(updated);
          this.aiAccessControl.setValue(updated.aiAccess, { emitEvent: false });
        }
        this.aiPending.set(false);
        this.aiAccessControl.enable({ emitEvent: false });
      },
      error: () => {
        this.aiMutationGeneration++;
        this.aiPending.set(false);
        this.aiAccessControl.enable({ emitEvent: false });
        this.aiAccessControl.setValue(previous?.aiAccess ?? false, {
          emitEvent: false,
        });
        this.toast.error(this.localization.translate("documents.saveError"));
      },
    });
  }

  private reloadDetail(documentId: string): void {
    this.documentsApi
      .get(documentId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => this.applyPolledDetail(detail),
        error: () => undefined,
      });
  }

  private applyPolledDetail(detail: DocumentDetail): void {
    if (this.detailDocument()?.id !== detail.id) return;
    this.detailDocument.set(detail);
    if (!this.aiPending() && !this.aiConfirmPending)
      this.aiAccessControl.setValue(detail.aiAccess, { emitEvent: false });
  }

  private resumeAiPolling(): void {
    this.lastAiSignature = null;
    this.idleAiPolls = 0;
    this.aiPollingExhausted.set(false);
  }

  /** Counts a poll that changed nothing; past the cap, polling stops. */
  private trackAiPoll(
    items: ReadonlyArray<DocumentSummary>,
    detail: DocumentDetail | null,
  ): void {
    const signature = [...items, ...(detail ? [detail] : [])]
      .map((item) => `${item.id}:${item.aiStatus}:${item.aiRetryable}`)
      .join("|");
    const changed =
      this.lastAiSignature !== null && this.lastAiSignature !== signature;
    this.lastAiSignature = signature;
    this.idleAiPolls = changed ? 0 : this.idleAiPolls + 1;
    if (this.idleAiPolls >= AI_POLL_MAX_IDLE) this.aiPollingExhausted.set(true);
  }

  /** Silent reload of the current page and the open detail (no spinner, no state reset). */
  private refreshAiStatus(): void {
    if (
      this.pollInFlight ||
      this.loading() ||
      this.aiPending() ||
      this.bulkPending() ||
      window.document.visibilityState === "hidden"
    )
      return;
    const generation = this.aiMutationGeneration;
    const query = this.buildListQuery(this.archivedFilter());
    const detailId = this.detailOpen() ? this.detailDocument()?.id : undefined;
    this.pollInFlight = true;
    this.pollSubscription = forkJoin({
      documents: this.documentsApi.list(query),
      detail: detailId
        ? this.documentsApi.get(detailId).pipe(catchError(() => of(null)))
        : of(null),
    })
      .pipe(
        finalize(() => (this.pollInFlight = false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ documents: response, detail }) => {
          if (generation !== this.aiMutationGeneration) return;
          this.trackAiPoll(response.items, detail);
          if (
            response.meta.page === this.pagination.page() &&
            query.pageSize === this.pagination.pageSize()
          ) {
            this.documents.set(response.items);
            this.pagination.applyPage(response.meta.page, response.meta);
          }
          if (detail) this.applyPolledDetail(detail);
        },
        // A failed poll is silent; the next tick retries.
        error: () => undefined,
      });
  }

  downloadSelected(): void {
    if (this.bulkPending()) return;
    for (const item of this.selection()) {
      if (item.kind === DocumentSelectionKind.FOLDER) {
        const link = window.document.createElement("a");
        link.href = this.documentsApi.folderDownloadUrl(item.id);
        link.download = "";
        link.click();
        continue;
      }
      const document = this.documents().find(({ id }) => id === item.id);
      if (document?.currentVersion) this.downloadDocument(document);
    }
  }

  canDownloadSelection(): boolean {
    return this.selection().some(
      (item) =>
        item.kind === DocumentSelectionKind.FOLDER ||
        this.documents().some(
          (document) => document.id === item.id && document.currentVersion,
        ),
    );
  }

  fileIcon(document: DocumentSummary): string {
    const mime = document.currentVersion?.mimeType ?? "";
    const filename =
      document.currentVersion?.originalFilename.toLowerCase() ?? "";
    if (mime.startsWith("image/") || /\.(png|jpe?g|webp)$/.test(filename))
      return "lucideImage";
    if (/sheet|excel/.test(mime) || /\.xlsx?$/.test(filename))
      return "lucideFileSpreadsheet";
    if (/word/.test(mime) || /\.docx?$/.test(filename)) return "lucideFileType";
    if (/pdf|text/.test(mime) || /\.(pdf|txt)$/.test(filename))
      return "lucideFileText";
    return "lucideFile";
  }

  linkedInfo(document: DocumentSummary): string {
    return [
      ...document.cases.map((item) => `${item.caseNumber} — ${item.name}`),
      ...document.clients.map((item) => item.displayName),
    ].join("; ");
  }

  onTabChange(value: string | null | undefined): void {
    const tab = this.tabOptions.find((option) => option.value === value);
    if (tab) this.selectTab(tab.value);
  }

  selectTab(tab: DocumentsTab): void {
    this.selectedTab.set(tab);
    this.pagination.page.set(1);
    this.load();
  }

  setViewMode(mode: DocumentsViewMode): void {
    this.viewMode.set(mode);
  }

  clearFilters(): void {
    this.searchControl.setValue("", { emitEvent: false });
    this.selectedCaseIds.set([]);
    this.selectedClientId.setValue("", { emitEvent: false });
    this.selectedCategory.setValue("", { emitEvent: false });
    this.pagination.page.set(1);
    this.load();
  }

  setSelectedClientId(value: string | null | undefined): void {
    this.selectedClientId.setValue(value ?? "");
    this.selectedClientId.markAsDirty();
    this.selectedClientId.markAsTouched();
  }

  setSelectedCaseIds(caseIds: string[]): void {
    this.selectedCaseIds.set(caseIds);
    this.resetPageAndLoad();
  }

  caseFilterLabel(): string {
    const selected = new Set(this.selectedCaseIds());
    if (!selected.size)
      return this.localization.translate("documents.filters.allCases");
    return this.caseOptions()
      .filter((option) => selected.has(option.id))
      .map((option) => option.label)
      .join(", ");
  }

  setDetailIds(
    field: "caseIds" | "clientIds",
    values: string[] | null | undefined,
  ): void {
    const control = this.detailForm.controls[field];
    control.setValue(values ?? []);
    control.markAsDirty();
  }

  joinLabels(
    values: readonly string[],
    toLabel: (value: string) => string,
  ): string {
    return values.map(toLabel).join(", ");
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return this.localization.translate("common.notProvided");
    return new Intl.DateTimeFormat(this.localization.locale(), {
      timeZone: OFFICE_TIME_ZONE,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  formatDateOnly(value: string | null | undefined): string {
    if (!value) return this.localization.translate("common.notProvided");
    return new Intl.DateTimeFormat(this.localization.locale(), {
      timeZone: OFFICE_TIME_ZONE,
      dateStyle: "medium",
    }).format(new Date(value));
  }

  categoryLabel(category: string | null): string {
    if (!category)
      return this.localization.translate("documents.category.unclassified");
    return labelOf(DOCUMENT_CATEGORY_LABELS, category, (key) =>
      this.localization.translate(key),
    );
  }

  fileSize(document: DocumentSummary): string {
    const bytes = document.currentVersion?.sizeBytes;
    return bytes == null
      ? ""
      : formatFileSize(bytes, this.localization.locale());
  }

  documentTitle(document: DocumentSummary): string {
    return document.title || this.localization.translate("documents.untitled");
  }

  getLinkedCaseName(document: DocumentSummary): string {
    return document.cases
      .map((item) => `${item.caseNumber} — ${item.name}`)
      .join("; ");
  }

  getLinkedClientName(document: DocumentSummary): string {
    return document.clients.map((item) => item.displayName).join("; ");
  }

  openDocumentDetail(document: DocumentSummary): void {
    this.detailOpen.set(true);
    this.detailEditing.set(false);
    this.detailDocument.set(null);
    this.detailVersions.set([]);
    this.detailLoading.set(true);
    this.documentsApi
      .get(document.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          this.detailDocument.set(detail);
          this.syncDetailForm(detail);
          this.detailLoading.set(false);
          this.loadVersions(detail.id);
        },
        error: () => {
          this.detailLoading.set(false);
          this.toast.error(
            this.localization.translate("documents.detailLoadError"),
          );
        },
      });
  }

  closeDetail(): void {
    this.detailOpen.set(false);
    this.detailDocument.set(null);
    this.detailVersions.set([]);
    this.detailEditing.set(false);
  }

  syncDetailForm(detail: DocumentDetail): void {
    this.aiAccessControl.setValue(detail.aiAccess, { emitEvent: false });
    this.detailForm.setValue({
      title: detail.title,
      category:
        detail.category && isDocumentCategory(detail.category)
          ? detail.category
          : ALL_OPTION_VALUE,
      caseIds: detail.cases.map((item) => item.id),
      clientIds: detail.clients.map((item) => item.id),
    });
  }

  loadVersions(documentId: string): void {
    this.documentsApi
      .listVersions(documentId, FIRST_PAGE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.detailVersions.set(response.items),
      });
  }

  saveDetail(): void {
    const document = this.detailDocument();
    if (!document) return;
    const value = this.detailForm.getRawValue();
    this.documentsApi
      .update(document.id, {
        title: value.title || undefined,
        category: value.category || null,
        caseIds: value.caseIds,
        clientIds: value.clientIds,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.detailDocument.set(updated);
          this.syncDetailForm(updated);
          this.detailEditing.set(false);
          this.toast.success(this.localization.translate("documents.saved"));
          this.load();
          this.documentsChanged.emit();
        },
        error: () => {
          this.toast.error(this.localization.translate("documents.saveError"));
        },
      });
  }

  downloadDocument(doc: DocumentSummary): void {
    const link = window.document.createElement("a");
    link.href = this.documentsApi.downloadUrl(doc.id);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  }

  downloadVersion(doc: DocumentSummary, version: DocumentVersionSummary): void {
    const link = window.document.createElement("a");
    link.href = this.documentsApi.downloadUrl(doc.id, version.id);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  }

  openVersionUpload(document: DocumentSummary): void {
    this.uploadDialog
      .open({ mode: DocumentUploadMode.VERSION, documentId: document.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        this.load();
        this.openDocumentDetail(document);
        if (result?.documents.length) this.documentsChanged.emit();
      });
  }

  archiveDocument(document: DocumentSummary): void {
    this.confirmDialog
      .confirm({
        title: this.localization.translate("documents.archiveTitle"),
        message: this.localization.translate("documents.archiveMessage"),
        confirmText: this.localization.translate("documents.archiveConfirm"),
        cancelText: this.localization.translate("common.cancel"),
        variant: "warning",
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.documentsApi
          .archive(document.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.toast.success(
                this.localization.translate("documents.archived"),
              );
              this.load();
              this.closeDetail();
              this.documentsChanged.emit();
            },
            error: () => {
              this.toast.error(
                this.localization.translate("documents.archiveError"),
              );
            },
          });
      });
  }

  restoreDocument(document: DocumentSummary): void {
    this.documentsApi
      .restore(document.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success(this.localization.translate("documents.restored"));
          this.load();
          this.closeDetail();
          this.documentsChanged.emit();
        },
        error: () => {
          this.toast.error(
            this.localization.translate("documents.restoreError"),
          );
        },
      });
  }

  lastUpdatedInfo(document: DocumentSummary): string {
    return this.formatDateOnly(document.createdAt);
  }

  private resetPageAndLoad(): void {
    this.pagination.page.set(1);
    this.load();
  }

  load(preserveSelection = false): void {
    if (!preserveSelection) {
      this.selection.set([]);
      this.selectionAnchor = null;
      this.bulkError.set(false);
    }
    if (!this.renamePending()) this.cancelRename();
    const arch = this.archivedFilter();

    const query = this.buildListQuery(arch);

    this.resumeAiPolling();
    this.pollSubscription?.unsubscribe();
    this.pollInFlight = false;
    this.listSubscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(false);
    this.listSubscription = forkJoin({
      documents: this.documentsApi.list(query),
      navigation: this.documentsApi.browseFolders(
        this.currentFolderId(),
        query.search,
        arch,
      ),
      stats: this.documentsApi.statistics(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ documents: response, navigation, stats }) => {
          if (
            this.pagination.applyPage(response.meta.page, response.meta) !==
            null
          ) {
            this.load(preserveSelection);
            return;
          }
          this.folders.set(navigation.folders);
          this.breadcrumbs.set(navigation.breadcrumbs);
          this.stats.set(stats);
          this.documents.set(response.items);
          this.selection.update((selected) =>
            selected.filter((item) =>
              this.visibleItems().some(({ id }) => id === item.id),
            ),
          );
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  private archivedFilter():
    | typeof DocumentArchivedFilter.ARCHIVED
    | typeof DocumentArchivedFilter.ACTIVE {
    return this.selectedTab() === DocumentsTab.ARCHIVED
      ? DocumentArchivedFilter.ARCHIVED
      : DocumentArchivedFilter.ACTIVE;
  }

  buildListQuery(archived: DocumentArchivedFilter): DocumentListQuery {
    const fixedCaseId = this.fixedCaseId();
    return {
      folderId: this.currentFolderId() ?? ROOT_FOLDER_ID,
      view: TAB_VIEWS[this.selectedTab()],
      archived,
      caseIds: fixedCaseId
        ? [fixedCaseId]
        : this.selectedCaseIds().length
          ? this.selectedCaseIds()
          : undefined,
      clientId:
        this.fixedClientId() || this.selectedClientId.value || undefined,
      category: this.selectedCategory.value || undefined,
      search: this.searchControl.value.trim() || undefined,
      ...this.pagination.request,
    };
  }

  private loadReferenceData(): void {
    const fixedClientId = this.fixedClientId();
    this.casesApi
      .list({
        ...FIRST_PAGE,
        ...(fixedClientId ? { clientId: fixedClientId } : {}),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.caseOptions.set(
            response.items.map((item) => ({
              id: item.id,
              label: `${item.caseNumber} ${item.name}`.trim(),
            })),
          );
        },
      });

    this.clientsApi
      .list(FIRST_PAGE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.clientOptions.set(
            response.items.map((item) => ({
              id: item.id,
              label: item.displayName,
            })),
          );
        },
      });
  }
}
