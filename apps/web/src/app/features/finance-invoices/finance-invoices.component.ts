import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import {
  InvoiceStatus,
  InvoiceSummary,
  ClientSummary,
} from "@law/api-interfaces";
import { ClientsApiClient, FinancialsApiClient } from "@law/api-clients";
import { RouterLink } from "@angular/router";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucidePencil, lucideTrash2 } from "@ng-icons/lucide";
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
import { HlmEmptyImports } from "@spartan-ng/helm/empty";
import { HlmInput } from "@spartan-ng/helm/input";
import { PaginationComponent } from "../../shared/ui/pagination/pagination.component";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { debounceTime, distinctUntilChanged, forkJoin } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ComboboxSelectAllComponent } from "../../shared/ui/combobox-select-all/combobox-select-all.component";
import {
  CURRENCY_FILTER_OPTIONS,
  createCurrencyItemToString,
} from "../../shared/currency";
import { createSelectItemToString, SelectOption } from "../../shared/utils";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import {
  STATUS_BADGE_BASE_CLASSES,
  statusBadgeClass,
} from "../../shared/status-badge";

@Component({
  selector: "law-finance-invoices",
  standalone: true,
  templateUrl: "./finance-invoices.component.html",
  imports: [
    ReactiveFormsModule,
    RouterLink,
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
    HlmEmptyImports,
    HlmInput,
    PaginationComponent,
    HlmSelectImports,
    HlmSpinner,
    HlmTableImports,
    TranslatePipe,
    ComboboxSelectAllComponent,
  ],
  providers: [provideIcons({ lucidePencil, lucideTrash2 })],
})
export class FinanceInvoicesComponent {
  private readonly api = inject(FinancialsApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly localization = inject(LocalizationService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);

  readonly search = new FormControl("", { nonNullable: true });
  readonly clientIds = signal<string[]>([]);
  readonly status = new FormControl<InvoiceStatus | "">("", {
    nonNullable: true,
  });
  readonly currency = new FormControl("", { nonNullable: true });
  readonly from = new FormControl("", { nonNullable: true });
  readonly to = new FormControl("", { nonNullable: true });
  readonly invoices = signal<InvoiceSummary[]>([]);
  readonly clients = signal<ClientSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly loaded = signal(false);
  readonly page = signal(1);
  readonly pageSize = signal(50);
  readonly filterRevision = signal(0);
  readonly advancedFiltersOpen = signal(false);
  readonly deletingInvoiceId = signal<string | null>(null);
  readonly statusBadgeBaseClasses = STATUS_BADGE_BASE_CLASSES;
  readonly statusBadgeClass = statusBadgeClass;

  readonly statusOptions: ReadonlyArray<SelectOption<InvoiceStatus | "">> = [
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
      : "";
  readonly selectedClientsLabel = computed(() =>
    this.clientIds().map(this.clientItemToString).join(", "),
  );

  readonly filteredInvoices = computed(() => {
    this.filterRevision();
    const search = this.search.value.trim().toLocaleLowerCase();
    const currency = this.currency.value.trim().toUpperCase();
    const from = this.from.value;
    const to = this.to.value;
    return this.invoices().filter((invoice) => {
      if (search && !invoice.invoiceNumber.toLocaleLowerCase().includes(search))
        return false;
      if (
        this.clientIds().length &&
        !this.clientIds().includes(invoice.client.id)
      )
        return false;
      if (this.status.value && invoice.status !== this.status.value)
        return false;
      if (currency && invoice.currency.toUpperCase() !== currency) return false;
      if (from && invoice.dateOfMaturity < from) return false;
      if (to && invoice.dateOfCreate > to) return false;
      return true;
    });
  });
  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.filteredInvoices().length / this.pageSize())),
  );
  readonly visibleInvoices = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.filteredInvoices().slice(start, start + this.pageSize());
  });

  constructor() {
    const controls = [
      this.search,
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
      invoices: this.api.invoices(),
      clients: this.clientsApi.list({ page: 1, pageSize: 100 }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ invoices, clients }) => {
          this.invoices.set(invoices);
          this.page.set(Math.min(this.page(), this.pageCount()));
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

  changePageSize(pageSize: number): void {
    if (this.loading() || pageSize === this.pageSize()) return;
    this.pageSize.set(pageSize);
    this.page.set(1);
  }

  deleteInvoice(invoice: InvoiceSummary, event: Event): void {
    event.stopPropagation();
    if (invoice.status !== "DRAFT" || this.deletingInvoiceId()) return;
    this.confirmDialog
      .confirm({
        title: this.localization.translate("finance.deleteInvoiceTitle"),
        message: this.localization.translate("finance.deleteInvoiceMessage", {
          number: invoice.invoiceNumber,
        }),
        confirmText: this.localization.translate("finance.deleteInvoice"),
        cancelText: this.localization.translate("common.cancel"),
        variant: "danger",
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.deletingInvoiceId.set(invoice.id);
        this.api
          .deleteInvoice(invoice.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.invoices.update((items) =>
                items.filter((item) => item.id !== invoice.id),
              );
              this.page.set(Math.min(this.page(), this.pageCount()));
              this.deletingInvoiceId.set(null);
              this.toast.success(
                this.localization.translate("finance.invoiceDeleted"),
              );
            },
            error: () => {
              this.deletingInvoiceId.set(null);
              this.toast.error(
                this.localization.translate("finance.invoiceDeleteError"),
              );
            },
          });
      });
  }

  toggleAdvancedFilters(): void {
    this.advancedFiltersOpen.update((open) => !open);
  }

  clearFilters(): void {
    this.search.setValue("", { emitEvent: false });
    this.clientIds.set([]);
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
        this.clientIds().length ||
        this.status.value ||
        this.currency.value ||
        this.from.value ||
        this.to.value,
    );
  }

  setClientIds(value: string[]): void {
    this.clientIds.set([...new Set(value)]);
    this.page.set(1);
    this.filterRevision.update((revision) => revision + 1);
  }

  statusLabel(status: InvoiceStatus): string {
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
