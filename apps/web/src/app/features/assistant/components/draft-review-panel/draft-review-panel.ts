import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  computed,
  signal,
  viewChild,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideCheck,
  lucideChevronLeft,
  lucideChevronRight,
  lucideCircleCheck,
  lucideDownload,
  lucideLocateFixed,
  lucideRotateCcw,
  lucideSave,
  lucideTriangleAlert,
  lucideX,
} from "@ng-icons/lucide";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { DraftResultResponse, DocumentScript } from "@law/api-interfaces";
import { TranslatePipe } from "../../../../core/localization/translate.pipe";
import { CollapsibleSectionComponent } from "../../../../shared/ui/collapsible-section/collapsible-section.component";
import { CitationListComponent } from "../citation-list/citation-list";
import {
  DraftPlaceholder,
  fillPlaceholder,
  findPlaceholders,
} from "../../draft-placeholders";

@Component({
  selector: "law-draft-review-panel",
  standalone: true,
  imports: [
    FormsModule,
    NgIcon,
    HlmButton,
    HlmInput,
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
      lucideCircleCheck,
      lucideDownload,
      lucideLocateFixed,
      lucideRotateCcw,
      lucideSave,
      lucideTriangleAlert,
      lucideX,
    }),
  ],
})
export class DraftReviewPanelComponent {
  private readonly documentTextarea =
    viewChild<ElementRef<HTMLTextAreaElement>>("documentTextarea");
  private readonly textValue = signal("");

  @Input({ required: true }) draft!: DraftResultResponse;
  @Input({ required: true })
  set text(value: string) {
    this.textValue.set(value ?? "");
  }
  get text(): string {
    return this.textValue();
  }
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
  protected readonly notesExpanded = signal(false);
  protected readonly placeholders = computed(() =>
    findPlaceholders(this.textValue()),
  );
  protected readonly fillValues = signal<Record<string, string | undefined>>({});

  protected get approved(): boolean {
    return this.draft.approvalStatus === "APPROVED";
  }

  protected setFillValue(id: string, value: string): void {
    this.fillValues.update((values) => ({ ...values, [id]: value }));
  }

  protected fill(placeholder: DraftPlaceholder): void {
    const value = (this.fillValues()[placeholder.id] ?? "").trim();
    if (!value) return;
    this.textChange.emit(fillPlaceholder(this.text, placeholder, value));
    this.fillValues.update((values) => {
      const next = { ...values };
      delete next[placeholder.id];
      return next;
    });
  }

  protected showInText(placeholder: DraftPlaceholder): void {
    const textarea = this.documentTextarea()?.nativeElement;
    const occurrence = placeholder.occurrences[0];
    if (!textarea || !occurrence) return;
    textarea.scrollIntoView({ block: "nearest", behavior: "smooth" });
    // Collapsing the caret first and refocusing makes browsers scroll it into view.
    textarea.setSelectionRange(occurrence.start, occurrence.start);
    textarea.blur();
    textarea.focus();
    textarea.setSelectionRange(occurrence.start, occurrence.end);
  }

  protected statusKey(): string {
    return `assistant.draftStatus.${this.draft.approvalStatus ?? "READY_FOR_SIGNOFF"}`;
  }
}
