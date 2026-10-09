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
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideEye } from "@ng-icons/lucide";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { HlmButton } from "@spartan-ng/helm/button";
import { PaginationComponent } from "../../shared/ui/pagination/pagination.component";
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmComboboxImports } from "@spartan-ng/helm/combobox";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { formatDate } from "../../shared/billing";
import { QuickCaptureDialogService } from "../time/quick-capture/quick-capture-dialog.service";
import { TREATMENT_LABEL_KEYS, formatMinutes } from "../time/time-utils";
import { InvoiceLineImportDialogContext } from "./invoice-line-import-dialog.models";
import {
  InvoiceLineImportMode,
  InvoiceLineImportResult,
} from "./invoice-line-import-dialog.models";

/** Lists the confirmed, unbilled work entries of one client for a invoice. */
@Component({
  selector: "law-invoice-line-import-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./invoice-line-import-dialog.component.html",
  imports: [
    HlmButton,
    PaginationComponent,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmComboboxImports,
    HlmSpinner,
    HlmTableImports,
    NgIcon,
    TranslatePipe,
  ],
  providers: [provideIcons({ lucideEye })],
})
export class InvoiceLineImportDialogComponent {
  private readonly api = inject(WorkEntriesApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly localization = inject(LocalizationService);
  private readonly quickCapture = inject(QuickCaptureDialogService);
  private readonly context =
    injectBrnDialogContext<InvoiceLineImportDialogContext>();
  readonly dialogRef =
    inject<BrnDialogRef<InvoiceLineImportResult>>(BrnDialogRef);

  readonly client = this.context.client;
  readonly excludedEntryIds = new Set(this.context.excludedEntryIds);
  readonly treatmentLabelKeys = TREATMENT_LABEL_KEYS;
  readonly formatMinutes = formatMinutes;

  readonly cases = signal<CaseSummary[]>([]);
  readonly caseId = signal("");
  readonly entries = signal<WorkEntry[]>([]);
  readonly selected = signal(new Map<string, WorkEntry>());
  readonly mode = signal<InvoiceLineImportMode>("SEPARATE");
  readonly page = signal(1);
  readonly pageSize = signal(50);
  readonly pageCount = signal(1);
  readonly totalItems = signal(0);
  readonly loading = signal(false);
  readonly error = signal(false);
  private requestSequence = 0;

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
    const sequence = ++this.requestSequence;
    this.loading.set(true);
    this.error.set(false);
    this.api
      .list({
        clientIds: [this.client.id],
        statuses: ["CONFIRMED"],
        treatments: ["RETAINER", "HOURLY", "AT", "UNDECIDED"],
        unbilledOnly: true,
        caseId: this.caseId() || undefined,
        page: this.page(),
        pageSize: this.pageSize(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (sequence !== this.requestSequence) return;
          const lastPage = Math.max(1, response.meta.totalPages);
          if (response.meta.page > lastPage) {
            this.page.set(lastPage);
            this.load();
            return;
          }
          this.entries.set(response.items);
          this.page.set(response.meta.page);
          this.pageCount.set(Math.max(1, response.meta.totalPages));
          this.totalItems.set(response.meta.totalItems);
          this.loading.set(false);
        },
        error: () => {
          if (sequence !== this.requestSequence) return;
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

  openEntry(entry: WorkEntry): void {
    this.quickCapture.open({ mode: "view", entryId: entry.id }).subscribe();
  }

  changePage(page: number): void {
    if (page < 1 || page > this.pageCount() || this.loading()) return;
    this.page.set(page);
    this.load();
  }

  changePageSize(pageSize: number): void {
    if (this.loading() || pageSize === this.pageSize()) return;
    this.pageSize.set(pageSize);
    this.page.set(1);
    this.load();
  }

  importSelected(): void {
    if (this.selected().size) {
      this.dialogRef.close({
        entries: [...this.selected().values()],
        mode: this.mode(),
      });
    }
  }

  formatDate(value: string): string {
    return formatDate(value.slice(0, 10), this.localization.language());
  }

  formatWorkValue(value: string): string {
    const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(value);
    if (!match) return value;

    const [, sign, whole, fraction = ""] = match;
    let cents = BigInt(`${whole}${fraction.padEnd(2, "0").slice(0, 2)}`);
    if (fraction.length > 2 && fraction[2] >= "5") cents += 1n;

    const groupedWhole = (cents / 100n)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const decimal = (cents % 100n).toString().padStart(2, "0");
    return `${sign && cents > 0n ? "-" : ""}${groupedWhole},${decimal}`;
  }
}
