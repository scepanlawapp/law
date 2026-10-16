import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { HlmDialogImports } from "@spartan-ng/helm/dialog";
import { PaymentViewContext, PaymentViewResult } from "./payment-dialog.models";
import { Component, DestroyRef, inject, signal } from "@angular/core";
import { FormControl, ReactiveFormsModule, Validators } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { PaymentsApiClient } from "@law/api-clients";
import {
  PaymentDetail,
  PaymentPurpose,
  PaymentStatus,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { firstValueFrom } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import {
  ALLOCATION_STATE_LABELS,
  OFFICE_TIME_ZONE,
  PAYMENT_AUDIT_ACTION_LABELS,
  PAYMENT_AUDIT_FALLBACK_LABEL,
  PAYMENT_METHOD_LABELS,
  PAYMENT_PURPOSE_LABELS,
  PAYMENT_STATUS_LABELS,
  labelOf,
} from "../../shared/models";
import { date, money, paymentError } from "./payment-ui";
@Component({
  selector: "law-payment-detail",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    HlmDialogImports,
    RouterLink,
    HlmButton,
    HlmInput,
    HlmSpinner,
    HlmTableImports,
    TranslatePipe,
  ],
  templateUrl: "./payment-detail.component.html",
})
export class PaymentDetailComponent {
  private readonly api = inject(PaymentsApiClient);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly localization = inject(LocalizationService);
  private readonly dialog =
    inject<BrnDialogRef<PaymentViewResult>>(BrnDialogRef);
  readonly id = injectBrnDialogContext<PaymentViewContext>().id;
  private allowClose = false;
  readonly payment = signal<PaymentDetail | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly showVoid = signal(false);
  readonly reason = new FormControl("", {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(1000)],
  });
  readonly PaymentPurpose = PaymentPurpose;
  readonly PaymentStatus = PaymentStatus;
  private readonly translate = (key: string) =>
    this.localization.translate(key);
  readonly money = (value: string, currency: string) =>
    money(value, currency, this.localization.locale());
  readonly date = (value: string) => date(value, this.localization.locale());
  readonly method = (value: string) =>
    labelOf(PAYMENT_METHOD_LABELS, value, this.translate);
  readonly state = (value: string) =>
    labelOf(ALLOCATION_STATE_LABELS, value, this.translate);
  readonly purpose = (value: string) =>
    labelOf(PAYMENT_PURPOSE_LABELS, value, this.translate);
  snapshot(value: unknown) {
    const p = value as PaymentDetail | null;
    if (!p) return null;
    return {
      fields: [
        {
          label: "payments.field.client",
          value: p.clientName ?? this.translate("payments.unidentifiedClient"),
        },
        { label: "payments.field.payer", value: p.payerName ?? "—" },
        {
          label: "payments.field.amount",
          value: this.money(p.amount, p.currency),
        },
        { label: "payments.field.receivedAt", value: this.date(p.receivedAt) },
        { label: "payments.field.method", value: this.method(p.paymentMethod) },
        { label: "payments.field.purpose", value: this.purpose(p.purpose) },
        {
          label: "payments.column.status",
          value: labelOf(PAYMENT_STATUS_LABELS, p.status, this.translate),
        },
        {
          label: "payments.field.bankAccount",
          value: p.bankAccountName ?? "—",
        },
        { label: "payments.field.reference", value: p.reference ?? "—" },
        { label: "payments.field.note", value: p.note ?? "—" },
      ],
      allocations: p.allocations.filter((a) => !a.removedAt),
    };
  }
  readonly timestamp = (value: string) =>
    new Intl.DateTimeFormat(this.localization.locale(), {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: OFFICE_TIME_ZONE,
    }).format(new Date(value));
  private key = crypto.randomUUID();
  private lastReason = "";
  edit() {
    if (this.saving()) return;
    this.allowClose = true;
    this.dialog.close({ edit: true });
  }
  close() {
    if (this.saving()) return;
    this.allowClose = true;
    this.dialog.close({ payment: this.payment() ?? undefined });
  }
  constructor() {
    this.dialog.closing$
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => {
        if (this.allowClose) return;
        this.dialog.reopen();
        this.close();
      });
    void this.load();
  }
  async load() {
    this.loading.set(true);
    this.error.set("");
    try {
      this.payment.set(await firstValueFrom(this.api.detail(this.id)));
    } catch (e) {
      this.error.set(paymentError(e, this.translate));
    } finally {
      this.loading.set(false);
    }
  }
  action(value: string) {
    return this.translate(
      PAYMENT_AUDIT_ACTION_LABELS[value] ?? PAYMENT_AUDIT_FALLBACK_LABEL,
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
            title: this.translate("payments.void.confirmTitle"),
            message: this.translate("payments.void.confirmMessage"),
            confirmText: this.translate("payments.void.action"),
            cancelText: this.translate("payments.dismiss"),
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
      this.error.set(paymentError(e, this.translate));
    } finally {
      this.saving.set(false);
    }
  }
}
