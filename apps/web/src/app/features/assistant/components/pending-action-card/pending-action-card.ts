import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideCheck,
  lucideCircleAlert,
  lucideClock,
  lucideShieldQuestion,
  lucideX,
} from "@ng-icons/lucide";
import { PendingActionSummary } from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { TranslatePipe } from "../../../../core/localization/translate.pipe";

/** Confirmation card for a record change proposed by the assistant. */
@Component({
  selector: "law-pending-action-card",
  standalone: true,
  imports: [NgIcon, HlmButton, HlmSpinner, TranslatePipe],
  templateUrl: "./pending-action-card.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      lucideCheck,
      lucideCircleAlert,
      lucideClock,
      lucideShieldQuestion,
      lucideX,
    }),
  ],
})
export class PendingActionCardComponent {
  readonly action = input.required<PendingActionSummary>();
  /** True while this card's decision request is in flight. */
  readonly busy = input(false);
  readonly approve = output<void>();
  readonly decline = output<void>();

  protected readonly pending = computed(
    () => this.action().status === "PENDING",
  );

  protected readonly icon = computed(() => {
    switch (this.action().status) {
      case "APPROVED":
        return "lucideCheck";
      case "DECLINED":
        return "lucideX";
      case "FAILED":
        return "lucideCircleAlert";
      case "EXPIRED":
        return "lucideClock";
      default:
        return "lucideShieldQuestion";
    }
  });
}
