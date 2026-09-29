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
  BillingStatementLineSummary,
  ClientSummary,
} from "@law/api-interfaces";
import { ClientsApiClient, FinancialsApiClient } from "@law/api-clients";
import { Router, RouterLink } from "@angular/router";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldError, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { Observable, concatMap, from, switchMap, tap, toArray } from "rxjs";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import {
  BillingStatementLineForm,
  appendUniqueBillingStatementLines,
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
    HlmButton,
    HlmField,
    HlmFieldError,
    HlmFieldLabel,
    HlmInput,
    HlmSelectImports,
    HlmSpinner,
    HlmTableImports,
    TranslatePipe,
  ],
})
export class FinanceStatementCreateComponent {
  private readonly api = inject(FinancialsApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly importDialog = inject(
    BillingStatementLineImportDialogService,
  );
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly clientDialog = inject(ClientFormDialogService);

  readonly clients = signal<ClientSummary[]>([]);
  readonly clientsLoading = signal(false);
  readonly clientsError = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal("");
  readonly formRevision = signal(0);
  readonly selectedClient = signal<ClientSummary | null>(null);
  readonly statementIdempotencyKey = crypto.randomUUID();

  readonly form = new FormGroup({
    clientId: new FormControl("", {
      nonNullable: true,
      validators: Validators.required,
    }),
    periodStart: new FormControl(today(), {
      nonNullable: true,
      validators: Validators.required,
    }),
    periodEnd: new FormControl(today(), {
      nonNullable: true,
      validators: Validators.required,
    }),
    currency: new FormControl("RSD", {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)],
    }),
    lines: new FormArray<BillingStatementLineForm>([]),
  });

  readonly clientItemToString = (value: string | null | undefined): string =>
    this.clients().find((client) => client.id === value)?.displayName ?? "";
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
  readonly total = computed(() => {
    this.formRevision();
    return this.form.controls.lines.controls.reduce(
      (sum, line) => sum + (line.controls.amount.value ?? 0),
      0,
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

  loadClients(): void {
    this.clientsLoading.set(true);
    this.clientsError.set(false);
    this.clientsApi
      .list({ page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.clients.set(response.items);
          this.selectedClient.set(
            response.items.find(
              (client) => client.id === this.form.controls.clientId.value,
            ) ?? null,
          );
          this.clientsLoading.set(false);
        },
        error: () => {
          this.clientsLoading.set(false);
          this.clientsError.set(true);
        },
      });
  }

  addManualLine(): void {
    this.form.controls.lines.push(
      createBillingStatementLineForm(
        undefined,
        normalizeCurrency(this.form.controls.currency.value) || "RSD",
      ),
    );
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
    const importedIds = this.form.controls.lines.controls
      .map((line) => line.controls.id.value)
      .filter((id): id is string => Boolean(id));
    this.importDialog
      .open(client, importedIds)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((lines) => {
        if (!lines?.length) return;
        const added = appendUniqueBillingStatementLines(
          this.form.controls.lines,
          lines,
        );
        if (!added) return;
        this.form.controls.lines.markAsDirty();
        this.bumpRevision();
      });
  }

  isCurrencyMismatch(index: number): boolean {
    return this.mismatchIndexes().includes(index);
  }

  submit(): void {
    this.saveError.set("");
    if (!this.canSave()) {
      this.form.markAllAsTouched();
      this.saveError.set("finance.statementValidation");
      return;
    }

    const header = this.form.getRawValue();
    const controls = [...this.form.controls.lines.controls];
    this.saving.set(true);
    from(controls)
      .pipe(
        concatMap((control) =>
          this.persistLine(control, header.clientId).pipe(
            tap((line) => {
              control.controls.id.setValue(line.id, { emitEvent: false });
              control.markAsPristine();
            }),
          ),
        ),
        toArray(),
        switchMap((lines) =>
          this.api.createStatement({
            clientId: header.clientId,
            periodStart: header.periodStart,
            periodEnd: header.periodEnd,
            currency: normalizeCurrency(header.currency),
            lineIds: lines.map((line) => line.id),
            idempotencyKey: this.statementIdempotencyKey,
          }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => void this.router.navigate(["/finance/statements"]),
        error: () => {
          this.saving.set(false);
          this.saveError.set("finance.saveError");
          this.bumpRevision();
        },
      });
  }

  private persistLine(
    control: BillingStatementLineForm,
    clientId: string,
  ): Observable<BillingStatementLineSummary> {
    const value = control.getRawValue();
    const amount = value.amount ?? 0;
    const currency = normalizeCurrency(value.currency);
    if (value.id) {
      return this.api.updateLine(value.id, {
        description: value.description.trim(),
        amount,
        currency,
      });
    }
    return this.api.createLine({
      clientId,
      performedByUserId: value.performedByUserId ?? undefined,
      serviceDate: value.serviceDate,
      description: value.description.trim(),
      amount,
      currency,
    });
  }

  private bumpRevision(): void {
    this.formRevision.update((value) => value + 1);
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
}

function today(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
