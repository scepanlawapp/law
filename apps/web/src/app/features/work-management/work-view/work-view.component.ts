import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import {
  CalendarItem,
  CaseSummary,
  DeadlineDetail,
  DeadlineStatus,
  EventDetail,
  EventStatus,
  TaskDetail,
  TaskStatus,
} from "@law/api-interfaces";
import {
  CasesApiClient,
  DeadlineListQuery,
  EventListQuery,
  EventsApiClient,
  ReferencesApiClient,
  TaskListQuery,
  TaskRequest,
  WorkManagementApiClient,
} from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmComboboxChip,
  HlmComboboxChipInput,
  HlmComboboxChips,
  HlmComboboxContent,
  HlmComboboxEmpty,
  HlmComboboxItem,
  HlmComboboxList,
  HlmComboboxMultiple,
  HlmComboboxPortal,
  HlmComboboxValues,
} from "@spartan-ng/helm/combobox";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideKanban, lucideList } from "@ng-icons/lucide";
import { Observable, debounceTime, distinctUntilChanged } from "rxjs";
import { BottomReachedDirective } from "../../../core/directives/bottom-reached.directive";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { LocalizationService } from "../../../core/localization/localization.service";
import { ConfirmDialogService } from "../../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../../shared/ui/toast/toast.service";
import { EventDialogService } from "../../calendar/event-dialog/event-dialog.service";
import { DeadlineDialogService } from "../deadline-dialog/deadline-dialog.service";
import { TaskDialogService } from "../task-dialog/task-dialog.service";
import { dueLabel } from "../work-management-utils";
import {
  createSelectItemToString,
  type SelectOption,
} from "../../../shared/utils";
import {
  BoardColumnKey,
  PresentationStatus,
  StatusTransitionAction,
  WorkItem,
  WorkSourceType,
  deadlineToWorkItem,
  eventToWorkItem,
  mergePage,
  sortWorkItems,
  statusTransition,
  taskToWorkItem,
} from "./work-view.models";

export type WorkViewMode = "team" | "my" | "case";
type DatePreset = "all" | "overdue" | "today" | "upcoming";
type StatusMode = "open" | "history";
type Presentation = "list" | "board";

const PAGE_SIZE = 20;
const ALL_RECORD_TYPES: WorkSourceType[] = ["TASK", "DEADLINE", "EVENT"];

function taskStatusesFor(
  presentations: PresentationStatus[],
): TaskStatus[] | undefined {
  if (!presentations.length) return undefined;
  return presentations.filter((status): status is TaskStatus =>
    (["TODO", "IN_PROGRESS", "DONE", "CANCELLED"] as string[]).includes(status),
  );
}

function deadlineStatusesFor(
  presentations: PresentationStatus[],
): DeadlineStatus[] | undefined {
  if (!presentations.length) return undefined;
  const mapped = presentations
    .map((status): DeadlineStatus | null => {
      if (status === "TODO") return "OPEN";
      if (status === "DONE") return "SATISFIED";
      if (status === "CANCELLED") return "CANCELLED";
      return null;
    })
    .filter((status): status is DeadlineStatus => status !== null);
  return mapped.length ? mapped : undefined;
}

function eventStatusesFor(
  presentations: PresentationStatus[],
): EventStatus[] | undefined {
  if (!presentations.length) return undefined;
  const mapped = presentations
    .map((status): EventStatus | null => {
      if (status === "TODO") return "SCHEDULED";
      if (status === "DONE") return "COMPLETED";
      if (status === "CANCELLED") return "CANCELLED";
      return null;
    })
    .filter((status): status is EventStatus => status !== null);
  return mapped.length ? mapped : undefined;
}

function toTaskRequest(task: TaskDetail, status: TaskStatus): TaskRequest {
  return {
    title: task.title,
    description: task.description ?? undefined,
    status,
    priority: task.priority,
    assigneeUserId: task.assigneeUserId,
    dueDate: task.dueDate ?? undefined,
    dueAt: task.dueAt ?? undefined,
    caseId: task.caseId ?? undefined,
    clientId: task.clientId ?? undefined,
    deadlineId: task.deadlineId ?? undefined,
  };
}

function eventToCalendarItem(event: EventDetail): CalendarItem {
  return {
    calendarId: event.id,
    sourceType: "EVENT",
    sourceId: event.id,
    title: event.title,
    status: event.status,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    date: null,
    timeZone: event.timeZone,
    caseId: event.caseId,
    clientId: null,
    responsibleUserId: event.organizerUserId,
    assigneeUserIds: event.assigneeUserIds,
  };
}

@Component({
  selector: "law-work-view",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./work-view.component.html",
  styleUrl: "./work-view.component.scss",
  imports: [
    ReactiveFormsModule,
    BottomReachedDirective,
    HlmButton,
    HlmComboboxChip,
    HlmComboboxChipInput,
    HlmComboboxChips,
    HlmComboboxContent,
    HlmComboboxEmpty,
    HlmComboboxItem,
    HlmComboboxList,
    HlmComboboxMultiple,
    HlmComboboxPortal,
    HlmComboboxValues,
    HlmInput,
    HlmSelectImports,
    HlmSpinner,
    HlmTooltip,
    NgIcon,
    TranslatePipe,
  ],
  providers: [
    provideIcons({
      lucideKanban,
      lucideList,
    }),
  ],
})
export class WorkViewComponent {
  readonly mode = input<WorkViewMode>("team");
  readonly fixedUserId = input<string | undefined>(undefined);
  readonly fixedCaseId = input<string | undefined>(undefined);
  readonly syncQueryParams = input<boolean>(true);

  private readonly workApi = inject(WorkManagementApiClient);
  private readonly eventsApi = inject(EventsApiClient);
  private readonly usersApi = inject(ReferencesApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly taskDialog = inject(TaskDialogService);
  private readonly deadlineDialog = inject(DeadlineDialogService);
  private readonly eventDialog = inject(EventDialogService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly initialParams = this.route.snapshot.queryParamMap;

  readonly presentation = signal<Presentation>(
    (this.initialParams.get("presentation") as Presentation) || "board",
  );
  readonly recordTypes = signal<WorkSourceType[]>(this.initialRecordTypes());
  readonly peopleIds = signal<string[]>(this.initialParams.getAll("people"));
  readonly statusMode = signal<StatusMode>(
    (this.initialParams.get("statusMode") as StatusMode) || "open",
  );
  readonly statuses = signal<PresentationStatus[]>([]);
  readonly datePreset = signal<DatePreset>(
    (this.initialParams.get("datePreset") as DatePreset) || "all",
  );
  readonly caseFilter = signal<string>(this.initialParams.get("case") ?? "");
  readonly search = new FormControl(this.initialParams.get("search") ?? "", {
    nonNullable: true,
  });

  readonly users = signal<Array<{ id: string; name: string }>>([]);
  readonly cases = signal<CaseSummary[]>([]);

  readonly tasks = signal<TaskDetail[]>([]);
  readonly tasksPage = signal(0);
  readonly tasksHasMore = signal(false);
  readonly tasksLoading = signal(false);

  readonly deadlines = signal<DeadlineDetail[]>([]);
  readonly deadlinesPage = signal(0);
  readonly deadlinesHasMore = signal(false);
  readonly deadlinesLoading = signal(false);

  readonly events = signal<EventDetail[]>([]);
  readonly eventsPage = signal(0);
  readonly eventsHasMore = signal(false);
  readonly eventsLoading = signal(false);

  readonly recordTypeOptions: ReadonlyArray<{
    value: WorkSourceType;
    label: string;
  }> = [
    { value: "TASK", label: "work.recordType.task" },
    { value: "DEADLINE", label: "work.recordType.deadline" },
    { value: "EVENT", label: "work.recordType.event" },
  ];
  readonly statusOptions: ReadonlyArray<{
    value: PresentationStatus;
    label: string;
  }> = [
    { value: "TODO", label: "work.status.todo" },
    { value: "IN_PROGRESS", label: "work.status.inProgress" },
    { value: "DONE", label: "work.status.done" },
    { value: "CANCELLED", label: "work.status.cancelled" },
  ];
  readonly datePresetOptions: ReadonlyArray<{
    value: DatePreset;
    label: string;
  }> = [
    { value: "all", label: "work.datePreset.all" },
    { value: "overdue", label: "work.datePreset.overdue" },
    { value: "today", label: "work.datePreset.today" },
    { value: "upcoming", label: "work.datePreset.upcoming" },
  ];
  readonly statusModeOptions: ReadonlyArray<SelectOption<StatusMode>> = [
    { value: "open", label: "work.statusMode.open" },
    { value: "history", label: "work.statusMode.history" },
  ];

  readonly statusModeItemToString = createSelectItemToString(
    this.statusModeOptions,
    (key) => this.localization.translate(key),
  );

  readonly recordTypeItemToString = (
    value: WorkSourceType | null | undefined,
  ): string =>
    value
      ? this.localization.translate(
          this.recordTypeOptions.find((option) => option.value === value)
            ?.label ?? "",
        )
      : "";
  readonly statusItemToString = (
    value: PresentationStatus | null | undefined,
  ): string =>
    value
      ? this.localization.translate(
          this.statusOptions.find((option) => option.value === value)?.label ??
            "",
        )
      : "";
  readonly userItemToString = (value: string | null | undefined): string =>
    value
      ? (this.users().find((user) => user.id === value)?.name ?? value)
      : "";
  readonly datePresetItemToString = (
    value: DatePreset | null | undefined,
  ): string =>
    this.localization.translate(
      this.datePresetOptions.find((option) => option.value === value)?.label ??
        "",
    );
  readonly caseItemToString = (value: string | null | undefined): string => {
    if (!value) return this.localization.translate("work.filters.allCases");
    const item = this.cases().find((option) => option.id === value);
    return item ? `${item.caseNumber} — ${item.name}` : value;
  };

  readonly workItems = computed<WorkItem[]>(() => {
    const types = this.recordTypes();
    const items: WorkItem[] = [];
    if (types.includes("TASK")) items.push(...this.tasks().map(taskToWorkItem));
    if (types.includes("DEADLINE"))
      items.push(...this.deadlines().map(deadlineToWorkItem));
    if (types.includes("EVENT"))
      items.push(...this.events().map(eventToWorkItem));
    return sortWorkItems(items);
  });

  readonly loading = computed(
    () =>
      this.tasksLoading() || this.deadlinesLoading() || this.eventsLoading(),
  );

  readonly hasMore = computed(() => {
    const types = this.recordTypes();
    return (
      (types.includes("TASK") && this.tasksHasMore()) ||
      (types.includes("DEADLINE") && this.deadlinesHasMore()) ||
      (types.includes("EVENT") && this.eventsHasMore())
    );
  });

  readonly boardColumns = computed<BoardColumnKey[]>(() => {
    const columns: BoardColumnKey[] = ["TODO"];
    if (this.recordTypes().includes("TASK")) columns.push("IN_PROGRESS");
    columns.push("DONE");
    if (this.statusMode() === "history") columns.push("CANCELLED");
    return columns;
  });

  constructor() {
    this.usersApi
      .users()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((items) =>
        this.users.set(
          items.map((item) => ({
            id: item.userId,
            name:
              [item.user.firstName, item.user.lastName]
                .filter(Boolean)
                .join(" ") || item.user.email,
          })),
        ),
      );
    this.casesApi
      .list({ page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((response) => this.cases.set(response.items));

    this.search.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.syncQuery();
        this.reload();
      });

    effect(() => {
      this.fixedUserId();
      this.fixedCaseId();
      this.mode();
      untracked(() => this.reload());
    });
  }

  private initialRecordTypes(): WorkSourceType[] {
    const requested = this.initialParams
      .getAll("recordType")
      .filter((value): value is WorkSourceType =>
        (ALL_RECORD_TYPES as string[]).includes(value),
      );
    return requested.length ? requested : [...ALL_RECORD_TYPES];
  }

  private effectiveUserIds(): string[] | undefined {
    const fixed = this.fixedUserId()?.trim();
    if (fixed) return [fixed];
    if (this.mode() === "my") return undefined;
    return this.peopleIds().length ? this.peopleIds() : undefined;
  }

  private effectiveCaseId(): string | undefined {
    const fixed = this.fixedCaseId()?.trim();
    if (fixed) return fixed;
    if (this.mode() === "case") return undefined;
    return this.caseFilter()?.trim() || undefined;
  }

  private effectivePresentationStatuses(): PresentationStatus[] {
    if (this.statuses().length) return this.statuses();
    // The board always renders a DONE column, so "open" must fetch it too.
    return this.statusMode() === "open"
      ? ["TODO", "IN_PROGRESS", "DONE"]
      : ["DONE", "CANCELLED"];
  }

  private dateRange(): { from?: string; to?: string } {
    const now = new Date();
    switch (this.datePreset()) {
      case "overdue":
        return { to: now.toISOString() };
      case "today": {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now);
        end.setHours(23, 59, 59, 999);
        return { from: start.toISOString(), to: end.toISOString() };
      }
      case "upcoming":
        return { from: now.toISOString() };
      default:
        return {};
    }
  }

  private syncQuery(): void {
    if (!this.syncQueryParams()) return;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParamsHandling: "merge",
      queryParams: {
        presentation: this.presentation(),
        recordType:
          this.recordTypes().length === ALL_RECORD_TYPES.length
            ? null
            : this.recordTypes(),
        people:
          this.fixedUserId() || this.mode() === "my"
            ? null
            : this.peopleIds().length
              ? this.peopleIds()
              : null,
        statusMode: this.statusMode(),
        datePreset: this.datePreset(),
        case:
          this.fixedCaseId() || this.mode() === "case"
            ? null
            : this.caseFilter() || null,
        search: this.search.value || null,
      },
    });
  }

  setPresentation(value: Presentation): void {
    this.presentation.set(value);
    this.syncQuery();
  }

  setRecordTypes(values: WorkSourceType[]): void {
    this.recordTypes.set(values.length ? values : [...ALL_RECORD_TYPES]);
    this.syncQuery();
    this.reload();
  }

  setPeopleIds(values: string[]): void {
    if (this.fixedUserId() || this.mode() === "my") return;
    this.peopleIds.set(values);
    this.syncQuery();
    this.reload();
  }

  setStatuses(values: PresentationStatus[]): void {
    this.statuses.set(values);
    this.syncQuery();
    this.reload();
  }

  setStatusMode(value: StatusMode): void {
    this.statusMode.set(value);
    this.syncQuery();
    this.reload();
  }

  setDatePreset(value: DatePreset): void {
    this.datePreset.set(value);
    this.syncQuery();
    this.reload();
  }

  setCaseFilter(value: string): void {
    if (this.fixedCaseId() || this.mode() === "case") return;
    this.caseFilter.set(value);
    this.syncQuery();
    this.reload();
  }

  reload(): void {
    if (this.mode() === "my" && !this.effectiveUserIds()?.length) {
      this.tasks.set([]);
      this.deadlines.set([]);
      this.events.set([]);
      return;
    }
    if (this.mode() === "case" && !this.effectiveCaseId()) {
      this.tasks.set([]);
      this.deadlines.set([]);
      this.events.set([]);
      return;
    }

    const types = this.recordTypes();
    if (types.includes("TASK")) this.loadTasks(true);
    else {
      this.tasks.set([]);
      this.tasksHasMore.set(false);
    }
    if (types.includes("DEADLINE")) this.loadDeadlines(true);
    else {
      this.deadlines.set([]);
      this.deadlinesHasMore.set(false);
    }
    if (types.includes("EVENT")) this.loadEvents(true);
    else {
      this.events.set([]);
      this.eventsHasMore.set(false);
    }
  }

  loadMore(): void {
    if (this.recordTypes().includes("TASK") && this.tasksHasMore())
      this.loadTasks(false);
    if (this.recordTypes().includes("DEADLINE") && this.deadlinesHasMore())
      this.loadDeadlines(false);
    if (this.recordTypes().includes("EVENT") && this.eventsHasMore())
      this.loadEvents(false);
  }

  private loadTasks(reset: boolean): void {
    const page = reset ? 1 : this.tasksPage() + 1;
    const range = this.dateRange();
    const query: TaskListQuery = {
      page,
      pageSize: PAGE_SIZE,
      search: this.search.value || undefined,
      assigneeUserIds: this.effectiveUserIds(),
      caseId: this.effectiveCaseId(),
      statuses: taskStatusesFor(this.effectivePresentationStatuses()),
      from: range.from,
      to: range.to,
    };
    this.tasksLoading.set(true);
    this.workApi
      .listTasks(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.tasks.set(
            reset ? response.items : mergePage(this.tasks(), response.items),
          );
          this.tasksPage.set(page);
          this.tasksHasMore.set(page < response.meta.totalPages);
          this.tasksLoading.set(false);
        },
        error: () => this.tasksLoading.set(false),
      });
  }

  private loadDeadlines(reset: boolean): void {
    const page = reset ? 1 : this.deadlinesPage() + 1;
    const range = this.dateRange();
    const query: DeadlineListQuery = {
      page,
      pageSize: PAGE_SIZE,
      search: this.search.value || undefined,
      responsibleUserIds: this.effectiveUserIds(),
      caseId: this.effectiveCaseId(),
      statuses: deadlineStatusesFor(this.effectivePresentationStatuses()),
      from: range.from,
      to: range.to,
    };
    this.deadlinesLoading.set(true);
    this.workApi
      .listDeadlines(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.deadlines.set(
            reset
              ? response.items
              : mergePage(this.deadlines(), response.items),
          );
          this.deadlinesPage.set(page);
          this.deadlinesHasMore.set(page < response.meta.totalPages);
          this.deadlinesLoading.set(false);
        },
        error: () => this.deadlinesLoading.set(false),
      });
  }

  private loadEvents(reset: boolean): void {
    const page = reset ? 1 : this.eventsPage() + 1;
    const range = this.dateRange();
    const query: EventListQuery = {
      page,
      pageSize: PAGE_SIZE,
      search: this.search.value || undefined,
      userIds: this.effectiveUserIds(),
      caseId: this.effectiveCaseId(),
      statuses: eventStatusesFor(this.effectivePresentationStatuses()),
      from: range.from,
      to: range.to,
    };
    this.eventsLoading.set(true);
    this.eventsApi
      .list(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.events.set(
            reset ? response.items : mergePage(this.events(), response.items),
          );
          this.eventsPage.set(page);
          this.eventsHasMore.set(page < response.meta.totalPages);
          this.eventsLoading.set(false);
        },
        error: () => this.eventsLoading.set(false),
      });
  }

  itemsForColumn(column: BoardColumnKey): WorkItem[] {
    return this.workItems().filter(
      (item) => item.presentationStatus === column,
    );
  }

  formatDue(item: WorkItem): string {
    return dueLabel(
      item.dueDate,
      item.dueAt,
      this.localization.translate("work.noDueDate"),
      this.localization.language() === "EN" ? "en-US" : "sr-RS",
    );
  }

  openItem(item?: WorkItem): void {
    if (!item) return;
    if (item.sourceType === "TASK") this.openTask(item.raw as TaskDetail);
    else if (item.sourceType === "DEADLINE")
      this.openDeadline(item.raw as DeadlineDetail);
    else this.openEvent(item.raw as EventDetail);
  }

  openTask(task?: TaskDetail): void {
    this.taskDialog
      .open({
        task,
        caseId: task?.caseId ?? this.effectiveCaseId(),
        clientId: task?.clientId ?? undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) this.reload();
      });
  }

  openDeadline(deadline?: DeadlineDetail): void {
    this.deadlineDialog
      .open({
        deadline,
        caseId: deadline?.caseId ?? this.effectiveCaseId(),
        clientId: deadline?.clientId ?? undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) this.reload();
      });
  }

  openEvent(event?: EventDetail): void {
    this.eventDialog
      .open({ item: event ? eventToCalendarItem(event) : undefined })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) this.reload();
      });
  }

  canCancel(item: WorkItem): boolean {
    return (
      item.presentationStatus !== "CANCELLED" &&
      item.presentationStatus !== "DONE"
    );
  }

  canComplete(item: WorkItem): boolean {
    return (
      item.presentationStatus === "TODO" ||
      item.presentationStatus === "IN_PROGRESS"
    );
  }

  canReopen(item: WorkItem): boolean {
    return (
      item.sourceType !== "EVENT" &&
      (item.presentationStatus === "DONE" ||
        item.presentationStatus === "CANCELLED")
    );
  }

  complete(item: WorkItem): void {
    if (item.sourceType === "TASK") this.runTransition(item, "task-complete");
    else if (item.sourceType === "DEADLINE")
      this.runTransition(item, "deadline-satisfy");
    else this.runTransition(item, "event-complete");
  }

  reopen(item: WorkItem): void {
    if (item.sourceType === "TASK") this.runTransition(item, "task-reopen");
    else if (item.sourceType === "DEADLINE")
      this.runTransition(item, "deadline-reopen");
  }

  cancel(item: WorkItem): void {
    this.confirm
      .confirm({
        title: this.localization.translate("work.confirmCancel"),
        message: this.localization.translate("work.confirmCancelMessage"),
        variant: "danger",
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (!confirmed) return;
        const call: Observable<unknown> =
          item.sourceType === "TASK"
            ? this.workApi.cancelTask(item.id)
            : item.sourceType === "DEADLINE"
              ? this.workApi.cancelDeadline(item.id)
              : this.eventsApi.cancel(item.id);
        call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: () => this.reload(),
          error: () =>
            this.toast.error(this.localization.translate("work.saveError")),
        });
      });
  }

  statusTargetsFor(item: WorkItem): BoardColumnKey[] {
    const candidates: BoardColumnKey[] = ["TODO", "IN_PROGRESS", "DONE"];
    return candidates.filter(
      (target) =>
        target === item.presentationStatus ||
        statusTransition(item, target) !== null,
    );
  }

  onStatusSelect(item: WorkItem, value: string): void {
    const target = value as BoardColumnKey;
    if (target === item.presentationStatus) return;
    const transition = statusTransition(item, target);
    if (!transition) {
      this.toast.error(this.localization.translate("work.invalidTransition"));
      return;
    }
    this.runTransition(item, transition.action);
  }

  private runTransition(item: WorkItem, action: StatusTransitionAction): void {
    const call = this.transitionCall(item, action);
    if (!call) return;
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.reload(),
      error: () =>
        this.toast.error(this.localization.translate("work.saveError")),
    });
  }

  private transitionCall(
    item: WorkItem,
    action: StatusTransitionAction,
  ): Observable<unknown> | undefined {
    switch (action) {
      case "task-set-todo":
        return this.workApi.updateTask(
          item.id,
          toTaskRequest(item.raw as TaskDetail, "TODO"),
        );
      case "task-set-in-progress":
        return this.workApi.updateTask(
          item.id,
          toTaskRequest(item.raw as TaskDetail, "IN_PROGRESS"),
        );
      case "task-complete":
        return this.workApi.completeTask(item.id);
      case "task-reopen":
        return this.workApi.reopenTask(item.id);
      case "deadline-satisfy":
        return this.workApi.satisfyDeadline(item.id);
      case "deadline-reopen":
        return this.workApi.reopenDeadline(item.id);
      case "event-complete":
        return this.eventsApi.complete(item.id);
      default:
        return undefined;
    }
  }
}
