import { Component, DestroyRef, effect, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSwitch } from "@spartan-ng/helm/switch";
import {
  NotificationPreferences,
  UserSettingsDateTimeFormat,
} from "@law/api-interfaces";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { UserSettingsStore } from "../../core/user-settings/user-settings.store";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import {
  createSelectItemToString,
  DATE_TIME_FORMAT_LABELS,
  OFFICE_TIME_ZONE,
  optionsFrom,
  TIME_ZONE_LABELS,
} from "../../shared/models";

@Component({
  selector: "law-workspace-settings",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmField,
    HlmFieldLabel,
    HlmSelectImports,
    HlmSwitch,
    TranslatePipe,
    HlmSpinner,
  ],
  templateUrl: "./workspace-settings.component.html",
  styleUrl: "./settings-pages.component.scss",
  host: {
    class: "block min-w-0",
  },
})
export class WorkspaceSettingsComponent {
  private readonly settingsStore = inject(UserSettingsStore);
  private readonly localization = inject(LocalizationService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly preferences = this.settingsStore.preferences;
  readonly loading = this.settingsStore.loading;
  readonly saving = signal(false);
  readonly dateTimeFormatOptions = optionsFrom(DATE_TIME_FORMAT_LABELS);
  readonly timeZoneOptions = optionsFrom(TIME_ZONE_LABELS);
  readonly notificationGroups: ReadonlyArray<{
    title: string;
    items: ReadonlyArray<{
      key: keyof NotificationPreferences;
      label: string;
    }>;
  }> = [
    {
      title: "settings.notificationDeadlines",
      items: [
        {
          key: "deadlineAssigned",
          label: "settings.notificationDeadlineAssigned",
        },
        {
          key: "deadlineDueSoon",
          label: "settings.notificationDeadlineDueSoon",
        },
        {
          key: "deadlineDueToday",
          label: "settings.notificationDeadlineDueToday",
        },
        {
          key: "deadlineOverdue",
          label: "settings.notificationDeadlineOverdue",
        },
        {
          key: "deadlineChanged",
          label: "settings.notificationDeadlineChanged",
        },
      ],
    },
    {
      title: "settings.notificationTasks",
      items: [
        { key: "taskAssigned", label: "settings.notificationTaskAssigned" },
        { key: "taskDueSoon", label: "settings.notificationTaskDueSoon" },
        { key: "taskDueToday", label: "settings.notificationTaskDueToday" },
        { key: "taskOverdue", label: "settings.notificationTaskOverdue" },
      ],
    },
    {
      title: "settings.notificationEvents",
      items: [
        { key: "eventUpcoming", label: "settings.notificationEventUpcoming" },
        { key: "eventChanged", label: "settings.notificationEventChanged" },
        { key: "eventCancelled", label: "settings.notificationEventCancelled" },
      ],
    },
    {
      title: "settings.notificationTime",
      items: [
        {
          key: "timerRunningLong",
          label: "settings.notificationTimerRunningLong",
        },
        {
          key: "timeReviewReminder",
          label: "settings.notificationTimeReviewReminder",
        },
        {
          key: "retainerUsage",
          label: "settings.notificationRetainerUsage",
        },
      ],
    },
  ];
  readonly dateTimeFormatItemToString = createSelectItemToString(
    this.dateTimeFormatOptions,
    (key) => this.localization.translate(key),
  );
  readonly timeZoneItemToString = createSelectItemToString(
    this.timeZoneOptions,
    (key) => this.localization.translate(key),
  );
  readonly form = new FormGroup({
    workspaceNotifications: new FormControl(true, { nonNullable: true }),
    notificationPreferences: new FormGroup<{
      [K in keyof NotificationPreferences]: FormControl<boolean>;
    }>({
      deadlineAssigned: new FormControl(true, { nonNullable: true }),
      deadlineDueSoon: new FormControl(true, { nonNullable: true }),
      deadlineDueToday: new FormControl(true, { nonNullable: true }),
      deadlineOverdue: new FormControl(true, { nonNullable: true }),
      deadlineChanged: new FormControl(true, { nonNullable: true }),
      taskAssigned: new FormControl(true, { nonNullable: true }),
      taskDueSoon: new FormControl(true, { nonNullable: true }),
      taskDueToday: new FormControl(true, { nonNullable: true }),
      taskOverdue: new FormControl(true, { nonNullable: true }),
      eventUpcoming: new FormControl(true, { nonNullable: true }),
      eventChanged: new FormControl(true, { nonNullable: true }),
      eventCancelled: new FormControl(true, { nonNullable: true }),
      timerRunningLong: new FormControl(true, { nonNullable: true }),
      timeReviewReminder: new FormControl(true, { nonNullable: true }),
      retainerUsage: new FormControl(true, { nonNullable: true }),
    }),
    dateTimeFormat: new FormControl<UserSettingsDateTimeFormat>(
      UserSettingsDateTimeFormat.TWENTY_FOUR_HOUR,
      { nonNullable: true },
    ),
    timeZone: new FormControl<string>(OFFICE_TIME_ZONE, { nonNullable: true }),
  });
  constructor() {
    effect(() => {
      const preferences = this.preferences();
      if (preferences && this.form.pristine) {
        this.form.patchValue(preferences);
      }
    });
  }
  save(): void {
    this.saving.set(true);
    this.settingsStore
      .update({ preferences: this.form.getRawValue() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.form.markAsPristine();
          this.toast.success(
            this.localization.translate("settings.workspaceSaved"),
          );
          this.saving.set(false);
        },
        error: () => {
          this.toast.error(
            this.localization.translate("settings.workspaceSaveError"),
          );
          this.saving.set(false);
        },
      });
  }
}
