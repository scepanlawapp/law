import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { EventDetail } from "@law/api-interfaces";
import { EventRequest, EventsApiClient } from "@law/api-clients";
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
  readonly dialogRef = inject(BrnDialogRef<EventDetail>);
  private readonly context = injectBrnDialogContext<EventDialogContext>();
  private readonly destroyRef = inject(DestroyRef);
  readonly saving = signal(false);
  readonly eventId =
    this.context.item?.sourceType === "EVENT"
      ? this.context.item.sourceId
      : undefined;
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
  });

  constructor() {
    const item = this.context.item;
    if (item?.sourceType === "EVENT") {
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
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const request: EventRequest = {
      ...value,
      description: value.description || undefined,
      location: value.location || undefined,
      meetingUrl: value.meetingUrl || undefined,
      startsAt: new Date(value.startsAt).toISOString(),
      endsAt: new Date(value.endsAt).toISOString(),
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
