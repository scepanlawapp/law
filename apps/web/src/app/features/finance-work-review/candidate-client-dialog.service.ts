import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { ClientSummary } from "@law/api-interfaces";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { CandidateClientDialogComponent } from "./candidate-client-dialog.component";
import { CandidateClientDialogContext } from "./candidate-client-dialog.models";

@Injectable({ providedIn: "root" })
export class CandidateClientDialogService {
  private readonly dialog = inject(HlmDialogService);

  open(
    context: CandidateClientDialogContext,
  ): Observable<ClientSummary | undefined> {
    return this.dialog.open<ClientSummary, CandidateClientDialogContext>(
      CandidateClientDialogComponent,
      {
        context,
        contentClass: "sm:max-w-lg",
      },
    ).closed$;
  }
}
