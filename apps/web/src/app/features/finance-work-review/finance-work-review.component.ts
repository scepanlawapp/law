import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Router } from "@angular/router";
import {
  CasesApiClient,
  ClientsApiClient,
  EventsApiClient,
  FinancialsApiClient,
  WorkManagementApiClient,
} from "@law/api-clients";
import {
  BillableWorkItem,
  BillableWorkSourceType,
  CaseSummary,
  ClientSummary,
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
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { EventDialogService } from "../calendar/event-dialog/event-dialog.service";
import { DeadlineDialogService } from "../work-management/deadline-dialog/deadline-dialog.service";
import { TaskDialogService } from "../work-management/task-dialog/task-dialog.service";

@Component({
  selector: "law-finance-work-review",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./finance-work-review.component.html",
  imports: [
    HlmButton,
    HlmComboboxContent,
    HlmComboboxEmpty,
    HlmComboboxInput,
    HlmComboboxItem,
    HlmComboboxList,
    HlmComboboxMultiple,
    HlmComboboxPortal,
    HlmComboboxTrigger,
    HlmSpinner,
    HlmTableImports,
    TranslatePipe,
  ],
})
export class FinanceWorkReviewComponent {
  private readonly api = inject(FinancialsApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly eventsApi = inject(EventsApiClient);
  private readonly workApi = inject(WorkManagementApiClient);
  private readonly eventDialog = inject(EventDialogService);
  private readonly taskDialog = inject(TaskDialogService);
  private readonly deadlineDialog = inject(DeadlineDialogService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);

  readonly items = signal<BillableWorkItem[]>([]);
  readonly clients = signal<ClientSummary[]>([]);
  readonly cases = signal<CaseSummary[]>([]);
  readonly clientIds = signal<string[]>([]);
  readonly caseIds = signal<string[]>([]);
  readonly sourceTypes = signal<BillableWorkSourceType[]>([]);
  readonly selectedSourceKeys = signal(new Set<string>());
  readonly loading = signal(true);
  readonly error = signal(false);

  readonly selectedItems = computed(() =>
    this.items().filter((item) =>
      this.selectedSourceKeys().has(item.sourceKey),
    ),
  );

  readonly sourceOptions: ReadonlyArray<{
    value: BillableWorkSourceType;
    label: string;
  }> = [
    { value: "EVENT", label: "finance.sourceEvent" },
    { value: "TASK", label: "finance.sourceTask" },
    { value: "DEADLINE", label: "finance.sourceDeadline" },
  ];

  readonly clientItemToString = (value: string | null | undefined): string =>
    value
      ? (this.clients().find((client) => client.id === value)?.displayName ??
        value)
      : "";
  readonly caseItemToString = (value: string | null | undefined): string => {
    if (!value) return "";
    const caseItem = this.cases().find((item) => item.id === value);
    return caseItem ? `${caseItem.caseNumber} — ${caseItem.name}` : value;
  };
  readonly sourceItemToString = (
    value: BillableWorkSourceType | null | undefined,
  ): string =>
    value
      ? this.localization.translate(
          this.sourceOptions.find((option) => option.value === value)?.label ??
            "",
        )
      : "";
  readonly selectedClientsLabel = computed(() =>
    this.clientIds().map(this.clientItemToString).join(", "),
  );
  readonly selectedCasesLabel = computed(() =>
    this.caseIds().map(this.caseItemToString).join(", "),
  );
  readonly selectedSourcesLabel = computed(() =>
    this.sourceTypes().map(this.sourceItemToString).join(", "),
  );

  constructor() {
    this.clientsApi
      .list({ page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (response) => this.clients.set(response.items) });
    this.casesApi
      .list({ page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (response) => this.cases.set(response.items) });
    this.load();
  }

  setClientIds(value: string[]): void {
    this.clientIds.set(value);
    this.filtersChanged();
  }

  setCaseIds(value: string[]): void {
    this.caseIds.set(value);
    this.filtersChanged();
  }

  setSourceTypes(value: BillableWorkSourceType[]): void {
    this.sourceTypes.set(value);
    this.filtersChanged();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api
      .billableWork({
        page: 1,
        pageSize: 100,
        clientIds: this.clientIds(),
        caseIds: this.caseIds(),
        sourceTypes: this.sourceTypes(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.items.set(response.items);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  toggle(item: BillableWorkItem): void {
    const selected = new Set(this.selectedSourceKeys());
    if (selected.has(item.sourceKey)) {
      selected.delete(item.sourceKey);
      this.selectedSourceKeys.set(selected);
      return;
    }
    const currentClient = this.selectedItems()[0]?.client.id;
    if (currentClient && currentClient !== item.client.id) {
      this.toast.error("finance.selectionOneClient");
      return;
    }
    selected.add(item.sourceKey);
    this.selectedSourceKeys.set(selected);
  }

  recordSelectedCandidates(): void {
    this.navigateToStatement(this.selectedItems());
  }

  recordItem(item: BillableWorkItem): void {
    this.navigateToStatement([item]);
  }

  openSource(item: BillableWorkItem): void {
    if (item.sourceType === "EVENT") {
      this.eventsApi
        .get(item.sourceId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (event) =>
            this.eventDialog
              .open({ event })
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe((updated) => updated && this.load()),
          error: () => this.toast.error("finance.sourceLoadError"),
        });
      return;
    }
    if (item.sourceType === "TASK") {
      this.workApi
        .getTask(item.sourceId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (task) =>
            this.taskDialog
              .open({ task })
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe((updated) => updated && this.load()),
          error: () => this.toast.error("finance.sourceLoadError"),
        });
      return;
    }
    this.workApi
      .getDeadline(item.sourceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (deadline) =>
          this.deadlineDialog
            .open({ deadline })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((updated) => updated && this.load()),
        error: () => this.toast.error("finance.sourceLoadError"),
      });
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat(
      this.localization.language() === "SR" ? "sr-Latn-RS" : "en-US",
      { dateStyle: "medium" },
    ).format(new Date(value));
  }

  sourceLabel(value: BillableWorkSourceType): string {
    return this.sourceItemToString(value);
  }

  private filtersChanged(): void {
    this.selectedSourceKeys.set(new Set());
    this.load();
  }

  private navigateToStatement(items: BillableWorkItem[]): void {
    if (!items.length) return;
    const clientIds = new Set(items.map((item) => item.client.id));
    if (clientIds.size !== 1) {
      this.toast.error("finance.selectionOneClient");
      return;
    }
    void this.router.navigate(["/finance/statements/new"], {
      queryParams: {
        clientId: items[0].client.id,
        source: items.map((item) => item.sourceKey),
      },
    });
  }
}
