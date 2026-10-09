import { inject, Injectable, signal } from "@angular/core";
import {
  WorkEntriesApiClient,
  WorkManagementApiClient,
} from "@law/api-clients";
import { TaskDetail, TaskRequest, WorkEntry } from "@law/api-interfaces";
import { map, Observable, of, switchMap, tap } from "rxjs";
import { isEditable } from "../time/time-utils";
import { QuickCaptureDialogService } from "../time/quick-capture/quick-capture-dialog.service";

@Injectable({ providedIn: "root" })
export class TaskCompletionService {
  private readonly capture = inject(QuickCaptureDialogService);
  private readonly api = inject(WorkManagementApiClient);
  private readonly entries = inject(WorkEntriesApiClient);
  private readonly revision = signal(0);
  readonly workRevision = this.revision.asReadonly();

  openQuickCapture(task: TaskDetail): Observable<WorkEntry | null> {
    return this.capture
      .open({
        mode: "create",
        taskId: task.id,
        userId: task.assigneeUser.id,
        title: task.title.slice(0, 200),
        description: task.description ?? undefined,
        clientId: task.client?.id,
        caseId: task.case?.id,
      })
      .pipe(
        tap((saved) => {
          if (saved) this.revision.update((value) => value + 1);
        }),
      );
  }

  openWorkEntry(entry: WorkEntry): Observable<WorkEntry | null> {
    return this.capture
      .open({
        mode: isEditable(entry) ? "edit" : "view",
        entryId: entry.id,
        manageEntry: true,
        onDeleted: () => this.revision.update((value) => value + 1),
      })
      .pipe(
        tap((saved) => {
          if (saved) this.revision.update((value) => value + 1);
        }),
      );
  }

  complete(
    request: TaskRequest,
    taskId?: string,
  ): Observable<TaskDetail | null> {
    const hasWork = taskId
      ? this.entries
          .list({ taskId, page: 1, pageSize: 1 })
          .pipe(map((response) => response.meta.totalItems > 0))
      : of(false);
    return hasWork.pipe(
      switchMap((existingWork) =>
        this.capture.open<TaskDetail>({
          mode: "create",
          taskId,
          userId: request.assigneeUserId,
          title: request.title.slice(0, 200),
          description: request.description,
          clientId: request.clientId,
          caseId: request.caseId,
          ...(existingWork && taskId
            ? {
                finishWithoutNewWork: () =>
                  this.api.updateTask(taskId, {
                    ...request,
                    status: "DONE",
                    workEntry: undefined,
                    finishWithoutNewWork: true,
                  }),
              }
            : {}),
          save: (workEntry) => {
            const payload = {
              ...request,
              status: "DONE" as const,
              finishWithoutNewWork: false,
              workEntry,
            };
            return taskId
              ? this.api.updateTask(taskId, payload)
              : this.api.createTask(payload);
          },
        }),
      ),
      tap((saved) => {
        if (saved) this.revision.update((value) => value + 1);
      }),
    );
  }
}
