import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
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
  lucideClock,
  lucideLandmark,
  lucideChartBar,
  lucideTags,
  lucideClipboardCheck,
  lucideChevronRight,
  lucideGauge,
  lucideCalendarCheck,
  lucideSettings,
} from "@ng-icons/lucide";
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
} from "@angular/router";
import { filter } from "rxjs";
import {
  HlmCollapsible,
  HlmCollapsibleContent,
  HlmCollapsibleTrigger,
} from "@spartan-ng/helm/collapsible";
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
  HlmSidebarMenuSub,
  HlmSidebarMenuSubButton,
  HlmSidebarMenuSubItem,
  HlmSidebarTrigger,
  HlmSidebarService,
} from "@spartan-ng/helm/sidebar";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { WorkspaceRole } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import {
  canManageBilling,
  canRunMonthEnd,
  canViewRetainers,
} from "../../shared/billing";
import { UserMenuComponent } from "../../shared/components/user-menu/user-menu.component";

interface SidebarNavigationItem {
  route: string;
  label: string;
  icon: string;
  /** Highlight only on an exact route match (for routes that are prefixes of others). */
  exact?: boolean;
  children?: SidebarNavigationItem[];
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
    HlmCollapsible,
    HlmCollapsibleContent,
    HlmCollapsibleTrigger,
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
    HlmSidebarMenuSub,
    HlmSidebarMenuSubButton,
    HlmSidebarMenuSubItem,
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
      lucideClock,
      lucideLandmark,
      lucideChartBar,
      lucideTags,
      lucideClipboardCheck,
      lucideChevronRight,
      lucideGauge,
      lucideCalendarCheck,
      lucideSettings,
    }),
  ],
})
export class SidebarComponent {
  private readonly authState = inject(AuthState);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sidebar = inject(HlmSidebarService);
  readonly reportsIconMode = computed(
    () => this.sidebar.state() === "collapsed" && !this.sidebar.isMobile(),
  );
  readonly reportsRouteActive = signal(this.router.url.startsWith("/reports"));
  readonly reportsExpanded = signal(this.router.url.startsWith("/reports"));
  readonly session = this.authState.session;
  readonly financeRouteActive = signal(this.router.url.startsWith("/finance"));

  readonly mainNavigation: SidebarNavigationItem[] = [
    { route: "/dashboard", label: "nav.dashboard", icon: "lucideHome" },
    { route: "/assistant", label: "nav.aiAssistant", icon: "lucideBot" },
  ];

  private readonly showRetainers = computed(() =>
    canViewRetainers(this.authState.activeWorkspace()?.role),
  );

  private readonly showMonthEnd = computed(() =>
    canRunMonthEnd(this.authState.activeWorkspace()?.role),
  );

  readonly navigationGroups = computed<SidebarNavigationGroup[]>(() => [
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
        {
          route: "/work/time/team",
          label: "nav.teamTime",
          icon: "lucideUsers",
        },
        {
          route: "/work/time",
          label: "nav.myTime",
          icon: "lucideClock",
          exact: true,
        },
        { route: "/calendar", label: "nav.calendar", icon: "lucideCalendar" },
      ],
    },
    {
      label: "nav.business",
      items: [
        {
          route: "/finance",
          label: "nav.finance",
          icon: "lucideLandmark",
          children: [
            {
              route: "/finance/work-review",
              label: "nav.financeWorkReview",
              icon: "lucideClipboardCheck",
            },
            {
              route: "/finance/invoices",
              label: "nav.financeInvoices",
              icon: "lucideFileText",
            },
            {
              route: "/finance/price-sources",
              label: "nav.financePriceSources",
              icon: "lucideTags",
            },
            ...(this.showRetainers()
              ? [
                  {
                    route: "/finance/retainers",
                    label: "nav.financeRetainers",
                    icon: "lucideGauge",
                  },
                ]
              : []),
            ...(this.showMonthEnd()
              ? [
                  {
                    route: "/finance/month-end",
                    label: "nav.financeMonthEnd",
                    icon: "lucideCalendarCheck",
                  },
                ]
              : []),
            ...([WorkspaceRole.OWNER, WorkspaceRole.ADMIN].includes(
              this.authState.activeWorkspace()?.role ?? WorkspaceRole.MEMBER,
            )
              ? [
                  {
                    route: "/finance/settings",
                    label: "revenue.nav",
                    icon: "lucideSettings",
                  },
                ]
              : []),
          ],
        },
        {
          route: "/reports",
          label: "nav.reports",
          icon: "lucideChartBar",
          children: [
            ...(canManageBilling(this.authState.activeWorkspace()?.role)
              ? [
                  {
                    route: "/reports/overview",
                    label: "report.overview",
                    icon: "lucideChartBar",
                  },
                  {
                    route: "/reports/earnings",
                    label: "report.earnings",
                    icon: "lucideUsers",
                  },
                  {
                    route: "/reports/outstanding",
                    label: "report.outstanding",
                    icon: "lucideClock",
                  },
                ]
              : []),
            {
              route: "/reports/my-earnings",
              label: "report.personal",
              icon: "lucideUserCheck",
            },
          ],
        },
      ],
    },
  ]);

  constructor() {
    this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd => event instanceof NavigationEnd,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        this.financeRouteActive.set(
          event.urlAfterRedirects.startsWith("/finance"),
        );
        this.reportsRouteActive.set(
          event.urlAfterRedirects.startsWith("/reports"),
        );
        if (event.urlAfterRedirects.startsWith("/reports"))
          this.reportsExpanded.set(true);
      });
  }

  toggleReports(expanded: boolean): void {
    this.reportsExpanded.set(expanded);
  }
  openReportsMenu(): void {
    this.sidebar.setOpen(true);
    this.reportsExpanded.set(true);
  }
  closeReportsMobile(route: string): void {
    if (route.startsWith("/reports")) this.sidebar.setOpenMobile(false);
  }

  logout(): void {
    this.authState
      .logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }
}
