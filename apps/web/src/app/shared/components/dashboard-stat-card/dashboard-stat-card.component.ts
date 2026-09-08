import { Component, input } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { TranslatePipe } from "../../../core/localization/translate.pipe";

@Component({
  selector: "app-dashboard-stat-card",
  standalone: true,
  imports: [MatIconModule, TranslatePipe],
  templateUrl: "./dashboard-stat-card.component.html",
  styleUrl: "./dashboard-stat-card.component.scss",
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
