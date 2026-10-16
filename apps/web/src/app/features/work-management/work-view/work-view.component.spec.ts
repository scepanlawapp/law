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
  it("starts with only the three board statuses and keeps terminal filters available", () => {
    component.reload();
    expect(component.boardColumns()).toEqual(["TODO", "IN_PROGRESS", "DONE"]);
    expect(api.listTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({
        statuses: ["TODO", "IN_PROGRESS", "DONE"],
      }),
    );
    component.setStatuses(["ARCHIVED", "CANCELLED"]);
    expect(api.listTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({
        statuses: ["ARCHIVED", "CANCELLED"],
      }),
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
