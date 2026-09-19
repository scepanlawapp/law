import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import {
  CasePriority,
  CaseSummary,
  DeadlineDetail,
  DeadlineStatus,
  DeadlineType,
  TaskDetail,
  TaskStatus,
} from "@law/api-interfaces";
import {
  CasesApiClient,
  ClientsApiClient,
  ReferencesApiClient,
  WorkManagementApiClient,
} from "@law/api-clients";
import { AuthState } from "@law/security";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import {
  HlmTable,
  HlmTableContainer,
  HlmTBody,
  HlmTd,
  HlmTh,
  HlmTHead,
  HlmTr,
} from "@spartan-ng/helm/table";
import { debounceTime, distinctUntilChanged, finalize, forkJoin } from "rxjs";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { LocalizationService } from "../../core/localization/localization.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { DeadlineDialogService } from "../work-management/deadline-dialog/deadline-dialog.service";
import { TaskDialogService } from "../work-management/task-dialog/task-dialog.service";
import { dueLabel } from "../work-management/work-management-utils";

type WorkTab = "tasks" | "deadlines";

@Component({
  selector: "app-tasks-deadlines",
  standalone: true,
  templateUrl: "./tasks-deadlines.component.html",
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButton,
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
})
export class TasksDeadlinesComponent {
  private readonly api = inject(WorkManagementApiClient);
  private readonly usersApi = inject(ReferencesApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly auth = inject(AuthState);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly taskDialog = inject(TaskDialogService);
  private readonly deadlineDialog = inject(DeadlineDialogService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly tab = signal<WorkTab>(this.readTab());
  readonly tasks = signal<TaskDetail[]>([]);
  readonly deadlines = signal<DeadlineDetail[]>([]);
  readonly selectedTask = signal<TaskDetail | null>(null);
  readonly selectedDeadline = signal<DeadlineDetail | null>(null);
  readonly users = signal<Array<{ id: string; name: string }>>([]);
  readonly cases = signal<CaseSummary[]>([]);
  readonly clients = signal<Array<{ id: string; name: string }>>([]);
  readonly taskPage = signal(this.numberParam("taskPage", 1));
  readonly deadlinePage = signal(this.numberParam("deadlinePage", 1));
  readonly taskPages = signal(1);
  readonly deadlinePages = signal(1);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal(false);
  readonly taskSearch = new FormControl(this.stringParam("taskSearch"), {
    nonNullable: true,
  });
  readonly deadlineSearch = new FormControl(
    this.stringParam("deadlineSearch"),
    { nonNullable: true },
  );
  readonly taskStatus = new FormControl<TaskStatus | "">(
    this.stringParam("taskStatus") as TaskStatus | "",
    { nonNullable: true },
  );
  readonly taskPriority = new FormControl<CasePriority | "">(
    this.stringParam("taskPriority") as CasePriority | "",
    { nonNullable: true },
  );
  readonly taskAssignee = new FormControl(this.stringParam("taskAssignee"), {
    nonNullable: true,
  });
  readonly taskCase = new FormControl(this.stringParam("taskCase"), {
    nonNullable: true,
  });
  readonly taskClient = new FormControl(this.stringParam("taskClient"), {
    nonNullable: true,
  });
  readonly taskDeadline = new FormControl(this.stringParam("taskDeadline"), {
    nonNullable: true,
  });
  readonly deadlineStatus = new FormControl<DeadlineStatus | "">(
    this.stringParam("deadlineStatus") as DeadlineStatus | "",
    { nonNullable: true },
  );
  readonly deadlineType = new FormControl<DeadlineType | "">(
    this.stringParam("deadlineType") as DeadlineType | "",
    { nonNullable: true },
  );
  readonly deadlineResponsible = new FormControl(
    this.stringParam("deadlineResponsible"),
    { nonNullable: true },
  );
  readonly deadlineCase = new FormControl(this.stringParam("deadlineCase"), {
    nonNullable: true,
  });
  readonly deadlineClient = new FormControl(
    this.stringParam("deadlineClient"),
    { nonNullable: true },
  );
  readonly taskStatuses: TaskStatus[] = [
    "TODO",
    "IN_PROGRESS",
    "DONE",
    "CANCELLED",
  ];
  readonly priorities: CasePriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];
  readonly deadlineStatuses: DeadlineStatus[] = [
    "OPEN",
    "SATISFIED",
    "CANCELLED",
  ];
  readonly deadlineTypes: DeadlineType[] = [
    "COURT",
    "STATUTORY",
    "CONTRACTUAL",
    "INTERNAL",
    "OTHER",
  ];
  readonly taskStatusOptions = [
    { value: "", label: "work.allStatuses" },
    ...this.taskStatuses.map((value) => ({
      value,
      label: `work.taskStatus.${value.toLowerCase()}`,
    })),
  ];
  readonly priorityOptions = [
    { value: "", label: "work.allPriorities" },
    ...this.priorities.map((value) => ({
      value,
      label: `work.priority.${value.toLowerCase()}`,
    })),
  ];
  readonly deadlineStatusOptions = [
    { value: "", label: "work.allStatuses" },
    ...this.deadlineStatuses.map((value) => ({
      value,
      label: `work.deadlineStatus.${value.toLowerCase()}`,
    })),
  ];
  readonly deadlineTypeOptions = [
    { value: "", label: "work.allTypes" },
    ...this.deadlineTypes.map((value) => ({
      value,
      label: `work.deadlineType.${value.toLowerCase()}`,
    })),
  ];
  readonly taskStatusItemToString = (
    value: string | null | undefined,
  ): string => this.optionLabel(this.taskStatusOptions, value);
  readonly priorityItemToString = (value: string | null | undefined): string =>
    this.optionLabel(this.priorityOptions, value);
  readonly deadlineStatusItemToString = (
    value: string | null | undefined,
  ): string => this.optionLabel(this.deadlineStatusOptions, value);
  readonly deadlineTypeItemToString = (
    value: string | null | undefined,
  ): string => this.optionLabel(this.deadlineTypeOptions, value);
  readonly userItemToString = (value: string | null | undefined): string =>
    value ? this.userName(value) : this.localization.translate("work.allUsers");
  readonly caseItemToString = (value: string | null | undefined): string =>
    value ? this.caseName(value) : this.localization.translate("work.allCases");
  readonly clientItemToString = (value: string | null | undefined): string =>
    value
      ? this.clientName(value)
      : this.localization.translate("work.allClients");

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
    forkJoin({
      cases: this.casesApi.list({ page: 1, pageSize: 100 }),
      clients: this.clientsApi.list({ page: 1, pageSize: 100 }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ cases, clients }) => {
        this.cases.set(cases.items);
        this.clients.set(
          clients.items.map((item) => ({
            id: item.id,
            name: item.displayName,
          })),
        );
      });
    this.bindReload(this.taskSearch, "taskSearch");
    this.bindReload(this.deadlineSearch, "deadlineSearch");
    [
      [this.taskStatus, "taskStatus"],
      [this.taskPriority, "taskPriority"],
      [this.taskAssignee, "taskAssignee"],
      [this.taskCase, "taskCase"],
      [this.taskClient, "taskClient"],
      [this.taskDeadline, "taskDeadline"],
      [this.deadlineStatus, "deadlineStatus"],
      [this.deadlineType, "deadlineType"],
      [this.deadlineResponsible, "deadlineResponsible"],
      [this.deadlineCase, "deadlineCase"],
      [this.deadlineClient, "deadlineClient"],
    ].forEach(([control, key]) =>
      (control as FormControl).valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() =>
          this.updateQuery({
            [key as string]: (control as FormControl).value || null,
            [this.tab() === "tasks" ? "taskPage" : "deadlinePage"]: 1,
          }),
        ),
    );
    this.load();
  }

  private bindReload(control: FormControl<string>, key: string): void {
    control.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.updateQuery({
          [key]: control.value || null,
          [this.tab() === "tasks" ? "taskPage" : "deadlinePage"]: 1,
        });
      });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    if (this.tab() === "tasks") {
      this.api
        .listTasks({
          page: this.taskPage(),
          pageSize: 20,
          search: this.taskSearch.value || undefined,
          status: this.taskStatus.value || undefined,
          priority: this.taskPriority.value || undefined,
          assigneeUserId: this.taskAssignee.value || undefined,
          caseId: this.taskCase.value || undefined,
          clientId: this.taskClient.value || undefined,
          deadlineId: this.taskDeadline.value || undefined,
        })
        .pipe(
          finalize(() => this.loading.set(false)),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe({
          next: (response) => {
            this.loaded.set(true);
            this.tasks.set(response.items);
            this.taskPages.set(response.meta.totalPages);
          },
          error: () => this.error.set(true),
        });
      return;
    }
    this.api
      .listDeadlines({
        page: this.deadlinePage(),
        pageSize: 20,
        search: this.deadlineSearch.value || undefined,
        status: this.deadlineStatus.value || undefined,
        type: this.deadlineType.value || undefined,
        responsibleUserId: this.deadlineResponsible.value || undefined,
        caseId: this.deadlineCase.value || undefined,
        clientId: this.deadlineClient.value || undefined,
      })
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.loaded.set(true);
          this.deadlines.set(response.items);
          this.deadlinePages.set(response.meta.totalPages);
        },
        error: () => this.error.set(true),
      });
  }

  selectTab(tab: WorkTab): void {
    this.tab.set(tab);
    this.updateQuery({
      tab,
      [tab === "tasks" ? "deadlinePage" : "taskPage"]: null,
    });
    this.load();
  }

  myOpenTasks(): void {
    this.taskStatus.setValue("TODO");
    this.taskAssignee.setValue(this.auth.session()?.user.id ?? "");
  }

  allOpenTasks(): void {
    this.taskStatus.setValue("TODO");
    this.taskAssignee.setValue("");
  }

  myOpenDeadlines(): void {
    this.deadlineStatus.setValue("OPEN");
    this.deadlineResponsible.setValue(this.auth.session()?.user.id ?? "");
  }

  allOpenDeadlines(): void {
    this.deadlineStatus.setValue("OPEN");
    this.deadlineResponsible.setValue("");
  }

  changePage(page: number): void {
    const max =
      this.tab() === "tasks" ? this.taskPages() : this.deadlinePages();
    if (page < 1 || page > max || this.loading()) return;
    if (this.tab() === "tasks") this.taskPage.set(page);
    else this.deadlinePage.set(page);
    this.updateQuery({
      [this.tab() === "tasks" ? "taskPage" : "deadlinePage"]: page,
    });
    this.load();
  }

  openTask(task?: TaskDetail): void {
    this.taskDialog
      .open({
        task,
        caseId: task?.caseId ?? (this.taskCase.value || undefined),
        clientId: task?.clientId ?? (this.taskClient.value || undefined),
        deadlineId: task?.deadlineId ?? (this.taskDeadline.value || undefined),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) this.load();
      });
  }

  openDeadline(deadline?: DeadlineDetail): void {
    this.deadlineDialog
      .open({
        deadline,
        caseId: deadline?.caseId ?? (this.deadlineCase.value || undefined),
        clientId:
          deadline?.clientId ?? (this.deadlineClient.value || undefined),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) this.load();
      });
  }

  transitionTask(
    task: TaskDetail,
    action: "complete" | "cancel" | "reopen",
  ): void {
    const call =
      action === "complete"
        ? this.api.completeTask(task.id)
        : action === "cancel"
          ? this.api.cancelTask(task.id)
          : this.api.reopenTask(task.id);
    const operation =
      action === "cancel"
        ? this.confirm.confirm({
            title: this.localization.translate("work.confirmCancel"),
            message: this.localization.translate("work.confirmCancelMessage"),
            variant: "danger",
          })
        : undefined;
    if (operation) {
      operation
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((confirmed) => {
          if (confirmed) this.runTaskTransition(call);
        });
      return;
    }
    this.runTaskTransition(call);
  }

  private runTaskTransition(
    call: ReturnType<WorkManagementApiClient["completeTask"]>,
  ): void {
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.load(),
      error: () =>
        this.toast.error(this.localization.translate("work.saveError")),
    });
  }

  transitionDeadline(
    deadline: DeadlineDetail,
    action: "satisfy" | "cancel" | "reopen",
  ): void {
    const call =
      action === "satisfy"
        ? this.api.satisfyDeadline(deadline.id)
        : action === "cancel"
          ? this.api.cancelDeadline(deadline.id)
          : this.api.reopenDeadline(deadline.id);
    this.confirm
      .confirm({
        title: this.localization.translate("work.confirmTransition"),
        message: this.localization.translate("work.confirmTransitionMessage"),
        variant: action === "cancel" ? "danger" : "default",
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (confirmed)
          call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: () => this.load(),
            error: () =>
              this.toast.error(this.localization.translate("work.saveError")),
          });
      });
  }

  userName(id: string): string {
    return this.users().find((user) => user.id === id)?.name ?? id;
  }
  caseName(id: string | null): string {
    return id
      ? (this.cases().find((item) => item.id === id)?.name ?? id)
      : this.localization.translate("common.notProvided");
  }
  clientName(id: string | null): string {
    return id
      ? (this.clients().find((item) => item.id === id)?.name ?? id)
      : this.localization.translate("common.notProvided");
  }
  dueDate(date: string | null, at: string | null): string {
    return dueLabel(
      date,
      at,
      this.localization.translate("work.noDueDate"),
      this.localization.language() === "EN" ? "en" : "sr-Latn",
    );
  }
  hasTaskFilters(): boolean {
    return Boolean(
      this.taskSearch.value ||
        this.taskStatus.value ||
        this.taskPriority.value ||
        this.taskAssignee.value ||
        this.taskCase.value ||
        this.taskClient.value ||
        this.taskDeadline.value,
    );
  }
  hasDeadlineFilters(): boolean {
    return Boolean(
      this.deadlineSearch.value ||
        this.deadlineStatus.value ||
        this.deadlineType.value ||
        this.deadlineResponsible.value ||
        this.deadlineCase.value ||
        this.deadlineClient.value,
    );
  }
  clearFilters(): void {
    const controls =
      this.tab() === "tasks"
        ? [
            this.taskSearch,
            this.taskStatus,
            this.taskPriority,
            this.taskAssignee,
            this.taskCase,
            this.taskClient,
            this.taskDeadline,
          ]
        : [
            this.deadlineSearch,
            this.deadlineStatus,
            this.deadlineType,
            this.deadlineResponsible,
            this.deadlineCase,
            this.deadlineClient,
          ];
    controls.forEach((control) => control.setValue("", { emitEvent: false }));
    this.updateQuery({
      taskSearch: null,
      taskStatus: null,
      taskPriority: null,
      taskAssignee: null,
      taskCase: null,
      taskClient: null,
      taskDeadline: null,
      deadlineSearch: null,
      deadlineStatus: null,
      deadlineType: null,
      deadlineResponsible: null,
      deadlineCase: null,
      deadlineClient: null,
      [this.tab() === "tasks" ? "taskPage" : "deadlinePage"]: 1,
    });
    if (this.tab() === "tasks") this.taskPage.set(1);
    else this.deadlinePage.set(1);
    this.load();
  }

  private updateQuery(query: Record<string, string | number | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: query,
      queryParamsHandling: "merge",
    });
  }
  private readTab(): WorkTab {
    return this.route.snapshot.queryParamMap.get("tab") === "deadlines"
      ? "deadlines"
      : "tasks";
  }
  private stringParam(key: string): string {
    return this.route.snapshot.queryParamMap.get(key) ?? "";
  }
  private numberParam(key: string, fallback: number): number {
    const value = Number(this.route.snapshot.queryParamMap.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private optionLabel(
    options: ReadonlyArray<{ value: string; label: string }>,
    value: string | null | undefined,
  ): string {
    const label = options.find(
      (option) => option.value === (value ?? ""),
    )?.label;
    return label ? this.localization.translate(label) : "";
  }
}
