import { Component, computed, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { AuthState } from "@law/security";
import {
  HlmEmpty,
  HlmEmptyDescription,
  HlmEmptyHeader,
  HlmEmptyTitle,
} from "@spartan-ng/helm/empty";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { canManageBilling } from "../../shared/billing";

@Component({
  selector: "law-reports",
  standalone: true,
  templateUrl: "./reports.component.html",
  imports: [
    HlmEmpty,
    HlmEmptyDescription,
    HlmEmptyHeader,
    HlmEmptyTitle,
    RouterLink,
    TranslatePipe,
  ],
})
export class ReportsComponent {
  private readonly auth = inject(AuthState);

  readonly canViewProfitability = computed(() =>
    canManageBilling(this.auth.activeWorkspace()?.role),
  );
}
