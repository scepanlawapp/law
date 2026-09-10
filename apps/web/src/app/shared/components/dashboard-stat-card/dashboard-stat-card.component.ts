import { Component, input } from "@angular/core";
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
import { TranslatePipe } from "../../../core/localization/translate.pipe";

@Component({
  selector: "app-dashboard-stat-card",
  standalone: true,
  imports: [NgIcon, TranslatePipe],
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
  readonly value = input.required<string>();
  readonly trend = input.required<string>();
  readonly trendDirection = input<"up" | "down" | "neutral">("up");
  readonly trendDetail = input.required<string>();
  readonly icon = input.required<string>();
  readonly chart = input<number[]>([]);
}
