import { HlmComboboxImports } from "@spartan-ng/helm/combobox";
import { PaymentDialogService } from "./payment-dialog.service";
import { PaymentFormContext } from "./payment-dialog.models";
import {
  CURRENCY_OPTIONS,
  CURRENCY_FILTER_OPTIONS,
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
  CollectionTotals,
  PaymentPage,
  PaymentQuery,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { Observable, debounceTime, firstValueFrom } from "rxjs";
import { PaginationComponent } from "../../shared/ui/pagination/pagination.component";
import { PaymentSelectComponent } from "./payment-select.component";
import { PaymentClientPickerComponent } from "./payment-client-picker.component";
import { all, methods, purposes, states } from "./payment-options";
import { allocationLabel, date, money, paymentMethodLabel } from "./payment-ui";
const c = (value = "") => new FormControl(value, { nonNullable: true });
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
  readonly summaryCurrencies = signal<string[]>(["RSD", "EUR"]);
  readonly currencyOptions = CURRENCY_OPTIONS;
  readonly currencyLabel = createCurrencyItemToString((key) =>
    this.localization.translate(key),
  );
  private defaultYear = new Intl.DateTimeFormat("en", {
    year: "numeric",
    timeZone: "Europe/Belgrade",
  }).format(new Date());
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
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly result = signal<PaymentPage>({
    items: [],
    meta: {
      totalItems: 0,
      totalPages: 0,
      page: 1,
      pageSize: 25,
      hasPreviousPage: false,
      hasNextPage: false,
      sort: [],
    },
  });
  readonly totals = signal<CollectionTotals[]>([]);
  readonly page = signal(1);
  readonly pageSize = signal(50);
  readonly advanced = signal(false);
  readonly filters = new FormGroup({
    search: c(),
    clientId: c(this.route.snapshot.queryParamMap.get("clientId") ?? ""),
    currency: c(),
    from: c(`${this.defaultYear}-01-01`),
    to: c(`${this.defaultYear}-12-31`),
    paymentMethod: c(),
    purpose: c(),
    status: c("ACTIVE"),
    allocationState: c(
      this.route.snapshot.queryParamMap.get("allocationState") ?? "",
    ),
    bankAccountId: c(),
  });
  readonly methodOptions = [all, ...methods];
  readonly purposeOptions = [all, ...purposes];
  readonly stateOptions = [all, ...states];
  readonly statusOptions = [
    all,
    { value: "ACTIVE", label: "payments.active" },
    { value: "VOIDED", label: "payments.voided" },
  ];
  readonly currencies = signal([...CURRENCY_FILTER_OPTIONS]);
  readonly banks = signal([all]);
  readonly sort = signal<PaymentQuery["sort"]>("receivedAt");
  readonly direction = signal<"asc" | "desc">("desc");
  readonly money = money;
  readonly date = date;
  readonly methodLabel = paymentMethodLabel;
  readonly stateLabel = allocationLabel;
  private request = 0;
  constructor() {
    this.filters.valueChanges
      .pipe(debounceTime(250), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => {
        this.page.set(1);
        void this.load();
      });
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
        all,
        ...o.bankAccounts.map((b) => ({ value: b.id, label: b.name })),
      ]);
    } catch {
      /* The supported catalog and current-year defaults remain available. */
    }
    await this.load();
  }
  private async open(result: Observable<unknown>) {
    this.modalOpen = true;
    try {
      await firstValueFrom(result);
    } finally {
      this.modalOpen = false;
      await this.load();
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
    if (this.summaryExpanded()) void this.load();
  }
  async load() {
    const n = ++this.request;
    this.loading.set(true);
    this.error.set(false);
    const q = {
      ...this.filters.getRawValue(),
      page: this.page(),
      pageSize: this.pageSize(),
      sort: this.sort(),
      direction: this.direction(),
    } as PaymentQuery;
    try {
      const [r, t] = await Promise.all([
        firstValueFrom(this.api.list(q)),
        this.summaryExpanded()
          ? firstValueFrom(
              this.api.summary({
                clientId: q.clientId,
                from: q.from,
                to: q.to,
              }),
            )
          : Promise.resolve([]),
      ]);
      if (n === this.request) {
        this.result.set(r);
        this.totals.set(t);
      }
    } catch {
      if (n === this.request) this.error.set(true);
    } finally {
      if (n === this.request) this.loading.set(false);
    }
  }
  quick(type: string) {
    this.filters.patchValue({
      status: type === "VOIDED" ? "VOIDED" : "ACTIVE",
      allocationState:
        type === "UNALLOCATED"
          ? "UNALLOCATED"
          : type === "PARTIAL"
            ? "PARTIAL"
            : "",
      purpose: type === "ADVANCE" ? "ADVANCE" : "",
    });
  }
  reset() {
    this.filters.reset({
      status: "ACTIVE",
      from: `${this.defaultYear}-01-01`,
      to: `${this.defaultYear}-12-31`,
    });
  }
  order(sort: PaymentQuery["sort"]) {
    this.direction.set(
      this.sort() === sort && this.direction() === "asc" ? "desc" : "asc",
    );
    this.sort.set(sort);
    this.page.set(1);
    void this.load();
  }
  changePage(value: number) {
    this.page.set(value);
    void this.load();
  }
  changeSize(value: number) {
    this.pageSize.set(value);
    this.page.set(1);
    void this.load();
  }
}
