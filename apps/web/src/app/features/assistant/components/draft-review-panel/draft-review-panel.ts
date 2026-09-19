import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideCheck,
  lucideChevronLeft,
  lucideChevronRight,
  lucideDownload,
  lucideRotateCcw,
  lucideSave,
  lucideTriangleAlert,
  lucideX,
} from "@ng-icons/lucide";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { DraftResultResponse, DocumentScript } from "@law/api-interfaces";
import { TranslatePipe } from "../../../../core/localization/translate.pipe";
import { CollapsibleSectionComponent } from "../../../../shared/ui/collapsible-section/collapsible-section.component";
import { CitationListComponent } from "../citation-list/citation-list";

@Component({
  selector: "app-draft-review-panel",
  standalone: true,
  imports: [
    FormsModule,
    NgIcon,
    HlmButton,
    HlmTextarea,
    HlmTooltipImports,
    TranslatePipe,
    CollapsibleSectionComponent,
    CitationListComponent,
  ],
  templateUrl: "./draft-review-panel.html",
  styleUrl: "./draft-review-panel.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      lucideCheck,
      lucideChevronLeft,
      lucideChevronRight,
      lucideDownload,
      lucideRotateCcw,
      lucideSave,
      lucideTriangleAlert,
      lucideX,
    }),
  ],
})
export class DraftReviewPanelComponent {
  @Input({ required: true }) draft!: DraftResultResponse;
  @Input({ required: true }) text = "";
  @Input({ required: true }) script: DocumentScript = "latin";
  @Input() note = "";
  @Input() expanded = true;

  @Output() textChange = new EventEmitter<string>();
  @Output() noteChange = new EventEmitter<string>();
  @Output() scriptChange = new EventEmitter<DocumentScript>();
  @Output() exportDocx = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
  @Output() approve = new EventEmitter<void>();
  @Output() reject = new EventEmitter<void>();
  @Output() requestChanges = new EventEmitter<void>();
  @Output() expandedChange = new EventEmitter<boolean>();

  protected readonly scripts: DocumentScript[] = ["latin", "cyrillic"];
  protected readonly sourcesExpanded = signal(false);

  protected statusKey(): string {
    return `assistant.draftStatus.${this.draft.approvalStatus ?? "READY_FOR_SIGNOFF"}`;
  }
}
