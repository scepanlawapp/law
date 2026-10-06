import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import {
  Invoice,
  InvoiceLineSummary,
  InvoiceSefStateResponse,
  SefValidationResult,
} from "@law/api-interfaces";
import { FinancialsApiClient } from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { AuthState } from "@law/security";
import { canManageBilling } from "../../shared/billing";
import { hasPricingRequiredLines, localizePaymentMethod } from "./invoice-form";
import {
  STATUS_BADGE_BASE_CLASSES,
  statusBadgeClass,
} from "../../shared/status-badge";

@Component({
  selector: "law-finance-invoice-detail",
  standalone: true,
  templateUrl: "./finance-invoice-detail.component.html",
  imports: [
    RouterLink,
    HlmButton,
    HlmSpinner,
    HlmTableImports,
    HlmTooltipImports,
    TranslatePipe,
  ],
})
export class FinanceInvoiceDetailComponent {
  readonly statusBadgeBaseClasses = STATUS_BADGE_BASE_CLASSES;
  readonly statusBadgeClass = statusBadgeClass;
  private readonly api = inject(FinancialsApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly localization = inject(LocalizationService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly authState = inject(AuthState);

  readonly invoiceId = this.route.snapshot.paramMap.get("id") ?? "";
  readonly invoice = signal<Invoice | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly sending = signal(false);
  readonly sefState = signal<InvoiceSefStateResponse | null>(null);
  readonly sefLoading = signal(false);
  readonly sefAction = signal<
    "validate" | "download" | "send" | "refresh" | null
  >(null);
  readonly sefValidation = signal<SefValidationResult | null>(null);
  /** Sending is for OWNER/ADMIN, like the API enforces. */
  readonly canSend = computed(() =>
    canManageBilling(this.authState.activeWorkspace()?.role),
  );

  /** Lines that still need a price block sending the invoice. */
  readonly pricingRequiredCount = computed(
    () =>
      this.invoice()?.lines.filter((line) => line.pricingRequired).length ?? 0,
  );
  readonly sendBlocked = computed(
    () =>
      hasPricingRequiredLines(this.invoice()?.lines ?? []) ||
      Boolean(this.sefState()?.immutable),
  );

  paymentMethodLabel(value: string | null): string {
    return (
      localizePaymentMethod(value, (key) => this.localization.translate(key)) ??
      "—"
    );
  }
  readonly sefSendBlocked = computed(() => {
    const state = this.sefState();
    return (
      !state ||
      !state.enabled ||
      !state.configured ||
      state.environment !== "DEMO" ||
      state.immutable ||
      this.sefAction() !== null
    );
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api
      .invoice(this.invoiceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invoice) => {
          this.invoice.set(invoice);
          this.loading.set(false);
          this.loadSefState();
        },
        error: () => {
          this.invoice.set(null);
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  loadSefState(): void {
    this.sefLoading.set(true);
    this.api
      .sefState(this.invoiceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (state) => {
          this.sefState.set(state);
          this.sefLoading.set(false);
        },
        error: () => {
          this.sefState.set(null);
          this.sefLoading.set(false);
        },
      });
  }

  validateForSef(): void {
    if (this.sefAction()) return;
    this.sefAction.set("validate");
    this.api
      .validateSefInvoice(this.invoiceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.sefValidation.set(result);
          this.sefAction.set(null);
          const message = this.localization.translate(
            result.valid
              ? "finance.sef.validationPassed"
              : "finance.sef.validationFailed",
          );
          if (result.valid) this.toast.success(message);
          else this.toast.error(message);
        },
        error: () => {
          this.sefAction.set(null);
          this.toast.error(
            this.localization.translate("finance.sef.actionError"),
          );
        },
      });
  }

  downloadUbl(): void {
    if (this.sefAction()) return;
    this.sefAction.set("download");
    this.api
      .downloadSefUbl(this.invoiceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download =
            `${this.invoice()?.invoiceNumber ?? "invoice"}.xml`.replace(
              /[^a-zA-Z0-9._-]+/g,
              "_",
            );
          anchor.click();
          URL.revokeObjectURL(url);
          this.sefAction.set(null);
        },
        error: () => {
          this.sefAction.set(null);
          this.toast.error(
            this.localization.translate("finance.sef.actionError"),
          );
        },
      });
  }

  sendToDemoSef(): void {
    if (this.sefSendBlocked()) return;
    this.confirmDialog
      .confirm({
        title: "finance.sef.sendTitle",
        message: "finance.sef.sendMessage",
        confirmText: "finance.sef.send",
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (!confirmed) return;
        const storageKey = `sef-idempotency:${this.invoiceId}`;
        const idempotencyKey =
          sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
        sessionStorage.setItem(storageKey, idempotencyKey);
        this.sefAction.set("send");
        this.api
          .sendToDemoSef(this.invoiceId, idempotencyKey)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (submission) => {
              if (submission.state === "FAILED")
                sessionStorage.removeItem(storageKey);
              this.sefAction.set(null);
              this.loadSefState();
            },
            error: () => {
              this.sefAction.set(null);
              this.loadSefState();
              this.toast.error(
                this.localization.translate("finance.sef.actionError"),
              );
            },
          });
      });
  }

  refreshSef(): void {
    if (this.sefAction()) return;
    this.sefAction.set("refresh");
    this.api
      .refreshSefStatus(this.invoiceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.sefAction.set(null);
          this.loadSefState();
        },
        error: () => {
          this.sefAction.set(null);
          this.loadSefState();
          this.toast.error(
            this.localization.translate("finance.sef.actionError"),
          );
        },
      });
  }

  sefStateKey(state: string): string {
    return `finance.sef.state.${state}`;
  }

  sefFieldLabel(fieldPath: string): string {
    const line = /^invoice\.lines\.(\d+)/.exec(fieldPath);
    if (line)
      return `${this.localization.translate("finance.sef.fieldLine")} ${Number(line[1]) + 1}`;
    const key = fieldPath.startsWith("supplier")
      ? "finance.sef.fieldIssuer"
      : fieldPath.startsWith("customer")
        ? "finance.sef.fieldRecipient"
        : fieldPath.startsWith("payment")
          ? "finance.sef.fieldPayment"
          : fieldPath.startsWith("invoice")
            ? "finance.sef.fieldInvoice"
            : "finance.sef.fieldConfiguration";
    return this.localization.translate(key);
  }

  send(): void {
    const invoice = this.invoice();
    if (!invoice || invoice.status !== "DRAFT" || this.sendBlocked()) return;
    this.confirmDialog
      .confirm({
        title: "finance.sendInvoiceTitle",
        message: "finance.sendInvoiceMessage",
        confirmText: "finance.sendInvoice",
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.sending.set(true);
        this.api
          .sendInvoice(invoice.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (sent) => {
              this.invoice.set(sent);
              this.sending.set(false);
              this.toast.success(
                this.localization.translate("finance.statementSent"),
              );
            },
            error: (error: unknown) => {
              this.sending.set(false);
              const conflict =
                (error as { status?: number } | null)?.status === 409;
              this.toast.error(
                this.localization.translate(this.sendErrorKey(error)),
              );
              // The invoice changed under us; show its current state.
              if (conflict) this.load();
            },
          });
      });
  }

  private sendErrorKey(error: unknown): string {
    const body = (error as { status?: number; error?: { message?: unknown } })
      ?.error;
    const reason = typeof body?.message === "string" ? body.message : "";
    if ((error as { status?: number })?.status !== 409)
      return "finance.statementSendError";
    if (reason.includes("Price every line"))
      return "finance.statementSendPricingError";
    if (reason.includes("draft")) return "finance.statementSendNotDraftError";
    return "finance.statementSendError";
  }

  sourceLabel(line: InvoiceLineSummary): string {
    return this.localization.translate(
      line.workEntries.length
        ? "finance.importedLineSource"
        : "finance.manualLineSource",
    );
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat(
      this.localization.language() === "EN" ? "en" : "sr-Latn",
      { dateStyle: "medium" },
    ).format(new Date(value));
  }

  formatAmount(value: string): string {
    return new Intl.NumberFormat(
      this.localization.language() === "EN" ? "en" : "sr-Latn",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    ).format(Number(value));
  }

  formatCurrency(value: string, currency: string): string {
    return new Intl.NumberFormat(
      this.localization.language() === "EN" ? "en" : "sr-Latn",
      { style: "currency", currency },
    ).format(Number(value));
  }
}
