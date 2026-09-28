import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  FormArray,
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
import {
  HlmTable,
  HlmTableContainer,
  HlmTBody,
  HlmTd,
  HlmTh,
  HlmTHead,
  HlmTr,
} from "@spartan-ng/helm/table";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import { map } from "rxjs";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { BillingEntryDialogContext } from "./billing-entry-dialog.models";
import { toDateInputValue } from "./billing-entry-dialog.utils";

type BillingEntryKind = "TIME" | "FIXED_FEE" | "EXPENSE";

type BillingItemForm = FormGroup<{
  candidateKey: FormControl<string>;
  title: FormControl<string>;
  kind: FormControl<BillingEntryKind>;
  durationMinutes: FormControl<number | null>;
  amount: FormControl<number | null>;
}>;

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
    HlmTable,
    HlmTableContainer,
    HlmTBody,
    HlmTd,
    HlmTh,
    HlmTHead,
    HlmTr,
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
  readonly dialogRef = inject(BrnDialogRef<BillingEntrySummary[]>);
  readonly clients = signal<ClientSummary[]>([]);
  readonly cases = signal<CaseSummary[]>([]);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly candidates = this.context.candidates ?? [];

  private readonly candidateClientIds = [
    ...new Set(
      this.candidates
        .map((candidate) => candidate.client?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  private readonly initialClientId =
    this.context.clientId ??
    (this.candidateClientIds.length === 1 ? this.candidateClientIds[0] : "");
  private readonly candidateDates = this.candidates
    .map((candidate) => toDateInputValue(candidate.date))
    .sort();

  readonly form = new FormGroup({
    clientId: new FormControl(this.initialClientId, {
      nonNullable: true,
      validators: Validators.required,
    }),
    caseIds: new FormControl<string[]>(
      this.context.caseIds ?? this.initialCandidateCaseIds(),
      { nonNullable: true },
    ),
    workStartDate: new FormControl(
      this.candidateDates[0] ?? toDateInputValue(),
      { nonNullable: true, validators: Validators.required },
    ),
    workEndDate: new FormControl(
      this.candidateDates[this.candidateDates.length - 1] ?? toDateInputValue(),
      { nonNullable: true, validators: Validators.required },
    ),
    clientDescription: new FormControl("", {
      nonNullable: true,
      validators: Validators.required,
    }),
    description: new FormControl(
      this.candidates.map((candidate) => candidate.title).join(" · "),
      { nonNullable: true, validators: Validators.required },
    ),
    items: new FormArray<BillingItemForm>(
      this.candidates.length
        ? this.candidates.map((candidate) => this.createItem(candidate))
        : [this.createItem()],
      { validators: Validators.minLength(1) },
    ),
  });

  constructor() {
    this.clientsApi
      .list({ page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (response) => this.clients.set(response.items) });
    this.loadCases(this.form.controls.clientId.value);
    this.form.controls.clientId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((clientId) => {
        this.form.controls.caseIds.setValue([]);
        this.loadCases(clientId);
      });
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

  removeItem(index: number): void {
    this.form.controls.items.removeAt(index);
    this.form.controls.items.markAsDirty();
  }

  submit(): void {
    this.error.set("");
    if (
      this.form.invalid ||
      !this.form.controls.items.length ||
      this.form.controls.workEndDate.value <
        this.form.controls.workStartDate.value
    ) {
      this.form.markAllAsTouched();
      this.error.set(
        this.form.controls.workEndDate.value <
          this.form.controls.workStartDate.value
          ? "finance.invalidWorkPeriod"
          : "finance.validationError",
      );
      return;
    }

    const value = this.form.getRawValue();
    const sharedEntry = {
      clientId: value.clientId,
      caseIds: value.caseIds,
      workStartDate: value.workStartDate,
      workEndDate: value.workEndDate,
      description: value.description,
      clientDescription: value.clientDescription,
    };
    const request$ = this.candidates.length
      ? this.api.recordCandidates({
          ...sharedEntry,
          items: value.items.map((item) => ({
            candidateKey: item.candidateKey,
            kind: item.kind,
            durationMinutes: item.durationMinutes ?? undefined,
            amount: item.amount ?? 0,
          })),
        })
      : this.api
          .createEntry({
            ...sharedEntry,
            kind: value.items[0].kind,
            durationMinutes: value.items[0].durationMinutes ?? undefined,
            amount: value.items[0].amount ?? 0,
          })
          .pipe(map((entry) => [entry]));

    this.saving.set(true);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (entries) => this.dialogRef.close(entries),
      error: () => {
        this.error.set("finance.saveError");
        this.saving.set(false);
      },
    });
  }

  private initialCandidateCaseIds(): string[] {
    if (!this.initialClientId) return [];
    return [
      ...new Set(
        this.candidates
          .filter((candidate) => candidate.client?.id === this.initialClientId)
          .map((candidate) => candidate.case?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
  }

  private createItem(candidate?: BillingSuggestion): BillingItemForm {
    const item = new FormGroup({
      candidateKey: new FormControl(candidate?.candidateKey ?? "", {
        nonNullable: true,
      }),
      title: new FormControl(candidate?.title ?? "", { nonNullable: true }),
      kind: new FormControl<BillingEntryKind>(
        this.context.kind ?? "FIXED_FEE",
        { nonNullable: true, validators: Validators.required },
      ),
      durationMinutes: new FormControl<number | null>(null),
      amount: new FormControl<number | null>(null, [
        Validators.required,
        Validators.min(0.01),
      ]),
    });
    this.updateDurationValidators(item, item.controls.kind.value);
    item.controls.kind.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((kind) => this.updateDurationValidators(item, kind));
    return item;
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
    item: BillingItemForm,
    kind: BillingEntryKind,
  ): void {
    const control = item.controls.durationMinutes;
    control.setValidators(
      kind === "TIME" ? [Validators.required, Validators.min(1)] : [],
    );
    control.updateValueAndValidity({ emitEvent: false });
  }
}
