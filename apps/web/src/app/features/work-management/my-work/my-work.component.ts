import { Component, computed, inject } from "@angular/core";
import { AuthState } from "@law/security";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { WorkViewComponent } from "../work-view/work-view.component";

@Component({
  selector: "law-my-work",
  standalone: true,
  imports: [WorkViewComponent, TranslatePipe],
  template: `
    <div class="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-hidden p-4">
      <h1 class="text-xl font-semibold">{{ "nav.myWork" | translate }}</h1>
      <law-work-view
        class="block min-h-0 min-w-0 flex-1"
        mode="my"
        [fixedUserId]="userId()"
      />
    </div>
  `,
})
export class MyWorkComponent {
  private readonly auth = inject(AuthState);
  readonly userId = computed(() => this.auth.session()?.user.id ?? "");
}
