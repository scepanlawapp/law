import { Component, inject, signal } from "@angular/core";
import { FormControl, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { PaymentsApiClient } from "@law/api-clients";
import { PaymentDetail } from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { firstValueFrom } from "rxjs";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import {
  allocationLabel,
  date,
  money,
  paymentError,
  paymentMethodLabel,
} from "./payment-ui";
@Component({
  selector: "law-payment-detail",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButton,
    HlmInput,
    HlmSpinner,
    HlmTableImports,
  ],
  templateUrl: "./payment-detail.component.html",
})
export class PaymentDetailComponent {
  private readonly api = inject(PaymentsApiClient);
  private readonly confirm = inject(ConfirmDialogService);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get("id") ?? "";
  readonly payment = signal<PaymentDetail | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly showVoid = signal(false);
  readonly reason = new FormControl("", {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(1000)],
  });
  readonly money = money;
  readonly date = date;
  readonly method = paymentMethodLabel;
  readonly state = allocationLabel;
  snapshot(value: unknown) {
    const p = value as PaymentDetail | null;
    if (!p) return null;
    return {
      fields: [
        { label: "Klijent", value: p.clientName ?? "Neidentifikovan klijent" },
        { label: "Uplatilac", value: p.payerName ?? "—" },
        { label: "Iznos", value: money(p.amount, p.currency) },
        { label: "Datum uplate", value: date(p.receivedAt) },
        { label: "Način plaćanja", value: paymentMethodLabel(p.paymentMethod) },
        {
          label: "Svrha",
          value: p.purpose === "ADVANCE" ? "Avans" : "Redovna uplata",
        },
        {
          label: "Status",
          value: p.status === "VOIDED" ? "Poništena" : "Aktivna",
        },
        { label: "Bankovni račun", value: p.bankAccountName ?? "—" },
        { label: "Referenca", value: p.reference ?? "—" },
        { label: "Napomena", value: p.note ?? "—" },
      ],
      allocations: p.allocations.filter((a) => !a.removedAt),
    };
  }
  readonly timestamp = (value: string) =>
    new Intl.DateTimeFormat("sr-Latn", {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: "Europe/Belgrade",
    }).format(new Date(value));
  private key = crypto.randomUUID();
  private lastReason = "";
  constructor() {
    void this.load();
  }
  async load() {
    this.loading.set(true);
    this.error.set("");
    try {
      this.payment.set(await firstValueFrom(this.api.detail(this.id)));
    } catch (e) {
      this.error.set(paymentError(e));
    } finally {
      this.loading.set(false);
    }
  }
  action(value: string) {
    return (
      {
        PAYMENT_CREATED: "Uplata kreirana",
        PAYMENT_UPDATED: "Uplata i raspodele izmenjene",
        PAYMENT_VOIDED: "Uplata poništena",
      }[value] ?? "Promena uplate"
    );
  }
  async voidPayment() {
    const p = this.payment();
    if (!p || this.saving()) return;
    this.reason.markAsTouched();
    if (this.reason.invalid || !this.reason.value.trim()) return;
    this.saving.set(true);
    try {
      if (
        !(await firstValueFrom(
          this.confirm.confirm({
            title: "Poništi uplatu?",
            message:
              "Uplata više neće doprinositi naplati računa. Raspodele i istorija ostaju sačuvane.",
            confirmText: "Poništi uplatu",
            cancelText: "Odustani",
            variant: "danger",
          }),
        ))
      )
        return;
      if (this.lastReason !== this.reason.value) {
        this.lastReason = this.reason.value;
        this.key = crypto.randomUUID();
      }
      this.payment.set(
        await firstValueFrom(
          this.api.void(p.id, this.reason.value, p.version, this.key),
        ),
      );
      this.showVoid.set(false);
      this.error.set("");
    } catch (e) {
      this.error.set(paymentError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
