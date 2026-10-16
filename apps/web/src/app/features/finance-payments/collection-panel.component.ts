import { PaymentDialogService } from "./payment-dialog.service";
import { PaymentFormContext } from "./payment-dialog.models";
import { Component, effect, inject, input, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { PaymentsApiClient } from "@law/api-clients";
import { AuthState } from "@law/security";
import {
  AllocationState,
  CollectionTotals,
  InvoiceCollection,
  InvoiceCollectionStatus,
  InvoicePaymentHistory,
  InvoiceStatus,
  PaymentStatus,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { firstValueFrom } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { canManageBilling } from "../../shared/billing";
import {
  INVOICE_COLLECTION_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  labelOf,
} from "../../shared/models";
import { date, money } from "./payment-ui";
@Component({
  selector: "law-collection-panel",
  standalone: true,
  imports: [RouterLink, HlmButton, HlmSpinner, HlmTableImports, TranslatePipe],
  template: `
    @if (allowed()) {
      <section class="app-section-surface space-y-3 p-4">
        <h2 class="text-lg font-semibold">
          {{
            (invoiceId()
              ? "payments.collection.invoiceTitle"
              : "payments.collection.clientTitle"
            ) | translate
          }}
        </h2>
        @if (loading()) {
          <hlm-spinner
            [attr.aria-label]="'payments.collection.loading' | translate"
          />
        }
        @if (error()) {
          <p role="alert">{{ "payments.collection.loadError" | translate }}</p>
          <button hlmBtn variant="outline" (click)="load()">
            {{ "payments.retry" | translate }}
          </button>
        } @else {
          @if (invoice(); as i) {
            <div class="grid gap-3 sm:grid-cols-3">
              <p>
                {{
                  "payments.collection.total"
                    | translate: { amount: money(i.grossAmount, i.currency) }
                }}
              </p>
              <p>
                {{
                  "payments.collection.paid"
                    | translate: { amount: money(i.paidAmount, i.currency) }
                }}
              </p>
              <p>
                {{
                  "payments.collection.remaining"
                    | translate
                      : { amount: money(i.remainingAmount, i.currency) }
                }}
              </p>
            </div>
            <p>
              {{ invoiceStatusText(i) }}
              ·
              {{
                "payments.collection.due"
                  | translate: { date: date(i.dateOfMaturity) }
              }}
              @if (i.overdue) {
                ·
                {{
                  "payments.collection.overdueDays"
                    | translate: { days: i.daysOverdue }
                }}
              }
            </p>
            @if (
              i.status === InvoiceStatus.SENT &&
              i.collectionStatus !== InvoiceCollectionStatus.PAID
            ) {
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
                {{ "payments.collection.record" | translate }}
              </button>
              <a
                hlmBtn
                variant="outline"
                routerLink="/finance/payments"
                [queryParams]="{ clientId: i.clientId }"
              >
                {{ "payments.collection.allocateExisting" | translate }}
              </a>
            }
            <div hlmTableContainer>
              <table hlmTable>
                <thead hlmTHead>
                  <tr hlmTr>
                    <th hlmTh>{{ "payments.column.date" | translate }}</th>
                    <th hlmTh>
                      {{ "payments.column.allocation" | translate }}
                    </th>
                    <th hlmTh>
                      {{ "payments.column.paymentTotal" | translate }}
                    </th>
                    <th hlmTh>
                      {{ "payments.column.methodReference" | translate }}
                    </th>
                    <th hlmTh>{{ "payments.column.status" | translate }}</th>
                    <th hlmTh>{{ "payments.column.action" | translate }}</th>
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
                          (p.removedAt
                            ? "payments.allocation.removed"
                            : p.status === PaymentStatus.VOIDED
                              ? "payments.allocation.paymentVoided"
                              : "payments.active"
                          ) | translate
                        }}
                      </td>
                      <td hlmTd>
                        <button class="underline" (click)="view(p.paymentId)">
                          {{ "payments.view" | translate }}
                        </button>
                      </td>
                    </tr>
                  } @empty {
                    <tr hlmTr>
                      <td hlmTd colspan="6">
                        {{ "payments.collection.noAllocations" | translate }}
                      </td>
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
                  {{ "payments.summary.outstanding" | translate }}
                  <br />
                  <strong>{{ money(t.outstanding, t.currency) }}</strong>
                </p>
                <p>
                  {{ "payments.summary.overdue" | translate }}
                  <br />
                  <strong>{{ money(t.overdue, t.currency) }}</strong>
                </p>
                <p>
                  {{ "payments.collection.unallocatedPayments" | translate }}
                  <br />
                  <strong>{{ money(t.unallocated, t.currency) }}</strong>
                </p>
                <p>
                  {{ "payments.summary.advances" | translate }}
                  <br />
                  <strong>{{ money(t.advances, t.currency) }}</strong>
                </p>
                <p>
                  {{ "payments.collection.unpaidInvoices" | translate }}
                  <br />
                  <strong>{{ t.unpaidInvoices }}</strong>
                </p>
              </div>
            } @empty {
              <p>{{ "payments.collection.empty" | translate }}</p>
            }
            <div class="flex flex-wrap gap-2">
              <a
                hlmBtn
                variant="outline"
                routerLink="/finance/invoices"
                [queryParams]="{ clientId: clientId() }"
              >
                {{ "payments.collection.clientInvoices" | translate }}
              </a>
              <a
                hlmBtn
                variant="outline"
                routerLink="/finance/payments"
                [queryParams]="{ clientId: clientId() }"
              >
                {{ "payments.collection.clientPayments" | translate }}
              </a>
              <a
                hlmBtn
                variant="outline"
                routerLink="/finance/payments"
                [queryParams]="{
                  clientId: clientId(),
                  allocationState: AllocationState.UNALLOCATED,
                }"
              >
                {{ "payments.collection.unallocatedPayments" | translate }}
              </a>
              <button
                hlmBtn
                type="button"
                (click)="create({ clientId: clientId() })"
              >
                {{ "payments.new" | translate }}
              </button>
            </div>
          }
        }
      </section>
    } @else {
      <p class="text-sm text-muted-foreground">
        {{ "payments.collection.restricted" | translate }}
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
  private readonly localization = inject(LocalizationService);
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
  readonly AllocationState = AllocationState;
  readonly InvoiceStatus = InvoiceStatus;
  readonly InvoiceCollectionStatus = InvoiceCollectionStatus;
  readonly PaymentStatus = PaymentStatus;
  private readonly translate = (key: string) =>
    this.localization.translate(key);
  readonly money = (value: string, currency: string) =>
    money(value, currency, this.localization.locale());
  readonly date = (value: string) => date(value, this.localization.locale());
  readonly method = (value: string) =>
    labelOf(PAYMENT_METHOD_LABELS, value, this.translate);
  invoiceStatusText(invoice: InvoiceCollection): string {
    if (invoice.status === InvoiceStatus.SENT)
      return labelOf(
        INVOICE_COLLECTION_STATUS_LABELS,
        invoice.collectionStatus,
        this.translate,
      );
    return this.translate(
      invoice.status === InvoiceStatus.DRAFT
        ? "payments.collection.draft"
        : "payments.collection.voidedInvoice",
    );
  }
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
