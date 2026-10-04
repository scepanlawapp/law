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
import { QuickCaptureDialogService } from "./quick-capture/quick-capture-dialog.service";
import {
  STATUS_BADGE_CLASSES,
  STATUS_LABEL_KEYS,
  TREATMENT_LABEL_KEYS,
  formatMinutes,
  isEditable,
  isIsoDate,
} from "./time-utils";
import { WriteOffDialogService } from "./write-off-dialog/write-off-dialog.service";

const PAGE_SIZE = 25;
const OPTION_PAGE_SIZE = 100;

const STATUS_VALUES = Object.keys(STATUS_LABEL_KEYS) as WorkEntryStatus[];
const TREATMENT_VALUES = Object.keys(
  TREATMENT_LABEL_KEYS,
) as WorkEntryTreatment[];

@Component({
  selector: "law-team-time",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
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
export class TeamTimeComponent {
  private readonly api = inject(WorkEntriesApiClient);
  private readonly usersApi = inject(ReferencesApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly capture = inject(QuickCaptureDialogService);
  private readonly writeOffDialog = inject(WriteOffDialogService);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  private requestId = 0;

  readonly statusLabelKeys = STATUS_LABEL_KEYS;
  readonly statusBadgeClasses = STATUS_BADGE_CLASSES;
  readonly treatmentLabelKeys = TREATMENT_LABEL_KEYS;
  readonly formatMinutes = formatMinutes;
  readonly isEditable = isEditable;

  readonly statusOptions = STATUS_VALUES;
  readonly treatmentOptions = TREATMENT_VALUES;

  readonly users = signal<Array<{ id: string; name: string }>>([]);
  readonly clients = signal<ClientSummary[]>([]);
  readonly cases = signal<CaseSummary[]>([]);

  readonly peopleIds = signal<string[]>([]);
  readonly clientIds = signal<string[]>([]);
  readonly caseId = signal("");
  readonly statuses = signal<WorkEntryStatus[]>([]);
  readonly treatments = signal<WorkEntryTreatment[]>([]);
  readonly from = new FormControl("", { nonNullable: true });
  readonly to = new FormControl("", { nonNullable: true });

  readonly entries = signal<WorkEntry[]>([]);
  readonly page = signal(0);
  readonly hasMore = signal(false);
  readonly loading = signal(false);
  readonly error = signal(false);
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
    value ? this.localization.translate(STATUS_LABEL_KEYS[value]) : "";
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
  readonly selectedStatusesLabel = computed(() =>
    this.statuses().map(this.statusItemToString).join(", "),
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

    this.reload();
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
    this.load(true);
  }

  loadMore(): void {
    if (this.hasMore() && !this.loading()) this.load(false);
  }

  edit(entry: WorkEntry): void {
    if (!isEditable(entry)) return;
    this.capture
      .open({ mode: "edit", entryId: entry.id })
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

  private query(page: number): Partial<WorkEntryQuery> {
    const from = this.from.value;
    const to = this.to.value;
    return {
      page,
      pageSize: PAGE_SIZE,
      userIds: this.peopleIds().length ? this.peopleIds() : undefined,
      clientIds: this.clientIds().length ? this.clientIds() : undefined,
      caseId: this.caseId() || undefined,
      statuses: this.statuses().length ? this.statuses() : undefined,
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
