import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { NoteDetail, NoteType } from "@law/api-interfaces";
import { NoteRequest, WorkManagementApiClient } from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { LocalizationService } from "../../../core/localization/localization.service";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { dateTimeInputValue } from "../work-management-utils";
import { NoteDialogContext } from "./note-dialog.models";

@Component({
  selector: "law-note-dialog",
  standalone: true,
  templateUrl: "./note-dialog.component.html",
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
export class NoteDialogComponent {
  private readonly api = inject(WorkManagementApiClient);
  private readonly context = injectBrnDialogContext<NoteDialogContext>();
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly dialogRef = inject(BrnDialogRef<NoteDetail>);
  readonly saving = signal(false);
  readonly editing = Boolean(this.context.note);
  readonly types: NoteType[] = [
    "GENERAL",
    "CALL_SUMMARY",
    "MEETING_SUMMARY",
    "CASE_UPDATE",
  ];
  readonly noteTypeItemToString = (value: string | null | undefined): string =>
    value
      ? this.localization.translate(`work.noteType.${value.toLowerCase()}`)
      : "";
  readonly form = new FormGroup({
    type: new FormControl<NoteType>(
      this.context.note?.type ?? this.context.type ?? "GENERAL",
      { nonNullable: true },
    ),
    body: new FormControl(this.context.note?.body ?? "", {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(10000)],
    }),
    occurredAt: new FormControl(
      dateTimeInputValue(this.context.note?.occurredAt) ||
        dateTimeInputValue(new Date().toISOString()),
      { nonNullable: true, validators: [Validators.required] },
    ),
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const request: NoteRequest = {
      type: value.type,
      body: value.body,
      occurredAt: new Date(value.occurredAt).toISOString(),
      caseId: this.context.caseId ?? this.context.note?.case?.id ?? undefined,
      clientId:
        this.context.clientId ?? this.context.note?.client?.id ?? undefined,
      eventId: this.context.eventId ?? this.context.note?.eventId ?? undefined,
    };
    this.saving.set(true);
    const operation = this.context.note
      ? this.api.updateNote(this.context.note.id, request)
      : this.api.createNote(request);
    operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (note) => this.dialogRef.close(note),
      error: () => this.saving.set(false),
    });
  }
}
