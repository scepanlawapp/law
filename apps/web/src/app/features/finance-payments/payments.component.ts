import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
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
import { debounceTime, firstValueFrom } from "rxjs";
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
    RouterLink,
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
  readonly pageSize = signal(25);
  readonly advanced = signal(false);
  readonly filters = new FormGroup({
    search: c(),
    clientId: c(this.route.snapshot.queryParamMap.get("clientId") ?? ""),
    currency: c(),
    from: c(),
    to: c(),
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
  readonly currencies = signal([all]);
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
    void this.load();
    this.api
      .options()
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe({
        next: (o) => {
          this.currencies.set([
            all,
            ...o.currencies.map((value) => ({ value, label: value })),
          ]);
          this.banks.set([
            all,
            ...o.bankAccounts.map((b) => ({ value: b.id, label: b.name })),
          ]);
        },
        error: () => this.error.set(true),
      });
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
        firstValueFrom(this.api.summary(q)),
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
    this.filters.reset({ status: "ACTIVE" });
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
