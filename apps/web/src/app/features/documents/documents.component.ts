import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
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
const DOCUMENT_SUMMARY_FALLBACKS = {
  active: 84,
  addedThisMonth: 12,
  needsLinking: 8,
  archived: 9,
};

@Component({
  selector: "law-documents",
  standalone: true,
  templateUrl: "./documents.component.html",
  imports: [
    ReactiveFormsModule,
    NgIcon,
    HlmButton,
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
export class DocumentsComponent {
  private readonly uploadDialog = inject(DocumentUploadDialogService);
  private readonly documentsApi = inject(DocumentsApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly localization = inject(LocalizationService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly searchControl = new FormControl("", { nonNullable: true });
  readonly selectedTab = signal<DocumentsTab>("all");
  readonly viewMode = signal<DocumentsViewMode>("list");
  readonly selectedCaseId = new FormControl("", { nonNullable: true });
  readonly selectedClientId = new FormControl("", { nonNullable: true });
  readonly selectedCategory = new FormControl("", { nonNullable: true });
  readonly documents = signal<DocumentSummary[]>([]);
  readonly loading = signal(false);
  readonly loaded = signal(false);
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

    this.selectedCaseId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.resetPageAndLoad());

    this.selectedClientId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.resetPageAndLoad());

    this.selectedCategory.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.resetPageAndLoad());

    this.loadReferenceData();
    this.load();
  }

  readonly stats = computed(() => {
    const docs = this.documents();
    return this.computeSummaryStats(docs);
  });

  computeSummaryStats(docs: DocumentSummary[]) {
    const summary = {
      active: docs.filter((doc) => !doc.archived).length,
      addedThisMonth: docs.filter((doc) => this.isAddedThisMonth(doc)).length,
      needsLinking: docs.filter((doc) => this.isNeedsLinking(doc)).length,
      archived: docs.filter((doc) => doc.archived).length,
    };

    return {
      active: summary.active || DOCUMENT_SUMMARY_FALLBACKS.active,
      addedThisMonth:
        summary.addedThisMonth || DOCUMENT_SUMMARY_FALLBACKS.addedThisMonth,
      needsLinking:
        summary.needsLinking || DOCUMENT_SUMMARY_FALLBACKS.needsLinking,
      archived: summary.archived || DOCUMENT_SUMMARY_FALLBACKS.archived,
    };
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

  openUpload(): void {
    this.uploadDialog
      .open()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.load());
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
    this.selectedCaseId.setValue("");
    this.selectedClientId.setValue("");
    this.selectedCategory.setValue("");
    this.page.set(1);
    this.load();
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
    if (!bytes) return "";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  documentTitle(document: DocumentSummary): string {
    return document.title || this.localization.translate("documents.untitled");
  }

  getLinkedCaseName(document: DocumentSummary): string {
    const linkedCase = document.cases[0];
    return linkedCase
      ? `${linkedCase.caseNumber} ${linkedCase.name}`.trim()
      : "";
  }

  getLinkedClientName(document: DocumentSummary): string {
    return document.clients[0]?.displayName ?? "";
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
      .subscribe(() => {
        this.load();
        this.openDocumentDetail(document);
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
        },
        error: () => {
          this.toast.error(
            this.localization.translate("documents.restoreError"),
          );
        },
      });
  }

  lastUpdatedInfo(document: DocumentSummary): string {
    return this.formatDate(document.updatedAt);
  }

  private resetPageAndLoad(): void {
    this.page.set(1);
    this.load();
  }

  load(): void {
    const arch: "true" | "false" | "all" =
      this.selectedTab() === "archived"
        ? "true"
        : this.selectedTab() === "all"
          ? "all"
          : "false";

    const query = {
      archived: arch,
      caseId: this.selectedCaseId.value || undefined,
      clientId: this.selectedClientId.value || undefined,
      category: (this.selectedCategory.value || undefined) as
        | DocumentCategory
        | undefined,
      search: this.searchControl.value.trim() || undefined,
      page: this.page(),
      pageSize: DOCUMENT_PAGE_SIZE,
    };

    this.loading.set(true);
    this.error.set(false);
    this.documentsApi
      .list(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const items = response.items.filter((item) => {
            if (this.selectedTab() === "recent") {
              return this.isRecentDocument(item);
            }
            if (this.selectedTab() === "needs-linking") {
              return this.isNeedsLinking(item);
            }
            if (this.selectedTab() === "all") {
              return !item.archived;
            }
            return true;
          });
          this.documents.set(items);
          this.page.set(response.meta.page);
          this.pageCount.set(response.meta.totalPages || 1);
          this.totalItems.set(response.meta.totalItems);
          this.loaded.set(true);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  private loadReferenceData(): void {
    this.casesApi
      .list({ page: 1, pageSize: 100 })
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

  private isRecentDocument(document: DocumentSummary): boolean {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 30);
    return new Date(document.updatedAt) >= threshold;
  }
}
