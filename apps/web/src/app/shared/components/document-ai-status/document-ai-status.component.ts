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

const STATUS_ICONS: Record<DocumentAiStatus, string> = {
  OFF: "lucideEyeOff",
  QUEUED: "lucideClock",
  PROCESSING: "lucideClock",
  READY: "lucideSparkles",
  FAILED: "lucideTriangleAlert",
  UNSUPPORTED: "lucideBan",
};

const STATUS_COLORS: Record<DocumentAiStatus, string> = {
  OFF: "text-muted-foreground",
  QUEUED: "text-muted-foreground",
  PROCESSING: "text-primary",
  READY: "text-primary",
  FAILED: "text-destructive",
  UNSUPPORTED: "text-muted-foreground",
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
  readonly inProgress = computed(
    () => this.status() === "QUEUED" || this.status() === "PROCESSING",
  );
  readonly label = computed(() =>
    this.localization.translate(`documents.ai.status.${this.status()}`),
  );
}
