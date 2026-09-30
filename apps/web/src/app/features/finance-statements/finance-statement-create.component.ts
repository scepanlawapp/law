import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { BillingStatement, ClientSummary } from "@law/api-interfaces";
import { ClientsApiClient, FinancialsApiClient } from "@law/api-clients";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideTrash2 } from "@ng-icons/lucide";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldError, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { LocalizationService } from "../../core/localization/localization.service";
import {
  CURRENCY_OPTIONS,
  createCurrencyItemToString,
} from "../../shared/currency";
import {
  BillingStatementLineForm,
  appendUniqueBillableWork,
  calculateBillingStatementLineAmounts,
  calculateBillingStatementTotals,
  createBillingStatementLineForm,
  detachBillingStatementLineSources,
  incompatibleCurrencyIndexes,
  normalizeCurrency,
} from "./billing-statement-form";
import { BillingStatementLineImportDialogService } from "./billing-statement-line-import-dialog.service";
import { ClientFormDialogService } from "../clients/client-create-edit-modal/client-form-dialog.service";

@Component({
  selector: "law-finance-statement-create",
  standalone: true,
  templateUrl: "./finance-statement-create.component.html",
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmButton,
    HlmField,
    HlmFieldError,
    HlmFieldLabel,
    HlmInput,
    HlmSelectImports,
    HlmSpinner,
    HlmTableImports,
    HlmTextarea,
    TranslatePipe,
  ],
  providers: [provideIcons({ lucideTrash2 })],
})
export class FinanceStatementCreateComponent {
  private readonly api = inject(FinancialsApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly importDialog = inject(
    BillingStatementLineImportDialogService,
  );
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly clientDialog = inject(ClientFormDialogService);
  private readonly localization = inject(LocalizationService);

  readonly clients = signal<ClientSummary[]>([]);
  readonly clientsLoading = signal(false);
  readonly clientsError = signal(false);
  readonly statementLoading = signal(false);
  readonly statementLoadError = signal("");
  readonly saving = signal(false);
  readonly saveError = signal("");
  readonly formRevision = signal(0);
  readonly selectedClient = signal<ClientSummary | null>(null);
  readonly statementIdempotencyKey = crypto.randomUUID();
  readonly statementId = this.route.snapshot.paramMap.get("id");
  readonly isEditMode = this.statementId !== null;
  private readonly requestedClientId =
    this.route.snapshot.queryParamMap.get("clientId");
  private readonly requestedSourceKeys =
    this.route.snapshot.queryParamMap.getAll("source");
  private prefillStarted = false;
  private readonly registeredLines = new WeakSet<BillingStatementLineForm>();

  readonly form = new FormGroup({
    clientId: new FormControl("", {
      nonNullable: true,
      validators: Validators.required,
    }),
    dateOfCreate: new FormControl(today(), {
      nonNullable: true,
      validators: Validators.required,
    }),
    dateOfMaturity: new FormControl(today(), {
      nonNullable: true,
      validators: Validators.required,
    }),
    dateOfTurnover: new FormControl(today(), {
      nonNullable: true,
      validators: Validators.required,
    }),
    placeOfIssue: new FormControl("", {
      nonNullable: true,
      validators: Validators.maxLength(255),
    }),
    methodOfPayment: new FormControl("", {
      nonNullable: true,
      validators: Validators.maxLength(255),
    }),
    comment: new FormControl("", {
      nonNullable: true,
      validators: Validators.maxLength(10_000),
    }),
    vatRate: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(100)],
    }),
    numberOfCashBill: new FormControl("", {
      nonNullable: true,
      validators: Validators.maxLength(255),
    }),
    country: new FormControl("", {
      nonNullable: true,
      validators: Validators.maxLength(255),
    }),
    currency: new FormControl("RSD", {
      nonNullable: true,
      validators: Validators.required,
    }),
    lines: new FormArray<BillingStatementLineForm>([]),
  });

  readonly clientItemToString = (value: string | null | undefined): string =>
    this.clients().find((client) => client.id === value)?.displayName ?? "";
  readonly currencyOptions = CURRENCY_OPTIONS;
  readonly currencyItemToString = createCurrencyItemToString((key) =>
    this.localization.translate(key),
  );
  readonly mismatchIndexes = computed(() => {
    this.formRevision();
    return incompatibleCurrencyIndexes(
      this.form.controls.lines.controls,
      this.form.controls.currency.value,
    );
  });
  readonly mismatchRows = computed(() =>
    this.mismatchIndexes()
      .map((index) => index + 1)
      .join(", "),
  );
  readonly invoiceTotals = computed(() => {
    this.formRevision();
    return calculateBillingStatementTotals(
      this.form.controls.lines.controls.map((line) => ({
        netAmount: line.controls.netAmount.value,
        vatAmount: line.controls.vatAmount.value,
      })),
    );
  });
  readonly canSave = computed(() => {
    this.formRevision();
    return (
      !this.saving() &&
      this.form.valid &&
      this.form.controls.lines.length > 0 &&
      this.mismatchIndexes().length === 0
    );
  });

  constructor() {
    if (this.isEditMode) {
      this.form.controls.clientId.disable({ emitEvent: false });
      this.form.controls.currency.disable({ emitEvent: false });
      this.loadStatement();
    }
    this.loadClients();
    let previousClientId = this.form.controls.clientId.value;
    this.form.controls.clientId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((clientId) => {
        if (previousClientId && previousClientId !== clientId) {
          detachBillingStatementLineSources(this.form.controls.lines.controls);
        }
        previousClientId = clientId;
        this.selectedClient.set(
          this.clients().find((client) => client.id === clientId) ?? null,
        );
        this.bumpRevision();
      });
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.bumpRevision());
  }

  loadStatement(): void {
    if (!this.statementId) return;
    this.statementLoading.set(true);
    this.statementLoadError.set("");
    this.api
      .statement(this.statementId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (statement) => {
          if (statement.status !== "DRAFT") {
            this.statementLoading.set(false);
            this.statementLoadError.set("finance.statementNotEditable");
            return;
          }
          this.populateStatement(statement);
          this.statementLoading.set(false);
        },
        error: () => {
          this.statementLoading.set(false);
          this.statementLoadError.set("finance.statementLoadError");
        },
      });
  }

  loadClients(): void {
    this.clientsLoading.set(true);
    this.clientsError.set(false);
    this.clientsApi
      .list({ page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (
            !this.isEditMode &&
            this.requestedClientId &&
            !response.items.some(
              (client) => client.id === this.requestedClientId,
            )
          ) {
            this.clientsApi
              .get(this.requestedClientId)
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe({
                next: (client) =>
                  this.applyClients([client, ...response.items]),
                error: () => {
                  this.applyClients(response.items);
                  this.saveError.set("finance.workImportError");
                },
              });
            return;
          }
          this.applyClients(response.items);
        },
        error: () => {
          this.clientsLoading.set(false);
          this.clientsError.set(true);
        },
      });
  }

  addManualLine(): void {
    const line = createBillingStatementLineForm(
      undefined,
      normalizeCurrency(this.form.controls.currency.value) || "RSD",
    );
    this.form.controls.lines.push(line);
    this.registerLine(line);
    this.form.controls.lines.markAsDirty();
    this.bumpRevision();
  }

  removeLine(index: number): void {
    this.form.controls.lines.removeAt(index);
    this.form.controls.lines.markAsDirty();
    this.bumpRevision();
  }

  openImportDialog(): void {
    const client = this.selectedClient();
    if (!client) return;
    const importedSourceKeys = this.form.controls.lines.controls.flatMap(
      (line) => {
        const type = line.controls.sourceType.value;
        const id = line.controls.sourceId.value;
        return type && id ? [`${type}:${id}`] : [];
      },
    );
    this.importDialog
      .open(client, importedSourceKeys)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((items) => {
        if (!items?.length) return;
        const firstNewIndex = this.form.controls.lines.length;
        const added = appendUniqueBillableWork(
          this.form.controls.lines,
          items,
          normalizeCurrency(this.form.controls.currency.value),
        );
        if (!added) return;
        this.registerLinesFrom(firstNewIndex);
        this.form.controls.lines.markAsDirty();
        this.bumpRevision();
      });
  }

  isCurrencyMismatch(index: number): boolean {
    return this.mismatchIndexes().includes(index);
  }

  formatCurrency(value: number, currency: string): string {
    return new Intl.NumberFormat(
      this.localization.language() === "EN" ? "en" : "sr-Latn",
      { style: "currency", currency },
    ).format(value);
  }

  submit(): void {
    this.saveError.set("");
    if (!this.canSave()) {
      this.form.markAllAsTouched();
      this.saveError.set("finance.statementValidation");
      return;
    }

    const header = this.form.getRawValue();
    const totals = this.invoiceTotals();
    const lines = this.form.controls.lines.controls.map((control) => {
      const value = control.getRawValue();
      return {
        serviceDate: value.serviceDate,
        description: value.description.trim(),
        netAmount: value.netAmount ?? 0,
        vatRate: value.vatRate ?? 0,
        vatAmount: value.vatAmount ?? 0,
        grossAmount: value.grossAmount ?? 0,
        currency: normalizeCurrency(value.currency),
        ...(value.sourceType && value.sourceId
          ? { sourceType: value.sourceType, sourceId: value.sourceId }
          : {}),
      };
    });
    this.saving.set(true);
    const request = this.statementId
      ? this.api.updateStatement(this.statementId, {
          dateOfCreate: header.dateOfCreate,
          dateOfMaturity: header.dateOfMaturity,
          dateOfTurnover: header.dateOfTurnover,
          placeOfIssue: header.placeOfIssue.trim(),
          methodOfPayment: header.methodOfPayment.trim(),
          comment: header.comment.trim(),
          netAmount: totals.netAmount,
          vatRate: header.vatRate,
          vatAmount: totals.vatAmount,
          grossAmount: totals.grossAmount,
          numberOfCashBill: header.numberOfCashBill.trim(),
          country: header.country.trim(),
          lines,
        })
      : this.api.createStatement({
          clientId: header.clientId,
          dateOfCreate: header.dateOfCreate,
          dateOfMaturity: header.dateOfMaturity,
          dateOfTurnover: header.dateOfTurnover,
          placeOfIssue: header.placeOfIssue.trim(),
          methodOfPayment: header.methodOfPayment.trim(),
          comment: header.comment.trim(),
          netAmount: totals.netAmount,
          vatRate: header.vatRate,
          vatAmount: totals.vatAmount,
          grossAmount: totals.grossAmount,
          numberOfCashBill: header.numberOfCashBill.trim(),
          country: header.country.trim(),
          currency: normalizeCurrency(header.currency),
          lines,
          idempotencyKey: this.statementIdempotencyKey,
        });
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => void this.router.navigate(["/finance/statements"]),
      error: () => {
        this.saving.set(false);
        this.saveError.set("finance.saveError");
        this.bumpRevision();
      },
    });
  }

  private populateStatement(statement: BillingStatement): void {
    this.form.patchValue(
      {
        clientId: statement.clientId,
        dateOfCreate: statement.dateOfCreate.slice(0, 10),
        dateOfMaturity: statement.dateOfMaturity.slice(0, 10),
        dateOfTurnover: statement.dateOfTurnover.slice(0, 10),
        placeOfIssue: statement.placeOfIssue,
        methodOfPayment: statement.methodOfPayment,
        comment: statement.comment,
        vatRate: Number(statement.vatRate),
        numberOfCashBill: statement.numberOfCashBill,
        country: statement.country,
        currency: statement.currency,
      },
      { emitEvent: false },
    );
    this.form.controls.lines.clear({ emitEvent: false });
    for (const line of statement.lines) {
      const lineForm = createBillingStatementLineForm(line);
      this.form.controls.lines.push(lineForm, {
        emitEvent: false,
      });
      this.registerLine(lineForm);
    }
    this.selectedClient.set(
      this.clients().find((client) => client.id === statement.clientId) ?? null,
    );
    this.form.markAsPristine();
    this.bumpRevision();
  }

  private bumpRevision(): void {
    this.formRevision.update((value) => value + 1);
  }

  private loadRequestedWork(): void {
    if (
      this.prefillStarted ||
      !this.requestedClientId ||
      !this.requestedSourceKeys.length
    ) {
      return;
    }
    this.prefillStarted = true;
    this.api
      .billableWork({
        clientId: this.requestedClientId,
        sourceKeys: this.requestedSourceKeys,
        page: 1,
        pageSize: Math.max(1, this.requestedSourceKeys.length),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const firstNewIndex = this.form.controls.lines.length;
          appendUniqueBillableWork(
            this.form.controls.lines,
            response.items,
            normalizeCurrency(this.form.controls.currency.value),
          );
          this.registerLinesFrom(firstNewIndex);
          if (response.items.length !== this.requestedSourceKeys.length) {
            this.saveError.set("finance.someWorkUnavailable");
          }
          this.form.controls.lines.markAsDirty();
          this.bumpRevision();
        },
        error: () => this.saveError.set("finance.workImportError"),
      });
  }

  private applyClients(clients: ClientSummary[]): void {
    this.clients.set(clients);
    if (!this.isEditMode && this.requestedClientId) {
      const requestedClient = clients.find(
        (client) => client.id === this.requestedClientId,
      );
      if (requestedClient) {
        this.form.controls.clientId.setValue(requestedClient.id);
        this.loadRequestedWork();
      }
    }
    this.selectedClient.set(
      clients.find(
        (client) => client.id === this.form.controls.clientId.value,
      ) ?? null,
    );
    this.clientsLoading.set(false);
  }

  openClientDialog(): void {
    this.clientDialog
      .create()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((client) => {
        if (!client) return;
        this.form.controls.clientId.setValue(client.id);
      });
  }

  private registerLinesFrom(firstIndex: number): void {
    for (
      let index = firstIndex;
      index < this.form.controls.lines.length;
      index += 1
    ) {
      this.registerLine(this.form.controls.lines.at(index));
    }
  }

  private registerLine(line: BillingStatementLineForm): void {
    if (this.registeredLines.has(line)) return;
    this.registeredLines.add(line);

    const recalculate = (
      source: Parameters<typeof calculateBillingStatementLineAmounts>[0],
    ): void => {
      const amounts = calculateBillingStatementLineAmounts(
        source,
        line.getRawValue(),
      );
      line.patchValue(amounts, { emitEvent: false });
      this.bumpRevision();
    };

    line.controls.netAmount.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => recalculate("netAmount"));
    line.controls.vatRate.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => recalculate("vatRate"));
    line.controls.vatAmount.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => recalculate("vatAmount"));
    line.controls.grossAmount.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => recalculate("grossAmount"));

    if (line.controls.netAmount.value !== null) recalculate("netAmount");
  }
}

function today(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
