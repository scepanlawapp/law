import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CaseSummary, WorkEntry } from "@law/api-interfaces";
import { CasesApiClient, WorkEntriesApiClient } from "@law/api-clients";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { formatDate } from "../../shared/billing";
import { TREATMENT_LABEL_KEYS, formatMinutes } from "../time/time-utils";
import { InvoiceLineImportDialogContext } from "./invoice-line-import-dialog.models";

const PAGE_SIZE = 10;

/** Lists the confirmed, unbilled work entries of one client for a invoice. */
@Component({
  selector: "law-invoice-line-import-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./invoice-line-import-dialog.component.html",
  imports: [
    HlmButton,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmSelectImports,
    HlmSpinner,
    HlmTableImports,
    TranslatePipe,
  ],
})
export class InvoiceLineImportDialogComponent {
  private readonly api = inject(WorkEntriesApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly localization = inject(LocalizationService);
  private readonly context =
    injectBrnDialogContext<InvoiceLineImportDialogContext>();
  readonly dialogRef = inject<BrnDialogRef<WorkEntry[]>>(BrnDialogRef);

  readonly client = this.context.client;
  readonly excludedEntryIds = new Set(this.context.excludedEntryIds);
  readonly treatmentLabelKeys = TREATMENT_LABEL_KEYS;
  readonly formatMinutes = formatMinutes;

  readonly cases = signal<CaseSummary[]>([]);
  readonly caseId = signal("");
  readonly entries = signal<WorkEntry[]>([]);
  readonly selected = signal(new Map<string, WorkEntry>());
  readonly page = signal(1);
  readonly pageCount = signal(1);
  readonly totalItems = signal(0);
  readonly loading = signal(false);
  readonly error = signal(false);

  readonly caseItemToString = (value: string | null | undefined): string => {
    if (!value) return this.localization.translate("finance.allCases");
    const item = this.cases().find((caseItem) => caseItem.id === value);
    return item ? `${item.caseNumber} — ${item.name}` : "";
  };

  constructor() {
    this.casesApi
      .list({ clientId: this.client.id, page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.cases.set(response.items),
        error: () => undefined,
      });
    this.load();
  }

  setCaseId(value: string): void {
    this.caseId.set(value);
    this.page.set(1);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api
      .list({
        clientIds: [this.client.id],
        statuses: ["CONFIRMED"],
        unbilledOnly: true,
        caseId: this.caseId() || undefined,
        page: this.page(),
        pageSize: PAGE_SIZE,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.entries.set(response.items);
          this.page.set(response.meta.page);
          this.pageCount.set(Math.max(1, response.meta.totalPages));
          this.totalItems.set(response.meta.totalItems);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  toggle(entry: WorkEntry): void {
    if (this.excludedEntryIds.has(entry.id)) return;
    const selected = new Map(this.selected());
    if (selected.has(entry.id)) selected.delete(entry.id);
    else selected.set(entry.id, entry);
    this.selected.set(selected);
  }

  toggleFromRow(event: MouseEvent, entry: WorkEntry): void {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("button, input, a, select, textarea")
    ) {
      return;
    }
    this.toggle(entry);
  }

  changePage(page: number): void {
    if (page < 1 || page > this.pageCount() || this.loading()) return;
    this.page.set(page);
    this.load();
  }

  importSelected(): void {
    if (this.selected().size) {
      this.dialogRef.close([...this.selected().values()]);
    }
  }

  formatDate(value: string): string {
    return formatDate(value.slice(0, 10), this.localization.language());
  }
}
