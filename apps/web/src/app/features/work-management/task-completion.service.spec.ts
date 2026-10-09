import { TestBed } from "@angular/core/testing";
import {
  WorkEntriesApiClient,
  WorkManagementApiClient,
} from "@law/api-clients";
import {
  CreateWorkEntryRequest,
  TaskDetail,
  TaskRequest,
  WorkEntry,
} from "@law/api-interfaces";
import { of, Subject } from "rxjs";
import { QuickCaptureDialogService } from "../time/quick-capture/quick-capture-dialog.service";
import { QuickCaptureInput } from "../time/quick-capture/quick-capture.models";
import { TaskCompletionService } from "./task-completion.service";

describe("TaskCompletionService", () => {
  const api = { updateTask: jest.fn(), createTask: jest.fn() };
  const entries = { list: jest.fn() };
  const capture = { open: jest.fn() };
  const request: TaskRequest = {
    title: "Pregled",
    description: "Opis",
    clientId: "client",
    caseId: "case",
    assigneeUserId: "user",
    status: "DONE",
  };
  const entry: CreateWorkEntryRequest = {
    clientId: "client",
    title: "Pregled",
    workDate: "2026-10-08",
    minutes: 30,
  };
  let service: TaskCompletionService;
  let closed: Subject<TaskDetail | null>;
  beforeEach(() => {
    jest.resetAllMocks();
    closed = new Subject();
    capture.open.mockReturnValue(closed);
    entries.list.mockReturnValue(of({ items: [], meta: { totalItems: 0 } }));
    api.updateTask.mockReturnValue(of({ id: "task", status: "DONE" }));
    api.createTask.mockReturnValue(of({ id: "new-task", status: "DONE" }));
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkManagementApiClient, useValue: api },
        { provide: WorkEntriesApiClient, useValue: entries },
        { provide: QuickCaptureDialogService, useValue: capture },
      ],
    });
    service = TestBed.inject(TaskCompletionService);
  });
  it("prefills capture and makes no mutation when dismissed", () => {
    const result = jest.fn();
    service.complete(request, "task").subscribe(result);
    expect(capture.open).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "create",
        title: "Pregled",
        description: "Opis",
        clientId: "client",
        caseId: "case",
      }),
    );
    closed.next(null);
    expect(result).toHaveBeenCalledWith(null);
    expect(api.updateTask).not.toHaveBeenCalled();
    expect(api.createTask).not.toHaveBeenCalled();
  });
  it.each(["task", undefined])(
    "saves task %s and capture in one request only on confirmation",
    (id) => {
      service.complete(request, id).subscribe();
      const context = capture.open.mock
        .calls[0][0] as QuickCaptureInput<TaskDetail>;
      expect(api.updateTask).not.toHaveBeenCalled();
      if (!context.save) throw new Error("Missing capture save");
      context.save(entry).subscribe();
      if (id)
        expect(api.updateTask).toHaveBeenCalledWith(id, {
          ...request,
          workEntry: entry,
          finishWithoutNewWork: false,
        });
      else
        expect(api.createTask).toHaveBeenCalledWith({
          ...request,
          workEntry: entry,
          finishWithoutNewWork: false,
        });
    },
  );
  it("offers completion without new work only when linked work exists", () => {
    entries.list.mockReturnValue(
      of({ items: [{ id: "entry" }], meta: { totalItems: 1 } }),
    );
    service.complete(request, "task").subscribe();
    const context = capture.open.mock
      .calls[0][0] as QuickCaptureInput<TaskDetail>;
    expect(entries.list).toHaveBeenCalledWith({
      taskId: "task",
      page: 1,
      pageSize: 1,
    });
    if (!context.finishWithoutNewWork) throw new Error("Missing alternative");
    context.finishWithoutNewWork().subscribe();
    expect(api.updateTask).toHaveBeenCalledWith("task", {
      ...request,
      workEntry: undefined,
      finishWithoutNewWork: true,
    });
  });
  it("does not offer skip for tasks without work", () => {
    service.complete(request, "task").subscribe();
    expect(capture.open.mock.calls[0][0].finishWithoutNewWork).toBeUndefined();
  });
  it("opens independent capture with a task link and does not complete the task", () => {
    service
      .openQuickCapture({
        id: "task",
        assigneeUser: { id: "task-user" },
        title: "Review",
        description: "Notes",
      } as TaskDetail)
      .subscribe();
    expect(capture.open).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "create",
        taskId: "task",
        userId: "task-user",
        title: "Review",
        description: "Notes",
      }),
    );
    expect(api.updateTask).not.toHaveBeenCalled();
    closed.next(null);
    expect(service.workRevision()).toBe(0);
  });
  it("refreshes task work after deletion without returning a deleted entry as a save", () => {
    const result = jest.fn();
    service
      .openWorkEntry({ id: "entry-1", status: "CONFIRMED" } as WorkEntry)
      .subscribe(result);
    const context = capture.open.mock.calls[0][0] as QuickCaptureInput;
    expect(context).toMatchObject({
      mode: "edit",
      entryId: "entry-1",
      manageEntry: true,
    });
    context.onDeleted?.();
    closed.next(null);
    expect(service.workRevision()).toBe(1);
    expect(result).toHaveBeenCalledWith(null);
  });
  it.each(["BILLED", "WRITTEN_OFF", "RUNNING"] as const)(
    "opens %s task work in view mode",
    (status) => {
      service.openWorkEntry({ id: "entry-1", status } as WorkEntry).subscribe();
      expect(capture.open).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "view", entryId: "entry-1" }),
      );
    },
  );
});
