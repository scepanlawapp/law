import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import {
  CasesApiClient,
  ClientsApiClient,
  ReferencesApiClient,
  WorkEntriesApiClient,
} from "@law/api-clients";
import {
  CaseSummary,
  ClientSummary,
  WorkEntry,
  WorkEntryQuery,
  WorkEntryStatus,
  WorkEntryTreatment,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmComboboxContent,
  HlmComboboxEmpty,
  HlmComboboxInput,
  HlmComboboxItem,
  HlmComboboxList,
  HlmComboboxMultiple,
  HlmComboboxPortal,
  HlmComboboxTrigger,
} from "@spartan-ng/helm/combobox";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ToastService } from "../../shared/ui/toast/toast.service";
import {
  TREATMENT_LABEL_KEYS,
  STATUS_LABEL_KEYS,
  formatMinutes,
  formatWorkDate,
  isIsoDate,
} from "../time/time-utils";
import { WriteOffDialogService } from "../time/write-off-dialog/write-off-dialog.service";

import { QuickCaptureDialogService } from "../time/quick-capture/quick-capture-dialog.service";
import { createSelectItemToString } from "../../shared/utils";

import {
  STATUS_BADGE_BASE_CLASSES,
  statusBadgeClass,
} from "../../shared/status-badge";

const PAGE_SIZE = 25;
const OPTION_PAGE_SIZE = 100;

const TREATMENT_VALUES = Object.keys(
  TREATMENT_LABEL_KEYS,
) as WorkEntryTreatment[];

/** Work review defaults to confirmed, unbilled work and can inspect every status. */
@Component({
  selector: "law-finance-work-review",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./finance-work-review.component.html",
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmComboboxContent,
    HlmComboboxEmpty,
    HlmComboboxInput,
    HlmComboboxItem,
    HlmComboboxList,
    HlmComboboxMultiple,
    HlmComboboxPortal,
    HlmComboboxTrigger,
    HlmInput,
    HlmSelectImports,
    HlmSpinner,
    HlmTableImports,
    TranslatePipe,
  ],
})
export class FinanceWorkReviewComponent {
  private readonly capture = inject(QuickCaptureDialogService);
  private readonly api = inject(WorkEntriesApiClient);
  private readonly usersApi = inject(ReferencesApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);
  private readonly writeOffDialog = inject(WriteOffDialogService);
  private requestId = 0;

  readonly status = signal<WorkEntryStatus | "">("CONFIRMED");
  readonly statusLabelKeys = STATUS_LABEL_KEYS;
  readonly statusBadgeBase = STATUS_BADGE_BASE_CLASSES;
  readonly statusBadgeClass = statusBadgeClass;
  readonly statusOptions = [
    { value: "", label: "time.team.allStatuses" },
    ...Object.entries(STATUS_LABEL_KEYS).map(([value, label]) => ({
      value: value as WorkEntryStatus,
      label,
    })),
  ];
  readonly statusItemToString = createSelectItemToString(
    this.statusOptions,
    (key) => this.localization.translate(key),
  );
  setStatus(status: string): void {
    if (status && !(status in STATUS_LABEL_KEYS)) return;
    this.status.set(status as WorkEntryStatus | "");
    this.reload();
  }
  canInvoice(entry: WorkEntry): boolean {
    return !!entry.client && entry.status === "CONFIRMED" && !entry.invoiceId;
  }
  view(entry: WorkEntry): void {
    this.capture
      .open({
        mode:
          entry.status === "BILLED" || entry.status === "RUNNING"
            ? "view"
            : "edit",
        entryId: entry.id,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((saved) => {
        if (saved) this.reload();
      });
  }

  readonly treatmentLabelKeys = TREATMENT_LABEL_KEYS;
  readonly treatmentOptions = TREATMENT_VALUES;
  readonly formatMinutes = formatMinutes;

  readonly users = signal<Array<{ id: string; name: string }>>([]);
  readonly clients = signal<ClientSummary[]>([]);
  readonly cases = signal<CaseSummary[]>([]);

  readonly peopleIds = signal<string[]>([]);
  readonly clientIds = signal<string[]>([]);
  readonly caseId = signal("");
  readonly treatments = signal<WorkEntryTreatment[]>([]);
  readonly from = new FormControl("", { nonNullable: true });
  readonly to = new FormControl("", { nonNullable: true });

  readonly entries = signal<WorkEntry[]>([]);
  readonly selected = signal(new Map<string, WorkEntry>());
  readonly page = signal(0);
  readonly hasMore = signal(false);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly busyEntryId = signal<string | null>(null);

  readonly selectedCount = computed(() => this.selected().size);

  readonly userItemToString = (value: string | null | undefined): string =>
    value
      ? (this.users().find((user) => user.id === value)?.name ?? value)
      : "";
  readonly clientItemToString = (value: string | null | undefined): string =>
    value
      ? (this.clients().find((client) => client.id === value)?.displayName ??
        value)
      : "";
  readonly caseItemToString = (value: string | null | undefined): string => {
    if (!value) return this.localization.translate("work.filters.allCases");
    const item = this.cases().find((option) => option.id === value);
    return item ? `${item.caseNumber} — ${item.name}` : value;
  };
  readonly treatmentItemToString = (
    value: WorkEntryTreatment | null | undefined,
  ): string =>
    value ? this.localization.translate(TREATMENT_LABEL_KEYS[value]) : "";

  readonly selectedPeopleLabel = computed(() =>
    this.peopleIds().map(this.userItemToString).join(", "),
  );
  readonly selectedClientsLabel = computed(() =>
    this.clientIds().map(this.clientItemToString).join(", "),
  );
  readonly selectedTreatmentsLabel = computed(() =>
    this.treatments().map(this.treatmentItemToString).join(", "),
  );

  constructor() {
    this.usersApi
      .users()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) =>
          this.users.set(
            items.map((item) => ({
              id: item.userId,
              name:
                [item.user.firstName, item.user.lastName]
                  .filter(Boolean)
                  .join(" ") || item.user.email,
            })),
          ),
        error: () => undefined,
      });
    this.clientsApi
      .list({ page: 1, pageSize: OPTION_PAGE_SIZE })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.clients.set(response.items),
        error: () => undefined,
      });
    this.casesApi
      .list({ page: 1, pageSize: OPTION_PAGE_SIZE })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.cases.set(response.items),
        error: () => undefined,
      });

    this.from.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reload());
    this.to.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reload());

    this.load(true);
  }

  setPeopleIds(values: string[]): void {
    this.peopleIds.set(values);
    this.reload();
  }

  setClientIds(values: string[]): void {
    this.clientIds.set(values);
    this.reload();
  }

  setCaseId(value: string): void {
    this.caseId.set(value);
    this.reload();
  }

  setTreatments(values: WorkEntryTreatment[]): void {
    this.treatments.set(values);
    this.reload();
  }

  /** A new filter starts a new list; the previous selection no longer applies. */
  reload(): void {
    this.selected.set(new Map());
    this.load(true);
  }

  retry(): void {
    this.load(true);
  }

  loadMore(): void {
    if (this.hasMore() && !this.loading()) this.load(false);
  }

  isSelected(entry: WorkEntry): boolean {
    return this.selected().has(entry.id);
  }

  toggle(entry: WorkEntry): void {
    if (!this.canInvoice(entry)) return;
    const entryClientId = entry.client?.id;
    if (!entryClientId) return;
    const selected = new Map(this.selected());
    if (selected.has(entry.id)) {
      selected.delete(entry.id);
      this.selected.set(selected);
      return;
    }
    const currentClient = selected.values().next().value?.client?.id;
    if (currentClient && currentClient !== entryClientId) {
      this.toast.error(
        this.localization.translate("finance.selectionOneClient"),
      );
      return;
    }
    selected.set(entry.id, entry);
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

  newStatementFromSelection(): void {
    this.navigateToStatement([...this.selected().values()]);
  }

  newStatementFor(entry: WorkEntry): void {
    this.navigateToStatement([entry]);
  }

  writeOff(entry: WorkEntry): void {
    if (entry.status !== "CONFIRMED" || this.busyEntryId()) return;
    this.writeOffDialog
      .open()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((reason) => {
        if (!reason) return;
        this.busyEntryId.set(entry.id);
        this.api
          .writeOff(entry.id, { reason })
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.reload();
              this.busyEntryId.set(null);
              this.toast.success(
                this.localization.translate("time.writeOff.done"),
              );
            },
            error: () => {
              this.busyEntryId.set(null);
              this.toast.error(
                this.localization.translate("time.writeOff.error"),
              );
            },
          });
      });
  }

  workDateLabel(date: string): string {
    return formatWorkDate(date, this.localization.language());
  }

  private navigateToStatement(entries: WorkEntry[]): void {
    if (!entries.length || entries.some((entry) => !this.canInvoice(entry)))
      return;
    const clientId = entries[0].client?.id;
    if (!clientId || entries.some((entry) => entry.client?.id !== clientId)) {
      this.toast.error(
        this.localization.translate("finance.selectionOneClient"),
      );
      return;
    }
    void this.router.navigate(["/finance/invoices/new"], {
      queryParams: {
        clientId,
        workEntryIds: entries.map((entry) => entry.id),
      },
    });
  }

  private query(page: number): Partial<WorkEntryQuery> {
    const from = this.from.value;
    const to = this.to.value;
    return {
      page,
      pageSize: PAGE_SIZE,
      statuses: this.status() ? [this.status() as WorkEntryStatus] : undefined,
      unbilledOnly: this.status() === "CONFIRMED" ? true : undefined,
      userIds: this.peopleIds().length ? this.peopleIds() : undefined,
      clientIds: this.clientIds().length ? this.clientIds() : undefined,
      caseId: this.caseId() || undefined,
      treatments: this.treatments().length ? this.treatments() : undefined,
      from: isIsoDate(from) ? from : undefined,
      to: isIsoDate(to) ? to : undefined,
    };
  }

  private load(reset: boolean): void {
    const page = reset ? 1 : this.page() + 1;
    const requestId = ++this.requestId;
    this.loading.set(true);
    this.error.set(false);
    this.api
      .list(this.query(page))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (requestId !== this.requestId) return;
          this.entries.update((items) =>
            reset ? response.items : [...items, ...response.items],
          );
          this.page.set(page);
          this.hasMore.set(page < response.meta.totalPages);
          this.loading.set(false);
        },
        error: () => {
          if (requestId !== this.requestId) return;
          if (reset) this.entries.set([]);
          this.hasMore.set(false);
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }
}
