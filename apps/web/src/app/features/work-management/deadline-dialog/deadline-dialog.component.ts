import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { DeadlineDetail, DeadlineType } from "@law/api-interfaces";
import {
  DeadlineRequest,
  ReferencesApiClient,
  WorkManagementApiClient,
} from "@law/api-clients";
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
import {
  dateInputValue,
  dateTimeInputValue,
  deadlineDueMode,
  todayDateInputValue,
} from "../work-management-utils";
import { DeadlineDialogContext } from "./deadline-dialog.models";

type DeadlineDueMode = "DATE" | "DATE_TIME";

@Component({
  selector: "law-deadline-dialog",
  standalone: true,
  templateUrl: "./deadline-dialog.component.html",
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
export class DeadlineDialogComponent {
  private readonly api = inject(WorkManagementApiClient);
  private readonly references = inject(ReferencesApiClient);
  private readonly context = injectBrnDialogContext<DeadlineDialogContext>();
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly dialogRef = inject(BrnDialogRef<DeadlineDetail>);
  readonly users = signal<Array<{ id: string; name: string }>>([]);
  readonly saving = signal(false);
  readonly editing = Boolean(this.context.deadline);
  readonly types: DeadlineType[] = [
    "COURT",
    "STATUTORY",
    "CONTRACTUAL",
    "INTERNAL",
    "OTHER",
  ];
  readonly dueModes: DeadlineDueMode[] = ["DATE", "DATE_TIME"];
  readonly deadlineTypeItemToString = (
    value: string | null | undefined,
  ): string =>
    value
      ? this.localization.translate(`work.deadlineType.${value.toLowerCase()}`)
      : "";
  readonly dueModeItemToString = (value: string | null | undefined): string =>
    value
      ? this.localization.translate(`work.dueMode.${value.toLowerCase()}`)
      : "";
  readonly userItemToString = (value: string | null | undefined): string =>
    this.users().find((user) => user.id === value)?.name ?? "";
  readonly form = new FormGroup({
    title: new FormControl(this.context.deadline?.title ?? "", {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(320)],
    }),
    description: new FormControl(this.context.deadline?.description ?? "", {
      nonNullable: true,
    }),
    type: new FormControl<DeadlineType>(
      this.context.deadline?.type ?? "INTERNAL",
      { nonNullable: true },
    ),
    dueMode: new FormControl<DeadlineDueMode>(
      deadlineDueMode(this.context.deadline),
      { nonNullable: true },
    ),
    dueDate: new FormControl(
      dateInputValue(this.context.deadline?.dueDate) ||
        (this.context.deadline ? "" : todayDateInputValue()),
      {
        nonNullable: true,
      },
    ),
    dueAt: new FormControl(dateTimeInputValue(this.context.deadline?.dueAt), {
      nonNullable: true,
    }),
    responsibleUserId: new FormControl(
      this.context.deadline?.responsibleUserId ?? "",
      { nonNullable: true, validators: [Validators.required] },
    ),
    sourceDescription: new FormControl(
      this.context.deadline?.sourceDescription ?? "",
      { nonNullable: true },
    ),
  });

  constructor() {
    this.form.controls.dueMode.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((mode) => {
        if (mode !== "DATE") this.form.controls.dueDate.setValue("");
        if (mode !== "DATE_TIME") this.form.controls.dueAt.setValue("");
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
        if (!this.form.controls.responsibleUserId.value && this.users()[0]) {
          this.form.controls.responsibleUserId.setValue(this.users()[0].id);
        }
      });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const request: DeadlineRequest = {
      title: value.title,
      description: value.description || undefined,
      type: value.type,
      timeZone: "Europe/Belgrade",
      responsibleUserId: value.responsibleUserId,
      sourceDescription: value.sourceDescription || undefined,
      caseId: this.context.caseId ?? this.context.deadline?.caseId ?? undefined,
      clientId:
        this.context.clientId ?? this.context.deadline?.clientId ?? undefined,
      dueDate: value.dueMode === "DATE" ? value.dueDate : undefined,
      dueAt:
        value.dueMode === "DATE_TIME"
          ? this.toIsoDateTime(value.dueAt)
          : undefined,
    };
    if (value.dueMode === "DATE" && !request.dueDate) {
      this.form.controls.dueDate.setErrors({ required: true });
      return;
    }
    if (value.dueMode === "DATE_TIME" && !value.dueAt) {
      this.form.controls.dueAt.setErrors({ required: true });
      return;
    }
    this.saving.set(true);
    const operation = this.context.deadline
      ? this.api.updateDeadline(this.context.deadline.id, request)
      : this.api.createDeadline(request);
    operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (deadline) => this.dialogRef.close(deadline),
      error: () => this.saving.set(false),
    });
  }

  private toIsoDateTime(value: string): string {
    return new Date(value).toISOString();
  }
}
