import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { PaymentsApiClient } from "@law/api-clients";
import {
  InvoiceCollection,
  PaymentDetail,
  PaymentOptions,
  SavePaymentRequest,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import { firstValueFrom, startWith } from "rxjs";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { PaymentSelectComponent } from "./payment-select.component";
import { PaymentClientPickerComponent } from "./payment-client-picker.component";
import { methods, purposes } from "./payment-options";
import { date, decimal, minor, money, paymentError } from "./payment-ui";
const control = (value = "") => new FormControl(value, { nonNullable: true });
@Component({
  selector: "law-payment-form",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButton,
    HlmInput,
    HlmSpinner,
    HlmTableImports,
    HlmTextarea,
    PaymentSelectComponent,
    PaymentClientPickerComponent,
  ],
  templateUrl: "./payment-form.component.html",
})
export class PaymentFormComponent {
  private readonly api = inject(PaymentsApiClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly destroy = inject(DestroyRef);
  readonly id = this.route.snapshot.paramMap.get("id");
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly eligibleLoading = signal(false);
  readonly eligibleError = signal("");
  readonly original = signal<PaymentDetail | null>(null);
  readonly options = signal<PaymentOptions | null>(null);
  readonly invoices = signal<InvoiceCollection[]>([]);
  readonly methods = methods;
  readonly purposes = purposes;
  readonly money = money;
  readonly date = date;
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
    currency: control("RSD"),
    paymentMethod: control("BANK_TRANSFER"),
    purpose: control("REGULAR"),
    bankAccountId: control(),
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
  readonly remainingText = computed(() => decimal(this.remaining()));
  readonly currencies = computed(
    () =>
      this.options()?.currencies.map((value) => ({ value, label: value })) ??
      [],
  );
  readonly banks = computed(() => [
    { value: "", label: "payments.none" },
    ...(this.options()?.bankAccounts.map((b) => ({
      value: b.id,
      label: b.name + " · " + b.currencyCode,
    })) ?? []),
  ]);
  private requestBody = "";
  private key = "";
  private sequence = 0;
  constructor() {
    for (const c of [this.form.controls.clientId, this.form.controls.currency])
      c.valueChanges
        .pipe(takeUntilDestroyed(this.destroy))
        .subscribe(() => void this.loadEligible());
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
      if (payment?.status === "VOIDED") {
        await this.router.navigate(["/finance/payments", payment.id]);
        return;
      }
      if (payment) {
        this.form.patchValue(
          {
            ...payment,
            clientId: payment.clientId ?? "",
            payerName: payment.payerName ?? "",
            bankAccountId: payment.bankAccountId ?? "",
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
            currency:
              this.route.snapshot.queryParamMap.get("currency") ||
              options.defaultCurrency,
            clientId: this.route.snapshot.queryParamMap.get("clientId") || "",
          },
          { emitEvent: false },
        );
      await this.loadEligible();
      if (!payment) {
        const invoiceId = this.route.snapshot.queryParamMap.get("invoiceId");
        const i = this.invoices().find((i) => i.id === invoiceId);
        if (i) {
          this.form.controls.amount.setValue(i.remainingAmount);
          this.add(i, i.remainingAmount);
        }
      }
      this.form.markAsPristine();
    } catch (e) {
      this.error.set(paymentError(e));
    } finally {
      this.loading.set(false);
    }
  }
  async loadEligible() {
    const request = ++this.sequence;
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
      if (request === this.sequence) this.invoices.set(invoices);
    } catch (e) {
      if (request === this.sequence) {
        this.invoices.set([]);
        this.eligibleError.set(paymentError(e));
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
    this.form.controls.allocations.removeAt(index);
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
  async cancel() {
    if (this.saving()) return;
    if (
      this.form.dirty &&
      !(await firstValueFrom(
        this.confirm.confirm({
          title: "Odbaci izmene?",
          message: "Nesačuvane izmene uplate biće odbačene.",
          confirmText: "Odbaci",
          cancelText: "Nastavi unos",
        }),
      ))
    )
      return;
    await this.router.navigate(
      this.id ? ["/finance/payments", this.id] : ["/finance/payments"],
    );
  }
  async submit() {
    if (this.saving() || this.loading()) return;
    this.form.markAllAsTouched();
    this.error.set("");
    const value = this.form.getRawValue();
    if (
      this.form.invalid ||
      minor(value.amount) <= 0n ||
      value.allocations.some((a) => minor(a.amount) <= 0n) ||
      this.remaining() < 0n ||
      !value.receivedAt
    ) {
      this.error.set(
        "Proverite datum i iznose. Iznosi moraju biti pozitivni, sa najviše dve decimale; raspodela ne sme premašiti uplatu.",
      );
      return;
    }
    if (
      value.allocations.some((a) => {
        const i = this.invoices().find((i) => i.id === a.invoiceId);
        return !i || minor(a.amount) > minor(i.remainingAmount);
      })
    ) {
      this.error.set(
        "Raspodele moraju odgovarati izabranom klijentu, valuti i preostalom dugu. Uklonite ili ispravite označene raspodele.",
      );
      return;
    }
    const body: SavePaymentRequest = {
      ...value,
      paymentMethod: value.paymentMethod as SavePaymentRequest["paymentMethod"],
      purpose: value.purpose as SavePaymentRequest["purpose"],
      clientId: value.clientId || null,
      bankAccountId: value.bankAccountId || null,
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
            title: "Sačuvaj promenu raspodele?",
            message:
              "Promena će odmah izmeniti stanje naplate povezanih računa. Prethodna raspodela ostaje u istoriji.",
            confirmText: "Sačuvaj",
            cancelText: "Odustani",
          }),
        ))
      )
        return;
      const result = await firstValueFrom(
        this.api.save(this.id, body, this.key),
      );
      this.form.markAsPristine();
      await this.router.navigate(["/finance/payments", result.id]);
    } catch (e) {
      this.error.set(paymentError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
