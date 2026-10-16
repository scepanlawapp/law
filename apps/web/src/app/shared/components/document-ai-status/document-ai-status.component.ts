import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideBan,
  lucideClock,
  lucideEyeOff,
  lucideSparkles,
  lucideTriangleAlert,
} from "@ng-icons/lucide";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { DocumentAiStatus } from "@law/api-interfaces";
import { LocalizationService } from "../../../core/localization/localization.service";
import {
  DOCUMENT_AI_IN_PROGRESS_STATUSES,
  DOCUMENT_AI_STATUS_LABELS,
} from "../../models";

const STATUS_ICONS: Readonly<Record<DocumentAiStatus, string>> = {
  [DocumentAiStatus.OFF]: "lucideEyeOff",
  [DocumentAiStatus.QUEUED]: "lucideClock",
  [DocumentAiStatus.PROCESSING]: "lucideClock",
  [DocumentAiStatus.READY]: "lucideSparkles",
  [DocumentAiStatus.FAILED]: "lucideTriangleAlert",
  [DocumentAiStatus.UNSUPPORTED]: "lucideBan",
};

const STATUS_COLORS: Readonly<Record<DocumentAiStatus, string>> = {
  [DocumentAiStatus.OFF]: "text-muted-foreground",
  [DocumentAiStatus.QUEUED]: "text-muted-foreground",
  [DocumentAiStatus.PROCESSING]: "text-primary",
  [DocumentAiStatus.READY]: "text-primary",
  [DocumentAiStatus.FAILED]: "text-destructive",
  [DocumentAiStatus.UNSUPPORTED]: "text-muted-foreground",
};

/** Compact AI-processing indicator. The focusable host carries the tooltip. */
@Component({
  selector: "law-document-ai-status",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmSpinner, HlmTooltip],
  providers: [
    provideIcons({
      lucideBan,
      lucideClock,
      lucideEyeOff,
      lucideSparkles,
      lucideTriangleAlert,
    }),
  ],
  host: { class: "inline-flex shrink-0" },
  template: `
    <span
      class="inline-flex items-center gap-1 rounded-sm"
      [class]="color()"
      role="img"
      tabindex="0"
      [attr.aria-label]="label()"
      [hlmTooltip]="label()"
    >
      <ng-icon [name]="icon()" size="1em" aria-hidden="true" />
      @if (inProgress()) {
        <hlm-spinner [attr.aria-label]="label()" />
      }
    </span>
  `,
})
export class DocumentAiStatusComponent {
  private readonly localization = inject(LocalizationService);

  readonly status = input.required<DocumentAiStatus>();

  readonly icon = computed(() => STATUS_ICONS[this.status()]);
  readonly color = computed(() => STATUS_COLORS[this.status()]);
  readonly inProgress = computed(() =>
    DOCUMENT_AI_IN_PROGRESS_STATUSES.includes(this.status()),
  );
  readonly label = computed(() =>
    this.localization.translate(DOCUMENT_AI_STATUS_LABELS[this.status()]),
  );
}
