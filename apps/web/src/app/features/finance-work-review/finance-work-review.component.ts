import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { CasesApiClient, ClientsApiClient, FinancialsApiClient } from "@law/api-clients";
import { BillingEntrySummary, BillingSuggestion, CaseSummary, ClientSummary } from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTable, HlmTableContainer, HlmTBody, HlmTd, HlmTh, HlmTHead, HlmTr } from "@spartan-ng/helm/table";
import { TranslatePipe } from "../../core/localization/translate.pipe";

type ReviewTab = "candidates" | "entries";

@Component({
  selector: "law-finance-work-review",
  standalone: true,
  templateUrl: "./finance-work-review.component.html",
  imports: [ReactiveFormsModule, HlmButton, HlmInput, HlmSpinner, HlmTable, HlmTableContainer, HlmTBody, HlmTd, HlmTh, HlmTHead, HlmTr, TranslatePipe],
})
export class FinanceWorkReviewComponent {
  private readonly api = inject(FinancialsApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly tab = signal<ReviewTab>("candidates");
  readonly candidates = signal<BillingSuggestion[]>([]);
  readonly entries = signal<BillingEntrySummary[]>([]);
  readonly clients = signal<ClientSummary[]>([]);
  readonly cases = signal<CaseSummary[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal(false);
  readonly message = signal("");
  readonly selected = signal(new Set<string>());
  readonly clientFilter = new FormControl("", { nonNullable: true });
  readonly sourceFilter = new FormControl("", { nonNullable: true });
  readonly entryFilter = new FormControl("", { nonNullable: true });
  readonly workForm = new FormGroup({
    kind: new FormControl<"TIME" | "FIXED_FEE" | "EXPENSE">("TIME", { nonNullable: true }),
    workDate: new FormControl(this.today(), { nonNullable: true, validators: Validators.required }),
    clientId: new FormControl("", { nonNullable: true, validators: Validators.required }),
    caseId: new FormControl("", { nonNullable: true }),
    description: new FormControl("", { nonNullable: true, validators: Validators.required }),
    clientDescription: new FormControl("", { nonNullable: true }),
    durationMinutes: new FormControl<number | null>(null),
    amount: new FormControl<number | null>(null, Validators.min(0)),
    currency: new FormControl("RSD", { nonNullable: true, validators: Validators.required }),
    disposition: new FormControl<"BILLABLE" | "INCLUDED" | "NO_CHARGE" | "INTERNAL">("BILLABLE", { nonNullable: true }),
    noChargeReason: new FormControl("", { nonNullable: true }),
  });

  constructor() {
    this.clientsApi.list({ page: 1, pageSize: 100 }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (response) => this.clients.set(response.items) });
    this.clientFilter.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadCandidates());
    this.sourceFilter.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadCandidates());
    this.entryFilter.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadEntries());
    this.workForm.controls.clientId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((clientId) => {
      this.workForm.controls.caseId.setValue("");
      this.cases.set([]);
      if (clientId) this.casesApi.list({ clientId, page: 1, pageSize: 100 }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (response) => this.cases.set(response.items) });
    });
    this.loadCandidates();
  }

  loadCandidates(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api.candidates({ page: 1, pageSize: 50, clientId: this.clientFilter.value || undefined, sourceType: this.sourceFilter.value || undefined }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => { this.candidates.set(response.items); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(true); },
    });
  }

  loadEntries(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api.entries({ page: 1, pageSize: 50, clientId: this.entryFilter.value || undefined }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => { this.entries.set(response.items); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(true); },
    });
  }

  selectTab(tab: ReviewTab): void { this.tab.set(tab); if (tab === "entries") this.loadEntries(); else this.loadCandidates(); }
  dismiss(item: BillingSuggestion): void { this.api.dismissCandidate(item.candidateKey).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: () => this.loadCandidates() }); }
  reopen(item: BillingSuggestion): void { this.api.reopenCandidate(item.candidateKey).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: () => this.loadCandidates() }); }

  toggleEntry(entry: BillingEntrySummary): void {
    if (!["DRAFT", "READY"].includes(entry.lifecycle) || entry.disposition === "INTERNAL") return;
    const current = new Set(this.selected());
    if (current.has(entry.id)) current.delete(entry.id);
    else if (!current.size || this.entries().find((item) => item.id === [...current][0])?.client.id === entry.client.id) current.add(entry.id);
    else this.message.set("finance.selectionOneClient");
    this.selected.set(current);
  }

  saveWork(): void {
    this.message.set("");
    this.workForm.markAllAsTouched();
    const value = this.workForm.getRawValue();
    const amount = value.amount ?? 0;
    const valid = this.workForm.valid && (value.kind !== "TIME" || (value.durationMinutes ?? 0) > 0) && (value.disposition !== "BILLABLE" || amount > 0) && (!["INCLUDED", "NO_CHARGE"].includes(value.disposition) || (amount === 0 && !!value.noChargeReason.trim()));
    if (!valid) { this.message.set("finance.validationError"); return; }
    this.saving.set(true);
    this.api.createEntry({ ...value, caseId: value.caseId || undefined, clientDescription: value.clientDescription || value.description, durationMinutes: value.durationMinutes || undefined, amount }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.saving.set(false); this.workForm.reset({ kind: "TIME", workDate: this.today(), clientId: "", caseId: "", description: "", clientDescription: "", durationMinutes: null, amount: null, currency: "RSD", disposition: "BILLABLE", noChargeReason: "" }); this.message.set("finance.saved"); if (this.tab() === "entries") this.loadEntries(); },
      error: () => { this.saving.set(false); this.message.set("finance.saveError"); },
    });
  }

  formatCurrency(value: string, currency: string): string { return new Intl.NumberFormat(this.locale(), { style: "currency", currency }).format(Number(value)); }
  formatDate(value: string): string { return new Intl.DateTimeFormat(this.locale(), { dateStyle: "medium" }).format(new Date(value)); }
  private today(): string { return new Date().toISOString().slice(0, 10); }
  private locale(): string { return navigator.language.startsWith("sr") ? "sr-Latn-RS" : "en-US"; }
}
