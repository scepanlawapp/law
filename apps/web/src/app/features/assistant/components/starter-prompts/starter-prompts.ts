import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideAlarmClock,
  lucideBookOpen,
  lucideBriefcase,
  lucideCalendarDays,
  lucideCalendarPlus,
  lucideCircleAlert,
  lucideFilePen,
  lucideFileSearch,
  lucideFileText,
  lucideGavel,
  lucideHistory,
  lucideListChecks,
  lucideReceipt,
  lucideUser,
} from "@ng-icons/lucide";
import { TranslatePipe } from "../../../../core/localization/translate.pipe";
import {
  AssistantStarterPrompt,
  starterPromptKey,
} from "../../assistant-starter-prompts";

/** Grid of starter cards shown on an empty assistant chat. */
@Component({
  selector: "law-starter-prompts",
  standalone: true,
  imports: [NgIcon, TranslatePipe],
  templateUrl: "./starter-prompts.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      lucideAlarmClock,
      lucideBookOpen,
      lucideBriefcase,
      lucideCalendarDays,
      lucideCalendarPlus,
      lucideCircleAlert,
      lucideFilePen,
      lucideFileSearch,
      lucideFileText,
      lucideGavel,
      lucideHistory,
      lucideListChecks,
      lucideReceipt,
      lucideUser,
    }),
  ],
})
export class StarterPromptsComponent {
  readonly prompts = input.required<readonly AssistantStarterPrompt[]>();
  readonly disabled = input(false);
  readonly selected = output<AssistantStarterPrompt>();

  protected readonly key = starterPromptKey;
}
