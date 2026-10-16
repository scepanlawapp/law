import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { HlmDialogImports } from "@spartan-ng/helm/dialog";
import { PaymentFormContext } from "./payment-dialog.models";
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from "../../shared/currency";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideWandSparkles, lucideSplit, lucideCheck } from "@ng-icons/lucide";
import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { RouterLink } from "@angular/router";
import { PaymentsApiClient } from "@law/api-clients";
import {
  InvoiceCollection,
  PaymentAllocationMode,
  PaymentDetail,
  PaymentMethod,
  PaymentOptions,
  PaymentPurpose,
  PaymentStatus,
  SavePaymentRequest,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmProgressImports } from "@spartan-ng/helm/progress";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import { firstValueFrom, startWith } from "rxjs";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { PaymentSelectComponent } from "./payment-select.component";
import { PaymentClientPickerComponent } from "./payment-client-picker.component";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import {
  ALL_OPTION_VALUE,
  PAYMENT_METHOD_LABELS,
  PAYMENT_PURPOSE_LABELS,
  SelectOption,
  optionsFrom,
} from "../../shared/models";
import { date, decimal, minor, money, paymentError } from "./payment-ui";
const control = (value = "") => new FormControl(value, { nonNullable: true });
@Component({
  selector: "law-payment-form",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    HlmDialogImports,
    NgIcon,
    RouterLink,
    HlmButton,
    HlmInput,
    HlmProgressImports,
    HlmSpinner,
    HlmTableImports,
    HlmTextarea,
    PaymentSelectComponent,
    PaymentClientPickerComponent,
    TranslatePipe,
  ],
  providers: [provideIcons({ lucideWandSparkles, lucideSplit, lucideCheck })],
  templateUrl: "./payment-form.component.html",
})
export class PaymentFormComponent {
  private readonly api = inject(PaymentsApiClient);
  private readonly dialog = inject<BrnDialogRef<PaymentDetail>>(BrnDialogRef);
  private readonly context = injectBrnDialogContext<PaymentFormContext>();
  private allowClose = false;
  private readonly confirm = inject(ConfirmDialogService);
  private readonly localization = inject(LocalizationService);
  private readonly destroy = inject(DestroyRef);
  readonly id = this.context.id ?? null;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly eligibleLoading = signal(false);
  readonly eligibleError = signal("");
  readonly original = signal<PaymentDetail | null>(null);
  readonly options = signal<PaymentOptions | null>(null);
  readonly invoices = signal<InvoiceCollection[]>([]);
  readonly selected = signal(new Set<string>());
  readonly previewing = signal(false);
  readonly feedback = signal("");
  readonly previewWarning = signal("");
  readonly newAdvance = computed(() => {
    this.values();
    return (
      !this.id && this.form.controls.purpose.value === PaymentPurpose.ADVANCE
    );
  });
  readonly allSelected = computed(
    () =>
      this.invoices().length > 0 &&
      this.invoices().every((i) => this.selected().has(i.id)),
  );
  readonly someSelected = computed(
    () =>
      !this.allSelected() &&
      this.invoices().some((i) => this.selected().has(i.id)),
  );
  readonly methods = optionsFrom(PAYMENT_METHOD_LABELS);
  readonly purposes = optionsFrom(PAYMENT_PURPOSE_LABELS);
  readonly PaymentAllocationMode = PaymentAllocationMode;
  private readonly translate = (
    key: string,
    params?: Record<string, string | number>,
  ) => this.localization.translate(key, params);
  readonly money = (value: string, currency: string) =>
    money(value, currency, this.localization.locale());
  readonly date = (value: string) => date(value, this.localization.locale());
  readonly form = new FormGroup({
    clientId: control(),
    payerName: control(),
    receivedAt: control(),
    amount: new FormControl("", {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/^\d{1,16}(\.\d{1,2})?$/),
      ],
    }),
    currency: control(DEFAULT_CURRENCY),
    paymentMethod: control(PaymentMethod.BANK_TRANSFER),
    purpose: control(PaymentPurpose.REGULAR),
    bankAccountId: control(),
    bankStatementNumber: control(),
    reference: control(),
    note: control(),
    allocations: new FormArray<
      FormGroup<{ invoiceId: FormControl<string>; amount: FormControl<string> }>
    >([]),
  });
  readonly values = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
  );
  readonly allocated = computed(() => {
    this.values();
    return this.form.controls.allocations.controls.reduce(
      (s, c) => s + minor(c.controls.amount.value),
      0n,
    );
  });
  readonly remaining = computed(() => {
    this.values();
    return minor(this.form.controls.amount.value) - this.allocated();
  });
  readonly allocatedText = computed(() => decimal(this.allocated()));
  readonly allocatedPercent = computed(() => {
    this.values();
    const total = minor(this.form.controls.amount.value);
    if (total <= 0n) return 0;
    return Math.min(100, Number((this.allocated() * 100n) / total));
  });
  readonly remainingText = computed(() => decimal(this.remaining()));
  readonly currencies = () => CURRENCY_OPTIONS;
  readonly banks = computed<SelectOption[]>(() => [
    { value: ALL_OPTION_VALUE, label: "payments.none" },
    ...(this.options()?.bankAccounts.map((b) => ({
      value: b.id,
      label: b.name + " · " + b.currencyCode,
    })) ?? []),
  ]);
  private requestBody = "";
  private key = "";
  private sequence = 0;
  constructor() {
    this.dialog.closing$
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => {
        if (this.allowClose) return;
        this.dialog.reopen();
        void this.cancel();
      });
    for (const c of [this.form.controls.clientId, this.form.controls.currency])
      c.valueChanges
        .pipe(takeUntilDestroyed(this.destroy))
        .subscribe(() => void this.loadEligible());
    this.form.controls.bankAccountId.valueChanges
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => {
        this.form.controls.bankStatementNumber.setValue("");
      });
    this.form.controls.purpose.valueChanges
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe((value) => {
        if (!this.id && value === PaymentPurpose.ADVANCE) this.clearProposal();
      });
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => {
        this.feedback.set("");
        this.previewWarning.set("");
      });
    void this.load();
  }
  async load() {
    this.loading.set(true);
    this.error.set("");
    try {
      const [options, payment] = await Promise.all([
        firstValueFrom(this.api.options()),
        this.id
          ? firstValueFrom(this.api.detail(this.id))
          : Promise.resolve(null),
      ]);
      this.options.set(options);
      this.original.set(payment);
      if (payment?.status === PaymentStatus.VOIDED) {
        this.error.set(this.translate("payments.error.voidedReadOnly"));
        this.allowClose = true;
        this.dialog.close();
        return;
      }
      if (payment) {
        this.form.patchValue(
          {
            ...payment,
            clientId: payment.clientId ?? "",
            payerName: payment.payerName ?? "",
            bankAccountId: payment.bankAccountId ?? "",
            bankStatementNumber: payment.bankStatementNumber ?? "",
            reference: payment.reference ?? "",
            note: payment.note ?? "",
            allocations: [],
          },
          { emitEvent: false },
        );
        for (const a of payment.allocations.filter((a) => !a.removedAt))
          this.add(a, a.amount);
      } else
        this.form.patchValue(
          {
            receivedAt: options.today,
            currency: this.context.currency || options.defaultCurrency,
            clientId: this.context.clientId || "",
          },
          { emitEvent: false },
        );
      await this.loadEligible();
      if (!payment) {
        const invoiceId = this.context.invoiceId;
        const i = this.invoices().find((i) => i.id === invoiceId);
        if (i) {
          this.form.controls.amount.setValue(i.remainingAmount);
        }
      }
      this.form.markAsPristine();
    } catch (e) {
      this.error.set(paymentError(e, this.translate));
    } finally {
      this.loading.set(false);
    }
  }
  async loadEligible() {
    const request = ++this.sequence;
    this.selected.set(new Set());
    const { clientId, currency } = this.form.getRawValue();
    this.eligibleError.set("");
    if (!clientId || !currency) {
      this.invoices.set([]);
      this.eligibleLoading.set(false);
      return;
    }
    this.eligibleLoading.set(true);
    try {
      const invoices = await firstValueFrom(
        this.api.eligible(clientId, currency, this.id ?? undefined),
      );
      if (request === this.sequence) {
        this.invoices.set(invoices);
        for (const i of invoices) this.add(i, "0.00");
      }
    } catch (e) {
      if (request === this.sequence) {
        this.invoices.set([]);
        this.eligibleError.set(paymentError(e, this.translate));
      }
    } finally {
      if (request === this.sequence) this.eligibleLoading.set(false);
    }
  }
  invoice(id: string) {
    return (
      this.invoices().find((i) => i.id === id) ||
      this.original()?.allocations.find((i) => i.id === id)
    );
  }
  isEligible(id: string) {
    return this.invoices().some((invoice) => invoice.id === id);
  }
  allocationIndex(id: string) {
    return this.form.controls.allocations.controls.findIndex(
      (row) => row.controls.invoiceId.value === id,
    );
  }
  allocation(id: string) {
    const index = this.allocationIndex(id);
    return index < 0 ? null : this.form.controls.allocations.at(index);
  }
  has(id: string) {
    return this.form.controls.allocations.controls.some(
      (c) => c.controls.invoiceId.value === id,
    );
  }
  add(i: InvoiceCollection, amount?: string) {
    if (this.has(i.id)) return;
    const available = this.remaining() > 0n ? this.remaining() : 0n;
    this.form.controls.allocations.push(
      new FormGroup({
        invoiceId: control(i.id),
        amount: new FormControl(
          amount ??
            decimal(
              available < minor(i.remainingAmount)
                ? available
                : minor(i.remainingAmount),
            ),
          {
            nonNullable: true,
            validators: [
              Validators.required,
              Validators.pattern(/^\d{1,16}(\.\d{1,2})?$/),
            ],
          },
        ),
      }),
    );
    this.form.markAsDirty();
  }
  remove(index: number) {
    const row = this.form.controls.allocations.at(index);
    if (this.isEligible(row.controls.invoiceId.value))
      row.controls.amount.setValue("0.00");
    else this.form.controls.allocations.removeAt(index);
    this.form.markAsDirty();
  }
  fill(index: number) {
    const c = this.form.controls.allocations.at(index);
    const i = this.invoice(c.controls.invoiceId.value);
    if (!i) return;
    const available = this.remaining() + minor(c.controls.amount.value);
    c.controls.amount.setValue(
      decimal(
        available < minor(i.remainingAmount)
          ? available > 0n
            ? available
            : 0n
          : minor(i.remainingAmount),
      ),
    );
    this.form.markAsDirty();
  }
  positive(id: string) {
    return minor(this.allocation(id)?.controls.amount.value ?? "0") > 0n;
  }
  fullyAllocated(i: InvoiceCollection) {
    return (
      minor(i.remainingAmount) > 0n &&
      minor(this.allocation(i.id)?.controls.amount.value ?? "0") ===
        minor(i.remainingAmount)
    );
  }
  toggleSelection(id: string, checked: boolean) {
    const selected = new Set(this.selected());
    if (checked) selected.add(id);
    else selected.delete(id);
    this.selected.set(selected);
  }
  selectAll(checked: boolean) {
    this.selected.set(new Set(checked ? this.invoices().map((i) => i.id) : []));
  }
  clearProposal() {
    for (const row of this.form.controls.allocations.controls)
      row.controls.amount.setValue("0.00");
    this.form.markAsDirty();
    this.feedback.set("");
    this.previewWarning.set("");
  }
  async distribute(mode: PaymentAllocationMode) {
    if (
      this.previewing() ||
      this.saving() ||
      this.eligibleLoading() ||
      this.newAdvance()
    )
      return;
    const value = this.form.getRawValue();
    if (
      !value.clientId ||
      this.form.controls.amount.invalid ||
      minor(value.amount) <= 0n
    ) {
      this.error.set(this.translate("payments.error.clientAndAmount"));
      return;
    }
    if (mode !== PaymentAllocationMode.AUTOMATIC && !this.selected().size) {
      this.error.set(this.translate("payments.error.selectInvoice"));
      return;
    }
    this.previewing.set(true);
    this.error.set("");
    try {
      if (
        this.form.controls.allocations.controls.some(
          (row) =>
            (row.controls.amount.dirty && row.controls.amount.invalid) ||
            minor(row.controls.amount.value) > 0n,
        ) &&
        !(await firstValueFrom(
          this.confirm.confirm({
            title: this.translate("payments.replace.confirmTitle"),
            message: this.translate("payments.replace.confirmMessage"),
            confirmText: this.translate("payments.replace.action"),
            cancelText: this.translate("payments.dismiss"),
          }),
        ))
      )
        return;
      const snapshot = JSON.stringify(this.form.getRawValue());
      const result = await firstValueFrom(
        this.api.preview({
          clientId: value.clientId,
          currency: value.currency,
          amount: value.amount,
          purpose: value.purpose as PaymentPurpose,
          reference: value.reference,
          paymentId: this.id ?? undefined,
          mode,
          invoiceIds:
            mode === PaymentAllocationMode.AUTOMATIC
              ? undefined
              : [...this.selected()],
        }),
      );
      if (snapshot !== JSON.stringify(this.form.getRawValue())) {
        this.error.set(this.translate("payments.error.changedDuringPreview"));
        return;
      }
      if (result.allocations.some((a) => !this.allocation(a.invoiceId))) {
        this.error.set(this.translate("payments.error.invoicesChanged"));
        return;
      }
      this.clearProposal();
      for (const a of result.allocations) {
        const row = this.allocation(a.invoiceId);
        if (!row)
          throw new Error(this.translate("payments.error.invoiceUnavailable"));
        row.controls.amount.setValue(a.amount);
      }
      this.previewWarning.set(result.warning ?? "");
      this.feedback.set(
        this.translate("payments.preview.feedback", {
          count: result.allocations.length,
          amount: this.money(result.unallocatedAmount, value.currency),
        }),
      );
    } catch (e) {
      this.error.set(paymentError(e, this.translate));
    } finally {
      this.previewing.set(false);
    }
  }
  async cancel() {
    if (this.saving() || this.previewing()) return;
    if (
      this.form.dirty &&
      !(await firstValueFrom(
        this.confirm.confirm({
          title: this.translate("payments.discard.confirmTitle"),
          message: this.translate("payments.discard.confirmMessage"),
          confirmText: this.translate("payments.discard.action"),
          cancelText: this.translate("payments.discard.continue"),
        }),
      ))
    )
      return;
    this.allowClose = true;
    this.dialog.close();
  }
  async submit() {
    if (this.saving() || this.loading() || this.previewing()) return;
    this.form.markAllAsTouched();
    this.error.set("");
    const value = this.form.getRawValue();
    value.allocations = value.allocations.filter((a) => minor(a.amount) > 0n);
    if (this.newAdvance() && value.allocations.length) {
      this.error.set(this.translate("payments.error.advanceWithAllocations"));
      return;
    }
    if (
      this.form.invalid ||
      minor(value.amount) <= 0n ||
      value.allocations.some((a) => minor(a.amount) <= 0n) ||
      this.remaining() < 0n ||
      !value.receivedAt
    ) {
      this.error.set(this.translate("payments.error.invalidAmounts"));
      return;
    }
    if (
      value.allocations.some((a) => {
        const i = this.invoices().find((i) => i.id === a.invoiceId);
        return !i || minor(a.amount) > minor(i.remainingAmount);
      })
    ) {
      this.error.set(this.translate("payments.error.allocationMismatch"));
      return;
    }
    const body: SavePaymentRequest = {
      ...value,
      paymentMethod: value.paymentMethod as PaymentMethod,
      purpose: value.purpose as PaymentPurpose,
      clientId: value.clientId || null,
      bankAccountId: value.bankAccountId || null,
      bankStatementNumber: value.bankAccountId
        ? value.bankStatementNumber.trim() || null
        : null,
      version: this.original()?.version,
    };
    const serialized = JSON.stringify(body);
    if (serialized !== this.requestBody) {
      this.requestBody = serialized;
      this.key = crypto.randomUUID();
    }
    this.saving.set(true);
    try {
      const old = this.original()
        ?.allocations.filter((a) => !a.removedAt)
        .map((a) => ({ invoiceId: a.id, amount: a.amount }));
      if (
        old &&
        JSON.stringify(old) !== JSON.stringify(value.allocations) &&
        !(await firstValueFrom(
          this.confirm.confirm({
            title: this.translate("payments.saveAllocation.confirmTitle"),
            message: this.translate("payments.saveAllocation.confirmMessage"),
            confirmText: this.translate("common.save"),
            cancelText: this.translate("payments.dismiss"),
          }),
        ))
      )
        return;
      const result = await firstValueFrom(
        this.api.save(this.id, body, this.key),
      );
      this.form.markAsPristine();
      this.allowClose = true;
      this.dialog.close(result);
    } catch (e) {
      this.error.set(paymentError(e, this.translate));
    } finally {
      this.saving.set(false);
    }
  }
}
