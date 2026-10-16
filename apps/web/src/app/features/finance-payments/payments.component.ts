import { HlmComboboxImports } from "@spartan-ng/helm/combobox";
import { PaymentDialogService } from "./payment-dialog.service";
import { PaymentFormContext } from "./payment-dialog.models";
import {
  CURRENCY_OPTIONS,
  CURRENCY_FILTER_OPTIONS,
  CurrencyCode,
  DEFAULT_CURRENCY,
  createCurrencyItemToString,
} from "../../shared/currency";
import { LocalizationService } from "../../core/localization/localization.service";
import {
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { PaymentsApiClient } from "@law/api-clients";
import {
  AllocationState,
  CollectionTotals,
  PaymentPage,
  PaymentPurpose,
  PaymentQuery,
  PaymentStatus,
  SortDirection,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import {
  Observable,
  debounceTime,
  firstValueFrom,
  forkJoin,
  map,
  of,
  tap,
} from "rxjs";
import { PaginationComponent } from "../../shared/ui/pagination/pagination.component";
import { injectPaginatedList } from "../../shared/pagination/paginated-list";
import { PaymentSelectComponent } from "./payment-select.component";
import { PaymentClientPickerComponent } from "./payment-client-picker.component";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { officeToday } from "../time/time-utils";
import {
  ALLOCATION_STATE_LABELS,
  ALL_OPTION_VALUE,
  PAYMENT_METHOD_LABELS,
  PAYMENT_PURPOSE_LABELS,
  PAYMENT_SORT_FIELDS,
  PAYMENT_STATUS_LABELS,
  PaymentSortField,
  SelectOption,
  filterOptionsFrom,
  labelOf,
} from "../../shared/models";
import { date, money } from "./payment-ui";
const c = (value = "") => new FormControl(value, { nonNullable: true });
const ALL_LABEL = "payments.all";
const SUMMARY_CURRENCIES: CurrencyCode[] = [DEFAULT_CURRENCY, "EUR"];

interface QuickFilter {
  readonly label: string;
  readonly status: PaymentStatus;
  readonly allocationState?: AllocationState;
  readonly purpose?: PaymentPurpose;
}

const QUICK_FILTERS: readonly QuickFilter[] = [
  { label: "payments.quick.all", status: PaymentStatus.ACTIVE },
  {
    label: "payments.quick.unallocated",
    status: PaymentStatus.ACTIVE,
    allocationState: AllocationState.UNALLOCATED,
  },
  {
    label: "payments.quick.partial",
    status: PaymentStatus.ACTIVE,
    allocationState: AllocationState.PARTIAL,
  },
  {
    label: "payments.quick.advances",
    status: PaymentStatus.ACTIVE,
    purpose: PaymentPurpose.ADVANCE,
  },
  { label: "payments.quick.voided", status: PaymentStatus.VOIDED },
];
@Component({
  selector: "law-payments",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    HlmComboboxImports,
    HlmButton,
    HlmInput,
    HlmSpinner,
    HlmTableImports,
    PaginationComponent,
    PaymentSelectComponent,
    PaymentClientPickerComponent,
    TranslatePipe,
  ],
  templateUrl: "./payments.component.html",
})
export class PaymentsComponent {
  private readonly api = inject(PaymentsApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialogs = inject(PaymentDialogService);
  private readonly destroy = inject(DestroyRef);
  private readonly localization = inject(LocalizationService);
  private modalOpen = false;
  readonly summaryExpanded = signal(false);
  readonly summaryCurrencies = signal<string[]>(SUMMARY_CURRENCIES);
  readonly currencyOptions = CURRENCY_OPTIONS;
  readonly currencyLabel = createCurrencyItemToString((key) =>
    this.localization.translate(key),
  );
  private defaultYear = officeToday().slice(0, 4);
  readonly visibleTotals = computed(() =>
    this.summaryCurrencies().map(
      (currency) =>
        this.totals().find((t) => t.currency === currency) ?? {
          currency,
          received: "0.00",
          allocated: "0.00",
          unallocated: "0.00",
          advances: "0.00",
          outstanding: "0.00",
          overdue: "0.00",
          unpaidInvoices: 0,
        },
    ),
  );
  readonly totals = signal<CollectionTotals[]>([]);
  readonly list = injectPaginatedList<PaymentPage["items"][number]>({
    fetch: (request) => {
      const query = {
        ...this.filters.getRawValue(),
        ...request,
        sort: this.sort(),
        direction: this.direction(),
      } as PaymentQuery;
      return forkJoin([
        this.api.list(query),
        this.summaryExpanded()
          ? this.api.summary({
              clientId: query.clientId,
              from: query.from,
              to: query.to,
            })
          : of([]),
      ]).pipe(
        tap(([, totals]) => this.totals.set(totals)),
        map(([page]) => page),
      );
    },
  });
  readonly loading = this.list.loading;
  readonly error = this.list.error;
  readonly advanced = signal(false);
  readonly filters = new FormGroup({
    search: c(),
    clientId: c(this.route.snapshot.queryParamMap.get("clientId") ?? ""),
    currency: c(),
    from: c(`${this.defaultYear}-01-01`),
    to: c(`${this.defaultYear}-12-31`),
    paymentMethod: c(),
    purpose: c(),
    status: c(PaymentStatus.ACTIVE),
    allocationState: c(
      this.route.snapshot.queryParamMap.get("allocationState") ?? "",
    ),
    bankAccountId: c(),
  });
  readonly quickFilters = QUICK_FILTERS;
  readonly methodOptions = filterOptionsFrom(PAYMENT_METHOD_LABELS, ALL_LABEL);
  readonly purposeOptions = filterOptionsFrom(
    PAYMENT_PURPOSE_LABELS,
    ALL_LABEL,
  );
  readonly stateOptions = filterOptionsFrom(ALLOCATION_STATE_LABELS, ALL_LABEL);
  readonly statusOptions = filterOptionsFrom(PAYMENT_STATUS_LABELS, ALL_LABEL);
  readonly currencies = signal([...CURRENCY_FILTER_OPTIONS]);
  readonly banks = signal<SelectOption[]>([
    { value: ALL_OPTION_VALUE, label: ALL_LABEL },
  ]);
  readonly sortFields = PAYMENT_SORT_FIELDS;
  readonly sort = signal<PaymentSortField>("receivedAt");
  readonly direction = signal<SortDirection>(SortDirection.DESC);
  readonly PaymentStatus = PaymentStatus;
  readonly PaymentPurpose = PaymentPurpose;
  readonly money = (value: string, currency: string) =>
    money(value, currency, this.localization.locale());
  readonly date = (value: string) => date(value, this.localization.locale());
  readonly methodLabel = (value: string) =>
    labelOf(PAYMENT_METHOD_LABELS, value, this.translate);
  readonly stateLabel = (value: string) =>
    labelOf(ALLOCATION_STATE_LABELS, value, this.translate);
  private readonly translate = (key: string) =>
    this.localization.translate(key);
  constructor() {
    this.filters.valueChanges
      .pipe(debounceTime(250), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.list.reset());
    void this.initialize();
    afterNextRender(() => {
      this.route.queryParamMap
        .pipe(takeUntilDestroyed(this.destroy))
        .subscribe((params) => {
          const mode = params.get("paymentDialog");
          if (!mode || this.modalOpen) return;
          const id = params.get("paymentId");
          const context = {
            clientId: params.get("clientId") ?? undefined,
            currency: params.get("currency") ?? undefined,
            invoiceId: params.get("invoiceId") ?? undefined,
          };
          void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: {
              paymentDialog: null,
              paymentId: null,
              invoiceId: null,
            },
            queryParamsHandling: "merge",
            replaceUrl: true,
          });
          if (mode === "new") void this.create(context);
          else if (id && mode === "edit") void this.edit(id);
          else if (id) void this.view(id);
        });
    });
  }
  private async initialize() {
    try {
      const o = await firstValueFrom(this.api.options());
      this.defaultYear = o.today.slice(0, 4);
      if (
        this.filters.controls.from.pristine &&
        this.filters.controls.to.pristine
      )
        this.filters.patchValue(
          {
            from: `${this.defaultYear}-01-01`,
            to: `${this.defaultYear}-12-31`,
          },
          { emitEvent: false },
        );
      this.banks.set([
        { value: ALL_OPTION_VALUE, label: ALL_LABEL },
        ...o.bankAccounts.map((b) => ({ value: b.id, label: b.name })),
      ]);
    } catch {
      /* The supported catalog and current-year defaults remain available. */
    }
    this.list.load();
  }
  private async open(result: Observable<unknown>) {
    this.modalOpen = true;
    try {
      await firstValueFrom(result);
    } finally {
      this.modalOpen = false;
      this.list.load();
    }
  }
  async create(context: PaymentFormContext = {}) {
    if (!this.modalOpen) await this.open(this.dialogs.form(context));
  }
  async edit(id: string) {
    if (!this.modalOpen) await this.open(this.dialogs.form({ id }));
  }
  async view(id: string) {
    if (!this.modalOpen) await this.open(this.dialogs.view(id));
  }
  openFromKeyboard(event: Event, id: string) {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    void this.view(id);
  }
  toggleSummary() {
    this.summaryExpanded.update((value) => !value);
    if (this.summaryExpanded()) this.list.load();
  }
  quick(filter: QuickFilter) {
    this.filters.patchValue({
      status: filter.status,
      allocationState: filter.allocationState ?? ALL_OPTION_VALUE,
      purpose: filter.purpose ?? ALL_OPTION_VALUE,
    });
  }
  reset() {
    this.filters.reset({
      status: PaymentStatus.ACTIVE,
      from: `${this.defaultYear}-01-01`,
      to: `${this.defaultYear}-12-31`,
    });
  }
  order(sort: PaymentSortField) {
    this.direction.set(
      this.sort() === sort && this.direction() === SortDirection.ASC
        ? SortDirection.DESC
        : SortDirection.ASC,
    );
    this.sort.set(sort);
    this.list.reset();
  }
  ariaSort(field: PaymentSortField) {
    if (this.sort() !== field) return "none";
    return this.direction() === SortDirection.ASC ? "ascending" : "descending";
  }
}
