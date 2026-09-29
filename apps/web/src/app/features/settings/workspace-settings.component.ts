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
import {
  createSelectItemToString,
  type SelectOption,
} from "../../shared/utils";
import { HlmSpinner } from "@spartan-ng/helm/spinner";

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
  readonly dateTimeFormatOptions: ReadonlyArray<
    SelectOption<UserSettingsDateTimeFormat>
  > = [
    { value: "TWENTY_FOUR_HOUR", label: "settings.twentyFourHour" },
    { value: "TWELVE_HOUR", label: "settings.twelveHour" },
  ];
  readonly timeZoneOptions: ReadonlyArray<SelectOption<string>> = [
    { value: "Europe/Belgrade", label: "settings.belgrade" },
    { value: "Europe/London", label: "settings.london" },
    { value: "America/New_York", label: "settings.newYork" },
  ];
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
    }),
    dateTimeFormat: new FormControl<UserSettingsDateTimeFormat>(
      "TWENTY_FOUR_HOUR",
      { nonNullable: true },
    ),
    timeZone: new FormControl("Europe/Belgrade", { nonNullable: true }),
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
