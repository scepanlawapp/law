import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  signal,
} from "@angular/core";
import { WorkEntriesApiClient } from "@law/api-clients";
import { StartTimerRequest, WorkEntry } from "@law/api-interfaces";
import { LocalizationService } from "../../../core/localization/localization.service";
import { ToastService } from "../../../shared/ui/toast/toast.service";
import { QuickCaptureDialogService } from "../quick-capture/quick-capture-dialog.service";

export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
}

/**
 * The current user's running timer. `running` also holds a stopped timer whose
 * time has not been confirmed yet (`timerStartedAt` is null): the API keeps
 * such an entry RUNNING until it is confirmed, so it must stay reachable.
 */
@Injectable({ providedIn: "root" })
export class WorkTimerStore {
  private readonly api = inject(WorkEntriesApiClient);
  private readonly dialog = inject(QuickCaptureDialogService);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);
  private readonly now = signal(Date.now());
  private tick: ReturnType<typeof setInterval> | null = null;

  private readonly current = signal<WorkEntry | null>(null);
  readonly running = this.current.asReadonly();
  readonly elapsedSeconds = computed(() => {
    const startedAt = this.current()?.timerStartedAt;
    if (!startedAt) return 0;
    return Math.max(0, Math.floor((this.now() - Date.parse(startedAt)) / 1000));
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopTicking());
  }

  load(): void {
    this.api.runningTimer().subscribe({
      next: (entry) => this.setRunning(entry),
      error: () => this.setRunning(null),
    });
  }

  start(request: StartTimerRequest): void {
    this.api.startTimer(request).subscribe({
      next: (entry) => this.setRunning(entry),
      error: () =>
        this.toast.error(this.localization.translate("time.timer.startError")),
    });
  }

  stop(): void {
    const running = this.current();
    if (!running) return;
    if (!running.timerStartedAt) {
      this.confirm(running);
      return;
    }
    this.api.stopTimer().subscribe({
      next: (stopped) => {
        this.setRunning(stopped);
        this.confirm(stopped);
      },
      error: () =>
        this.toast.error(this.localization.translate("time.timer.stopError")),
    });
  }

  private confirm(entry: WorkEntry): void {
    this.dialog
      .open({
        mode: "confirm-timer",
        entryId: entry.id,
        clientId: entry.client.id,
        caseId: entry.case?.id,
        minutes: entry.minutes ?? undefined,
        requireMinutes: true,
        title: entry.title || undefined,
        description: entry.description || undefined,
        workDate: entry.workDate,
      })
      .subscribe((saved) => {
        if (saved) this.setRunning(null);
      });
  }

  private setRunning(entry: WorkEntry | null): void {
    this.current.set(entry);
    this.stopTicking();
    if (entry?.timerStartedAt) {
      this.now.set(Date.now());
      this.tick = setInterval(() => this.now.set(Date.now()), 1000);
    }
  }

  private stopTicking(): void {
    if (this.tick !== null) clearInterval(this.tick);
    this.tick = null;
  }
}
