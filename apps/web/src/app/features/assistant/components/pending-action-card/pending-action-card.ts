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
  lucideUndo2,
  lucideX,
  lucideZap,
} from "@ng-icons/lucide";
import {
  PendingActionMode,
  PendingActionStatus,
  PendingActionSummary,
  PendingActionType,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { TranslatePipe } from "../../../../core/localization/translate.pipe";
import {
  PENDING_ACTION_RESULT_LABELS,
  PENDING_ACTION_STATUS_LABELS,
} from "../../../../shared/models";

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
      lucideUndo2,
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
  /** AUTO: reverts the automatic save. */
  readonly undo = output<void>();

  protected readonly undone = computed(() => !!this.action().undoneAt);
  protected readonly statusLabels = PENDING_ACTION_STATUS_LABELS;
  protected readonly resultLabels = PENDING_ACTION_RESULT_LABELS;

  protected readonly isForm = computed(
    () => this.action().mode === PendingActionMode.FORM,
  );
  protected readonly isAuto = computed(
    () => this.action().mode === PendingActionMode.AUTO,
  );
  protected readonly executed = computed(
    () => this.action().status === PendingActionStatus.APPROVED,
  );
  protected readonly failed = computed(
    () => this.action().status === PendingActionStatus.FAILED,
  );
  protected readonly resultType = computed(() =>
    this.executed() && !this.undone() && this.action().resultEntityId
      ? (this.action().resultEntityType ?? null)
      : null,
  );
  /** Work saved without review is only proposed until the lawyer confirms it. */
  protected readonly autoLabel = computed(() =>
    this.action().actionType === PendingActionType.LOG_WORK_ENTRY
      ? "assistant.pendingAction.status.AUTO_PROPOSED"
      : "assistant.pendingAction.status.AUTO",
  );

  protected readonly pending = computed(
    () => this.action().status === PendingActionStatus.PENDING,
  );

  protected readonly icon = computed(() => {
    switch (this.action().status) {
      case PendingActionStatus.APPROVED:
        if (this.undone()) return "lucideUndo2";
        return this.isAuto() ? "lucideZap" : "lucideCheck";
      case PendingActionStatus.DECLINED:
        return "lucideX";
      case PendingActionStatus.FAILED:
        return "lucideCircleAlert";
      case PendingActionStatus.EXPIRED:
        return "lucideClock";
      default:
        return this.isForm() ? "lucideSquarePen" : "lucideShieldQuestion";
    }
  });
}
