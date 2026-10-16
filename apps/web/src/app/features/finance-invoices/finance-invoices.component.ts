import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import {
  InvoiceStatus,
  InvoiceSummary,
  ClientSummary,
} from "@law/api-interfaces";
import { ClientsApiClient, FinancialsApiClient } from "@law/api-clients";
import { ActivatedRoute, RouterLink } from "@angular/router";
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
import { LocalPagination } from "../../shared/pagination/paginated-list";
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
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import {
  STATUS_BADGE_BASE_CLASSES,
  statusBadgeClass,
} from "../../shared/status-badge";
import {
  AllOptionValue,
  INVOICE_COLLECTION_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  createSelectItemToString,
  filterOptionsFrom,
  labelOf,
} from "../../shared/models";
import { FIRST_PAGE } from "../../shared/pagination/paginated-list";

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
  readonly status = new FormControl<InvoiceStatus | AllOptionValue>("", {
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
  readonly filterRevision = signal(0);
  readonly advancedFiltersOpen = signal(false);
  readonly deletingInvoiceId = signal<string | null>(null);
  readonly statusBadgeBaseClasses = STATUS_BADGE_BASE_CLASSES;
  readonly statusBadgeClass = statusBadgeClass;
  readonly InvoiceStatus = InvoiceStatus;

  readonly statusOptions = filterOptionsFrom(
    INVOICE_STATUS_LABELS,
    "finance.all",
  );
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
  readonly pagination = new LocalPagination(this.filteredInvoices, {
    loading: this.loading,
  });
  readonly visibleInvoices = this.pagination.items;

  constructor() {
    const clientId =
      inject(ActivatedRoute).snapshot.queryParamMap.get("clientId");
    if (clientId) this.clientIds.set([clientId]);
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
          this.pagination.reset();
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
      clients: this.clientsApi.list(FIRST_PAGE),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ invoices, clients }) => {
          this.invoices.set(invoices);
          this.pagination.clamp();
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

  deleteInvoice(invoice: InvoiceSummary, event: Event): void {
    event.stopPropagation();
    if (invoice.status !== InvoiceStatus.DRAFT || this.deletingInvoiceId())
      return;
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
              this.pagination.clamp();
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
    this.pagination.reset();
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
    this.pagination.reset();
    this.filterRevision.update((revision) => revision + 1);
  }

  statusLabel(status: InvoiceStatus): string {
    return labelOf(INVOICE_STATUS_LABELS, status, this.translate);
  }

  collectionLabel(status: string): string {
    return labelOf(INVOICE_COLLECTION_STATUS_LABELS, status, this.translate);
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat(this.localization.locale(), {
      dateStyle: "medium",
    }).format(new Date(value));
  }

  formatCurrency(value: string, currency: string): string {
    return new Intl.NumberFormat(this.localization.locale(), {
      style: "currency",
      currency,
    }).format(Number(value));
  }

  private readonly translate = (key: string) =>
    this.localization.translate(key);
}
