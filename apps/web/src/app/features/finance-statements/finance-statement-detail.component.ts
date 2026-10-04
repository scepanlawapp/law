import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import {
  BillingStatement,
  BillingStatementLineSummary,
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
import { hasPricingRequiredLines } from "./billing-statement-form";

@Component({
  selector: "law-finance-statement-detail",
  standalone: true,
  templateUrl: "./finance-statement-detail.component.html",
  imports: [
    RouterLink,
    HlmButton,
    HlmSpinner,
    HlmTableImports,
    HlmTooltipImports,
    TranslatePipe,
  ],
})
export class FinanceStatementDetailComponent {
  private readonly api = inject(FinancialsApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly localization = inject(LocalizationService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);

  readonly statementId = this.route.snapshot.paramMap.get("id") ?? "";
  readonly statement = signal<BillingStatement | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly sending = signal(false);

  /** Lines that still need a price block sending the statement. */
  readonly pricingRequiredCount = computed(
    () =>
      this.statement()?.lines.filter((line) => line.pricingRequired).length ??
      0,
  );
  readonly sendBlocked = computed(() =>
    hasPricingRequiredLines(this.statement()?.lines ?? []),
  );

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api
      .statement(this.statementId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (statement) => {
          this.statement.set(statement);
          this.loading.set(false);
        },
        error: () => {
          this.statement.set(null);
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  send(): void {
    const statement = this.statement();
    if (!statement || statement.status !== "DRAFT" || this.sendBlocked())
      return;
    this.confirmDialog
      .confirm({
        title: "finance.sendStatementTitle",
        message: "finance.sendStatementMessage",
        confirmText: "finance.sendStatement",
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.sending.set(true);
        this.api
          .sendStatement(statement.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (sent) => {
              this.statement.set(sent);
              this.sending.set(false);
              this.toast.success(
                this.localization.translate("finance.statementSent"),
              );
            },
            error: () => {
              this.sending.set(false);
              this.toast.error(
                this.localization.translate("finance.statementSendError"),
              );
            },
          });
      });
  }

  sourceLabel(line: BillingStatementLineSummary): string {
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
