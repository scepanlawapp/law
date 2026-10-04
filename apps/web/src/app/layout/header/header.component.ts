import { Component, computed, inject, signal } from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideSearch,
  lucideBell,
  lucideCalendar,
  lucideCheckCheck,
  lucideClock3,
  lucidePlus,
  lucideTriangleAlert,
} from "@ng-icons/lucide";
import { Router } from "@angular/router";
import { NotificationDto, NotificationType } from "@law/api-interfaces";
import { HlmDropdownMenuImports } from "@spartan-ng/helm/dropdown-menu";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInputGroupImports } from "@spartan-ng/helm/input-group";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { LocalizationService } from "../../core/localization/localization.service";
import { NotificationsStore } from "../../core/notifications/notifications.store";
import { notificationTarget } from "../../core/notifications/notification-navigation";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { QuickCaptureDialogService } from "../../features/time/quick-capture/quick-capture-dialog.service";
import { HeaderTimerComponent } from "../../features/time/timer/header-timer.component";

const LEGAL_QUOTE_KEYS = Array.from(
  { length: 120 },
  (_, index) => `header.quote${String(index + 1).padStart(2, "0")}`,
);

const notificationIcon: Record<NotificationType, string> = {
  DEADLINE_ASSIGNED: "lucideClock3",
  DEADLINE_DUE_SOON: "lucideTriangleAlert",
  DEADLINE_DUE_TODAY: "lucideTriangleAlert",
  DEADLINE_OVERDUE: "lucideTriangleAlert",
  DEADLINE_CHANGED: "lucideClock3",
  TASK_ASSIGNED: "lucideCheckCheck",
  TASK_DUE_SOON: "lucideCheckCheck",
  TASK_DUE_TODAY: "lucideCheckCheck",
  TASK_OVERDUE: "lucideTriangleAlert",
  EVENT_UPCOMING: "lucideCalendar",
  EVENT_CHANGED: "lucideCalendar",
  EVENT_CANCELLED: "lucideCalendar",
  TIMER_RUNNING_LONG: "lucideClock3",
  TIME_REVIEW_REMINDER: "lucideCheckCheck",
  RETAINER_USAGE_80: "lucideTriangleAlert",
  RETAINER_USAGE_100: "lucideTriangleAlert",
};

@Component({
  selector: "law-header",
  standalone: true,
  templateUrl: "./header.component.html",
  imports: [
    NgIcon,
    ...HlmDropdownMenuImports,
    HlmButton,
    HlmInputGroupImports,
    HlmSpinner,
    HeaderTimerComponent,
    TranslatePipe,
  ],
  providers: [
    provideIcons({
      lucideSearch,
      lucideBell,
      lucideCalendar,
      lucideCheckCheck,
      lucideClock3,
      lucidePlus,
      lucideTriangleAlert,
    }),
  ],
})
export class HeaderComponent {
  private readonly router = inject(Router);
  private readonly localization = inject(LocalizationService);
  private readonly quickCapture = inject(QuickCaptureDialogService);
  readonly notifications = inject(NotificationsStore);
  readonly quoteKey = signal(
    LEGAL_QUOTE_KEYS[Math.floor(Math.random() * LEGAL_QUOTE_KEYS.length)],
  );
  readonly notificationAriaLabel = computed(() =>
    this.localization.translate("header.notificationsAria", {
      count: this.notifications.unreadCount(),
    }),
  );

  openQuickCapture(): void {
    this.quickCapture.open({ mode: "create" }).subscribe();
  }

  iconFor(type: NotificationType): string {
    return notificationIcon[type];
  }

  contextLabel(item: NotificationDto): string {
    return item.metadata?.caseName ?? item.metadata?.clientName ?? "";
  }

  relativeTime(value: string): string {
    const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
    const formatter = new Intl.RelativeTimeFormat(
      this.localization.language() === "EN" ? "en" : "sr-Latn",
      { numeric: "auto" },
    );
    const ranges: Array<[Intl.RelativeTimeFormatUnit, number]> = [
      ["year", 31_536_000],
      ["month", 2_592_000],
      ["week", 604_800],
      ["day", 86_400],
      ["hour", 3_600],
      ["minute", 60],
    ];
    for (const [unit, size] of ranges) {
      if (Math.abs(seconds) >= size) {
        return formatter.format(Math.round(seconds / size), unit);
      }
    }
    return formatter.format(seconds, "second");
  }

  openNotification(item: NotificationDto): void {
    this.notifications.markRead(item);
    const target = notificationTarget(item);
    if (target) {
      void this.router.navigate(target.commands, {
        queryParams: target.queryParams,
      });
    }
  }
}
