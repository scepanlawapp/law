import { Component, DestroyRef, inject, signal } from "@angular/core";
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
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "law-finance-statement-detail",
  standalone: true,
  templateUrl: "./finance-statement-detail.component.html",
  imports: [RouterLink, HlmButton, HlmSpinner, HlmTableImports, TranslatePipe],
})
export class FinanceStatementDetailComponent {
  private readonly api = inject(FinancialsApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly localization = inject(LocalizationService);

  readonly statementId = this.route.snapshot.paramMap.get("id") ?? "";
  readonly statement = signal<BillingStatement | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);

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

  sourceLabel(line: BillingStatementLineSummary): string {
    return this.localization.translate(
      line.sourceType
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
