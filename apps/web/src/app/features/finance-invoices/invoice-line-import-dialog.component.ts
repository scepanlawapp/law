import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CaseSummary, WorkEntry, WorkEntryStatus } from "@law/api-interfaces";
import { CasesApiClient, WorkEntriesApiClient } from "@law/api-clients";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideEye } from "@ng-icons/lucide";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { HlmButton } from "@spartan-ng/helm/button";
import { PaginationComponent } from "../../shared/ui/pagination/pagination.component";
import {
  FIRST_PAGE,
  injectPaginatedList,
} from "../../shared/pagination/paginated-list";
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
import { formatMinutes } from "../time/time-utils";
import { InvoiceLineImportDialogContext } from "./invoice-line-import-dialog.models";
import {
  INVOICE_IMPORTABLE_TREATMENTS,
  INVOICE_LINE_IMPORT_MODE_LABELS,
  InvoiceLineImportMode,
  InvoiceLineImportResult,
} from "./invoice-line-import-dialog.models";
import { WORK_ENTRY_TREATMENT_LABELS, optionsFrom } from "../../shared/models";

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
  readonly treatmentLabelKeys = WORK_ENTRY_TREATMENT_LABELS;
  readonly formatMinutes = formatMinutes;

  readonly cases = signal<CaseSummary[]>([]);
  readonly caseId = signal("");
  readonly list = injectPaginatedList<WorkEntry>({
    fetch: (request) =>
      this.api.list({
        clientIds: [this.client.id],
        statuses: [WorkEntryStatus.CONFIRMED],
        treatments: [...INVOICE_IMPORTABLE_TREATMENTS],
        unbilledOnly: true,
        caseId: this.caseId() || undefined,
        ...request,
      }),
  });
  readonly entries = this.list.items;
  readonly loading = this.list.loading;
  readonly error = this.list.error;
  readonly selected = signal(new Map<string, WorkEntry>());
  readonly mode = signal<InvoiceLineImportMode>(InvoiceLineImportMode.SEPARATE);
  readonly modeOptions = optionsFrom(INVOICE_LINE_IMPORT_MODE_LABELS);

  readonly caseItemToString = (value: string | null | undefined): string => {
    if (!value) return this.localization.translate("finance.allCases");
    const item = this.cases().find((caseItem) => caseItem.id === value);
    return item ? `${item.caseNumber} — ${item.name}` : "";
  };

  constructor() {
    this.casesApi
      .list({ ...FIRST_PAGE, clientId: this.client.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.cases.set(response.items),
        error: () => undefined,
      });
    this.list.load();
  }

  setCaseId(value: string): void {
    this.caseId.set(value);
    this.list.reset();
  }

  readonly selectableEntries = computed(() =>
    this.entries().filter((entry) => !this.excludedEntryIds.has(entry.id)),
  );
  readonly allVisibleSelected = computed(
    () =>
      this.selectableEntries().length > 0 &&
      this.selectableEntries().every((entry) => this.selected().has(entry.id)),
  );
  readonly someVisibleSelected = computed(
    () =>
      !this.allVisibleSelected() &&
      this.selectableEntries().some((entry) => this.selected().has(entry.id)),
  );

  toggleAllVisible(): void {
    if (this.loading()) return;
    const selected = new Map(this.selected());
    const remove = this.allVisibleSelected();
    for (const entry of this.selectableEntries()) {
      if (remove) selected.delete(entry.id);
      else selected.set(entry.id, entry);
    }
    this.selected.set(selected);
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
