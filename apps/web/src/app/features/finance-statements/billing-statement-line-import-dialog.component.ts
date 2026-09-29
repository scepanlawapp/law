import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { BillingStatementLineSummary } from "@law/api-interfaces";
import { FinancialsApiClient } from "@law/api-clients";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { debounceTime, distinctUntilChanged } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import {
  CURRENCY_FILTER_OPTIONS,
  createCurrencyItemToString,
} from "../../shared/currency";
import { BillingStatementLineImportDialogContext } from "./billing-statement-line-import-dialog.models";

const PAGE_SIZE = 10;

@Component({
  selector: "law-billing-statement-line-import-dialog",
  standalone: true,
  templateUrl: "./billing-statement-line-import-dialog.component.html",
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmInput,
    HlmSelectImports,
    HlmSpinner,
    HlmTableImports,
    TranslatePipe,
  ],
})
export class BillingStatementLineImportDialogComponent {
  private readonly api = inject(FinancialsApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly localization = inject(LocalizationService);
  private readonly context =
    injectBrnDialogContext<BillingStatementLineImportDialogContext>();
  readonly dialogRef =
    inject<BrnDialogRef<BillingStatementLineSummary[]>>(BrnDialogRef);

  readonly client = this.context.client;
  readonly excludedLineIds = new Set(this.context.excludedLineIds);
  readonly currency = new FormControl("", { nonNullable: true });
  readonly currencyOptions = CURRENCY_FILTER_OPTIONS;
  readonly currencyItemToString = createCurrencyItemToString(
    (key) => this.localization.translate(key),
    true,
  );
  readonly from = new FormControl("", { nonNullable: true });
  readonly to = new FormControl("", { nonNullable: true });
  readonly items = signal<BillingStatementLineSummary[]>([]);
  readonly selected = signal(new Map<string, BillingStatementLineSummary>());
  readonly page = signal(1);
  readonly pageCount = signal(1);
  readonly totalItems = signal(0);
  readonly loading = signal(false);
  readonly error = signal(false);

  constructor() {
    for (const control of [this.currency, this.from, this.to]) {
      control.valueChanges
        .pipe(
          debounceTime(250),
          distinctUntilChanged(),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => {
          this.page.set(1);
          this.load();
        });
    }
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api
      .lines({
        clientId: this.client.id,
        status: "UNBILLED",
        currency: this.currency.value.trim().toUpperCase() || undefined,
        from: this.from.value || undefined,
        to: this.to.value || undefined,
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

  toggle(line: BillingStatementLineSummary): void {
    if (this.excludedLineIds.has(line.id)) return;
    const selected = new Map(this.selected());
    if (selected.has(line.id)) selected.delete(line.id);
    else selected.set(line.id, line);
    this.selected.set(selected);
  }

  changePage(page: number): void {
    if (page < 1 || page > this.pageCount() || this.loading()) return;
    this.page.set(page);
    this.load();
  }

  clearFilters(): void {
    this.currency.setValue("", { emitEvent: false });
    this.from.setValue("", { emitEvent: false });
    this.to.setValue("", { emitEvent: false });
    this.page.set(1);
    this.load();
  }

  importSelected(): void {
    if (!this.selected().size) return;
    this.dialogRef.close([...this.selected().values()]);
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat(
      this.localization.language() === "EN" ? "en" : "sr-Latn",
      { dateStyle: "medium" },
    ).format(new Date(value));
  }
}
