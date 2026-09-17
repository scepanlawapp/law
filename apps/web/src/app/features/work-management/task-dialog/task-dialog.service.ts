import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { TaskDetail } from "@law/api-interfaces";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { TaskDialogComponent } from "./task-dialog.component";
import { TaskDialogContext } from "./task-dialog.models";

@Injectable({ providedIn: "root" })
export class TaskDialogService {
  private readonly dialog = inject(HlmDialogService);

  open(context: TaskDialogContext): Observable<TaskDetail | undefined> {
    return this.dialog.open<TaskDetail, TaskDialogContext>(
      TaskDialogComponent,
      {
        context,
        contentClass: "sm:max-w-2xl max-h-[90dvh] overflow-y-auto",
      },
    ).closed$;
  }
}
