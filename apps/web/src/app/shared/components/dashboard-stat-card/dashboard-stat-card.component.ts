import { Component, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideFolderOpen,
  lucideCalendar,
  lucideSquareCheck,
  lucideFileText,
  lucideTrendingUp,
  lucideTrendingDown,
  lucideMinus,
} from "@ng-icons/lucide";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { TranslatePipe } from "../../../core/localization/translate.pipe";

/**
 * Reusable stat/summary card. Trend/chart are optional so it also works for
 * plain counts and for an "unavailable" placeholder (no real data source yet).
 */
@Component({
  selector: "app-dashboard-stat-card",
  standalone: true,
  imports: [NgIcon, RouterLink, HlmSpinner, TranslatePipe],
  templateUrl: "./dashboard-stat-card.component.html",
  providers: [
    provideIcons({
      lucideFolderOpen,
      lucideCalendar,
      lucideSquareCheck,
      lucideFileText,
      lucideTrendingUp,
      lucideTrendingDown,
      lucideMinus,
    }),
  ],
})
export class DashboardStatCardComponent {
  readonly title = input.required<string>();
  readonly icon = input.required<string>();
  /** Rendered as-is; leave undefined while loading or unavailable. */
  readonly value = input<string | number | undefined>(undefined);
  readonly subtitleKey = input<string | undefined>(undefined);
  readonly loading = input<boolean>(false);
  readonly unavailable = input<boolean>(false);
  readonly unavailableKey = input<string>("common.notAvailableYet");
  readonly trend = input<string | undefined>(undefined);
  readonly trendDirection = input<"up" | "down" | "neutral">("neutral");
  readonly trendDetailKey = input<string | undefined>(undefined);
  readonly chart = input<number[]>([]);
  readonly routerLink = input<string | undefined>(undefined);
  readonly queryParams = input<Record<string, string> | undefined>(undefined);
}
