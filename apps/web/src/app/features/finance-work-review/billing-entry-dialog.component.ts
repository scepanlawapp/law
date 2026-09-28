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
import { ClientsApiClient, FinancialsApiClient } from "@law/api-clients";
import {
  BillingStatementLineSummary,
  BillingSuggestion,
  ClientSummary,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSelectImports } from "@spartan-ng/helm/select";
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
import { forkJoin } from "rxjs";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { BillingStatementLineDialogContext } from "./billing-entry-dialog.models";

type BillingLineItemForm = FormGroup<{
  candidateKey: FormControl<string>;
  title: FormControl<string>;
  description: FormControl<string>;
  amount: FormControl<number | null>;
  currency: FormControl<string>;
}>;

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
    HlmField,
    HlmFieldLabel,
    HlmInput,
    HlmSelectImports,
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
export class BillingStatementLineDialogComponent {
  private readonly api = inject(FinancialsApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly context =
    injectBrnDialogContext<BillingStatementLineDialogContext>();
  private readonly destroyRef = inject(DestroyRef);
  readonly dialogRef = inject(BrnDialogRef<BillingStatementLineSummary[]>);
  readonly clients = signal<ClientSummary[]>([]);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly candidates = this.context.candidates ?? [];
  readonly clientItemToString = (value: string | null | undefined): string =>
    this.clients().find((client) => client.id === value)?.displayName ?? "";

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

  readonly form = new FormGroup({
    clientId: new FormControl(this.initialClientId, {
      nonNullable: true,
      validators: Validators.required,
    }),
    items: new FormArray<BillingLineItemForm>(
      this.candidates.length
        ? this.candidates.map((candidate) => this.createItem(candidate))
        : [this.createItem()],
      { validators: Validators.minLength(1) },
    ),
  });

  constructor() {
    if (this.candidates.length) this.form.controls.clientId.disable();
    this.clientsApi
      .list({ page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (response) => this.clients.set(response.items) });
  }

  totals(): Array<{ currency: string; amount: number }> {
    const totals = new Map<string, number>();
    for (const item of this.form.controls.items.controls) {
      const currency = item.controls.currency.value.trim().toUpperCase();
      const amount = item.controls.amount.value ?? 0;
      if (!currency || !Number.isFinite(amount)) continue;
      totals.set(currency, (totals.get(currency) ?? 0) + amount);
    }
    return [...totals].map(([currency, amount]) => ({ currency, amount }));
  }

  removeItem(index: number): void {
    this.form.controls.items.removeAt(index);
    this.form.controls.items.markAsDirty();
  }

  submit(): void {
    this.error.set("");
    if (this.form.invalid || !this.form.controls.items.length) {
      this.form.markAllAsTouched();
      this.error.set("finance.validationError");
      return;
    }

    const value = this.form.getRawValue();
    const items = value.items.map((item) => ({
      candidateKey: item.candidateKey,
      description: item.description.trim(),
      amount: item.amount ?? 0,
      currency: item.currency.trim().toUpperCase(),
    }));
    const request$ = this.candidates.length
      ? this.api.recordCandidateLines({ clientId: value.clientId, items })
      : forkJoin(
          items.map((item) =>
            this.api.createLine({
              clientId: value.clientId,
              description: item.description,
              amount: item.amount,
              currency: item.currency,
            }),
          ),
        );

    this.saving.set(true);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (lines) => this.dialogRef.close(lines),
      error: () => {
        this.error.set("finance.saveError");
        this.saving.set(false);
      },
    });
  }

  private createItem(candidate?: BillingSuggestion): BillingLineItemForm {
    return new FormGroup({
      candidateKey: new FormControl(candidate?.candidateKey ?? "", {
        nonNullable: true,
      }),
      title: new FormControl(candidate?.title ?? "", { nonNullable: true }),
      description: new FormControl(candidate?.title ?? "", {
        nonNullable: true,
        validators: Validators.required,
      }),
      amount: new FormControl<number | null>(null, [
        Validators.required,
        Validators.min(0.01),
      ]),
      currency: new FormControl("RSD", {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(3),
        ],
      }),
    });
  }
}
