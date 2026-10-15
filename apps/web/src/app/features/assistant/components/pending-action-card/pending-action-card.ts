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
  lucideSquarePen,
  lucideShieldQuestion,
  lucideX,
  lucideZap,
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
      lucideSquarePen,
      lucideShieldQuestion,
      lucideX,
      lucideZap,
    }),
  ],
})
export class PendingActionCardComponent {
  readonly action = input.required<PendingActionSummary>();
  /** True while this card's decision request is in flight. */
  readonly busy = input(false);
  readonly approve = output<void>();
  readonly decline = output<void>();
  /** FORM mode: open the prefilled form so the user can check and save it. */
  readonly openForm = output<void>();
  /** Opens the record an executed action created. */
  readonly openResult = output<void>();

  protected readonly isForm = computed(() => this.action().mode === "FORM");
  protected readonly isAuto = computed(() => this.action().mode === "AUTO");
  protected readonly resultType = computed(() =>
    this.action().status === "APPROVED" && this.action().resultEntityId
      ? (this.action().resultEntityType ?? null)
      : null,
  );
  /** Work saved without review is only proposed until the lawyer confirms it. */
  protected readonly autoLabel = computed(() =>
    this.action().actionType === "log_work_entry"
      ? "assistant.pendingAction.status.AUTO_PROPOSED"
      : "assistant.pendingAction.status.AUTO",
  );

  protected readonly pending = computed(
    () => this.action().status === "PENDING",
  );

  protected readonly icon = computed(() => {
    switch (this.action().status) {
      case "APPROVED":
        return this.isAuto() ? "lucideZap" : "lucideCheck";
      case "DECLINED":
        return "lucideX";
      case "FAILED":
        return "lucideCircleAlert";
      case "EXPIRED":
        return "lucideClock";
      default:
        return this.isForm() ? "lucideSquarePen" : "lucideShieldQuestion";
    }
  });
}
