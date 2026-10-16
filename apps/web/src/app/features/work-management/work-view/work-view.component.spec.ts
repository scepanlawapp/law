import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap, Router } from "@angular/router";
import {
  CasesApiClient,
  ReferencesApiClient,
  WorkManagementApiClient,
} from "@law/api-clients";
import { TaskDetail } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { of, Subject } from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { ConfirmDialogService } from "../../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../../shared/ui/toast/toast.service";
import { TaskCompletionService } from "../task-completion.service";
import { TaskDialogService } from "../task-dialog/task-dialog.service";
import { WorkViewComponent } from "./work-view.component";
import { taskToWorkItem } from "./work-view.models";

describe("WorkViewComponent completion", () => {
  const completion = { complete: jest.fn() };
  const api = {
    listTasks: jest.fn(() => of({ items: [], meta: { total: 0 } })),
    updateTask: jest.fn(),
  };
  const toast = { error: jest.fn() };
  const confirm = { confirm: jest.fn() };
  let result: Subject<TaskDetail | null>;
  const task = {
    id: "task",
    title: "Pregled",
    status: "IN_PROGRESS",
    priority: "NORMAL",
    assigneeUser: { id: "user" },
    createdAt: "2026-10-08",
    updatedAt: "2026-10-08",
  } as TaskDetail;
  let component: WorkViewComponent;
  beforeEach(() => {
    result = new Subject();
    completion.complete.mockReset().mockReturnValue(result);
    api.listTasks.mockClear();
    api.listTasks.mockReturnValue(of({ items: [], meta: { total: 0 } }));
    api.updateTask.mockReset().mockReturnValue(result);
    toast.error.mockReset();
    confirm.confirm.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: TaskCompletionService, useValue: completion },
        {
          provide: WorkManagementApiClient,
          useValue: api,
        },
        {
          provide: AuthState,
          useValue: { session: () => ({ user: { id: "user" } }) },
        },
        { provide: ReferencesApiClient, useValue: { users: () => of([]) } },
        {
          provide: CasesApiClient,
          useValue: { list: () => of({ items: [] }) },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({}),
              paramMap: convertToParamMap({}),
            },
            paramMap: of(convertToParamMap({})),
          },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: TaskDialogService, useValue: {} },
        { provide: ConfirmDialogService, useValue: confirm },
        { provide: ToastService, useValue: toast },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key },
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new WorkViewComponent());
    component.tasks.set([task]);
  });
  it("requests each board status independently with 100-item pages", () => {
    component.reload();
    expect(component.boardColumns()).toEqual(["TODO", "IN_PROGRESS", "DONE"]);
    expect(api.listTasks).toHaveBeenCalledTimes(3);
    for (const status of component.boardColumns()) {
      expect(api.listTasks).toHaveBeenCalledWith(
        expect.objectContaining({ statuses: [status], page: 1, pageSize: 100 }),
      );
    }
  });
  it("opens the task when a card or row surface is clicked", () => {
    const target = document.createElement("span");
    component.onItemClick(
      { target } as unknown as MouseEvent,
      taskToWorkItem(task),
    );
    expect(component.editPanel()?.context.task).toEqual(task);
  });
  it.each([
    "button",
    "a",
    "input",
    "select",
    "textarea",
    "label",
    "hlm-select",
  ])("does not open the task from a nested %s control", (tagName) => {
    const control = document.createElement(tagName);
    const target = document.createElement("span");
    control.appendChild(target);
    component.onItemClick(
      { target } as unknown as MouseEvent,
      taskToWorkItem(task),
    );
    expect(component.editPanel()).toBeNull();
  });
  it("does not open a task while dragging its card", () => {
    const item = taskToWorkItem(task);
    component.onDragStarted(item);
    component.onItemClick(
      { target: document.createElement("div") } as unknown as MouseEvent,
      item,
    );
    expect(component.editPanel()).toBeNull();
  });
  it("shows terminal statuses only in the table", () => {
    component.setStatuses(["ARCHIVED", "CANCELLED"]);
    expect(api.listTasks).not.toHaveBeenCalled();
    expect(component.boardColumns()).toEqual([]);
    component.setPresentation("table");
    expect(api.listTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({
        statuses: ["ARCHIVED", "CANCELLED"],
      }),
    );
  });
  function tableResponse(page: number, totalItems = 201) {
    return of({
      items: [{ ...task, id: `task-${page}` }],
      meta: {
        page,
        pageSize: 100,
        totalItems,
        totalPages: Math.ceil(totalItems / 100),
      },
    }) as never;
  }
  it("uses numbered table pages and replaces rows instead of appending", () => {
    api.listTasks.mockReturnValueOnce(tableResponse(1));
    component.setPresentation("table");
    expect(component.tasksPageSize()).toBe(100);
    expect(component.tasksTotalItems()).toBe(201);
    api.listTasks.mockReturnValueOnce(tableResponse(2));
    component.changeTaskPage(2);
    expect(api.listTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, pageSize: 100 }),
    );
    expect(component.tasks().map((item) => item.id)).toEqual(["task-2"]);
    api.listTasks.mockReturnValueOnce(tableResponse(1));
    component.changeTaskPage(1);
    expect(component.tasks().map((item) => item.id)).toEqual(["task-1"]);
  });
  it("resets numbered pagination when filters change", () => {
    api.listTasks.mockReturnValue(tableResponse(1));
    component.setPresentation("table");
    component.changeTaskPage(2);
    component.setStatuses(["TODO"]);
    expect(api.listTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, statuses: ["TODO"] }),
    );
    expect(component.tasksPage()).toBe(1);
  });
  it("changes table page size starting at page one", () => {
    api.listTasks.mockReturnValue(tableResponse(1));
    component.setPresentation("table");
    component.changeTaskPage(2);
    component.changeTaskPageSize(25);
    expect(api.listTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, pageSize: 25 }),
    );
    expect(component.tasksPage()).toBe(1);
  });
  it("retries the selected page after a failed request", () => {
    api.listTasks.mockReturnValueOnce(tableResponse(1));
    component.setPresentation("table");
    const failed = new Subject<never>();
    api.listTasks.mockReturnValueOnce(failed);
    component.changeTaskPage(2);
    failed.error(new Error("Offline"));
    expect(component.tasksError()).toBe(true);
    api.listTasks.mockReturnValueOnce(tableResponse(2));
    component.retryTasks();
    expect(api.listTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    );
    expect(component.tasks().map((item) => item.id)).toEqual(["task-2"]);
  });
  it("ignores paging while busy and rejects out-of-range pages", () => {
    api.listTasks.mockReturnValueOnce(tableResponse(1));
    component.setPresentation("table");
    api.listTasks.mockClear();
    component.changeTaskPage(0);
    component.changeTaskPage(4);
    expect(api.listTasks).not.toHaveBeenCalled();
    api.listTasks.mockReturnValueOnce(new Subject<never>());
    component.changeTaskPage(2);
    component.changeTaskPage(3);
    expect(api.listTasks).toHaveBeenCalledTimes(1);
  });
  it("clamps the table page if the server result set shrinks", () => {
    api.listTasks.mockReturnValueOnce(tableResponse(1));
    component.setPresentation("table");
    api.listTasks
      .mockReturnValueOnce(tableResponse(3, 101))
      .mockReturnValueOnce(tableResponse(2, 101));
    component.changeTaskPage(3);
    expect(api.listTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    );
    expect(component.tasksPage()).toBe(2);
  });
  it("loads the next page only for the requested column", () => {
    api.listTasks.mockReturnValue(
      of({ items: [], meta: { total: 300, totalPages: 3 } }) as never,
    );
    component.reload();
    api.listTasks.mockClear();
    component.loadMoreColumn("TODO");
    expect(api.listTasks).toHaveBeenCalledTimes(1);
    expect(api.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ statuses: ["TODO"], page: 2, pageSize: 100 }),
    );
  });
  it("ignores stale responses after filters change", () => {
    const stale = new Subject<never>();
    api.listTasks.mockReturnValueOnce(stale);
    component.reload();
    component.setStatuses(["DONE"]);
    stale.next({ items: [task], meta: { totalPages: 1 } } as never);
    expect(component.itemsForColumn("IN_PROGRESS")).toEqual([]);
  });
  it("does not request another page while a column is loading", () => {
    const pending = new Subject<never>();
    api.listTasks.mockReturnValueOnce(pending);
    component.reload();
    api.listTasks.mockClear();
    component.loadMoreColumn("TODO");
    expect(api.listTasks).not.toHaveBeenCalled();
  });
  it("retries a failed column without loading its neighbors", () => {
    const failed = new Subject<never>();
    api.listTasks.mockReturnValueOnce(failed);
    component.reload();
    failed.error(new Error("Offline"));
    expect(component.columnPages().TODO?.error).toBe(true);
    api.listTasks.mockClear();
    component.loadMoreColumn("TODO");
    expect(api.listTasks).toHaveBeenCalledTimes(1);
    expect(api.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, statuses: ["TODO"] }),
    );
    expect(component.columnPages().TODO?.error).toBe(false);
  });
  it("offers every task status, including on archived tasks", () => {
    expect(component.statusTargetsFor()).toEqual([
      "TODO",
      "IN_PROGRESS",
      "DONE",
      "CANCELLED",
      "ARCHIVED",
    ]);
    component.onStatusSelect(
      taskToWorkItem({ ...task, status: "ARCHIVED" }),
      "IN_PROGRESS",
    );
    expect(api.updateTask).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({ status: "IN_PROGRESS" }),
    );
  });
  it("restores a cancelled task directly to TODO", () => {
    component.onStatusSelect(
      taskToWorkItem({ ...task, status: "CANCELLED" }),
      "TODO",
    );
    expect(api.updateTask).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({ status: "TODO" }),
    );
  });
  it("archives through the existing update API without confirmation or work capture", () => {
    const item = taskToWorkItem(task);
    component.archive(item);
    component.archive(item);
    expect(api.updateTask).toHaveBeenCalledTimes(1);
    expect(api.updateTask).toHaveBeenCalledWith(task.id, {
      title: task.title,
      description: undefined,
      status: "ARCHIVED",
      priority: task.priority,
      assigneeUserId: "user",
      dueDate: undefined,
      dueAt: undefined,
      caseId: undefined,
      clientId: undefined,
      deadlineId: undefined,
    });
    expect(component.archivingTaskIds().has(task.id)).toBe(true);
    expect(component.tasks()[0].status).toBe("IN_PROGRESS");
    result.next({ ...task, status: "ARCHIVED" });
    result.complete();
    expect(component.tasks()[0].status).toBe("ARCHIVED");
    expect(component.itemsForColumn("IN_PROGRESS")).toEqual([]);
    expect(component.archivingTaskIds().size).toBe(0);
    expect(completion.complete).not.toHaveBeenCalled();
    expect(confirm.confirm).not.toHaveBeenCalled();
  });
  it("preserves the task and clears pending state when archive is denied", () => {
    component.archive(taskToWorkItem(task));
    result.error({ status: 403 });
    expect(component.tasks()[0]).toEqual(task);
    expect(component.archivingTaskIds().size).toBe(0);
    expect(toast.error).toHaveBeenCalledWith("work.saveError");
  });
  it("keeps a dropped task in its original column until capture succeeds", () => {
    component.onBoardDrop({
      item: { data: taskToWorkItem(task) },
      container: { data: "DONE" },
    } as never);
    expect(component.tasks()[0].status).toBe("IN_PROGRESS");
    result.next(null);
    expect(component.tasks()[0].status).toBe("IN_PROGRESS");
  });
  it("moves the task only after saved capture", () => {
    component.complete(taskToWorkItem(task));
    expect(component.tasks()[0].status).toBe("IN_PROGRESS");
    result.next({ ...task, status: "DONE" });
    expect(component.tasks()[0].status).toBe("DONE");
  });
  it("resets status selection after cancellation so DONE can be selected again", () => {
    const item = taskToWorkItem(task);
    const control = component.statusControlFor(item);
    control.setValue("DONE");
    result.next(null);
    expect(component.statusControlFor(item).value).toBe("IN_PROGRESS");
    control.setValue("DONE");
    expect(completion.complete).toHaveBeenCalledTimes(2);
  });
});
