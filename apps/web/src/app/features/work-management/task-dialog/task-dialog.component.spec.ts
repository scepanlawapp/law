import { TestBed } from "@angular/core/testing";
import {
  CasesApiClient,
  ClientsApiClient,
  ReferencesApiClient,
  WorkManagementApiClient,
} from "@law/api-clients";
import { AuthState } from "@law/security";
import { BrnDialogRef } from "@spartan-ng/brain/dialog";
import { of, Subject } from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { TaskCompletionService } from "../task-completion.service";
import { TaskDialogComponent } from "./task-dialog.component";
import { TaskDialogContext } from "./task-dialog.models";
import { TaskDetail } from "@law/api-interfaces";
let context: TaskDialogContext;
jest.mock("@spartan-ng/brain/dialog", () => ({
  ...jest.requireActual("@spartan-ng/brain/dialog"),
  injectBrnDialogContext: () => context,
}));
describe("TaskDialogComponent completion", () => {
  const api = { updateTask: jest.fn(), createTask: jest.fn() };
  const completion = { complete: jest.fn() };
  const dialog = { close: jest.fn() };
  let result: Subject<TaskDetail | null>;
  beforeEach(() => {
    jest.resetAllMocks();
    context = {
      task: {
        id: "task",
        title: "Pregled",
        status: "IN_PROGRESS",
        assigneeUser: { id: "user" },
      } as TaskDetail,
    };
    result = new Subject();
    completion.complete.mockReturnValue(result);
    api.updateTask.mockReturnValue(of(context.task));
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkManagementApiClient, useValue: api },
        { provide: TaskCompletionService, useValue: completion },
        {
          provide: CasesApiClient,
          useValue: { list: () => of({ items: [] }) },
        },
        {
          provide: ClientsApiClient,
          useValue: { list: () => of({ items: [] }) },
        },
        { provide: ReferencesApiClient, useValue: { users: () => of([]) } },
        {
          provide: AuthState,
          useValue: { session: () => ({ user: { id: "user" } }) },
        },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key },
        },
        { provide: BrnDialogRef, useValue: dialog },
      ],
    });
  });
  const create = () =>
    TestBed.runInInjectionContext(() => new TaskDialogComponent());
  it("preserves the previous status and pending edits when capture is cancelled", () => {
    const component = create();
    component.form.patchValue({ status: "DONE", title: "Edited title" });
    component.submit();
    component.submit();
    expect(completion.complete).toHaveBeenCalledTimes(1);
    expect(api.updateTask).not.toHaveBeenCalled();
    result.next(null);
    expect(component.form.controls.status.value).toBe("IN_PROGRESS");
    expect(component.form.controls.title.value).toBe("Edited title");
    expect(component.saving()).toBe(false);
    expect(dialog.close).not.toHaveBeenCalled();
  });
  it("closes with the saved task after capture succeeds", () => {
    const component = create();
    component.form.controls.status.setValue("DONE");
    component.submit();
    const saved = { ...context.task, status: "DONE" as const };
    result.next(saved);
    expect(dialog.close).toHaveBeenCalledWith(saved);
  });
  it("requires capture when creating a task as DONE", () => {
    context = {};
    const component = create();
    component.form.patchValue({ title: "New task", status: "DONE" });
    component.submit();
    expect(completion.complete).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New task", status: "DONE" }),
      undefined,
    );
    result.next(null);
    expect(component.form.controls.status.value).toBe("TODO");
    expect(api.createTask).not.toHaveBeenCalled();
  });
  it("does not prompt when editing an already completed task", () => {
    if (!context.task) throw new Error("Missing task fixture");
    context.task.status = "DONE";
    const component = create();
    component.submit();
    expect(completion.complete).not.toHaveBeenCalled();
    expect(api.updateTask).toHaveBeenCalled();
  });
});
