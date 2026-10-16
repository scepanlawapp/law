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
  CalendarSourceType,
  CaseSummary,
  TaskDetail,
  TaskStatus,
  TaskListQuery,
} from "@law/api-interfaces";
import {
  CasesApiClient,
  ReferencesApiClient,
  TaskRequest,
  WorkManagementApiClient,
} from "@law/api-clients";
import { AuthState } from "@law/security";
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
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { UserAvatarComponent } from "../../../shared/components/user-avatar/user-avatar.component";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideArchive,
  lucideKanban,
  lucideTable2,
  lucidePlus,
} from "@ng-icons/lucide";
import { Observable, debounceTime, distinctUntilChanged, finalize } from "rxjs";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { ComboboxSelectAllComponent } from "../../../shared/ui/combobox-select-all/combobox-select-all.component";
import { LocalizationService } from "../../../core/localization/localization.service";
import { ConfirmDialogService } from "../../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../../shared/ui/toast/toast.service";
import {
  STATUS_BADGE_BASE_CLASSES,
  priorityBadgeClass,
  statusBadgeClass,
} from "../../../shared/status-badge";
import { TaskCompletionService } from "../task-completion.service";
import { TaskDialogComponent } from "../task-dialog/task-dialog.component";
import { TaskDialogContext } from "../task-dialog/task-dialog.models";
import { TaskDialogService } from "../task-dialog/task-dialog.service";
import { DialogPanelComponent } from "../../../shared/ui/dialog-panel/dialog-panel.component";
import { PaginationComponent } from "../../../shared/ui/pagination/pagination.component";
import {
  FIRST_PAGE,
  PageState,
} from "../../../shared/pagination/paginated-list";
import {
  TABLE_ONLY_WORK_VIEW_STATUSES,
  TASK_PRIORITY_LABELS,
  WORK_BOARD_COLUMNS,
  WORK_BOARD_COLUMN_LABELS,
  WORK_VIEW_STATUS_LABELS,
  WorkBoardColumn,
  createSelectItemToString,
  optionsFrom,
} from "../../../shared/models";
import { dueLabel } from "../work-management-utils";
import {
  StatusTransitionAction,
  WorkItem,
  WorkPresentation,
  WorkViewMode,
  mergePage,
  sortWorkItems,
  statusTransition,
  taskToWorkItem,
} from "./work-view.models";
import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  CdkDropListGroup,
} from "@angular/cdk/drag-drop";

type ColumnPage = {
  page: number;
  hasMore: boolean;
  loading: boolean;
  error: boolean;
};
type EditPanelState = {
  component: typeof TaskDialogComponent;
  context: TaskDialogContext;
};

const LEGACY_TABLE_PRESENTATION = "list";

function workViewModeFromRoute(value: string | null): WorkViewMode {
  return value === WorkViewMode.MY || value === WorkViewMode.CASE
    ? value
    : WorkViewMode.TEAM;
}

function presentationFromQuery(value: string | null): WorkPresentation {
  return value === WorkPresentation.TABLE || value === LEGACY_TABLE_PRESENTATION
    ? WorkPresentation.TABLE
    : WorkPresentation.BOARD;
}

function taskStatusesFor(statuses: TaskStatus[]): TaskStatus[] | undefined {
  return statuses.length ? statuses : undefined;
}

function toTaskRequest(task: TaskDetail, status: TaskStatus): TaskRequest {
  return {
    title: task.title,
    description: task.description ?? undefined,
    status,
    priority: task.priority,
    assigneeUserId: task.assigneeUser.id,
    dueDate: task.dueDate ?? undefined,
    dueAt: task.dueAt ?? undefined,
    caseId: task.case?.id ?? undefined,
    clientId: task.client?.id ?? undefined,
    deadlineId: task.deadlineId ?? undefined,
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
    HlmTooltip,
    HlmTableImports,
    UserAvatarComponent,
    NgIcon,
    TranslatePipe,
    ComboboxSelectAllComponent,
    DialogPanelComponent,
    PaginationComponent,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
  ],
  providers: [
    provideIcons({
      lucideArchive,
      lucideKanban,
      lucideTable2,
      lucidePlus,
    }),
  ],
})
export class WorkViewComponent {
  private readonly taskCompletion = inject(TaskCompletionService);
  readonly TaskStatus = TaskStatus;
  readonly WorkViewMode = WorkViewMode;
  readonly WorkPresentation = WorkPresentation;
  readonly boardColumnLabels = WORK_BOARD_COLUMN_LABELS;
  readonly priorityLabels = TASK_PRIORITY_LABELS;
  readonly statusBadgeBaseClasses = STATUS_BADGE_BASE_CLASSES;
  readonly priorityBadgeClass = priorityBadgeClass;
  readonly statusBadgeClass = statusBadgeClass;
  readonly mode = input<WorkViewMode>();
  readonly fixedUserId = input<string | undefined>(undefined);
  readonly fixedCaseId = input<string | undefined>(undefined);
  readonly syncQueryParams = input<boolean>(true);

  private readonly workApi = inject(WorkManagementApiClient);
  private readonly auth = inject(AuthState);
  private readonly usersApi = inject(ReferencesApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly taskDialog = inject(TaskDialogService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly initialParams = this.route.snapshot.queryParamMap;
  private readonly routeMode = signal<WorkViewMode>(
    workViewModeFromRoute(this.route.snapshot.paramMap.get("mode")),
  );
  readonly viewMode = computed<WorkViewMode>(() => {
    return this.mode() ?? this.routeMode();
  });

  readonly editPanel = signal<EditPanelState | null>(null);

  readonly presentation = signal<WorkPresentation>(
    presentationFromQuery(this.initialParams.get("presentation")),
  );
  readonly isTable = computed(
    () => this.presentation() === WorkPresentation.TABLE,
  );
  readonly peopleIds = signal<string[]>(this.initialParams.getAll("people"));
  readonly statuses = signal<TaskStatus[]>([...WORK_BOARD_COLUMNS]);
  readonly archivingTaskIds = signal<ReadonlySet<string>>(new Set());
  readonly savingTaskIds = signal<ReadonlySet<string>>(new Set());
  readonly caseFilter = signal<string>(this.initialParams.get("case") ?? "");
  readonly search = new FormControl(this.initialParams.get("search") ?? "", {
    nonNullable: true,
  });

  readonly users = signal<Array<{ id: string; name: string }>>([]);
  readonly cases = signal<CaseSummary[]>([]);

  readonly tasks = signal<TaskDetail[]>([]);
  readonly tasksLoading = signal(false);
  readonly taskPages = new PageState({
    loading: this.tasksLoading,
    onChange: ({ page }) => this.loadTasks(page),
  });
  readonly tasksError = signal(false);
  readonly columnPages = signal<Partial<Record<WorkBoardColumn, ColumnPage>>>(
    {},
  );
  private requestGeneration = 0;
  readonly statusOptions = optionsFrom(WORK_VIEW_STATUS_LABELS);
  readonly statusItemToString = createSelectItemToString(
    this.statusOptions,
    (key) => this.localization.translate(key),
  );
  readonly selectedStatusesLabel = computed(() =>
    this.statuses().map(this.statusItemToString).join(", "),
  );
  readonly userItemToString = (value: string | null | undefined): string =>
    value
      ? (this.users().find((user) => user.id === value)?.name ?? value)
      : "";
  readonly selectedPeopleLabel = computed(() =>
    this.peopleIds().map(this.userItemToString).join(", "),
  );
  readonly caseItemToString = (value: string | null | undefined): string => {
    if (!value) return this.localization.translate("work.filters.allCases");
    const item = this.cases().find((option) => option.id === value);
    return item ? `${item.caseNumber} — ${item.name}` : value;
  };

  readonly workItems = computed<WorkItem[]>(() => {
    return sortWorkItems(this.tasks().map(taskToWorkItem));
  });

  readonly loading = computed(() =>
    this.isTable()
      ? this.tasksLoading()
      : Object.values(this.columnPages()).some((column) => column.loading),
  );

  readonly boardColumns = computed<WorkBoardColumn[]>(() =>
    WORK_BOARD_COLUMNS.filter(
      (status) => !this.statuses().length || this.statuses().includes(status),
    ),
  );
  readonly hasTableOnlyStatuses = computed(() =>
    this.statuses().some((status) =>
      TABLE_ONLY_WORK_VIEW_STATUSES.includes(status),
    ),
  );
  readonly draggingItem = signal<WorkItem | null>(null);
  readonly hoveredColumn = signal<WorkBoardColumn | null>(null);

  constructor() {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) =>
        this.routeMode.set(workViewModeFromRoute(params.get("mode"))),
      );

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
      .list(FIRST_PAGE)
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
      this.viewMode();
      untracked(() => this.reload());
    });
  }

  private effectiveUserIds(): string[] | undefined {
    const fixed = this.fixedUserId()?.trim();
    if (fixed) return [fixed];
    if (this.viewMode() === WorkViewMode.MY) {
      const userId = this.auth.session()?.user.id;
      return userId ? [userId] : undefined;
    }
    return this.peopleIds().length ? this.peopleIds() : undefined;
  }

  private effectiveCaseId(): string | undefined {
    const fixed = this.fixedCaseId()?.trim();
    if (fixed) return fixed;
    if (this.viewMode() === WorkViewMode.CASE) return undefined;
    return this.caseFilter()?.trim() || undefined;
  }

  private syncQuery(): void {
    if (!this.syncQueryParams()) return;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParamsHandling: "merge",
      queryParams: {
        presentation: this.presentation(),
        people:
          this.fixedUserId() || this.viewMode() === WorkViewMode.MY
            ? null
            : this.peopleIds().length
              ? this.peopleIds()
              : null,
        statusMode: null,
        datePreset: null,
        case:
          this.fixedCaseId() || this.viewMode() === WorkViewMode.CASE
            ? null
            : this.caseFilter() || null,
        search: this.search.value || null,
      },
    });
  }

  setPresentation(value: WorkPresentation): void {
    if (this.presentation() === value) return;
    this.presentation.set(value);
    this.syncQuery();
    this.reload();
  }

  setPeopleIds(values: string[]): void {
    if (this.fixedUserId() || this.viewMode() === WorkViewMode.MY) return;
    this.peopleIds.set(values);
    this.syncQuery();
    this.reload();
  }

  setStatuses(values: TaskStatus[]): void {
    this.statuses.set(values);
    this.syncQuery();
    this.reload();
  }

  setCaseFilter(value: string): void {
    if (this.fixedCaseId() || this.viewMode() === WorkViewMode.CASE) return;
    this.caseFilter.set(value);
    this.syncQuery();
    this.reload();
  }

  reload(): void {
    this.requestGeneration++;
    this.tasks.set([]);
    this.taskPages.clear();
    this.tasksLoading.set(false);
    this.tasksError.set(false);
    this.columnPages.set({});
    if (
      this.viewMode() === WorkViewMode.MY &&
      !this.effectiveUserIds()?.length
    ) {
      this.tasks.set([]);
      return;
    }
    if (this.viewMode() === WorkViewMode.CASE && !this.effectiveCaseId()) {
      this.tasks.set([]);
      return;
    }

    if (this.presentation() === WorkPresentation.BOARD) {
      for (const column of this.boardColumns()) this.loadColumn(column, true);
    } else {
      this.loadTasks(1);
    }
  }

  retryTasks(): void {
    if (!this.tasksLoading()) this.loadTasks(this.taskPages.page());
  }

  loadMoreColumn(column: WorkBoardColumn): void {
    const state = this.columnPages()[column];
    if (state?.loading) return;
    if (state?.hasMore || state?.error) this.loadColumn(column, !state.page);
  }

  private loadColumn(column: WorkBoardColumn, reset: boolean): void {
    const generation = this.requestGeneration;
    const previous = this.columnPages()[column];
    const page = reset ? 1 : (previous?.page ?? 0) + 1;
    this.columnPages.update((columns) => ({
      ...columns,
      [column]: {
        page: previous?.page ?? 0,
        hasMore: previous?.hasMore ?? false,
        loading: true,
        error: false,
      },
    }));
    this.workApi
      .listTasks({ ...this.taskQuery(page), statuses: [column] })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (generation !== this.requestGeneration) return;
          this.tasks.update((tasks) => mergePage(tasks, response.items));
          this.columnPages.update((columns) => ({
            ...columns,
            [column]: {
              page,
              hasMore: page < response.meta.totalPages,
              loading: false,
              error: false,
            },
          }));
        },
        error: () => {
          if (generation !== this.requestGeneration) return;
          this.columnPages.update((columns) => ({
            ...columns,
            [column]: {
              page: previous?.page ?? 0,
              hasMore: previous?.hasMore ?? false,
              loading: false,
              error: true,
            },
          }));
        },
      });
  }

  private taskQuery(page: number): TaskListQuery {
    return {
      ...FIRST_PAGE,
      page,
      search: this.search.value || undefined,
      assigneeUserIds: this.effectiveUserIds(),
      caseId: this.effectiveCaseId(),
      statuses: taskStatusesFor(this.statuses()),
    };
  }

  private loadTasks(page: number): void {
    const generation = ++this.requestGeneration;
    const query = {
      ...this.taskQuery(page),
      pageSize: this.taskPages.pageSize(),
    };
    this.taskPages.page.set(page);
    this.tasks.set([]);
    this.tasksLoading.set(true);
    this.tasksError.set(false);
    this.workApi
      .listTasks(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (generation !== this.requestGeneration) return;
          const lastPage = this.taskPages.applyPage(page, response.meta);
          if (lastPage !== null) {
            this.loadTasks(lastPage);
            return;
          }
          this.tasks.set(response.items);
          this.tasksLoading.set(false);
        },
        error: () => {
          if (generation !== this.requestGeneration) return;
          this.tasksLoading.set(false);
          this.tasksError.set(true);
        },
      });
  }

  itemsForColumn(column: WorkBoardColumn): WorkItem[] {
    return this.workItems().filter(
      (item) => item.presentationStatus === column,
    );
  }

  taskFor(item: WorkItem): TaskDetail {
    return item.raw as TaskDetail;
  }

  formatDue(item: WorkItem): string {
    return dueLabel(
      item.dueDate,
      item.dueAt,
      this.localization.translate("work.noDueDate"),
      this.localization.locale(),
    );
  }

  openItem(item?: WorkItem): void {
    if (!item) return;
    this.openTask(item.raw as TaskDetail);
  }

  onItemClick(event: MouseEvent, item: WorkItem): void {
    const target = event.target;
    if (
      event.defaultPrevented ||
      this.draggingItem() ||
      (target instanceof Element &&
        target.closest("button, a, input, select, textarea, label, hlm-select"))
    )
      return;
    this.openItem(item);
  }

  createTask(): void {
    this.taskDialog
      .open({ caseId: this.effectiveCaseId() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) this.reload();
      });
  }

  openTask(task?: TaskDetail): void {
    const context: TaskDialogContext = {
      task,
      caseId: task?.case?.id ?? this.effectiveCaseId(),
      clientId: task?.client?.id ?? undefined,
    };
    this.editPanel.set({ component: TaskDialogComponent, context });
  }

  closeEditPanel(): void {
    this.editPanel.set(null);
  }

  onEditPanelClosed(result: unknown): void {
    this.editPanel.set(null);
    if (result) this.reload();
  }

  canCancel(item: WorkItem): boolean {
    return (
      item.presentationStatus !== TaskStatus.ARCHIVED &&
      item.presentationStatus !== TaskStatus.CANCELLED &&
      item.presentationStatus !== TaskStatus.DONE
    );
  }

  canComplete(item: WorkItem): boolean {
    return (
      item.presentationStatus === TaskStatus.TODO ||
      item.presentationStatus === TaskStatus.IN_PROGRESS
    );
  }

  canReopen(item: WorkItem): boolean {
    return (
      item.presentationStatus === TaskStatus.DONE ||
      item.presentationStatus === TaskStatus.CANCELLED
    );
  }

  openQuickCapture(item: WorkItem): void {
    this.taskCompletion
      .openQuickCapture(item.raw as TaskDetail)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  archive(item: WorkItem): void {
    if (
      item.sourceType !== CalendarSourceType.TASK ||
      item.rawStatus === TaskStatus.ARCHIVED ||
      this.archivingTaskIds().has(item.id)
    )
      return;
    this.archivingTaskIds.update((ids) => new Set([...ids, item.id]));
    this.workApi
      .updateTask(
        item.id,
        toTaskRequest(item.raw as TaskDetail, TaskStatus.ARCHIVED),
      )
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() =>
          this.archivingTaskIds.update((ids) => {
            const remaining = new Set(ids);
            remaining.delete(item.id);
            return remaining;
          }),
        ),
      )
      .subscribe({
        next: () => this.updateTaskStatusLocally(item.id, TaskStatus.ARCHIVED),
        error: () =>
          this.toast.error(this.localization.translate("work.saveError")),
      });
  }

  complete(item: WorkItem): void {
    this.runTransition(
      item,
      StatusTransitionAction.TASK_COMPLETE,
      TaskStatus.DONE,
    );
  }

  reopen(item: WorkItem): void {
    this.runTransition(
      item,
      StatusTransitionAction.TASK_REOPEN,
      TaskStatus.TODO,
    );
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
        this.workApi
          .cancelTask(item.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => this.reload(),
            error: () =>
              this.toast.error(this.localization.translate("work.saveError")),
          });
      });
  }

  statusTargetsFor(): TaskStatus[] {
    return this.statusOptions.map((option) => option.value);
  }

  private readonly statusControls = new Map<string, FormControl<TaskStatus>>();

  statusControlFor(item: WorkItem): FormControl<TaskStatus> {
    let control = this.statusControls.get(item.id);
    if (!control) {
      control = new FormControl(item.presentationStatus, { nonNullable: true });
      control.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((value) => {
          const current = this.workItems().find(
            (candidate) => candidate.id === item.id,
          );
          if (current) this.onStatusSelect(current, value);
        });
      this.statusControls.set(item.id, control);
    }
    // The stored status remains authoritative until capture and save succeed.
    if (control.value !== item.presentationStatus) {
      control.setValue(item.presentationStatus, { emitEvent: false });
    }
    const pending =
      this.savingTaskIds().has(item.id) || this.archivingTaskIds().has(item.id);
    if (pending && control.enabled) control.disable({ emitEvent: false });
    if (!pending && control.disabled) control.enable({ emitEvent: false });
    return control;
  }

  onStatusSelect(item: WorkItem, value: string): void {
    if (
      this.savingTaskIds().has(item.id) ||
      this.archivingTaskIds().has(item.id)
    )
      return;
    const target = value as TaskStatus;

    if (target === item.presentationStatus) {
      return;
    }

    if (target === TaskStatus.ARCHIVED) {
      this.archive(item);
      return;
    }
    if (target === TaskStatus.CANCELLED) {
      this.cancel(item);
      return;
    }
    if (target === TaskStatus.DONE) {
      this.runTransition(item, StatusTransitionAction.TASK_COMPLETE, target);
      return;
    }
    if (target === TaskStatus.TODO || target === TaskStatus.IN_PROGRESS) {
      this.savingTaskIds.update((ids) => new Set([...ids, item.id]));
      this.workApi
        .updateTask(item.id, toTaskRequest(item.raw as TaskDetail, target))
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          finalize(() => this.clearSaving(item.id)),
        )
        .subscribe({
          next: () => this.updateTaskStatusLocally(item.id, target),
          error: () =>
            this.toast.error(this.localization.translate("work.saveError")),
        });
      return;
    }

    const transition = statusTransition(item, target);

    if (!transition) {
      this.toast.error(this.localization.translate("work.invalidTransition"));
      return;
    }

    this.runTransition(item, transition.action, target);
  }

  private runTransition(
    item: WorkItem,
    action: StatusTransitionAction,
    target: TaskStatus,
  ): void {
    const call = this.transitionCall(item, action);

    if (!call) return;

    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        if (!result) return;
        this.updateTaskStatusLocally(item.id, target);
      },
      error: () => {
        this.toast.error(this.localization.translate("work.saveError"));
      },
    });
  }

  private transitionCall(
    item: WorkItem,
    action: StatusTransitionAction,
  ): Observable<unknown> | undefined {
    switch (action) {
      case StatusTransitionAction.TASK_SET_TODO:
        return this.workApi.updateTask(
          item.id,
          toTaskRequest(item.raw as TaskDetail, TaskStatus.TODO),
        );
      case StatusTransitionAction.TASK_SET_IN_PROGRESS:
        return this.workApi.updateTask(
          item.id,
          toTaskRequest(item.raw as TaskDetail, TaskStatus.IN_PROGRESS),
        );
      case StatusTransitionAction.TASK_COMPLETE:
        return this.taskCompletion.complete(
          toTaskRequest(item.raw as TaskDetail, TaskStatus.DONE),
          item.id,
        );
      case StatusTransitionAction.TASK_REOPEN:
        return this.workApi.reopenTask(item.id);
      default:
        return undefined;
    }
  }

  readonly canEnterColumn = (
    drag: CdkDrag<WorkItem>,
    drop: CdkDropList<WorkBoardColumn>,
  ): boolean => {
    const item = drag.data;
    const target = drop.data;

    if (target === item.presentationStatus) {
      return true;
    }

    return statusTransition(item, target) !== null;
  };

  onDragStarted(item: WorkItem): void {
    this.draggingItem.set(item);
  }

  onDragEnded(): void {
    this.draggingItem.set(null);
    this.hoveredColumn.set(null);
  }

  onColumnEntered(column: WorkBoardColumn): void {
    const item = this.draggingItem();

    if (!item || column === item.presentationStatus) {
      return;
    }

    this.hoveredColumn.set(column);
  }

  onColumnExited(column: WorkBoardColumn): void {
    if (this.hoveredColumn() === column) {
      this.hoveredColumn.set(null);
    }
  }

  onBoardDrop(
    event: CdkDragDrop<WorkBoardColumn, WorkBoardColumn, WorkItem>,
  ): void {
    const item = event.item.data;
    const target = event.container.data;

    this.draggingItem.set(null);
    this.hoveredColumn.set(null);

    if (target === item.presentationStatus) {
      return;
    }

    const transition = statusTransition(item, target);

    if (!transition) {
      this.toast.error(this.localization.translate("work.invalidTransition"));
      return;
    }

    this.runTransition(item, transition.action, target);
  }

  private updateTaskStatusLocally(taskId: string, status: TaskStatus): void {
    this.tasks.update((tasks) =>
      tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status,
            }
          : task,
      ),
    );
    if (
      this.taskPages.totalItems() > 0 ||
      this.tasksLoading() ||
      Object.values(this.columnPages()).some(
        (column) => column.page > 0 || column.loading,
      )
    ) {
      this.reload();
    }
  }

  private clearSaving(taskId: string): void {
    this.savingTaskIds.update((ids) => {
      const remaining = new Set(ids);
      remaining.delete(taskId);
      return remaining;
    });
  }
}
