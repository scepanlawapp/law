import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { WorkEntriesApiClient } from "@law/api-clients";
import { TaskDetail, WorkEntry } from "@law/api-interfaces";
import { of, Subject, throwError } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { TaskCompletionService } from "./task-completion.service";
import { TaskWorkEntriesComponent } from "./task-work-entries.component";

describe("TaskWorkEntriesComponent", () => {
  const api = { list: jest.fn() };
  const revision = signal(0);
  const capture = { workRevision: revision, openQuickCapture: jest.fn() };
  const task = {
    id: "task-1",
    title: "Review",
    status: "IN_PROGRESS",
  } as TaskDetail;
  const entry = (id: string) =>
    ({
      id,
      title: `Work ${id}`,
      user: { displayName: "Ana" },
      workDate: "2026-10-08",
      minutes: null,
      status: "CONFIRMED",
      description: "Notes",
    }) as WorkEntry;
  beforeEach(() => {
    jest.resetAllMocks();
    revision.set(0);
    api.list.mockReturnValue(of({ items: [entry("1")], meta: { totalItems: 1 } }));
    capture.openQuickCapture.mockReturnValue(of(null));
    TestBed.configureTestingModule({
      imports: [TaskWorkEntriesComponent],
      providers: [
        { provide: WorkEntriesApiClient, useValue: api },
        { provide: TaskCompletionService, useValue: capture },
        {
          provide: LocalizationService,
          useValue: { language: () => "EN", translate: (key: string) => key },
        },
      ],
    });
  });
  function render() {
    const fixture = TestBed.createComponent(TaskWorkEntriesComponent);
    fixture.componentRef.setInput("task", task);
    fixture.detectChanges();
    return fixture;
  }
  it("loads related entries and renders performer, notes and untimed state", () => {
    const fixture = render();
    expect(api.list).toHaveBeenCalledWith({
      taskId: task.id,
      page: 1,
      pageSize: 50,
    });
    const text = fixture.nativeElement.textContent;
    expect(text).toContain("Work 1");
    expect(text).toContain("Ana");
    expect(text).toContain("Notes");
    expect(text).toContain("work.entries.untimed");
  });
  it("loads more entries and refreshes when capture saves work", () => {
    api.list.mockReturnValueOnce(
      of({ items: [entry("1")], meta: { totalItems: 2 } }),
    );
    const fixture = render();
    api.list.mockReturnValueOnce(
      of({ items: [entry("2")], meta: { totalItems: 2 } }),
    );
    fixture.componentInstance.load(false);
    expect(fixture.componentInstance.entries().map((item) => item.id)).toEqual([
      "1",
      "2",
    ]);
    expect(fixture.componentInstance.hasMore()).toBe(false);
    api.list.mockReturnValueOnce(
      of({ items: [entry("3")], meta: { totalItems: 1 } }),
    );
    revision.update((value) => value + 1);
    fixture.detectChanges();
    expect(fixture.componentInstance.entries().map((item) => item.id)).toEqual([
      "3",
    ]);
  });
  it("shows load failure separately from an empty list and can retry", () => {
    api.list.mockReturnValueOnce(throwError(() => new Error("Failed")));
    const fixture = render();
    expect(fixture.nativeElement.textContent).toContain("work.entries.error");
    expect(fixture.nativeElement.textContent).not.toContain(
      "work.entries.empty",
    );
    api.list.mockReturnValueOnce(of({ items: [], meta: { totalItems: 0 } }));
    fixture.componentInstance.load(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("work.entries.empty");
  });
  it("opens only one capture and cancellation preserves task status", () => {
    const closed = new Subject<WorkEntry | null>();
    capture.openQuickCapture.mockReturnValue(closed);
    const fixture = render();
    fixture.componentInstance.openQuickCapture();
    fixture.componentInstance.openQuickCapture();
    expect(capture.openQuickCapture).toHaveBeenCalledTimes(1);
    closed.next(null);
    expect(fixture.componentInstance.opening()).toBe(false);
    expect(task.status).toBe("IN_PROGRESS");
  });
});
