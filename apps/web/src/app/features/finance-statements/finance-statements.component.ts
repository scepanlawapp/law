import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import {
  BillingStatementStatus,
  BillingStatementSummary,
  ClientSummary,
} from "@law/api-interfaces";
import { ClientsApiClient, FinancialsApiClient } from "@law/api-clients";
import { RouterLink } from "@angular/router";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmEmptyImports } from "@spartan-ng/helm/empty";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { debounceTime, distinctUntilChanged, forkJoin } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import {
  CURRENCY_FILTER_OPTIONS,
  createCurrencyItemToString,
} from "../../shared/currency";
import { createSelectItemToString, SelectOption } from "../../shared/utils";

const PAGE_SIZE = 15;

@Component({
  selector: "law-finance-statements",
  standalone: true,
  templateUrl: "./finance-statements.component.html",
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButton,
    HlmEmptyImports,
    HlmInput,
    HlmSelectImports,
    HlmSpinner,
    HlmTableImports,
    TranslatePipe,
  ],
})
export class FinanceStatementsComponent {
  private readonly api = inject(FinancialsApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly localization = inject(LocalizationService);

  readonly search = new FormControl("", { nonNullable: true });
  readonly clientId = new FormControl("", { nonNullable: true });
  readonly status = new FormControl<BillingStatementStatus | "">("", {
    nonNullable: true,
  });
  readonly currency = new FormControl("", { nonNullable: true });
  readonly from = new FormControl("", { nonNullable: true });
  readonly to = new FormControl("", { nonNullable: true });
  readonly statements = signal<BillingStatementSummary[]>([]);
  readonly clients = signal<ClientSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly loaded = signal(false);
  readonly page = signal(1);
  readonly filterRevision = signal(0);
  readonly advancedFiltersOpen = signal(false);

  readonly statusOptions: ReadonlyArray<
    SelectOption<BillingStatementStatus | "">
  > = [
    { value: "", label: "finance.all" },
    { value: "DRAFT", label: "finance.draft" },
    { value: "SENT", label: "finance.sent" },
    { value: "VOIDED", label: "finance.voided" },
  ];
  readonly statusItemToString = createSelectItemToString(
    this.statusOptions,
    (key) => this.localization.translate(key),
  );
  readonly currencyOptions = CURRENCY_FILTER_OPTIONS;
  readonly currencyItemToString = createCurrencyItemToString(
    (key) => this.localization.translate(key),
    true,
  );
  readonly clientItemToString = (value: string | null | undefined): string =>
    value
      ? (this.clients().find((client) => client.id === value)?.displayName ??
        value)
      : this.localization.translate("finance.allClients");

  readonly filteredStatements = computed(() => {
    this.filterRevision();
    const search = this.search.value.trim().toLocaleLowerCase();
    const currency = this.currency.value.trim().toUpperCase();
    const from = this.from.value;
    const to = this.to.value;
    return this.statements().filter((statement) => {
      if (
        search &&
        !statement.statementNumber.toLocaleLowerCase().includes(search)
      )
        return false;
      if (this.clientId.value && statement.client.id !== this.clientId.value)
        return false;
      if (this.status.value && statement.status !== this.status.value)
        return false;
      if (currency && statement.currency.toUpperCase() !== currency)
        return false;
      if (from && statement.periodEnd < from) return false;
      if (to && statement.periodStart > to) return false;
      return true;
    });
  });
  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.filteredStatements().length / PAGE_SIZE)),
  );
  readonly visibleStatements = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.filteredStatements().slice(start, start + PAGE_SIZE);
  });

  constructor() {
    const controls = [
      this.search,
      this.clientId,
      this.status,
      this.currency,
      this.from,
      this.to,
    ];
    for (const control of controls) {
      control.valueChanges
        .pipe(
          debounceTime(control === this.search ? 250 : 0),
          distinctUntilChanged(),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => {
          this.page.set(1);
          this.filterRevision.update((value) => value + 1);
        });
    }
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    forkJoin({
      statements: this.api.statements(),
      clients: this.clientsApi.list({ page: 1, pageSize: 100 }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ statements, clients }) => {
          this.statements.set(statements);
          this.clients.set(clients.items);
          this.loaded.set(true);
          this.loading.set(false);
        },
        error: () => {
          this.loaded.set(true);
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  changePage(page: number): void {
    if (page < 1 || page > this.pageCount() || this.loading()) return;
    this.page.set(page);
  }

  toggleAdvancedFilters(): void {
    this.advancedFiltersOpen.update((open) => !open);
  }

  clearFilters(): void {
    this.search.setValue("", { emitEvent: false });
    this.clientId.setValue("", { emitEvent: false });
    this.status.setValue("", { emitEvent: false });
    this.currency.setValue("", { emitEvent: false });
    this.from.setValue("", { emitEvent: false });
    this.to.setValue("", { emitEvent: false });
    this.page.set(1);
    this.advancedFiltersOpen.set(false);
    this.filterRevision.update((value) => value + 1);
  }

  hasFilters(): boolean {
    return Boolean(
      this.search.value ||
        this.clientId.value ||
        this.status.value ||
        this.currency.value ||
        this.from.value ||
        this.to.value,
    );
  }

  statusLabel(status: BillingStatementStatus): string {
    return this.localization.translate(
      status === "DRAFT"
        ? "finance.draft"
        : status === "SENT"
          ? "finance.sent"
          : "finance.voided",
    );
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat(
      this.localization.language() === "EN" ? "en" : "sr-Latn",
      { dateStyle: "medium" },
    ).format(new Date(value));
  }

  formatCurrency(value: string, currency: string): string {
    return new Intl.NumberFormat(
      this.localization.language() === "EN" ? "en" : "sr-Latn",
      { style: "currency", currency },
    ).format(Number(value));
  }
}
