import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  BillableWorkItem,
  BillableWorkSourceType,
  CaseSummary,
} from "@law/api-interfaces";
import { CasesApiClient, FinancialsApiClient } from "@law/api-clients";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmComboboxContent,
  HlmComboboxEmpty,
  HlmComboboxItem,
  HlmComboboxList,
  HlmComboboxMultiple,
  HlmComboboxPortal,
  HlmComboboxTrigger,
} from "@spartan-ng/helm/combobox";
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { BillingStatementLineImportDialogContext } from "./billing-statement-line-import-dialog.models";

const PAGE_SIZE = 10;

@Component({
  selector: "law-billing-statement-line-import-dialog",
  standalone: true,
  templateUrl: "./billing-statement-line-import-dialog.component.html",
  imports: [
    HlmButton,
    HlmComboboxContent,
    HlmComboboxEmpty,
    HlmComboboxItem,
    HlmComboboxList,
    HlmComboboxMultiple,
    HlmComboboxPortal,
    HlmComboboxTrigger,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmSpinner,
    HlmTableImports,
    TranslatePipe,
  ],
})
export class BillingStatementLineImportDialogComponent {
  private readonly api = inject(FinancialsApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly localization = inject(LocalizationService);
  private readonly context =
    injectBrnDialogContext<BillingStatementLineImportDialogContext>();
  readonly dialogRef = inject<BrnDialogRef<BillableWorkItem[]>>(BrnDialogRef);

  readonly client = this.context.client;
  readonly excludedSourceKeys = new Set(this.context.excludedSourceKeys);
  readonly cases = signal<CaseSummary[]>([]);
  readonly caseIds = signal<string[]>([]);
  readonly sourceTypes = signal<BillableWorkSourceType[]>([]);
  readonly items = signal<BillableWorkItem[]>([]);
  readonly selected = signal(new Map<string, BillableWorkItem>());
  readonly page = signal(1);
  readonly pageCount = signal(1);
  readonly totalItems = signal(0);
  readonly loading = signal(false);
  readonly error = signal(false);

  readonly sourceOptions: ReadonlyArray<{
    value: BillableWorkSourceType;
    label: string;
  }> = [
    { value: "EVENT", label: "finance.sourceEvent" },
    { value: "TASK", label: "finance.sourceTask" },
    { value: "DEADLINE", label: "finance.sourceDeadline" },
  ];
  readonly caseItemToString = (value: string | null | undefined): string => {
    const item = this.cases().find((caseItem) => caseItem.id === value);
    return item ? `${item.caseNumber} — ${item.name}` : "";
  };
  readonly sourceItemToString = (
    value: BillableWorkSourceType | null | undefined,
  ): string =>
    value
      ? this.localization.translate(
          this.sourceOptions.find((option) => option.value === value)?.label ??
            "",
        )
      : "";
  readonly selectedCasesLabel = computed(() =>
    this.caseIds().map(this.caseItemToString).join(", "),
  );
  readonly selectedSourcesLabel = computed(() =>
    this.sourceTypes().map(this.sourceItemToString).join(", "),
  );

  constructor() {
    this.casesApi
      .list({ clientId: this.client.id, page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (response) => this.cases.set(response.items) });
    this.load();
  }

  setCaseIds(value: string[]): void {
    this.caseIds.set(value);
    this.filtersChanged();
  }

  setSourceTypes(value: BillableWorkSourceType[]): void {
    this.sourceTypes.set(value);
    this.filtersChanged();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api
      .billableWork({
        clientId: this.client.id,
        caseIds: this.caseIds(),
        sourceTypes: this.sourceTypes(),
        page: this.page(),
        pageSize: PAGE_SIZE,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.items.set(response.items);
          this.page.set(response.meta.page);
          this.pageCount.set(Math.max(1, response.meta.totalPages));
          this.totalItems.set(response.meta.totalItems);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  toggle(item: BillableWorkItem): void {
    if (this.excludedSourceKeys.has(item.sourceKey)) return;
    const selected = new Map(this.selected());
    if (selected.has(item.sourceKey)) selected.delete(item.sourceKey);
    else selected.set(item.sourceKey, item);
    this.selected.set(selected);
  }

  changePage(page: number): void {
    if (page < 1 || page > this.pageCount() || this.loading()) return;
    this.page.set(page);
    this.load();
  }

  clearFilters(): void {
    this.caseIds.set([]);
    this.sourceTypes.set([]);
    this.filtersChanged();
  }

  importSelected(): void {
    if (this.selected().size) {
      this.dialogRef.close([...this.selected().values()]);
    }
  }

  sourceLabel(value: BillableWorkSourceType): string {
    return this.sourceItemToString(value);
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat(
      this.localization.language() === "EN" ? "en" : "sr-Latn",
      { dateStyle: "medium" },
    ).format(new Date(value));
  }

  private filtersChanged(): void {
    this.page.set(1);
    this.load();
  }
}
