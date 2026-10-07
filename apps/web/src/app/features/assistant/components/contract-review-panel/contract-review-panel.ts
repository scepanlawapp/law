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
  lucideDownload,
  lucideFileSearch,
  lucideTriangleAlert,
} from "@ng-icons/lucide";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import {
  ContractIssueRisk,
  ContractReviewAnalysis,
  ContractReviewIssue,
  DocumentScript,
} from "@law/api-interfaces";
import { TranslatePipe } from "../../../../core/localization/translate.pipe";
import {
  riskBadgeClass,
  STATUS_BADGE_BASE_CLASSES,
} from "../../../../shared/status-badge";
import { CollapsibleSectionComponent } from "../../../../shared/ui/collapsible-section/collapsible-section.component";
import { CitationListComponent } from "../citation-list/citation-list";

const RISKS: readonly ContractIssueRisk[] = ["HIGH", "MEDIUM", "LOW"];

/** Read-only contract review in the assistant rail ("Analiza"). */
@Component({
  selector: "law-contract-review-panel",
  standalone: true,
  imports: [
    NgIcon,
    HlmButton,
    HlmTooltipImports,
    TranslatePipe,
    CollapsibleSectionComponent,
    CitationListComponent,
  ],
  templateUrl: "./contract-review-panel.html",
  styleUrl: "./contract-review-panel.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      lucideChevronLeft,
      lucideChevronRight,
      lucideDownload,
      lucideFileSearch,
      lucideTriangleAlert,
    }),
  ],
})
export class ContractReviewPanelComponent {
  readonly analysis = input.required<ContractReviewAnalysis>();
  readonly expanded = input(true);
  readonly expandedChange = output<boolean>();
  readonly exportDocx = output<DocumentScript>();

  protected readonly notesExpanded = signal(false);
  protected readonly sourcesExpanded = signal(false);
  protected readonly badgeBase = STATUS_BADGE_BASE_CLASSES;
  protected readonly riskBadgeClass = riskBadgeClass;

  /** Issues grouped by risk, highest first; empty groups are dropped. */
  protected readonly issueGroups = computed(() => {
    const issues = this.analysis().result.issues;
    return RISKS.map((risk) => ({
      risk,
      issues: issues.filter((issue) => issue.risk === risk),
    })).filter((group) => group.issues.length);
  });

  protected readonly highRiskCount = computed(
    () =>
      this.analysis().result.issues.filter((issue) => issue.risk === "HIGH")
        .length,
  );

  /** Model warnings plus the truncation notice. */
  protected readonly notes = computed(() => {
    const analysis = this.analysis();
    return analysis.truncated
      ? [...analysis.result.warnings, "assistant.review.truncatedNote"]
      : analysis.result.warnings;
  });

  protected issueId(index: number): string {
    return `review-issue-${this.analysis().id}-${index}`;
  }

  protected markers(issue: ContractReviewIssue): string {
    return issue.citations.map((marker) => `[${marker}]`).join("");
  }
}
