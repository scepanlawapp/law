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
    TestBed.configureTestingModule({
      providers: [
        { provide: TaskCompletionService, useValue: completion },
        {
          provide: WorkManagementApiClient,
          useValue: { listTasks: () => of({ items: [], meta: { total: 0 } }) },
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
        { provide: ConfirmDialogService, useValue: {} },
        { provide: ToastService, useValue: { error: jest.fn() } },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key },
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new WorkViewComponent());
    component.tasks.set([task]);
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
