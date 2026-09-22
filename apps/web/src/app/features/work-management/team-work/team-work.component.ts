import { Component } from "@angular/core";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { WorkViewComponent } from "../work-view/work-view.component";

@Component({
  selector: "law-team-work",
  standalone: true,
  imports: [WorkViewComponent, TranslatePipe],
  template: `
    <div class="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-hidden p-4">
      <h1 class="shrink-0 text-xl font-semibold">
        {{ "nav.teamWork" | translate }}
      </h1>

      <law-work-view class="block min-h-0 min-w-0 flex-1" mode="team" />
    </div>
  `,
})
export class TeamWorkComponent {}
