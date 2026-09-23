import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { ClientsApiClient, FinancialsApiClient } from "@law/api-clients";
import {
  BillingEntrySummary,
  BillingStatement,
  ClientAccount,
  ClientSummary,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
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
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { LocalizationService } from "../../core/localization/localization.service";

@Component({
  selector: "law-finance-client-balances",
  standalone: true,
  templateUrl: "./finance-client-balances.component.html",
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmInput,
    HlmSpinner,
    HlmTable,
    HlmTableContainer,
    HlmTBody,
    HlmTd,
    HlmTh,
    HlmTHead,
    HlmTr,
    RouterLink,
    TranslatePipe,
  ],
})
export class FinanceClientBalancesComponent {
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly api = inject(FinancialsApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly clients = signal<ClientSummary[]>([]);
  readonly account = signal<ClientAccount | null>(null);
  readonly selectedClient = signal<ClientSummary | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly search = new FormControl("", { nonNullable: true });
  private readonly localization = inject(LocalizationService);

  constructor() {
    this.clientsApi
      .list({ page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.clients.set(response.items);
          const id = this.route.snapshot.queryParamMap.get("clientId");
          if (id && !response.items.some((client) => client.id === id))
            this.clientsApi
              .get(id)
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe({
                next: (client) => {
                  this.clients.set([client, ...response.items]);
                  this.open(id);
                },
                error: () => {
                  this.error.set(true);
                  this.loading.set(false);
                },
              });
          else if (id) this.open(id);
          else this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }

  open(clientId: string): void {
    const client = this.clients().find((item) => item.id === clientId) ?? null;
    this.selectedClient.set(client);
    this.loading.set(true);
    this.api
      .clientAccount(clientId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.account.set(value);
          this.loading.set(false);
          void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { clientId },
            queryParamsHandling: "merge",
          });
        },
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  visibleClients(): ClientSummary[] {
    const term = this.search.value.trim().toLowerCase();
    return term
      ? this.clients().filter(
          (client) =>
            client.displayName.toLowerCase().includes(term) ||
            client.clientNumber.toLowerCase().includes(term),
        )
      : this.clients();
  }
  totalEntries(entries: BillingEntrySummary[]): string {
    return this.money(
      entries
        .filter((entry) => entry.disposition === "BILLABLE")
        .reduce((sum, entry) => sum + Number(entry.amount), 0),
      entries[0]?.currency ?? "RSD",
    );
  }
  amounts(values: Array<{ currency: string; amount: string }>): string {
    return values.length
      ? values.map((item) => this.money(item.amount, item.currency)).join(" · ")
      : "—";
  }
  statementTotal(statement: BillingStatement): string {
    return this.money(
      statement.lines.reduce((sum, line) => sum + Number(line.amount), 0),
      statement.currency,
    );
  }
  formatDate(value: string): string {
    return new Intl.DateTimeFormat(this.locale(), {
      dateStyle: "medium",
    }).format(new Date(value));
  }
  private money(value: number | string, currency: string): string {
    return new Intl.NumberFormat(this.locale(), {
      style: "currency",
      currency,
    }).format(typeof value === "string" ? Number(value) : value);
  }
  private locale(): string {
    return this.localization.language() === "SR" ? "sr-Latn-RS" : "en-US";
  }
}
