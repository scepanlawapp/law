import { Component, DestroyRef, computed, inject } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideArrowUp,
  lucideBot,
  lucideCalendarPlus,
  lucideCalendar,
  lucideCheckCheck,
  lucideClock,
  lucideFilePlus,
  lucideFolderPlus,
  lucideSparkles,
  lucideSquareCheck,
  lucideTriangleAlert,
  lucideUserPlus,
} from "@ng-icons/lucide";
import {
  HlmTable,
  HlmTableContainer,
  HlmTBody,
  HlmTd,
  HlmTh,
  HlmTHead,
  HlmTr,
} from "@spartan-ng/helm/table";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import {
  CalendarItem,
  DeadlineDetail,
  NotificationDto,
  NotificationType,
  TaskDetail,
} from "@law/api-interfaces";
import { WorkManagementApiClient } from "@law/api-clients";
import { AuthState } from "@law/security";
import { ActivityFeedComponent } from "../../shared/components/activity-feed/activity-feed.component";
import { DashboardStatCardComponent } from "../../shared/components/dashboard-stat-card/dashboard-stat-card.component";
import { ObligationListComponent } from "../../shared/components/obligation-list/obligation-list.component";
import { SectionPanelComponent } from "../../shared/components/section-panel/section-panel.component";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ClientFormDialogService } from "../clients/client-create-edit-modal/client-form-dialog.service";
import { EventDialogService } from "../calendar/event-dialog/event-dialog.service";
import { DeadlineDialogService } from "../work-management/deadline-dialog/deadline-dialog.service";
import { TaskDialogService } from "../work-management/task-dialog/task-dialog.service";
import { todayDateInputValue } from "../work-management/work-management-utils";
import { ObligationItem, obligationToCalendarItem } from "./dashboard.models";
import { DashboardStore } from "./dashboard.store";
import { UserSettingsStore } from "../../core/user-settings/user-settings.store";
import { nameInVocative } from "../../shared/utils";
import { NotificationsStore } from "../../core/notifications/notifications.store";
import { notificationTarget } from "../../core/notifications/notification-navigation";

const PROMPT_SUGGESTION_KEYS = [
  "dashboard.suggestSummarizeCase",
  "dashboard.suggestDraftResponse",
  "dashboard.suggestExplainDeadline",
  "dashboard.suggestFindSimilarCases",
] as const;

const NOTIFICATION_ICON: Record<NotificationType, string> = {
  DEADLINE_ASSIGNED: "lucideClock",
  DEADLINE_DUE_SOON: "lucideTriangleAlert",
  DEADLINE_DUE_TODAY: "lucideTriangleAlert",
  DEADLINE_OVERDUE: "lucideTriangleAlert",
  DEADLINE_CHANGED: "lucideClock",
  TASK_ASSIGNED: "lucideCheckCheck",
  TASK_DUE_SOON: "lucideCheckCheck",
  TASK_DUE_TODAY: "lucideCheckCheck",
  TASK_OVERDUE: "lucideTriangleAlert",
  EVENT_UPCOMING: "lucideCalendar",
  EVENT_CHANGED: "lucideCalendar",
  EVENT_CANCELLED: "lucideCalendar",
  TIMER_RUNNING_LONG: "lucideClock",
  TIME_REVIEW_REMINDER: "lucideCheckCheck",
  RETAINER_USAGE_80: "lucideTriangleAlert",
  RETAINER_USAGE_100: "lucideTriangleAlert",
};

@Component({
  selector: "law-dashboard",
  standalone: true,
  templateUrl: "./dashboard.component.html",
  styleUrls: ["./dashboard.component.scss"],
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmTable,
    HlmTableContainer,
    HlmTBody,
    HlmTd,
    HlmTh,
    HlmTHead,
    HlmTr,
    HlmButton,
    HlmInput,
    ActivityFeedComponent,
    DashboardStatCardComponent,
    ObligationListComponent,
    SectionPanelComponent,
    TranslatePipe,
  ],
  providers: [
    DashboardStore,
    provideIcons({
      lucideArrowUp,
      lucideBot,
      lucideCalendar,
      lucideCalendarPlus,
      lucideCheckCheck,
      lucideClock,
      lucideFilePlus,
      lucideFolderPlus,
      lucideSparkles,
      lucideSquareCheck,
      lucideTriangleAlert,
      lucideUserPlus,
    }),
  ],
})
export class DashboardComponent {
  protected readonly store = inject(DashboardStore);
  private readonly auth = inject(AuthState);
  private readonly router = inject(Router);
  private readonly localization = inject(LocalizationService);
  private readonly workApi = inject(WorkManagementApiClient);
  private readonly taskDialog = inject(TaskDialogService);
  private readonly deadlineDialog = inject(DeadlineDialogService);
  private readonly eventDialog = inject(EventDialogService);
  private readonly clientDialog = inject(ClientFormDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly settingsStore = inject(UserSettingsStore);
  protected readonly notifications = inject(NotificationsStore);

  protected readonly promptControl = new FormControl("", { nonNullable: true });
  protected readonly suggestionKeys = PROMPT_SUGGESTION_KEYS;
  protected readonly recentNotifications = computed(() =>
    this.notifications.items().slice(0, 4),
  );

  protected readonly greetingName = computed(() => {
    const profile = this.settingsStore.profile();
    const firstName = profile?.firstName?.trim();
    const lastName = profile?.lastName?.trim();
    const username = profile?.username?.trim();

    if (this.localization.language() === "SR" && firstName && profile?.gender) {
      return nameInVocative(firstName, profile.gender);
    }
    if (lastName && profile?.gender) {
      const salutation = this.localization.translate(
        profile.gender === "MALE"
          ? "dashboard.salutationMale"
          : "dashboard.salutationFemale",
      );
      return `${salutation} ${lastName}`;
    }
    if (firstName) return firstName;
    if (username) return username;

    let name = "";
    const user = this.auth.session()?.user;
    if (!user) return "";
    if (user.name?.trim()) name = user.name.trim();
    else name = (user.email.split("@", 1)[0] || "").split(/[._-]+/)[0] || "";
    return name;
  });

  constructor() {
    this.store.refreshAll();
    this.notifications.open();
  }

  protected applySuggestion(key: string): void {
    this.promptControl.setValue(this.localization.translate(key));
  }

  protected submitPrompt(): void {
    const prompt = this.promptControl.value.trim();
    if (!prompt) return;
    void this.router.navigate(["/assistant"], { queryParams: { prompt } });
  }

  protected openObligation(item: ObligationItem): void {
    if (item.sourceType === "EVENT") {
      this.openEventDialog(item);
      return;
    }
    if (item.sourceType === "TASK") {
      this.workApi
        .getTask(item.sourceId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((task) => this.openTaskDialog(task));
      return;
    }
    this.workApi
      .getDeadline(item.sourceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((deadline) => this.openDeadlineDialog(deadline));
  }

  private openEventDialog(item: ObligationItem): void {
    const calendarItem: CalendarItem = obligationToCalendarItem(item);
    this.eventDialog
      .open({ item: calendarItem })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) this.refreshAfterMutation();
      });
  }

  private openTaskDialog(task?: TaskDetail): void {
    this.taskDialog
      .open({ task })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) this.refreshAfterMutation();
      });
  }

  private openDeadlineDialog(deadline?: DeadlineDetail): void {
    this.deadlineDialog
      .open({ deadline })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) this.refreshAfterMutation();
      });
  }

  protected createCase(): void {
    void this.router.navigate(["/cases/new"]);
  }

  protected addClient(): void {
    this.clientDialog
      .create()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  protected createTask(): void {
    this.openTaskDialog(undefined);
  }

  protected addDeadline(): void {
    this.openDeadlineDialog(undefined);
  }

  protected scheduleEvent(): void {
    this.eventDialog
      .open({ date: todayDateInputValue(), hour: 9 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) this.refreshAfterMutation();
      });
  }

  protected notificationIcon(type: NotificationType): string {
    return NOTIFICATION_ICON[type];
  }

  protected notificationContext(item: NotificationDto): string {
    return item.metadata?.caseName ?? item.metadata?.clientName ?? "";
  }

  protected notificationRelativeTime(value: string): string {
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

  protected openNotification(item: NotificationDto): void {
    this.notifications.markRead(item);
    const target = notificationTarget(item);
    if (target) {
      void this.router.navigate(target.commands, {
        queryParams: target.queryParams,
      });
    }
  }

  private refreshAfterMutation(): void {
    this.store.loadStats();
    this.store.loadObligations();
    this.store.loadActivity();
    this.store.loadCasesPreview();
  }
}
