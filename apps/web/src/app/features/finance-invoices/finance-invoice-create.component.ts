import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import {
  Invoice,
  ClientSummary,
  OrganizationSettings,
  WorkEntry,
} from "@law/api-interfaces";
import {
  BillingSetupApiClient,
  ClientsApiClient,
  FinancialsApiClient,
  OrganizationSettingsApiClient,
  WorkEntriesApiClient,
} from "@law/api-clients";
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
import {
  EMPTY,
  Observable,
  catchError,
  forkJoin,
  map,
  of,
  switchMap,
} from "rxjs";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { LocalizationService } from "../../core/localization/localization.service";
import {
  CURRENCY_OPTIONS,
  createCurrencyItemToString,
} from "../../shared/currency";
import {
  InvoiceLineForm,
  ClientRate,
  appendUniqueWorkEntries,
  calculateInvoiceTotals,
  createInvoiceLineForm,
  detachInvoiceLineWorkEntries,
  incompatibleCurrencyIndexes,
  lineWorkEntryIds,
  normalizeCurrency,
  recalculateInvoiceLine,
  toInvoiceLineInput,
} from "./invoice-form";
import { InvoiceLineImportDialogService } from "./invoice-line-import-dialog.service";
import { ClientFormDialogService } from "../clients/client-create-edit-modal/client-form-dialog.service";
import { createSelectItemToString } from "../../shared/utils";

@Component({
  selector: "law-finance-invoice-create",
  standalone: true,
  templateUrl: "./finance-invoice-create.component.html",
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
export class FinanceInvoiceCreateComponent {
  private readonly api = inject(FinancialsApiClient);
  private readonly organizationSettingsApi = inject(
    OrganizationSettingsApiClient,
  );
  private readonly workEntriesApi = inject(WorkEntriesApiClient);
  private readonly billingSetupApi = inject(BillingSetupApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly importDialog = inject(InvoiceLineImportDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly clientDialog = inject(ClientFormDialogService);
  private readonly localization = inject(LocalizationService);

  readonly clients = signal<ClientSummary[]>([]);
  readonly clientsLoading = signal(false);
  readonly clientsError = signal(false);
  readonly invoiceLoading = signal(false);
  readonly invoiceLoadError = signal("");
  readonly saving = signal(false);
  readonly suggestingNumber = signal(false);
  readonly allowManualOverride = signal(true);
  readonly saveError = signal("");
  readonly formRevision = signal(0);
  readonly selectedClient = signal<ClientSummary | null>(null);
  private readonly organizationSettings = signal<OrganizationSettings | null>(
    null,
  );
  readonly invoiceIdempotencyKey = crypto.randomUUID();
  readonly invoiceId = this.route.snapshot.paramMap.get("id");
  readonly isEditMode = this.invoiceId !== null;
  private readonly requestedClientId =
    this.route.snapshot.queryParamMap.get("clientId");
  /** `?workEntryIds=a&workEntryIds=b` (or comma separated) from Unbilled work. */
  private readonly requestedWorkEntryIds = [
    ...new Set(
      this.route.snapshot.queryParamMap
        .getAll("workEntryIds")
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  private prefillStarted = false;
  private readonly registeredLines = new WeakSet<InvoiceLineForm>();

  readonly form = new FormGroup({
    invoiceNumber: new FormControl("", { nonNullable: true }),
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
    vatLiabilityTimingCode: new FormControl<"3" | "35" | "432" | null>("35"),
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
    printWorkSpecification: new FormControl(true, { nonNullable: true }),
    lines: new FormArray<InvoiceLineForm>([]),
  });

  readonly clientItemToString = (value: string | null | undefined): string =>
    this.clients().find((client) => client.id === value)?.displayName ?? "";
  readonly currencyOptions = CURRENCY_OPTIONS;
  readonly currencyItemToString = createCurrencyItemToString((key) =>
    this.localization.translate(key),
  );
  readonly vatTimingOptions = [
    { value: "35", label: "finance.sef.vatTiming35" },
    { value: "3", label: "finance.sef.vatTiming3" },
    { value: "432", label: "finance.sef.vatTiming432" },
  ];
  readonly vatTimingItemToString = createSelectItemToString(
    this.vatTimingOptions,
    (key) => this.localization.translate(key),
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
    return calculateInvoiceTotals(
      this.form.controls.lines.controls.map((line) => ({
        netAmount: line.controls.netAmount.value,
        vatAmount: line.controls.vatAmount.value,
      })),
    );
  });
  readonly pricingRequiredCount = computed(() => {
    this.formRevision();
    return this.form.controls.lines.controls.filter(
      (line) => line.controls.pricingRequired.value,
    ).length;
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
    this.organizationSettingsApi
      .get()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.organizationSettings.set(settings);
          this.allowManualOverride.set(
            settings.invoiceNumbering.allowManualOverride,
          );
          this.applyOrganizationDefaults(settings);
        },
      });
    if (this.isEditMode) {
      this.form.controls.clientId.disable({ emitEvent: false });
      this.form.controls.currency.disable({ emitEvent: false });
      this.loadInvoice();
    }
    this.loadClients();
    let previousClientId = this.form.controls.clientId.value;
    this.form.controls.clientId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((clientId) => {
        if (previousClientId && previousClientId !== clientId) {
          detachInvoiceLineWorkEntries(this.form.controls.lines.controls);
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

  loadInvoice(): void {
    if (!this.invoiceId) return;
    this.invoiceLoading.set(true);
    this.invoiceLoadError.set("");
    this.api
      .invoice(this.invoiceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invoice) => {
          if (invoice.status !== "DRAFT") {
            this.invoiceLoading.set(false);
            this.invoiceLoadError.set("finance.invoiceNotEditable");
            return;
          }
          this.populateInvoice(invoice);
          this.invoiceLoading.set(false);
        },
        error: () => {
          this.invoiceLoading.set(false);
          this.invoiceLoadError.set("finance.invoiceLoadError");
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
    const line = createInvoiceLineForm(
      undefined,
      normalizeCurrency(this.form.controls.currency.value) || "RSD",
      this.invoiceLineDefaultVatRate(),
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
    this.importDialog
      .open(client, lineWorkEntryIds(this.form.controls.lines.controls))
      .pipe(
        switchMap((entries) =>
          entries?.length
            ? forkJoin({
                entries: of(entries),
                rate: this.clientRate(client.id),
              })
            : EMPTY,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ entries, rate }) => this.appendEntries(entries, rate));
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
      this.saveError.set("finance.invoiceValidation");
      return;
    }

    const header = this.form.getRawValue();
    const totals = this.invoiceTotals();
    const lines = this.form.controls.lines.controls.map(toInvoiceLineInput);
    this.saving.set(true);
    const request = this.invoiceId
      ? this.api.updateInvoice(this.invoiceId, {
          invoiceNumber: this.allowManualOverride()
            ? header.invoiceNumber?.trim() || undefined
            : undefined,
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
          vatLiabilityTimingCode: header.vatLiabilityTimingCode,
          printWorkSpecification: header.printWorkSpecification,
          lines,
        })
      : this.api.createInvoice({
          invoiceNumber: this.allowManualOverride()
            ? header.invoiceNumber?.trim() || undefined
            : undefined,
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
          vatLiabilityTimingCode: header.vatLiabilityTimingCode,
          printWorkSpecification: header.printWorkSpecification,
          lines,
          idempotencyKey: this.invoiceIdempotencyKey,
        });
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (invoice) =>
        void this.router.navigate(["/finance/invoices", invoice.id]),
      error: () => {
        this.saving.set(false);
        this.saveError.set("finance.saveError");
        this.bumpRevision();
      },
    });
  }

  private populateInvoice(invoice: Invoice): void {
    this.form.patchValue(
      {
        invoiceNumber: invoice.invoiceNumber,
        clientId: invoice.clientId,
        dateOfCreate: invoice.dateOfCreate.slice(0, 10),
        dateOfMaturity: invoice.dateOfMaturity.slice(0, 10),
        dateOfTurnover: invoice.dateOfTurnover.slice(0, 10),
        placeOfIssue: invoice.placeOfIssue,
        methodOfPayment: invoice.methodOfPayment,
        comment: invoice.comment,
        vatRate: Number(invoice.vatRate),
        vatLiabilityTimingCode: invoice.vatLiabilityTimingCode,
        numberOfCashBill: invoice.numberOfCashBill,
        country: invoice.country,
        currency: invoice.currency,
        printWorkSpecification: invoice.printWorkSpecification,
      },
      { emitEvent: false },
    );
    this.form.controls.lines.clear({ emitEvent: false });
    for (const line of invoice.lines) {
      const lineForm = createInvoiceLineForm(line);
      this.form.controls.lines.push(lineForm, {
        emitEvent: false,
      });
      this.registerLine(lineForm);
    }
    this.selectedClient.set(
      this.clients().find((client) => client.id === invoice.clientId) ?? null,
    );
    this.form.markAsPristine();
    const settings = this.organizationSettings();
    if (settings) this.applyOrganizationDefaults(settings);
    this.bumpRevision();
  }

  suggestInvoiceNumber(): void {
    this.suggestingNumber.set(true);
    this.api
      .suggestInvoiceNumber(this.form.controls.dateOfCreate.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ invoiceNumber }) => {
          this.form.controls.invoiceNumber.setValue(invoiceNumber);
          this.suggestingNumber.set(false);
        },
        error: () => {
          this.saveError.set("finance.invoiceNumberSuggestionError");
          this.suggestingNumber.set(false);
        },
      });
  }

  private bumpRevision(): void {
    this.formRevision.update((value) => value + 1);
  }

  private loadRequestedWork(): void {
    if (
      this.prefillStarted ||
      !this.requestedClientId ||
      !this.requestedWorkEntryIds.length
    ) {
      return;
    }
    this.prefillStarted = true;
    const clientId = this.requestedClientId;
    forkJoin({
      entries: forkJoin(
        this.requestedWorkEntryIds.map((id) =>
          this.workEntriesApi.get(id).pipe(catchError(() => of(null))),
        ),
      ),
      rate: this.clientRate(clientId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ entries, rate }) => {
          const usable = entries.filter(
            (entry): entry is WorkEntry =>
              entry !== null &&
              entry.client.id === clientId &&
              entry.status === "CONFIRMED" &&
              entry.invoiceId === null,
          );
          this.appendEntries(usable, rate);
          if (usable.length !== this.requestedWorkEntryIds.length) {
            this.saveError.set("finance.someWorkUnavailable");
          }
        },
        error: () => this.saveError.set("finance.workImportError"),
      });
  }

  /** The client's hourly rate; `null` when it is not set or not readable. */
  private clientRate(clientId: string): Observable<ClientRate | null> {
    return this.billingSetupApi.getProfile(clientId).pipe(
      map((profile) => ({
        hourlyRate: profile.hourlyRate,
        currency: profile.currency,
      })),
      catchError(() => of(null)),
    );
  }

  private appendEntries(
    entries: readonly WorkEntry[],
    rate: ClientRate | null,
  ): void {
    // A new invoice bills in the client's currency, so the imported
    // entries can be priced from the client's rate.
    if (
      !this.isEditMode &&
      !this.form.controls.lines.length &&
      rate &&
      CURRENCY_OPTIONS.some(
        (option) => option.value === normalizeCurrency(rate.currency),
      )
    ) {
      this.form.controls.currency.setValue(normalizeCurrency(rate.currency));
    }
    const firstNewIndex = this.form.controls.lines.length;
    const added = appendUniqueWorkEntries(
      this.form.controls.lines,
      entries,
      normalizeCurrency(this.form.controls.currency.value) || "RSD",
      rate,
      this.invoiceLineDefaultVatRate(),
    );
    if (!added) return;
    this.registerLinesFrom(firstNewIndex);
    this.form.controls.lines.markAsDirty();
    this.bumpRevision();
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

  private applyOrganizationDefaults(settings: OrganizationSettings): void {
    const setTextDefault = (
      control:
        | typeof this.form.controls.placeOfIssue
        | typeof this.form.controls.methodOfPayment
        | typeof this.form.controls.comment
        | typeof this.form.controls.country
        | typeof this.form.controls.currency,
      value: string | null | undefined,
    ): void => {
      const normalized = value?.trim();
      if (!normalized || !control.pristine) return;
      if (this.isEditMode && control.value.trim()) return;
      control.setValue(normalized);
    };

    setTextDefault(
      this.form.controls.placeOfIssue,
      settings.invoiceDefaults?.defaultIssuePlace || settings.company?.city,
    );
    setTextDefault(
      this.form.controls.methodOfPayment,
      settings.payment?.defaultPaymentMethod,
    );
    setTextDefault(
      this.form.controls.comment,
      settings.invoiceDefaults?.defaultNote,
    );
    setTextDefault(this.form.controls.country, settings.company?.countryCode);
    setTextDefault(
      this.form.controls.currency,
      settings.currency?.defaultCurrencyCode,
    );

    if (!this.isEditMode && this.form.controls.dateOfMaturity.pristine) {
      this.form.controls.dateOfMaturity.setValue(
        addDays(
          this.form.controls.dateOfCreate.value,
          settings.payment?.defaultPaymentTermDays ?? 0,
        ),
      );
    }
    if (!this.isEditMode && this.form.controls.vatRate.pristine) {
      this.form.controls.vatRate.setValue(settings.tax?.defaultVatRate ?? 0);
    }
    if (
      this.form.controls.vatLiabilityTimingCode.pristine &&
      (!this.isEditMode ||
        this.form.controls.vatLiabilityTimingCode.value == null)
    ) {
      const defaultVatRate = settings.tax?.defaultVatRate;
      if (defaultVatRate !== null && defaultVatRate !== undefined)
        this.form.controls.vatLiabilityTimingCode.setValue(
          defaultVatRate > 0
            ? settings.tax?.cashAccountingEnabled
              ? "432"
              : "35"
            : null,
        );
    }

    for (const line of this.form.controls.lines.controls) {
      if (line.controls.id.value === null && line.controls.vatRate.pristine) {
        line.controls.vatRate.setValue(settings.tax?.defaultVatRate ?? 0, {
          emitEvent: false,
        });
        recalculateInvoiceLine(line, "vatRate");
      }
    }
    this.bumpRevision();
  }

  private invoiceLineDefaultVatRate(): number {
    return this.organizationSettings()?.tax.defaultVatRate ?? 0;
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

  private registerLine(line: InvoiceLineForm): void {
    if (this.registeredLines.has(line)) return;
    this.registeredLines.add(line);

    const recalculate = (
      source: Parameters<typeof recalculateInvoiceLine>[1],
    ): void => {
      recalculateInvoiceLine(line, source);
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

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + Math.max(0, Math.trunc(days)));
  return parsed.toISOString().slice(0, 10);
}
