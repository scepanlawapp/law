import { inject, Injectable, signal } from "@angular/core";
import { WorkEntriesApiClient } from "@law/api-clients";
import { EventSummary } from "@law/api-interfaces";
import { take } from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { ToastService } from "../../../shared/ui/toast/toast.service";
import { QuickCaptureDialogService } from "../quick-capture/quick-capture-dialog.service";

export interface CompletionPromptSource {
  sourceType: "TASK" | "EVENT" | "DEADLINE";
  sourceId: string;
  title: string;
  defaultMinutes?: number;
}

/** The prompt closes by itself, as a skip, when nobody touches it. */
export const COMPLETION_PROMPT_TIMEOUT_MS = 20_000;

const MAX_MINUTES = 1440;

/** A timed event's length in minutes, when it is a plausible amount of work. */
export function eventDefaultMinutes(
  event: Pick<EventSummary, "startsAt" | "endsAt" | "isAllDay">,
): number | undefined {
  if (event.isAllDay) return undefined;
  const minutes = Math.round(
    (new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()) /
      60_000,
  );
  return minutes >= 1 && minutes <= MAX_MINUTES ? minutes : undefined;
}

/**
 * Asks "how long did it take?" after a task, event or deadline is completed.
 * The backend has already created a PROPOSED entry, so skipping loses nothing.
 */
@Injectable({ providedIn: "root" })
export class CompletionPromptService {
  private readonly workEntries = inject(WorkEntriesApiClient);
  private readonly quickCapture = inject(QuickCaptureDialogService);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);
  private timer: ReturnType<typeof setTimeout> | undefined;

  private readonly state = signal<CompletionPromptSource | null>(null);
  /** The prompt being shown, or `null`. */
  readonly current = this.state.asReadonly();

  /** Shows the prompt, replacing any previous one. */
  prompt(source: CompletionPromptSource): void {
    this.clearTimer();
    this.state.set(source);
    this.timer = setTimeout(() => this.skip(), COMPLETION_PROMPT_TIMEOUT_MS);
  }

  confirm(minutes: number): void {
    const source = this.state();
    if (!source) return;
    this.close();
    this.workEntries
      .confirmFromSource({
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        minutes,
      })
      .pipe(take(1))
      .subscribe({
        next: () =>
          this.toast.success(
            this.localization.translate("time.completion.saved", { minutes }),
          ),
        // The entry stays PROPOSED and can still be confirmed from the review.
        error: () =>
          this.toast.error(
            this.localization.translate("time.completion.saveError"),
          ),
      });
  }

  other(): void {
    const source = this.state();
    if (!source) return;
    this.close();
    this.quickCapture
      .open({
        mode: "confirm-source",
        source: { sourceType: source.sourceType, sourceId: source.sourceId },
        ...(source.defaultMinutes ? { minutes: source.defaultMinutes } : {}),
      })
      .pipe(take(1))
      .subscribe();
  }

  skip(): void {
    this.close();
  }

  private close(): void {
    this.clearTimer();
    this.state.set(null);
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
