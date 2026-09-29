import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { CaseSummary, EventDetail } from "@law/api-interfaces";
import {
  CasesApiClient,
  EventRequest,
  EventsApiClient,
  ReferencesApiClient,
} from "@law/api-clients";
import { AuthState } from "@law/security";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import { LocalizationService } from "../../../core/localization/localization.service";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { EventDialogContext } from "./event-dialog.models";

function localDateTime(value: string): string {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

@Component({
  selector: "law-event-dialog",
  standalone: true,
  templateUrl: "./event-dialog.component.html",
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmField,
    HlmFieldLabel,
    HlmInput,
    HlmSelectImports,
    HlmSpinner,
    HlmTextarea,
    TranslatePipe,
  ],
})
export class EventDialogComponent {
  private readonly api = inject(EventsApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly references = inject(ReferencesApiClient);
  private readonly auth = inject(AuthState);
  private readonly localization = inject(LocalizationService);
  readonly dialogRef = inject(BrnDialogRef<EventDetail>);
  private readonly context = injectBrnDialogContext<EventDialogContext>();
  private readonly destroyRef = inject(DestroyRef);
  readonly saving = signal(false);
  readonly users = signal<Array<{ id: string; name: string }>>([]);
  readonly cases = signal<CaseSummary[]>([]);
  readonly eventId =
    this.context.event?.id ??
    (this.context.item?.sourceType === "EVENT"
      ? this.context.item.sourceId
      : undefined);
  readonly userItemToString = (value: string | null | undefined): string =>
    this.users().find((user) => user.id === value)?.name ?? "";
  readonly caseItemToString = (value: string | null | undefined): string => {
    if (!value) return this.localization.translate("work.noCase");
    const caseItem = this.cases().find((item) => item.id === value);
    return caseItem ? `${caseItem.caseNumber} — ${caseItem.name}` : value;
  };
  readonly form = new FormGroup({
    type: new FormControl<"MEETING" | "HEARING" | "CALL" | "OTHER">("MEETING", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    title: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(320)],
    }),
    description: new FormControl("", { nonNullable: true }),
    startsAt: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    endsAt: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    timeZone: new FormControl("Europe/Belgrade", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    location: new FormControl("", { nonNullable: true }),
    meetingUrl: new FormControl("", { nonNullable: true }),
    responsibleUserId: new FormControl(
      this.context.event?.assigneeUsers[0]?.id ??
        this.context.event?.organizerUser.id ??
        this.context.item?.assigneeUsers[0]?.id ??
        this.context.item?.responsibleUser?.id ??
        this.auth.session()?.user.id ??
        "",
      { nonNullable: true, validators: [Validators.required] },
    ),
    caseId: new FormControl(
      this.context.event?.case?.id ?? this.context.item?.case?.id ?? "",
      {
        nonNullable: true,
      },
    ),
  });

  constructor() {
    const event = this.context.event;
    const item = this.context.item;
    if (event) {
      this.form.patchValue({
        type: event.type,
        title: event.title,
        description: event.description ?? "",
        startsAt: localDateTime(event.startsAt),
        endsAt: localDateTime(event.endsAt),
        timeZone: event.timeZone,
        location: event.location ?? "",
        meetingUrl: event.meetingUrl ?? "",
      });
    } else if (item?.sourceType === "EVENT") {
      this.form.patchValue({
        title: item.title,
        startsAt: item.startsAt ? localDateTime(item.startsAt) : "",
        endsAt: item.endsAt ? localDateTime(item.endsAt) : "",
      });
    } else if (this.context.date) {
      const hour = String(this.context.hour ?? 9).padStart(2, "0");
      this.form.patchValue({
        startsAt: `${this.context.date}T${hour}:00`,
        endsAt: `${this.context.date}T${String((this.context.hour ?? 9) + 1).padStart(2, "0")}:00`,
      });
    }

    this.form.controls.startsAt.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((startsAt) => {
        this.form.controls.endsAt.setValue(startsAt);
      });

    this.references
      .users()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((users) => {
        this.users.set(
          users.map((membership) => ({
            id: membership.userId,
            name:
              [membership.user.firstName, membership.user.lastName]
                .filter(Boolean)
                .join(" ") || membership.user.email,
          })),
        );
      });
    this.casesApi
      .list({ page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((response) => this.cases.set(response.items));
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const { responsibleUserId, caseId, ...eventValue } = value;
    const request: EventRequest = {
      ...eventValue,
      description: value.description || undefined,
      location: value.location || undefined,
      meetingUrl: value.meetingUrl || undefined,
      startsAt: new Date(value.startsAt).toISOString(),
      endsAt: new Date(value.endsAt).toISOString(),
      caseId: caseId || undefined,
      assigneeUserIds: [responsibleUserId],
    };
    if (new Date(request.endsAt) <= new Date(request.startsAt)) {
      this.form.controls.endsAt.setErrors({ order: true });
      return;
    }
    this.saving.set(true);
    const operation = this.eventId
      ? this.api.update(this.eventId, request)
      : this.api.create(request);
    operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (event) => this.dialogRef.close(event),
      error: () => this.saving.set(false),
    });
  }
}
