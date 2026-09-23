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
import { CaseSummary, TaskDetail, TaskStatus } from "@law/api-interfaces";
import {
  CasesApiClient,
  ReferencesApiClient,
  TaskListQuery,
  TaskRequest,
  WorkManagementApiClient,
} from "@law/api-clients";
import { AuthState } from "@law/security";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmComboboxContent,
  HlmComboboxEmpty,
  HlmComboboxItem,
  HlmComboboxList,
  HlmComboboxMultiple,
  HlmComboboxPortal,
  HlmComboboxTrigger,
} from "@spartan-ng/helm/combobox";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideKanban, lucideList, lucidePlus } from "@ng-icons/lucide";
import { Observable, debounceTime, distinctUntilChanged } from "rxjs";
import { BottomReachedDirective } from "../../../core/directives/bottom-reached.directive";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { LocalizationService } from "../../../core/localization/localization.service";
import { ConfirmDialogService } from "../../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../../shared/ui/toast/toast.service";
import { TaskDialogComponent } from "../task-dialog/task-dialog.component";
import { TaskDialogContext } from "../task-dialog/task-dialog.models";
import { TaskDialogService } from "../task-dialog/task-dialog.service";
import { DialogPanelComponent } from "../../../shared/ui/dialog-panel/dialog-panel.component";
import { dueLabel } from "../work-management-utils";
import {
  BoardColumnKey,
  PresentationStatus,
  StatusTransitionAction,
  WorkItem,
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

export type WorkViewMode = "team" | "my" | "case";
type Presentation = "list" | "board";
type EditPanelState = {
  component: typeof TaskDialogComponent;
  context: TaskDialogContext;
};

const PAGE_SIZE = 20;

function workViewModeFromRoute(value: string | null): WorkViewMode {
  return value === "my" || value === "case" ? value : "team";
}

function taskStatusesFor(
  presentations: PresentationStatus[],
): TaskStatus[] | undefined {
  if (!presentations.length) return undefined;
  return presentations.filter((status): status is TaskStatus =>
    (["TODO", "IN_PROGRESS", "DONE", "CANCELLED"] as string[]).includes(status),
  );
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
    BottomReachedDirective,
    HlmButton,
    HlmComboboxContent,
    HlmComboboxEmpty,
    HlmComboboxItem,
    HlmComboboxList,
    HlmComboboxMultiple,
    HlmComboboxPortal,
    HlmComboboxTrigger,
    HlmInput,
    HlmSelectImports,
    HlmSpinner,
    HlmTooltip,
    NgIcon,
    TranslatePipe,
    DialogPanelComponent,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
  ],
  providers: [
    provideIcons({
      lucideKanban,
      lucideList,
      lucidePlus,
    }),
  ],
})
export class WorkViewComponent {
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

  readonly presentation = signal<Presentation>(
    (this.initialParams.get("presentation") as Presentation) || "board",
  );
  readonly peopleIds = signal<string[]>(this.initialParams.getAll("people"));
  readonly statuses = signal<PresentationStatus[]>([]);
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
  readonly statusOptions: ReadonlyArray<{
    value: PresentationStatus;
    label: string;
  }> = [
    { value: "TODO", label: "work.status.todo" },
    { value: "IN_PROGRESS", label: "work.status.inProgress" },
    { value: "DONE", label: "work.status.done" },
    { value: "CANCELLED", label: "work.status.cancelled" },
  ];
  readonly statusItemToString = (
    value: PresentationStatus | null | undefined,
  ): string =>
    value
      ? this.localization.translate(
          this.statusOptions.find((option) => option.value === value)?.label ??
            "",
        )
      : "";
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

  readonly loading = computed(() => this.tasksLoading());

  readonly hasMore = computed(() => this.tasksHasMore());

  readonly boardColumns = computed<BoardColumnKey[]>(() => {
    return ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"];
  });
  readonly draggingItem = signal<WorkItem | null>(null);
  readonly hoveredColumn = signal<BoardColumnKey | null>(null);

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
      this.viewMode();
      untracked(() => this.reload());
    });
  }

  private effectiveUserIds(): string[] | undefined {
    const fixed = this.fixedUserId()?.trim();
    if (fixed) return [fixed];
    if (this.viewMode() === "my") {
      const userId = this.auth.session()?.user.id;
      return userId ? [userId] : undefined;
    }
    return this.peopleIds().length ? this.peopleIds() : undefined;
  }

  private effectiveCaseId(): string | undefined {
    const fixed = this.fixedCaseId()?.trim();
    if (fixed) return fixed;
    if (this.viewMode() === "case") return undefined;
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
          this.fixedUserId() || this.viewMode() === "my"
            ? null
            : this.peopleIds().length
              ? this.peopleIds()
              : null,
        statusMode: null,
        datePreset: null,
        case:
          this.fixedCaseId() || this.viewMode() === "case"
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

  setPeopleIds(values: string[]): void {
    if (this.fixedUserId() || this.viewMode() === "my") return;
    this.peopleIds.set(values);
    this.syncQuery();
    this.reload();
  }

  setStatuses(values: PresentationStatus[]): void {
    this.statuses.set(values);
    this.syncQuery();
    this.reload();
  }

  setCaseFilter(value: string): void {
    if (this.fixedCaseId() || this.viewMode() === "case") return;
    this.caseFilter.set(value);
    this.syncQuery();
    this.reload();
  }

  reload(): void {
    if (this.viewMode() === "my" && !this.effectiveUserIds()?.length) {
      this.tasks.set([]);
      return;
    }
    if (this.viewMode() === "case" && !this.effectiveCaseId()) {
      this.tasks.set([]);
      return;
    }

    this.loadTasks(true);
  }

  loadMore(): void {
    if (this.tasksHasMore()) this.loadTasks(false);
  }

  private loadTasks(reset: boolean): void {
    const page = reset ? 1 : this.tasksPage() + 1;
    const query: TaskListQuery = {
      page,
      pageSize: PAGE_SIZE,
      search: this.search.value || undefined,
      assigneeUserIds: this.effectiveUserIds(),
      caseId: this.effectiveCaseId(),
      statuses: taskStatusesFor(this.statuses()),
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
    this.openTask(item.raw as TaskDetail);
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
      item.presentationStatus === "DONE" ||
      item.presentationStatus === "CANCELLED"
    );
  }

  complete(item: WorkItem): void {
    this.runTransition(item, "task-complete", "DONE");
  }

  reopen(item: WorkItem): void {
    this.runTransition(item, "task-reopen", "TODO");
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

  private runTransition(
    item: WorkItem,
    action: StatusTransitionAction,
    target: BoardColumnKey,
  ): void {
    const call = this.transitionCall(item, action);

    if (!call) return;

    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.updateTaskStatusLocally(item.id, target as TaskStatus);
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
      default:
        return undefined;
    }
  }

  readonly canEnterColumn = (
    drag: CdkDrag<WorkItem>,
    drop: CdkDropList<BoardColumnKey>,
  ): boolean => {
    const item = drag.data;
    const target = drop.data;

    // Always allow returning to original column.
    if (target === item.presentationStatus) {
      return true;
    }

    // CANCELLED is special in your existing implementation.
    if (target === "CANCELLED") {
      return this.canCancel(item);
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

  onColumnEntered(column: BoardColumnKey): void {
    const item = this.draggingItem();

    if (!item || column === item.presentationStatus) {
      return;
    }

    this.hoveredColumn.set(column);
  }

  onColumnExited(column: BoardColumnKey): void {
    if (this.hoveredColumn() === column) {
      this.hoveredColumn.set(null);
    }
  }

  onBoardDrop(
    event: CdkDragDrop<BoardColumnKey, BoardColumnKey, WorkItem>,
  ): void {
    const item = event.item.data;
    const target = event.container.data;

    this.draggingItem.set(null);
    this.hoveredColumn.set(null);

    if (target === item.presentationStatus) {
      return;
    }

    if (target === "CANCELLED") {
      this.cancel(item);
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
  }
}
