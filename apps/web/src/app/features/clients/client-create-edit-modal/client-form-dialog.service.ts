import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { ClientDetail } from "@law/api-interfaces";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { ClientFormDialogContext } from "./client-form-dialog.models";
import { ClientFormComponent } from "./client-form.component";

/** Opens the client create/edit form in a modal so any component can reuse it without routing. */
@Injectable({ providedIn: "root" })
export class ClientFormDialogService {
  private readonly dialog = inject(HlmDialogService);

  create(): Observable<ClientDetail | undefined> {
    return this.open();
  }

  edit(clientId: string): Observable<ClientDetail | undefined> {
    return this.open({ clientId });
  }

  private open(
    context?: ClientFormDialogContext,
  ): Observable<ClientDetail | undefined> {
    return this.dialog.open<ClientDetail, ClientFormDialogContext>(
      ClientFormComponent,
      {
        contentClass:
          "sm:max-w-2xl h-[calc(100dvh-4rem)] flex flex-col overflow-hidden",
        context: context ?? {},
      },
    ).closed$;
  }
}
