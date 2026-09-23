import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import {
  CasesApiClient,
  ClientsApiClient,
  FinancialsApiClient,
} from "@law/api-clients";
import {
  BillingEntrySummary,
  CaseSummary,
  ClientSummary,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { BillingEntryDialogContext } from "./billing-entry-dialog.models";

@Component({
  selector: "law-billing-entry-dialog",
  standalone: true,
  templateUrl: "./billing-entry-dialog.component.html",
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmInput,
    HlmSpinner,
    TranslatePipe,
  ],
})
export class BillingEntryDialogComponent {
  private readonly api = inject(FinancialsApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly context =
    injectBrnDialogContext<BillingEntryDialogContext>();
  readonly dialogRef = inject(BrnDialogRef<BillingEntrySummary>);
  readonly clients = signal<ClientSummary[]>([]);
  readonly cases = signal<CaseSummary[]>([]);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly candidate = this.context.candidate;
  readonly form = new FormGroup({
    kind: new FormControl<"TIME" | "FIXED_FEE" | "EXPENSE">(
      this.context.kind ?? "TIME",
      { nonNullable: true },
    ),
    workDate: new FormControl(this.localDate(this.candidate?.date), {
      nonNullable: true,
      validators: Validators.required,
    }),
    clientId: new FormControl(
      this.context.clientId ?? this.candidate?.client?.id ?? "",
      { nonNullable: true, validators: Validators.required },
    ),
    caseId: new FormControl(
      this.context.caseId ?? this.candidate?.case?.id ?? "",
      { nonNullable: true },
    ),
    description: new FormControl(this.candidate?.title ?? "", {
      nonNullable: true,
      validators: Validators.required,
    }),
    clientDescription: new FormControl(this.candidate?.title ?? "", {
      nonNullable: true,
    }),
    durationMinutes: new FormControl<number | null>(null),
    amount: new FormControl<string>("", { nonNullable: true }),
    currency: new FormControl("RSD", {
      nonNullable: true,
      validators: Validators.required,
    }),
    disposition: new FormControl<
      "BILLABLE" | "INCLUDED" | "NO_CHARGE" | "INTERNAL"
    >("BILLABLE", { nonNullable: true }),
    noChargeReason: new FormControl("", { nonNullable: true }),
  });

  constructor() {
    this.clientsApi
      .list({ page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (response) => this.clients.set(response.items) });
    this.form.controls.clientId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((clientId) => {
        this.form.controls.caseId.setValue("");
        this.cases.set([]);
        if (clientId)
          this.casesApi
            .list({ clientId, page: 1, pageSize: 100 })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ next: (response) => this.cases.set(response.items) });
      });
    if (this.form.controls.clientId.value)
      this.loadCases(this.form.controls.clientId.value);
  }

  submit(): void {
    this.error.set("");
    const value = this.form.getRawValue();
    const amount = value.amount.trim();
    const valid =
      this.form.valid &&
      (value.kind !== "TIME" || (value.durationMinutes ?? 0) > 0) &&
      (value.disposition !== "BILLABLE"
        ? amount === "0" && !!value.noChargeReason.trim()
        : /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount) > 0);
    if (!valid) {
      this.form.markAllAsTouched();
      this.error.set(this.localization.translate("finance.validationError"));
      return;
    }
    this.saving.set(true);
    this.api
      .createEntry({
        ...value,
        amount,
        caseId: value.caseId || undefined,
        clientDescription: value.clientDescription || value.description,
        durationMinutes: value.durationMinutes || undefined,
        sourceType: this.candidate?.sourceType,
        sourceId: this.candidate?.sourceId,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (entry) => this.dialogRef.close(entry),
        error: () => {
          this.saving.set(false);
          this.error.set(this.localization.translate("finance.saveError"));
        },
      });
  }

  private loadCases(clientId: string): void {
    this.casesApi
      .list({ clientId, page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (response) => this.cases.set(response.items) });
  }
  private localDate(value?: string): string {
    if (!value) return new Date().toLocaleDateString("en-CA");
    return value.slice(0, 10);
  }
}
