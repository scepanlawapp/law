import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
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
import { AuthState } from "@law/security";
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
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { PaginationComponent } from "../../shared/ui/pagination/pagination.component";
import {
  FIRST_PAGE,
  PageRequest,
  injectPaginatedList,
} from "../../shared/pagination/paginated-list";
import {
  HlmTBody,
  HlmTd,
  HlmTh,
  HlmTHead,
  HlmTable,
  HlmTableContainer,
  HlmTr,
} from "@spartan-ng/helm/table";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { ComboboxSelectAllComponent } from "../../shared/ui/combobox-select-all/combobox-select-all.component";
import { QuickCaptureDialogService } from "./quick-capture/quick-capture-dialog.service";
import {
  STATUS_BADGE_CLASSES,
  formatMinutes,
  formatWorkValue,
  isEditable,
  isIsoDate,
} from "./time-utils";
import { WriteOffDialogService } from "./write-off-dialog/write-off-dialog.service";
import {
  WORK_ENTRY_STATUS_LABELS,
  WORK_ENTRY_TREATMENT_LABELS,
  labelOf,
  optionsFrom,
} from "../../shared/models";
import { formatDate } from "../../shared/billing";

@Component({
  selector: "law-team-time, law-time-table",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    ComboboxSelectAllComponent,
    PaginationComponent,
    HlmInput,
    HlmSpinner,
    HlmTable,
    HlmTableContainer,
    HlmTBody,
    HlmTd,
    HlmTh,
    HlmTHead,
    HlmTr,
    TranslatePipe,
  ],
  templateUrl: "./team-time.component.html",
})
export class TeamTimeComponent implements OnInit {
  private readonly api = inject(WorkEntriesApiClient);
  private readonly auth = inject(AuthState);
  private readonly usersApi = inject(ReferencesApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly capture = inject(QuickCaptureDialogService);
  private readonly writeOffDialog = inject(WriteOffDialogService);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly currentUserOnly = input(false);

  readonly statusLabelKeys = WORK_ENTRY_STATUS_LABELS;
  readonly statusBadgeClasses = STATUS_BADGE_CLASSES;
  readonly treatmentLabelKeys = WORK_ENTRY_TREATMENT_LABELS;
  readonly formatMinutes = formatMinutes;
  readonly isEditable = isEditable;

  readonly statusOptions = optionsFrom(WORK_ENTRY_STATUS_LABELS);
  readonly treatmentOptions = optionsFrom(WORK_ENTRY_TREATMENT_LABELS);

  readonly users = signal<Array<{ id: string; name: string }>>([]);
  readonly clients = signal<ClientSummary[]>([]);
  readonly cases = signal<CaseSummary[]>([]);

  readonly peopleIds = signal<string[]>([]);
  readonly clientIds = signal<string[]>([]);
  readonly caseId = signal("");
  readonly statuses = signal<WorkEntryStatus[]>([
    WorkEntryStatus.PROPOSED,
    WorkEntryStatus.RUNNING,
    WorkEntryStatus.CONFIRMED,
  ]);
  readonly treatments = signal<WorkEntryTreatment[]>([]);
  readonly from = new FormControl("", { nonNullable: true });
  readonly to = new FormControl("", { nonNullable: true });

  readonly list = injectPaginatedList<WorkEntry>({
    fetch: (request) => this.api.list(this.query(request)),
    onError: () => this.entries.set([]),
  });
  readonly entries = this.list.items;
  readonly totalItems = this.list.totalItems;
  readonly loading = this.list.loading;
  readonly error = this.list.error;
  readonly busyEntryId = signal<string | null>(null);

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
  readonly statusItemToString = (
    value: WorkEntryStatus | null | undefined,
  ): string =>
    labelOf(WORK_ENTRY_STATUS_LABELS, value, (key) =>
      this.localization.translate(key),
    );
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
  readonly selectedStatusesLabel = computed(() =>
    this.statuses().map(this.statusItemToString).join(", "),
  );
  readonly selectedTreatmentsLabel = computed(() =>
    this.treatments().map(this.treatmentItemToString).join(", "),
  );

  constructor() {
    effect(() => {
      const currentUserOnly = this.currentUserOnly();
      if (currentUserOnly) this.auth.session();
      untracked(() => this.reload());
    });
  }

  ngOnInit(): void {
    if (!this.currentUserOnly())
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

  setStatuses(values: WorkEntryStatus[]): void {
    this.statuses.set(values);
    this.reload();
  }

  setTreatments(values: WorkEntryTreatment[]): void {
    this.treatments.set(values);
    this.reload();
  }

  reload(): void {
    if (this.currentUserOnly() && !this.auth.session()?.user.id) {
      this.list.clear();
      return;
    }
    this.list.reset();
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

  openFromRow(event: Event, entry: WorkEntry): void {
    if (
      event.target instanceof Element &&
      event.target.closest("button, input, a, select, textarea")
    )
      return;
    if (this.busyEntryId() === entry.id) return;
    if (event instanceof KeyboardEvent) event.preventDefault();
    this.edit(entry);
  }

  edit(entry: WorkEntry): void {
    this.capture
      .open({ mode: isEditable(entry) ? "edit" : "view", entryId: entry.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((saved) => {
        if (saved) this.replaceEntry(saved);
      });
  }

  writeOff(entry: WorkEntry): void {
    if (!isEditable(entry)) return;
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
            next: (updated) => {
              this.busyEntryId.set(null);
              this.replaceEntry(updated);
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

  private replaceEntry(updated: WorkEntry): void {
    this.entries.update((items) =>
      items.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  private query(request: PageRequest): Partial<WorkEntryQuery> {
    const from = this.from.value;
    const to = this.to.value;
    const userId = this.auth.session()?.user.id;
    return {
      ...request,
      userIds: this.currentUserOnly()
        ? userId
          ? [userId]
          : []
        : this.peopleIds().length
          ? this.peopleIds()
          : undefined,
      clientIds: this.clientIds().length ? this.clientIds() : undefined,
      caseId: this.caseId() || undefined,
      statuses: this.statuses().length ? this.statuses() : undefined,
      treatments: this.treatments().length ? this.treatments() : undefined,
      from: isIsoDate(from) ? from : undefined,
      to: isIsoDate(to) ? to : undefined,
    };
  }
}
