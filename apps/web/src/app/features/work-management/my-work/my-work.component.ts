import { Component, inject } from "@angular/core";
import { AuthState } from "@law/security";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { WorkViewComponent } from "../work-view/work-view.component";

@Component({
  selector: "app-my-work",
  standalone: true,
  imports: [WorkViewComponent, TranslatePipe],
  template: `
    <div class="flex flex-col gap-4 p-4">
      <h1 class="text-xl font-semibold">{{ "nav.myWork" | translate }}</h1>
      <app-work-view
        mode="my"
        [showTeamFilters]="false"
        [fixedUserId]="userId"
      />
    </div>
  `,
})
export class MyWorkComponent {
  private readonly auth = inject(AuthState);
  readonly userId = this.auth.session()?.user.id ?? "";
}
