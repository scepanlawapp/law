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
  HlmCombobox,
  HlmComboboxContent,
  HlmComboboxEmpty,
  HlmComboboxInput,
  HlmComboboxItem,
  HlmComboboxList,
  HlmComboboxMultiple,
  HlmComboboxPortal,
  HlmComboboxTrigger,
  HlmComboboxValue,
} from "@spartan-ng/helm/combobox";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ComboboxSelectAllComponent } from "../../shared/ui/combobox-select-all/combobox-select-all.component";
import { InfiniteScrollDirective } from "../../shared/infinite-scroll.directive";
import {
  FIRST_PAGE,
  PageRequest,
  injectPaginatedList,
} from "../../shared/pagination/paginated-list";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { formatWorkValue, isIsoDate } from "../time/time-utils";
import { formatDate } from "../../shared/billing";
import { WriteOffDialogService } from "../time/write-off-dialog/write-off-dialog.service";

import { QuickCaptureDialogService } from "../time/quick-capture/quick-capture-dialog.service";

import {
  STATUS_BADGE_BASE_CLASSES,
  statusBadgeClass,
} from "../../shared/status-badge";
import {
  AllOptionValue,
  createSelectItemToString,
  filterOptionsFrom,
  labelOf,
  optionsFrom,
  WORK_ENTRY_STATUS_LABELS,
  WORK_ENTRY_TREATMENT_LABELS,
} from "../../shared/models";

/** Work review defaults to confirmed, unbilled work and can inspect every status. */
@Component({
  selector: "law-finance-work-review",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./finance-work-review.component.html",
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmCombobox,
    HlmComboboxContent,
    HlmComboboxEmpty,
    HlmComboboxInput,
    HlmComboboxItem,
    HlmComboboxList,
    HlmComboboxMultiple,
    HlmComboboxPortal,
    HlmComboboxTrigger,
    HlmComboboxValue,
    HlmInput,
    HlmSelectImports,
    HlmSpinner,
    HlmTableImports,
    TranslatePipe,
    ComboboxSelectAllComponent,
    InfiniteScrollDirective,
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

  readonly status = signal<WorkEntryStatus | AllOptionValue>(
    WorkEntryStatus.CONFIRMED,
  );
  readonly statusLabelKeys = WORK_ENTRY_STATUS_LABELS;
  readonly statusBadgeBase = STATUS_BADGE_BASE_CLASSES;
  readonly statusBadgeClass = statusBadgeClass;
  readonly statusOptions = filterOptionsFrom(
    WORK_ENTRY_STATUS_LABELS,
    "time.team.allStatuses",
  );
  readonly statusItemToString = createSelectItemToString(
    this.statusOptions,
    (key) => this.localization.translate(key),
  );
  setStatus(status: string): void {
    if (status && !(status in WORK_ENTRY_STATUS_LABELS)) return;
    this.status.set(status as WorkEntryStatus | AllOptionValue);
    this.reload();
  }
  canInvoice(entry: WorkEntry): boolean {
    return (
      !!entry.client &&
      entry.status === WorkEntryStatus.CONFIRMED &&
      !entry.invoiceId &&
      entry.treatment !== WorkEntryTreatment.NON_BILLABLE
    );
  }
  view(entry: WorkEntry): void {
    this.capture
      .open({
        mode:
          entry.status === WorkEntryStatus.BILLED ||
          entry.status === WorkEntryStatus.RUNNING
            ? "view"
            : "edit",
        entryId: entry.id,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((saved) => {
        if (saved) this.reload();
      });
  }

  readonly treatmentLabelKeys = WORK_ENTRY_TREATMENT_LABELS;
  readonly treatmentOptions = optionsFrom(WORK_ENTRY_TREATMENT_LABELS);

  readonly users = signal<Array<{ id: string; name: string }>>([]);
  readonly clients = signal<ClientSummary[]>([]);
  readonly cases = signal<CaseSummary[]>([]);

  readonly peopleIds = signal<string[]>([]);
  readonly clientIds = signal<string[]>([]);
  readonly caseId = signal("");
  readonly treatments = signal<WorkEntryTreatment[]>([]);
  readonly from = new FormControl("", { nonNullable: true });
  readonly to = new FormControl("", { nonNullable: true });

  readonly list = injectPaginatedList<WorkEntry>({
    fetch: (request) => this.api.list(this.query(request)),
  });
  readonly entries = this.list.items;
  readonly selected = signal(new Map<string, WorkEntry>());
  readonly loading = this.list.loading;
  readonly error = this.list.error;
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
    labelOf(WORK_ENTRY_TREATMENT_LABELS, value, (key) =>
      this.localization.translate(key),
    );

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
      .list(FIRST_PAGE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.clients.set(response.items),
        error: () => undefined,
      });
    this.casesApi
      .list(FIRST_PAGE)
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

    this.list.load();
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
    this.list.reset();
  }

  isSelected(entry: WorkEntry): boolean {
    return this.selected().has(entry.id);
  }

  readonly selectableEntries = computed(() => {
    const entries = this.entries().filter(
      (entry) => this.canInvoice(entry) && !!entry.client,
    );
    const clientId =
      this.selected().values().next().value?.client?.id ??
      entries[0]?.client?.id;
    return entries.filter((entry) => entry.client?.id === clientId);
  });
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
    if (entry.status !== WorkEntryStatus.CONFIRMED || this.busyEntryId())
      return;
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
    return formatDate(date, this.localization.language());
  }

  priceLabel(entry: WorkEntry): string {
    if (entry.value == null)
      return this.localization.translate("time.capture.noWorkValue");
    return formatWorkValue(
      entry.value,
      entry.currency,
      this.localization.locale(),
    );
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

  private query(request: PageRequest): Partial<WorkEntryQuery> {
    const from = this.from.value;
    const to = this.to.value;
    return {
      ...request,
      statuses: this.status() ? [this.status() as WorkEntryStatus] : undefined,
      unbilledOnly:
        this.status() === WorkEntryStatus.CONFIRMED ? true : undefined,
      userIds: this.peopleIds().length ? this.peopleIds() : undefined,
      clientIds: this.clientIds().length ? this.clientIds() : undefined,
      caseId: this.caseId() || undefined,
      treatments: this.treatments().length ? this.treatments() : undefined,
      from: isIsoDate(from) ? from : undefined,
      to: isIsoDate(to) ? to : undefined,
    };
  }
}
