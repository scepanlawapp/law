import { Component } from "@angular/core";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { WorkViewComponent } from "../work-view/work-view.component";

@Component({
  selector: "app-team-work",
  standalone: true,
  imports: [WorkViewComponent, TranslatePipe],
  template: `
    <div class="flex flex-col gap-4 p-4">
      <h1 class="text-xl font-semibold">{{ "nav.teamWork" | translate }}</h1>
      <app-work-view mode="team" [showTeamFilters]="true" />
    </div>
  `,
})
export class TeamWorkComponent {}
