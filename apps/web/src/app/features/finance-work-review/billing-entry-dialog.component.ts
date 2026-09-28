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
  BillingSuggestion,
  CaseSummary,
  ClientSummary,
  EntryProposalResponse,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmComboboxContent,
  HlmComboboxEmpty,
  HlmComboboxItem,
  HlmComboboxList,
  HlmComboboxMultiple,
  HlmComboboxPortal,
  HlmComboboxTrigger,
} from "@spartan-ng/helm/combobox";
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { BillingEntryDialogContext } from "./billing-entry-dialog.models";
import {
  billingEntryValidationKey,
  toDateInputValue,
} from "./billing-entry-dialog.utils";

@Component({
  selector: "law-billing-entry-dialog",
  standalone: true,
  templateUrl: "./billing-entry-dialog.component.html",
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmComboboxContent,
    HlmComboboxEmpty,
    HlmComboboxItem,
    HlmComboboxList,
    HlmComboboxMultiple,
    HlmComboboxPortal,
    HlmComboboxTrigger,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmInput,
    HlmSpinner,
    HlmTextarea,
    TranslatePipe,
  ],
})
export class BillingEntryDialogComponent {
  private readonly api = inject(FinancialsApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly context =
    injectBrnDialogContext<BillingEntryDialogContext>();
  private readonly destroyRef = inject(DestroyRef);
  readonly dialogRef = inject(BrnDialogRef<BillingEntrySummary>);
  readonly clients = signal<ClientSummary[]>([]);
  readonly cases = signal<CaseSummary[]>([]);
  readonly proposal = signal<EntryProposalResponse | null>(null);
  readonly suggesting = signal(false);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly candidate: BillingSuggestion | undefined = this.context.candidate;
  readonly form = new FormGroup({
    kind: new FormControl<"TIME" | "FIXED_FEE" | "EXPENSE">(
      this.context.kind ?? "FIXED_FEE",
      { nonNullable: true, validators: Validators.required },
    ),
    workStartDate: new FormControl(
      toDateInputValue(this.context.candidate?.date),
      {
        nonNullable: true,
        validators: Validators.required,
      },
    ),
    workEndDate: new FormControl(
      toDateInputValue(this.context.candidate?.date),
      {
        nonNullable: true,
        validators: Validators.required,
      },
    ),
    clientId: new FormControl(
      this.context.clientId ?? this.context.candidate?.client?.id ?? "",
      {
        nonNullable: true,
        validators: Validators.required,
      },
    ),
    caseIds: new FormControl<string[]>(
      this.context.caseIds ??
        (this.context.candidate?.case ? [this.context.candidate.case.id] : []),
      { nonNullable: true },
    ),
    description: new FormControl(this.context.candidate?.title ?? "", {
      nonNullable: true,
      validators: Validators.required,
    }),
    clientDescription: new FormControl("", {
      nonNullable: true,
      validators: Validators.required,
    }),
    durationMinutes: new FormControl<number | null>(null),
    amount: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0),
    ]),
    currency: new FormControl("RSD", {
      nonNullable: true,
      validators: Validators.required,
    }),
    disposition: new FormControl<
      "BILLABLE" | "INCLUDED" | "NO_CHARGE" | "INTERNAL"
    >("BILLABLE", { nonNullable: true }),
    noChargeReason: new FormControl("", { nonNullable: true }),
    userInstruction: new FormControl("", { nonNullable: true }),
  });

  constructor() {
    this.clientsApi
      .list({ page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (response) => this.clients.set(response.items) });
    this.loadCases(this.form.controls.clientId.value);
    this.updateDurationValidators(this.form.controls.kind.value);
    this.form.controls.clientId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((clientId) => {
        this.form.controls.caseIds.setValue([]);
        this.loadCases(clientId);
      });
    this.form.controls.kind.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((kind) => this.updateDurationValidators(kind));
  }

  readonly caseItemToString = (value: string | null | undefined): string => {
    if (!value) return "";
    const caseItem = this.cases().find((item) => item.id === value);
    return caseItem ? `${caseItem.caseNumber} — ${caseItem.name}` : value;
  };

  selectedCasesLabel(): string {
    return this.form.controls.caseIds.value
      .map((caseId) => this.caseItemToString(caseId))
      .join(", ");
  }

  setCaseIds(caseIds: string[]): void {
    this.form.controls.caseIds.setValue(caseIds);
    this.form.controls.caseIds.markAsDirty();
  }

  suggest(): void {
    const value = this.form.getRawValue();
    this.error.set("");
    if (!value.clientId) {
      this.form.controls.clientId.markAsTouched();
      this.error.set("finance.validationError");
      return;
    }
    if (!value.userInstruction.trim()) {
      this.form.controls.userInstruction.markAsTouched();
      this.error.set("finance.proposalInstructionRequired");
      return;
    }
    this.suggesting.set(true);
    this.api
      .entryProposal({
        clientId: value.clientId,
        caseIds: value.caseIds,
        candidateKey: this.candidate?.candidateKey,
        userInstruction: value.userInstruction,
        currentDraft: {
          kind: value.kind,
          workStartDate: value.workStartDate,
          workEndDate: value.workEndDate,
          durationMinutes: value.durationMinutes ?? undefined,
          description: value.description,
          clientDescription: value.clientDescription,
          disposition: value.disposition,
          amount: value.amount?.toString(),
          currency: value.currency,
        },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (proposal) => {
          this.proposal.set(proposal);
          this.suggesting.set(false);
        },
        error: () => {
          this.error.set("finance.proposalUnavailable");
          this.suggesting.set(false);
        },
      });
  }

  applySuggestion(): void {
    const suggested = this.proposal()?.suggested;
    if (!suggested) return;
    this.form.patchValue({
      kind: suggested.kind ?? this.form.controls.kind.value,
      workStartDate: suggested.workStartDate
        ? toDateInputValue(suggested.workStartDate)
        : this.form.controls.workStartDate.value,
      workEndDate: suggested.workEndDate
        ? toDateInputValue(suggested.workEndDate)
        : this.form.controls.workEndDate.value,
      description:
        suggested.internalDescription ?? this.form.controls.description.value,
      clientDescription:
        suggested.clientDescription ??
        this.form.controls.clientDescription.value,
      durationMinutes: suggested.actualDurationMinutes,
      amount: suggested.amount === null ? null : Number(suggested.amount),
      disposition:
        suggested.disposition ?? this.form.controls.disposition.value,
    });
  }

  submit(): void {
    this.error.set("");
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set("finance.validationError");
      return;
    }
    const value = this.form.getRawValue();
    const validationKey = billingEntryValidationKey(value);
    if (validationKey) {
      this.form.markAllAsTouched();
      this.error.set(validationKey);
      return;
    }
    this.saving.set(true);
    this.api
      .createEntry({
        kind: value.kind,
        workStartDate: value.workStartDate,
        workEndDate: value.workEndDate,
        clientId: value.clientId,
        caseIds: value.caseIds,
        description: value.description,
        clientDescription: value.clientDescription,
        durationMinutes: value.durationMinutes ?? undefined,
        amount: value.amount ?? 0,
        currency: value.currency,
        disposition: value.disposition,
        noChargeReason: value.noChargeReason || undefined,
        candidateKey: this.candidate?.candidateKey,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (entry) => this.dialogRef.close(entry),
        error: () => {
          this.error.set("finance.saveError");
          this.saving.set(false);
        },
      });
  }

  private loadCases(clientId: string): void {
    if (!clientId) {
      this.cases.set([]);
      return;
    }
    this.casesApi
      .list({ clientId, page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (response) => this.cases.set(response.items) });
  }

  private updateDurationValidators(
    kind: "TIME" | "FIXED_FEE" | "EXPENSE",
  ): void {
    const control = this.form.controls.durationMinutes;
    control.setValidators(
      kind === "TIME" ? [Validators.required, Validators.min(1)] : [],
    );
    control.updateValueAndValidity({ emitEvent: false });
  }
}
