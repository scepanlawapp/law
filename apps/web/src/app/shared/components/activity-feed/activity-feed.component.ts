import { Component, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import { DatePipe } from "@angular/common";
import { ActivityFeedItem } from "../../../features/dashboard/dashboard.models";
import { TranslatePipe } from "../../../core/localization/translate.pipe";

/**
 * Reusable, presentation-only activity feed. Data retrieval stays in the
 * caller (dashboard today; case/client-scoped screens can reuse this later).
 */
@Component({
  selector: "law-activity-feed",
  standalone: true,
  imports: [RouterLink, DatePipe, TranslatePipe],
  templateUrl: "./activity-feed.component.html",
})
export class ActivityFeedComponent {
  readonly items = input.required<ActivityFeedItem[]>();

  entityLink(item: ActivityFeedItem): string[] | null {
    if (item.caseId) return ["/cases", item.caseId];
    if (item.clientId) return ["/clients", item.clientId];
    return null;
  }
}
