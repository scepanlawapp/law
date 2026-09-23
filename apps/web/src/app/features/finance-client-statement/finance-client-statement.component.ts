import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { ClientsApiClient, FinancialsApiClient } from "@law/api-clients";
import { BillingEntrySummary, BillingStatement, ClientSummary } from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTable, HlmTableContainer, HlmTBody, HlmTd, HlmTh, HlmTHead, HlmTr } from "@spartan-ng/helm/table";
import { TranslatePipe } from "../../core/localization/translate.pipe";

type StatementFilter = "ALL" | "DRAFT" | "SENT";

@Component({
  selector: "law-finance-client-statement",
  standalone: true,
  templateUrl: "./finance-client-statement.component.html",
  imports: [ReactiveFormsModule, RouterLink, HlmButton, HlmInput, HlmSpinner, HlmTable, HlmTableContainer, HlmTBody, HlmTd, HlmTh, HlmTHead, HlmTr, TranslatePipe],
})
export class FinanceClientStatementComponent {
  private readonly api = inject(FinancialsApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
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
  readonly form = new FormGroup({ clientId: new FormControl("", { nonNullable: true, validators: Validators.required }), periodStart: new FormControl(this.monthStart(), { nonNullable: true, validators: Validators.required }), periodEnd: new FormControl(this.today(), { nonNullable: true, validators: Validators.required }), currency: new FormControl("RSD", { nonNullable: true, validators: Validators.required }) });

  constructor() {
    this.clientsApi.list({ page: 1, pageSize: 100 }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (response) => this.clients.set(response.items) });
    this.load();
    const statementId = this.route.snapshot.paramMap.get("statementId");
    if (statementId) this.api.statement(statementId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (statement) => this.detail.set(statement) });
    this.form.controls.clientId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((clientId) => {
      this.selected.set(new Set());
      this.entries.set([]);
      if (clientId) this.api.entries({ page: 1, pageSize: 100, clientId, lifecycle: "READY", currency: this.form.controls.currency.value }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (response) => this.entries.set(response.items) });
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api.statements().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (items) => { this.statements.set(items); this.loading.set(false); }, error: () => { this.loading.set(false); this.error.set(true); } });
  }

  visibleStatements(): BillingStatement[] { return this.statements().filter((item) => this.filter() === "ALL" || item.status === this.filter()); }
  setFilter(filter: StatementFilter): void { this.filter.set(filter); }
  selectEntry(entry: BillingEntrySummary): void { const next = new Set(this.selected()); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); this.selected.set(next); }

  createDraft(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.selected().size) { this.message.set("finance.statementValidation"); return; }
    this.saving.set(true);
    const value = this.form.getRawValue();
    this.api.createStatement({ ...value, entryIds: [...this.selected()], idempotencyKey: crypto.randomUUID() }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: () => { this.saving.set(false); this.message.set("finance.saved"); this.load(); }, error: () => { this.saving.set(false); this.message.set("finance.saveError"); } });
  }

  send(statement: BillingStatement): void { if (!confirm("Mark this informational statement as shared externally?")) return; this.api.sendStatement(statement.id, "EXTERNAL", crypto.randomUUID()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: () => this.load() }); }
  void(statement: BillingStatement): void { if (!confirm("Void this statement?")) return; this.api.voidStatement(statement.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: () => this.load() }); }
  closeDetail(): void { this.detail.set(null); }
  total(statement: BillingStatement): string { return this.money(statement.lines.reduce((sum, line) => sum + Number(line.amount), 0), statement.currency); }
  paid(statement: BillingStatement): string { return this.money(statement.payments.filter((item) => !item.reversedAt).reduce((sum, item) => sum + Number(item.amount), 0), statement.currency); }
  outstanding(statement: BillingStatement): string { return this.money(Math.max(0, Number(this.totalNumber(statement)) - Number(this.paidNumber(statement))), statement.currency); }
  paymentStatus(statement: BillingStatement): string { const total = Number(this.totalNumber(statement)); const paid = Number(this.paidNumber(statement)); return paid <= 0 ? "finance.unpaid" : paid >= total ? "finance.paidStatus" : "finance.partial"; }
  formatDate(value: string | null): string { return value ? new Intl.DateTimeFormat(this.locale(), { dateStyle: "medium" }).format(new Date(value)) : "—"; }
  private totalNumber(statement: BillingStatement): number { return statement.lines.reduce((sum, line) => sum + Number(line.amount), 0); }
  private paidNumber(statement: BillingStatement): number { return statement.payments.filter((item) => !item.reversedAt).reduce((sum, item) => sum + Number(item.amount), 0); }
  private money(value: number, currency: string): string { return new Intl.NumberFormat(this.locale(), { style: "currency", currency }).format(value); }
  private today(): string { return new Date().toISOString().slice(0, 10); }
  private monthStart(): string { const date = new Date(); return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10); }
  private locale(): string { return navigator.language.startsWith("sr") ? "sr-Latn-RS" : "en-US"; }
}
