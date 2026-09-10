import { Component, inject } from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideScale,
  lucideBot,
  lucideHome,
  lucideUsers,
  lucideFolder,
  lucideFileText,
  lucideSquareCheck,
  lucideCalendar,
  lucideLandmark,
  lucideChartBar,
  lucideSettings,
} from "@ng-icons/lucide";
import { RouterLink, RouterLinkActive } from "@angular/router";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { AuthState } from "@law/security";
import { UserMenuComponent } from "../../shared/components/user-menu/user-menu.component";

@Component({
  selector: "app-sidebar",
  standalone: true,
  templateUrl: "./sidebar.component.html",
  imports: [
    NgIcon,
    RouterLink,
    RouterLinkActive,
    TranslatePipe,
    UserMenuComponent,
  ],
  providers: [
    provideIcons({
      lucideScale,
      lucideBot,
      lucideHome,
      lucideUsers,
      lucideFolder,
      lucideFileText,
      lucideSquareCheck,
      lucideCalendar,
      lucideLandmark,
      lucideChartBar,
      lucideSettings,
    }),
  ],
})
export class SidebarComponent {
  private readonly authState = inject(AuthState);
  readonly session = this.authState.session;

  logout(): void {
    this.authState.logout().subscribe();
  }
}
