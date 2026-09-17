import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { EventDetail } from "@law/api-interfaces";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { EventDialogComponent } from "./event-dialog.component";
import { EventDialogContext } from "./event-dialog.models";

@Injectable({ providedIn: "root" })
export class EventDialogService {
  private readonly dialog = inject(HlmDialogService);

  open(context: EventDialogContext): Observable<EventDetail | undefined> {
    return this.dialog.open<EventDetail, EventDialogContext>(EventDialogComponent, {
      context,
      contentClass: "sm:max-w-2xl max-h-[90dvh] overflow-y-auto",
    }).closed$;
  }
}
