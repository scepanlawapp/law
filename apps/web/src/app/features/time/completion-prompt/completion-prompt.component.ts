import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { HlmButton } from "@spartan-ng/helm/button";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { CompletionPromptService } from "./completion-prompt.service";

/** Non-modal "Koliko vremena?" panel, anchored bottom-right. Mounted once in the app shell. */
@Component({
  selector: "law-completion-prompt",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./completion-prompt.component.html",
  imports: [HlmButton, TranslatePipe],
})
export class CompletionPromptComponent {
  protected readonly prompt = inject(CompletionPromptService);
  protected readonly minuteChips = [15, 30, 60, 120] as const;

  /** A default that matches no chip is offered through "Drugo…". */
  protected customMinutes(minutes: number | undefined): number | undefined {
    return minutes && !(this.minuteChips as readonly number[]).includes(minutes)
      ? minutes
      : undefined;
  }
}
