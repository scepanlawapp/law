import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideAlarmClock,
  lucideBookOpen,
  lucideBriefcase,
  lucideCalendarDays,
  lucideCalendarPlus,
  lucideChevronRight,
  lucideCircleAlert,
  lucideFilePen,
  lucideFileSearch,
  lucideFileText,
  lucideGavel,
  lucideHistory,
  lucideListChecks,
  lucideReceipt,
  lucideUser,
  lucideUsers,
} from "@ng-icons/lucide";
import { TranslatePipe } from "../../../../core/localization/translate.pipe";
import {
  AssistantStarterPrompt,
  STARTER_PROMPT_GROUPS,
  StarterPromptGroup,
  starterPromptKey,
} from "../../assistant-starter-prompts";

interface StarterPromptSection {
  group: StarterPromptGroup | null;
  prompts: AssistantStarterPrompt[];
}

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
      lucideChevronRight,
      lucideCircleAlert,
      lucideFilePen,
      lucideFileSearch,
      lucideFileText,
      lucideGavel,
      lucideHistory,
      lucideListChecks,
      lucideReceipt,
      lucideUser,
      lucideUsers,
    }),
  ],
})
export class StarterPromptsComponent {
  readonly prompts = input.required<readonly AssistantStarterPrompt[]>();
  readonly disabled = input(false);
  readonly selected = output<AssistantStarterPrompt>();

  protected readonly key = starterPromptKey;
  /** Grouped cards get a heading per group; ungrouped cards form one section. */
  protected readonly sections = computed<StarterPromptSection[]>(() => {
    const prompts = this.prompts();
    const ungrouped = prompts.filter((prompt) => !prompt.group);
    const grouped = STARTER_PROMPT_GROUPS.map((group) => ({
      group,
      prompts: prompts.filter((prompt) => prompt.group === group),
    })).filter((section) => section.prompts.length);
    return ungrouped.length
      ? [{ group: null, prompts: ungrouped }, ...grouped]
      : grouped;
  });
}
