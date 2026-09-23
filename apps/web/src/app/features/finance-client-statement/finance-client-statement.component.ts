import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { switchMap } from "rxjs";
import { ClientsApiClient, FinancialsApiClient } from "@law/api-clients";
import {
  BillingEntrySummary,
  BillingStatement,
  ClientSummary,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
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
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { LocalizationService } from "../../core/localization/localization.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";

type StatementFilter = "ALL" | "DRAFT" | "SENT";

@Component({
  selector: "law-finance-client-statement",
  standalone: true,
  templateUrl: "./finance-client-statement.component.html",
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButton,
    HlmInput,
    HlmSpinner,
    HlmTable,
    HlmTableContainer,
    HlmTBody,
    HlmTd,
    HlmTh,
    HlmTHead,
    HlmTr,
    TranslatePipe,
  ],
})
export class FinanceClientStatementComponent {
  private readonly api = inject(FinancialsApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);
  readonly statements = signal<BillingStatement[]>([]);
  readonly entries = signal<BillingEntrySummary[]>([]);
  readonly clients = signal<ClientSummary[]>([]);
  readonly filter = signal<StatementFilter>("ALL");
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal(false);
  readonly message = signal("");
  readonly selected = signal(new Set<string>());
  readonly detail = signal<BillingStatement | null>(null);
  private entryRequest = 0;
  private draftIdempotencyKey: string | null = null;
  readonly form = new FormGroup({
    clientId: new FormControl("", {
      nonNullable: true,
      validators: Validators.required,
    }),
    periodStart: new FormControl(this.monthStart(), {
      nonNullable: true,
      validators: Validators.required,
    }),
    periodEnd: new FormControl(this.today(), {
      nonNullable: true,
      validators: Validators.required,
    }),
    currency: new FormControl("RSD", {
      nonNullable: true,
      validators: Validators.required,
    }),
  });
  readonly invoiceForm = new FormGroup({
    invoiceNumber: new FormControl("", { nonNullable: true }),
    invoiceDate: new FormControl("", { nonNullable: true }),
    reference: new FormControl("", { nonNullable: true }),
  });
  readonly paymentForm = new FormGroup({
    amount: new FormControl("", {
      nonNullable: true,
      validators: Validators.required,
    }),
    currency: new FormControl("RSD", {
      nonNullable: true,
      validators: Validators.required,
    }),
    paidDate: new FormControl(this.today(), {
      nonNullable: true,
      validators: Validators.required,
    }),
    externalReference: new FormControl("", { nonNullable: true }),
  });

  constructor() {
    this.clientsApi
      .list({ page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (response) => this.clients.set(response.items) });
    this.load();
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const statementId = params.get("statementId");
          this.detail.set(null);
          return statementId ? this.api.statement(statementId) : [];
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({ next: (statement) => this.detail.set(statement) });
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const clientId = params.get("clientId") ?? "";
        this.form.controls.clientId.setValue(clientId, { emitEvent: false });
        if (clientId)
          this.loadEligibleEntries(clientId, this.form.controls.currency.value);
      });
    this.form.controls.clientId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((clientId) => {
        this.selected.set(new Set());
        this.loadEligibleEntries(clientId, this.form.controls.currency.value);
      });
    this.form.controls.currency.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((currency) =>
        this.loadEligibleEntries(this.form.controls.clientId.value, currency),
      );
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api
      .statements()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.statements.set(items);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  visibleStatements(): BillingStatement[] {
    return this.statements().filter(
      (item) => this.filter() === "ALL" || item.status === this.filter(),
    );
  }
  setFilter(filter: StatementFilter): void {
    this.filter.set(filter);
  }
  selectEntry(entry: BillingEntrySummary): void {
    const next = new Set(this.selected());
    if (next.has(entry.id)) next.delete(entry.id);
    else next.add(entry.id);
    this.selected.set(next);
  }

  createDraft(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.selected().size) {
      this.message.set("finance.statementValidation");
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    this.api
      .createStatement({
        ...value,
        entryIds: [...this.selected()],
        idempotencyKey:
          this.draftIdempotencyKey ??
          (this.draftIdempotencyKey = crypto.randomUUID()),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.draftIdempotencyKey = null;
          this.message.set("finance.saved");
          this.load();
        },
        error: () => {
          this.saving.set(false);
          this.message.set("finance.saveError");
        },
      });
  }

  send(statement: BillingStatement): void {
    this.confirm
      .confirm({
        title: "finance.sendExternal",
        message: "finance.sendConfirm",
        confirmText: "finance.sendExternal",
      })
      .pipe(
        switchMap((confirmed) =>
          confirmed
            ? this.api.sendStatement(
                statement.id,
                "EXTERNAL",
                crypto.randomUUID(),
              )
            : [],
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.toast.success("finance.saved");
          this.load();
        },
        error: () => this.toast.error("finance.saveError"),
      });
  }
  voidStatement(statement: BillingStatement): void {
    this.confirm
      .confirm({
        title: "finance.void",
        message: "finance.voidConfirm",
        confirmText: "finance.void",
        variant: "danger",
      })
      .pipe(
        switchMap((confirmed) =>
          confirmed ? this.api.voidStatement(statement.id) : [],
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.toast.success("finance.saved");
          this.load();
        },
        error: () => this.toast.error("finance.saveError"),
      });
  }
  closeDetail(): void {
    this.detail.set(null);
  }
  linkInvoice(statement: BillingStatement): void {
    this.api
      .linkExternalInvoice(statement.id, this.invoiceForm.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.detail.set(updated);
          this.load();
        },
        error: () => this.message.set("finance.saveError"),
      });
  }
  addPayment(statement: BillingStatement): void {
    const value = this.paymentForm.getRawValue();
    if (
      this.paymentForm.invalid ||
      !/^\d+(\.\d{1,2})?$/.test(value.amount) ||
      Number(value.amount) <= 0
    ) {
      this.paymentForm.markAllAsTouched();
      this.message.set("finance.validationError");
      return;
    }
    this.api
      .addPayment(statement.id, {
        amount: Number(value.amount),
        currency: value.currency,
        paidDate: value.paidDate,
        externalReference: value.externalReference || undefined,
        idempotencyKey: crypto.randomUUID(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.message.set("finance.saved");
          this.api
            .statement(statement.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ next: (updated) => this.detail.set(updated) });
        },
        error: () => this.message.set("finance.saveError"),
      });
  }
  total(statement: BillingStatement): string {
    return this.money(statement.total, statement.currency);
  }
  paid(statement: BillingStatement): string {
    return this.money(statement.paid, statement.currency);
  }
  outstanding(statement: BillingStatement): string {
    return this.money(statement.outstanding, statement.currency);
  }
  paymentStatus(statement: BillingStatement): string {
    return statement.paymentStatus === "PAID"
      ? "finance.paidStatus"
      : statement.paymentStatus === "PARTIAL"
        ? "finance.partial"
        : "finance.unpaid";
  }
  formatDate(value: string | null): string {
    return value
      ? new Intl.DateTimeFormat(this.locale(), { dateStyle: "medium" }).format(
          new Date(value),
        )
      : "—";
  }
  private loadEligibleEntries(clientId: string, currency: string): void {
    const request = ++this.entryRequest;
    this.entries.set([]);
    if (!clientId) return;
    this.api
      .entries({
        page: 1,
        pageSize: 100,
        clientId,
        lifecycle: "READY",
        currency,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (request === this.entryRequest) this.entries.set(response.items);
        },
      });
  }
  private money(value: string, currency: string): string {
    return new Intl.NumberFormat(this.locale(), {
      style: "currency",
      currency,
    }).format(Number(value));
  }
  private today(): string {
    return new Date().toLocaleDateString("en-CA");
  }
  private monthStart(): string {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1).toLocaleDateString(
      "en-CA",
    );
  }
  private locale(): string {
    return this.localization.language() === "SR" ? "sr-Latn-RS" : "en-US";
  }
}
