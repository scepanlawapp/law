import { PaymentDialogService } from "./payment-dialog.service";
import { PaymentFormContext } from "./payment-dialog.models";
import { Component, effect, inject, input, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { PaymentsApiClient } from "@law/api-clients";
import { AuthState } from "@law/security";
import {
  CollectionTotals,
  InvoiceCollection,
  InvoicePaymentHistory,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { firstValueFrom } from "rxjs";
import { canManageBilling } from "../../shared/billing";
import { collectionLabel, date, money, paymentMethodLabel } from "./payment-ui";
@Component({
  selector: "law-collection-panel",
  standalone: true,
  imports: [RouterLink, HlmButton, HlmSpinner, HlmTableImports],
  template: `
    @if (allowed()) {
      <section class="app-section-surface space-y-3 p-4">
        <h2 class="text-lg font-semibold">
          {{ invoiceId() ? "Naplata računa" : "Potraživanja i uplate" }}
        </h2>
        @if (loading()) {
          <hlm-spinner aria-label="Učitavanje naplate" />
        }
        @if (error()) {
          <p role="alert">Podaci o naplati nisu učitani.</p>
          <button hlmBtn variant="outline" (click)="load()">
            Pokušaj ponovo
          </button>
        } @else {
          @if (invoice(); as i) {
            <div class="grid gap-3 sm:grid-cols-3">
              <p>Ukupno: {{ money(i.grossAmount, i.currency) }}</p>
              <p>Naplaćeno: {{ money(i.paidAmount, i.currency) }}</p>
              <p>Preostalo: {{ money(i.remainingAmount, i.currency) }}</p>
            </div>
            <p>
              {{
                i.status === "SENT"
                  ? label(i.collectionStatus)
                  : i.status === "DRAFT"
                    ? "Nacrt — nije za naplatu"
                    : "Poništen račun"
              }}
              · Rok plaćanja: {{ date(i.dateOfMaturity) }}
              @if (i.overdue) {
                · Kasni {{ i.daysOverdue }} dana
              }
            </p>
            @if (i.status === "SENT" && i.collectionStatus !== "PAID") {
              <button
                hlmBtn
                type="button"
                (click)="
                  create({
                    clientId: i.clientId,
                    invoiceId: i.id,
                    currency: i.currency,
                  })
                "
              >
                Evidentiraj uplatu
              </button>
              <a
                hlmBtn
                variant="outline"
                routerLink="/finance/payments"
                [queryParams]="{ clientId: i.clientId }"
              >
                Rasporedi postojeću uplatu
              </a>
            }
            <div hlmTableContainer>
              <table hlmTable>
                <thead hlmTHead>
                  <tr hlmTr>
                    <th hlmTh>Datum</th>
                    <th hlmTh>Raspodela</th>
                    <th hlmTh>Ukupna uplata</th>
                    <th hlmTh>Način / Referenca</th>
                    <th hlmTh>Status</th>
                    <th hlmTh>Radnja</th>
                  </tr>
                </thead>
                <tbody hlmTBody>
                  @for (p of history(); track $index) {
                    <tr hlmTr>
                      <td hlmTd>{{ date(p.receivedAt) }}</td>
                      <td hlmTd>{{ money(p.amount, i.currency) }}</td>
                      <td hlmTd>{{ money(p.paymentAmount, i.currency) }}</td>
                      <td hlmTd>
                        {{ method(p.paymentMethod) }} · {{ p.reference }}
                      </td>
                      <td hlmTd>
                        {{
                          p.removedAt
                            ? "Uklonjena / zamenjena"
                            : p.status === "VOIDED"
                              ? "Poništena uplata"
                              : "Aktivna"
                        }}
                      </td>
                      <td hlmTd>
                        <button class="underline" (click)="view(p.paymentId)">
                          Pregled uplate
                        </button>
                      </td>
                    </tr>
                  } @empty {
                    <tr hlmTr>
                      <td hlmTd colspan="6">Nema evidentiranih raspodela.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
          @if (!invoiceId()) {
            @for (t of totals(); track t.currency) {
              <div
                class="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-5"
              >
                <p>
                  Preostali dug
                  <br />
                  <strong>{{ money(t.outstanding, t.currency) }}</strong>
                </p>
                <p>
                  Dospeo dug
                  <br />
                  <strong>{{ money(t.overdue, t.currency) }}</strong>
                </p>
                <p>
                  Neraspoređene uplate
                  <br />
                  <strong>{{ money(t.unallocated, t.currency) }}</strong>
                </p>
                <p>
                  Neraspoređeni avansi
                  <br />
                  <strong>{{ money(t.advances, t.currency) }}</strong>
                </p>
                <p>
                  Neplaćeni računi
                  <br />
                  <strong>{{ t.unpaidInvoices }}</strong>
                </p>
              </div>
            } @empty {
              <p>Nema potraživanja ni uplata.</p>
            }
            <div class="flex flex-wrap gap-2">
              <a
                hlmBtn
                variant="outline"
                routerLink="/finance/invoices"
                [queryParams]="{ clientId: clientId() }"
              >
                Računi klijenta
              </a>
              <a
                hlmBtn
                variant="outline"
                routerLink="/finance/payments"
                [queryParams]="{ clientId: clientId() }"
              >
                Uplate klijenta
              </a>
              <a
                hlmBtn
                variant="outline"
                routerLink="/finance/payments"
                [queryParams]="{
                  clientId: clientId(),
                  allocationState: 'UNALLOCATED',
                }"
              >
                Neraspoređene uplate
              </a>
              <button
                hlmBtn
                type="button"
                (click)="create({ clientId: clientId() })"
              >
                Nova uplata
              </button>
            </div>
          }
        }
      </section>
    } @else {
      <p class="text-sm text-muted-foreground">
        Pregled finansija dostupan je ovlašćenim korisnicima kancelarije.
      </p>
    }
  `,
})
export class CollectionPanelComponent {
  readonly revision = input<string>();
  readonly clientId = input<string>();
  readonly invoiceId = input<string>();
  private readonly api = inject(PaymentsApiClient);
  private readonly dialogs = inject(PaymentDialogService);
  async create(context: PaymentFormContext) {
    await firstValueFrom(this.dialogs.form(context));
    await this.load();
  }
  async view(id: string) {
    await firstValueFrom(this.dialogs.view(id));
    await this.load();
  }
  private readonly auth = inject(AuthState);
  readonly allowed = () => canManageBilling(this.auth.activeWorkspace()?.role);
  readonly totals = signal<CollectionTotals[]>([]);
  readonly invoice = signal<InvoiceCollection | null>(null);
  readonly history = signal<InvoicePaymentHistory[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  private request = 0;
  readonly money = money;
  readonly date = date;
  readonly label = collectionLabel;
  readonly method = paymentMethodLabel;
  constructor() {
    effect(() => {
      this.revision();
      this.clientId();
      this.invoiceId();
      if (this.allowed()) void this.load();
    });
  }
  async load() {
    const id = this.invoiceId();
    const clientId = this.clientId();
    const n = ++this.request;
    this.loading.set(true);
    this.error.set(false);
    try {
      if (id) {
        const [i, h] = await Promise.all([
          firstValueFrom(this.api.collection(id)),
          firstValueFrom(this.api.history(id)),
        ]);
        if (n === this.request) {
          this.invoice.set(i);
          this.history.set(h);
        }
      } else {
        const totals = await firstValueFrom(this.api.summary({ clientId }));
        if (n === this.request) this.totals.set(totals);
      }
    } catch {
      if (n === this.request) this.error.set(true);
    } finally {
      if (n === this.request) this.loading.set(false);
    }
  }
}
