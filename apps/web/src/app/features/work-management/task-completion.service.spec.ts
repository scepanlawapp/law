import { TestBed } from "@angular/core/testing";
import { WorkManagementApiClient } from "@law/api-clients";
import {
  CreateWorkEntryRequest,
  TaskDetail,
  TaskRequest,
} from "@law/api-interfaces";
import { of, Subject } from "rxjs";
import { QuickCaptureDialogService } from "../time/quick-capture/quick-capture-dialog.service";
import { QuickCaptureInput } from "../time/quick-capture/quick-capture.models";
import { TaskCompletionService } from "./task-completion.service";

describe("TaskCompletionService", () => {
  const api = { updateTask: jest.fn(), createTask: jest.fn() };
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
    api.updateTask.mockReturnValue(of({ id: "task", status: "DONE" }));
    api.createTask.mockReturnValue(of({ id: "new-task", status: "DONE" }));
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkManagementApiClient, useValue: api },
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
        });
      else
        expect(api.createTask).toHaveBeenCalledWith({
          ...request,
          workEntry: entry,
        });
    },
  );
});
