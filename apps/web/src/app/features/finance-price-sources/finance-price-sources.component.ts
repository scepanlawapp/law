import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { ClientsApiClient, FinancialsApiClient } from "@law/api-clients";
import { ClientSummary, PriceSourceScope, PriceSourceSummary } from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { TranslatePipe } from "../../core/localization/translate.pipe";

type SourceTab = "CLIENT_AGREEMENT" | "WORKSPACE_PUBLIC_REFERENCE";

@Component({
  selector: "law-finance-price-sources",
  standalone: true,
  templateUrl: "./finance-price-sources.component.html",
  imports: [ReactiveFormsModule, HlmButton, HlmInput, HlmTextarea, HlmSpinner, TranslatePipe],
})
export class FinancePriceSourcesComponent {
  private readonly api = inject(FinancialsApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly tab = signal<SourceTab>("CLIENT_AGREEMENT");
  readonly sources = signal<PriceSourceSummary[]>([]);
  readonly clients = signal<ClientSummary[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly message = signal("");
  readonly form = new FormGroup({ title: new FormControl("", { nonNullable: true, validators: Validators.required }), clientId: new FormControl("", { nonNullable: true }), rawText: new FormControl("", { nonNullable: true, validators: Validators.required }), sourceUrl: new FormControl("", { nonNullable: true }) });

  constructor() {
    this.clientsApi.list({ page: 1, pageSize: 100 }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (response) => this.clients.set(response.items) });
    this.load();
  }

  load(): void { this.loading.set(true); this.api.priceSources().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (items) => { this.sources.set(items); this.loading.set(false); }, error: () => { this.loading.set(false); this.message.set("finance.loadError"); } }); }
  selectTab(tab: SourceTab): void { this.tab.set(tab); this.form.reset({ title: "", clientId: "", rawText: "", sourceUrl: "" }); }
  visibleSources(): PriceSourceSummary[] { const scope: PriceSourceScope = this.tab() === "CLIENT_AGREEMENT" ? "CLIENT_AGREEMENT" : "WORKSPACE_PUBLIC_REFERENCE"; return this.sources().filter((source) => source.scope === scope); }
  clientName(clientId: string | null): string { return this.clients().find((client) => client.id === clientId)?.displayName ?? "—"; }
  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) { this.message.set("finance.validationError"); return; }
    this.saving.set(true);
    const value = this.form.getRawValue();
    this.api.createPriceSource({ scope: this.tab(), title: value.title, rawText: value.rawText, clientId: value.clientId || undefined }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: () => { this.saving.set(false); this.message.set("finance.saved"); this.form.reset({ title: "", clientId: "", rawText: "", sourceUrl: "" }); this.load(); }, error: () => { this.saving.set(false); this.message.set("finance.saveError"); } });
  }
}
