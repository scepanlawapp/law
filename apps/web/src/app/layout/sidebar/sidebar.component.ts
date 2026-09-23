import { Component, DestroyRef, inject } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideScale,
  lucideBot,
  lucideHome,
  lucideUsers,
  lucideFolder,
  lucideFileText,
  lucideSquareCheck,
  lucideUserCheck,
  lucideCalendar,
  lucideLandmark,
  lucideChartBar,
  lucideSettings,
} from "@ng-icons/lucide";
import { RouterLink, RouterLinkActive } from "@angular/router";
import {
  HlmSidebar,
  HlmSidebarContent,
  HlmSidebarFooter,
  HlmSidebarGroup,
  HlmSidebarGroupContent,
  HlmSidebarGroupLabel,
  HlmSidebarHeader,
  HlmSidebarMenu,
  HlmSidebarMenuButton,
  HlmSidebarMenuItem,
  HlmSidebarTrigger,
} from "@spartan-ng/helm/sidebar";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { AuthState } from "@law/security";
import { UserMenuComponent } from "../../shared/components/user-menu/user-menu.component";

interface SidebarNavigationItem {
  route: string;
  label: string;
  icon: string;
}

interface SidebarNavigationGroup {
  label: string;
  items: SidebarNavigationItem[];
}

@Component({
  selector: "law-sidebar",
  standalone: true,
  templateUrl: "./sidebar.component.html",
  imports: [
    NgIcon,
    HlmSidebar,
    HlmSidebarContent,
    HlmSidebarFooter,
    HlmSidebarGroup,
    HlmSidebarGroupContent,
    HlmSidebarGroupLabel,
    HlmSidebarHeader,
    HlmSidebarMenu,
    HlmSidebarMenuButton,
    HlmSidebarMenuItem,
    HlmSidebarTrigger,
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
      lucideUserCheck,
      lucideCalendar,
      lucideLandmark,
      lucideChartBar,
      lucideSettings,
    }),
  ],
})
export class SidebarComponent {
  private readonly authState = inject(AuthState);
  private readonly destroyRef = inject(DestroyRef);
  readonly session = this.authState.session;

  readonly mainNavigation: SidebarNavigationItem[] = [
    { route: "/dashboard", label: "nav.dashboard", icon: "lucideHome" },
    { route: "/assistant", label: "nav.aiAssistant", icon: "lucideBot" },
  ];

  readonly navigationGroups: SidebarNavigationGroup[] = [
    {
      label: "nav.workspace",
      items: [
        { route: "/clients", label: "nav.clients", icon: "lucideUsers" },
        { route: "/cases", label: "nav.cases", icon: "lucideFolder" },
        { route: "/documents", label: "nav.documents", icon: "lucideFileText" },
      ],
    },
    {
      label: "nav.work",
      items: [
        {
          route: "/work/team",
          label: "nav.teamWork",
          icon: "lucideSquareCheck",
        },
        { route: "/work/my", label: "nav.myWork", icon: "lucideUserCheck" },
        { route: "/calendar", label: "nav.calendar", icon: "lucideCalendar" },
      ],
    },
    {
      label: "nav.business",
      items: [
        { route: "/finance", label: "nav.finance", icon: "lucideLandmark" },
        { route: "/reports", label: "nav.reports", icon: "lucideChartBar" },
      ],
    },
  ];

  logout(): void {
    this.authState
      .logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }
}
