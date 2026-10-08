import { inject, Injectable } from "@angular/core";
import { WorkManagementApiClient } from "@law/api-clients";
import { TaskDetail, TaskRequest } from "@law/api-interfaces";
import { Observable } from "rxjs";
import { QuickCaptureDialogService } from "../time/quick-capture/quick-capture-dialog.service";

@Injectable({ providedIn: "root" })
export class TaskCompletionService {
  private readonly capture = inject(QuickCaptureDialogService);
  private readonly api = inject(WorkManagementApiClient);

  complete(
    request: TaskRequest,
    taskId?: string,
  ): Observable<TaskDetail | null> {
    return this.capture.open<TaskDetail>({
      mode: "create",
      title: request.title.slice(0, 200),
      description: request.description,
      clientId: request.clientId,
      caseId: request.caseId,
      save: (workEntry) => {
        const payload = { ...request, status: "DONE" as const, workEntry };
        return taskId
          ? this.api.updateTask(taskId, payload)
          : this.api.createTask(payload);
      },
    });
  }
}
