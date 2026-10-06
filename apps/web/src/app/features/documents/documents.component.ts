import { formatFileSize } from "./document-upload-modal/document-upload.utils";
import { forkJoin, Subscription } from "rxjs";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
  output,
  signal,
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
  lucideFileText,
  lucideGrid2x2,
  lucideLink2,
  lucideList,
  lucideMoreHorizontal,
  lucideRefreshCw,
  lucideSearch,
  lucideUpload,
  lucideX,
} from "@ng-icons/lucide";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmComboboxContent,
  HlmComboboxEmpty,
  HlmComboboxInput,
  HlmComboboxItem,
  HlmComboboxList,
  HlmComboboxMultiple,
  HlmComboboxPortal,
  HlmComboboxTrigger,
} from "@spartan-ng/helm/combobox";
import {
  HlmEmpty,
  HlmEmptyContent,
  HlmEmptyDescription,
  HlmEmptyHeader,
  HlmEmptyTitle,
} from "@spartan-ng/helm/empty";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
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
  DOCUMENT_CATEGORIES,
  DocumentCategory,
  DocumentDetail,
  DocumentSummary,
  DocumentFolderSummary,
  DocumentStatistics,
  DocumentListQuery,
  DocumentVersionSummary,
} from "@law/api-interfaces";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import {
  createSelectItemToString,
  type SelectOption,
} from "../../shared/utils";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { DocumentUploadDialogService } from "./document-upload-modal/document-upload-dialog.service";

export type DocumentsViewMode = "list" | "grid";
export type DocumentsTab = "all" | "recent" | "needs-linking" | "archived";

const DOCUMENT_PAGE_SIZE = 20;
@Component({
  selector: "law-documents",
  standalone: true,
  templateUrl: "./documents.component.html",
  imports: [
    ReactiveFormsModule,
    NgIcon,
    HlmButton,
    HlmComboboxContent,
    HlmComboboxEmpty,
    HlmComboboxInput,
    HlmComboboxItem,
    HlmComboboxList,
    HlmComboboxMultiple,
    HlmComboboxPortal,
    HlmComboboxTrigger,
    HlmTooltip,
    HlmEmpty,
    HlmEmptyContent,
    HlmEmptyDescription,
    HlmEmptyHeader,
    HlmInput,
    HlmSelectImports,
    HlmSpinner,
    HlmTable,
    HlmTableContainer,
    HlmTBody,
    HlmTd,
    HlmTh,
    HlmTHead,
    HlmTr,
    HlmEmptyTitle,
    TranslatePipe,
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
      lucideFileText,
      lucideGrid2x2,
      lucideLink2,
      lucideList,
      lucideMoreHorizontal,
      lucideRefreshCw,
      lucideSearch,
      lucideUpload,
      lucideX,
    }),
  ],
})
export class DocumentsComponent implements OnInit {
  private readonly uploadDialog = inject(DocumentUploadDialogService);
  private readonly documentsApi = inject(DocumentsApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly localization = inject(LocalizationService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly embedded = input(false);
  readonly fixedCaseId = input<string>();
  readonly fixedClientId = input<string>();
  readonly documentsChanged = output<void>();
  readonly searchControl = new FormControl("", { nonNullable: true });
  readonly selectedTab = signal<DocumentsTab>("all");
  readonly viewMode = signal<DocumentsViewMode>("list");
  readonly selectedCaseIds = signal<string[]>([]);
  readonly selectedClientId = new FormControl("", { nonNullable: true });
  readonly selectedCategory = new FormControl("", { nonNullable: true });
  readonly currentFolderId = signal<string | null>(null);
  readonly folders = signal<DocumentFolderSummary[]>([]);
  readonly breadcrumbs = signal<DocumentFolderSummary[]>([]);
  readonly stats = signal<DocumentStatistics | null>(null);
  private listSubscription?: Subscription;
  readonly documents = signal<DocumentSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly page = signal(1);
  readonly pageCount = signal(1);
  readonly totalItems = signal(0);
  readonly caseOptions = signal<Array<{ id: string; label: string }>>([]);
  readonly clientOptions = signal<Array<{ id: string; label: string }>>([]);
  readonly detailDocument = signal<DocumentDetail | null>(null);
  readonly detailVersions = signal<DocumentVersionSummary[]>([]);
  readonly detailLoading = signal(false);
  readonly detailOpen = signal(false);
  readonly detailEditing = signal(false);
  readonly detailForm = new FormGroup({
    title: new FormControl("", { nonNullable: true }),
    category: new FormControl("", { nonNullable: true }),
    caseIds: new FormControl<string[]>([], { nonNullable: true }),
    clientIds: new FormControl<string[]>([], { nonNullable: true }),
  });

  readonly tabOptions: ReadonlyArray<{ value: DocumentsTab; label: string }> = [
    { value: "all", label: "documents.tabs.all" },
    { value: "recent", label: "documents.tabs.recent" },
    { value: "needs-linking", label: "documents.tabs.needsLinking" },
    { value: "archived", label: "documents.tabs.archived" },
  ];

  readonly categoryOptions: ReadonlyArray<SelectOption<DocumentCategory | "">> =
    [
      { value: "", label: "documents.filters.allCategories" },
      ...DOCUMENT_CATEGORIES.map((category) => ({
        value: category,
        label: `documents.category.${category}`,
      })),
    ];

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
  }

  ngOnInit(): void {
    this.loadReferenceData();
    this.load();
  }

  isNeedsLinking(document: DocumentSummary): boolean {
    return !document.cases.length && !document.clients.length;
  }

  isAddedThisMonth(document: DocumentSummary): boolean {
    const date = new Date(document.createdAt);
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth()
    );
  }

  tabLabel(tab: DocumentsTab): string {
    const option = this.tabOptions.find((item) => item.value === tab);
    return option?.label ?? "documents.tabs.all";
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

  openFolder(id: string | null): void {
    this.currentFolderId.set(id);
    this.page.set(1);
    this.load();
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

  selectTab(tab: DocumentsTab): void {
    this.selectedTab.set(tab);
    this.page.set(1);
    this.load();
  }

  setViewMode(mode: DocumentsViewMode): void {
    this.viewMode.set(mode);
  }

  changePage(page: number): void {
    if (page < 1 || page > this.pageCount() || this.loading()) return;
    this.page.set(page);
    this.load();
  }

  clearFilters(): void {
    this.searchControl.setValue("");
    this.selectedCaseIds.set([]);
    this.selectedClientId.setValue("");
    this.selectedCategory.setValue("");
    this.page.set(1);
    this.load();
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

  formatDate(value: string | null | undefined): string {
    if (!value) return this.localization.translate("common.notProvided");
    const locale = this.localization.language() === "EN" ? "en" : "sr-Latn";
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  formatDateOnly(value: string | null | undefined): string {
    if (!value) return this.localization.translate("common.notProvided");
    const locale = this.localization.language() === "EN" ? "en" : "sr-Latn";
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
    }).format(new Date(value));
  }

  categoryLabel(category: string | null): string {
    if (!category)
      return this.localization.translate("documents.category.unclassified");
    return this.localization.translate(`documents.category.${category}`);
  }

  documentTypeName(document: DocumentSummary): string {
    const mime = document.currentVersion?.mimeType ?? "";
    if (mime.includes("pdf")) return "PDF";
    if (mime.includes("word")) return "DOCX";
    if (mime.includes("sheet") || mime.includes("excel")) return "XLSX";
    if (mime.includes("image")) return "IMG";
    return "FILE";
  }

  fileSize(document: DocumentSummary): string {
    const bytes = document.currentVersion?.sizeBytes;
    return bytes == null ? "" : formatFileSize(bytes);
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
    this.detailForm.setValue({
      title: detail.title,
      category: detail.category ?? "",
      caseIds: detail.cases.map((item) => item.id),
      clientIds: detail.clients.map((item) => item.id),
    });
  }

  loadVersions(documentId: string): void {
    this.documentsApi
      .listVersions(documentId, { page: 1, pageSize: 20 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.detailVersions.set(response.items),
      });
  }

  saveDetail(): void {
    const document = this.detailDocument();
    if (!document) return;
    const value = this.detailForm.getRawValue();
    const category = value.category
      ? (value.category as DocumentCategory)
      : null;
    this.documentsApi
      .update(document.id, {
        title: value.title || undefined,
        category,
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
      .open({ mode: "version", documentId: document.id })
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
    this.page.set(1);
    this.load();
  }

  load(): void {
    const arch: "true" | "false" | "all" =
      this.selectedTab() === "archived" ? "true" : "false";

    const query = this.buildListQuery(arch);

    this.listSubscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(false);
    this.listSubscription = forkJoin({
      documents: this.documentsApi.list(query),
      navigation: this.documentsApi.browseFolders(
        this.currentFolderId(),
        query.search,
      ),
      stats: this.documentsApi.statistics(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ documents: response, navigation, stats }) => {
          this.folders.set(navigation.folders);
          this.breadcrumbs.set(navigation.breadcrumbs);
          this.stats.set(stats);
          this.documents.set(response.items);
          this.page.set(response.meta.page);
          this.pageCount.set(response.meta.totalPages || 1);
          this.totalItems.set(response.meta.totalItems);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  buildListQuery(archived: "true" | "false" | "all"): DocumentListQuery {
    const fixedCaseId = this.fixedCaseId();
    return {
      folderId: this.currentFolderId() ?? "root",
      view:
        this.selectedTab() === "recent"
          ? "recent"
          : this.selectedTab() === "needs-linking"
            ? "needs-linking"
            : undefined,
      archived,
      caseIds: fixedCaseId
        ? [fixedCaseId]
        : this.selectedCaseIds().length
          ? this.selectedCaseIds()
          : undefined,
      clientId:
        this.fixedClientId() || this.selectedClientId.value || undefined,
      category: (this.selectedCategory.value || undefined) as
        | DocumentCategory
        | undefined,
      search: this.searchControl.value.trim() || undefined,
      page: this.page(),
      pageSize: DOCUMENT_PAGE_SIZE,
    };
  }

  private loadReferenceData(): void {
    const fixedClientId = this.fixedClientId();
    this.casesApi
      .list({
        page: 1,
        pageSize: 100,
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
      .list({ page: 1, pageSize: 100 })
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
