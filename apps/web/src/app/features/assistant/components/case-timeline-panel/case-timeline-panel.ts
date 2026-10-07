import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideChevronLeft,
  lucideChevronRight,
  lucideHistory,
} from "@ng-icons/lucide";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import {
  CaseTimelineAnalysis,
  CaseTimelineEvent,
  CaseTimelineSourceStatus,
} from "@law/api-interfaces";
import { TranslatePipe } from "../../../../core/localization/translate.pipe";
import { STATUS_BADGE_BASE_CLASSES } from "../../../../shared/status-badge";
import { CollapsibleSectionComponent } from "../../../../shared/ui/collapsible-section/collapsible-section.component";

const SOURCE_BADGE: Record<CaseTimelineSourceStatus, string> = {
  READ: "border-success/40 bg-success/10 text-success",
  TRUNCATED: "border-warning/40 bg-warning/10 text-warning",
  NO_TEXT: "border-border bg-muted text-muted-foreground",
  FAILED: "border-destructive/40 bg-destructive/10 text-destructive",
  SKIPPED: "border-border bg-muted text-muted-foreground",
};

/** Formats YYYY-MM-DD / YYYY-MM / YYYY as Serbian dates (15.03.2026.). */
export function formatTimelineDate(event: CaseTimelineEvent): string | null {
  if (!event.date) return event.dateText;
  const [year, month, day] = event.date.split("-");
  if (day) return `${day}.${month}.${year}.`;
  if (month) return `${month}.${year}.`;
  return `${year}.`;
}

/** Read-only case chronology in the assistant rail ("Analiza"). */
@Component({
  selector: "law-case-timeline-panel",
  standalone: true,
  imports: [
    NgIcon,
    HlmButton,
    HlmTooltipImports,
    TranslatePipe,
    CollapsibleSectionComponent,
  ],
  templateUrl: "./case-timeline-panel.html",
  styleUrl: "./case-timeline-panel.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({ lucideChevronLeft, lucideChevronRight, lucideHistory }),
  ],
})
export class CaseTimelinePanelComponent {
  readonly analysis = input.required<CaseTimelineAnalysis>();
  readonly expanded = input(true);
  readonly expandedChange = output<boolean>();

  protected readonly sourcesExpanded = signal(false);
  protected readonly notesExpanded = signal(false);
  protected readonly badgeBase = STATUS_BADGE_BASE_CLASSES;
  protected readonly formatDate = formatTimelineDate;

  /** Events grouped by year; undated events form the last group (year null). */
  protected readonly groups = computed(() => {
    const groups: Array<{ year: string | null; events: CaseTimelineEvent[] }> =
      [];
    for (const event of this.analysis().result.events) {
      const year = event.date ? event.date.slice(0, 4) : null;
      const last = groups[groups.length - 1];
      if (last && last.year === year) last.events.push(event);
      else groups.push({ year, events: [event] });
    }
    return groups;
  });

  protected sourceBadge(status: CaseTimelineSourceStatus): string {
    return `${STATUS_BADGE_BASE_CLASSES} ${SOURCE_BADGE[status]}`;
  }
}
