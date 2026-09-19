import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { DeadlineDetail } from "@law/api-interfaces";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { DeadlineDialogComponent } from "./deadline-dialog.component";
import { DeadlineDialogContext } from "./deadline-dialog.models";

@Injectable({ providedIn: "root" })
export class DeadlineDialogService {
  private readonly dialog = inject(HlmDialogService);

  open(context: DeadlineDialogContext): Observable<DeadlineDetail | undefined> {
    return this.dialog.open<DeadlineDetail, DeadlineDialogContext>(
      DeadlineDialogComponent,
      {
        context,
        contentClass:
          "sm:max-w-2xl h-[calc(100dvh-4rem)] flex flex-col overflow-hidden",
      },
    ).closed$;
  }
}
