import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { CasePriority, TaskDetail, TaskStatus } from "@law/api-interfaces";
import {
  ReferencesApiClient,
  TaskRequest,
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
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import {
  dateInputValue,
  dateTimeInputValue,
  DueTargetMode,
  taskDueMode,
  todayDateInputValue,
} from "../work-management-utils";
import { TaskDialogContext } from "./task-dialog.models";

@Component({
  selector: "app-task-dialog",
  standalone: true,
  templateUrl: "./task-dialog.component.html",
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
export class TaskDialogComponent {
  private readonly api = inject(WorkManagementApiClient);
  private readonly references = inject(ReferencesApiClient);
  private readonly context = injectBrnDialogContext<TaskDialogContext>();
  private readonly destroyRef = inject(DestroyRef);
  readonly dialogRef = inject(BrnDialogRef<TaskDetail>);
  readonly users = signal<Array<{ id: string; name: string }>>([]);
  readonly saving = signal(false);
  readonly editing = Boolean(this.context.task);
  readonly priorities: CasePriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];
  readonly statuses: TaskStatus[] = [
    "TODO",
    "IN_PROGRESS",
    "DONE",
    "CANCELLED",
  ];
  readonly dueModes: DueTargetMode[] = ["NONE", "DATE", "DATE_TIME"];
  readonly form = new FormGroup({
    title: new FormControl(this.context.task?.title ?? "", {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(320)],
    }),
    description: new FormControl(this.context.task?.description ?? "", {
      nonNullable: true,
    }),
    status: new FormControl<TaskStatus>(this.context.task?.status ?? "TODO", {
      nonNullable: true,
    }),
    priority: new FormControl<CasePriority>(
      this.context.task?.priority ?? "NORMAL",
      { nonNullable: true },
    ),
    assigneeUserId: new FormControl(this.context.task?.assigneeUserId ?? "", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    dueMode: new FormControl<DueTargetMode>(
      this.context.task ? taskDueMode(this.context.task) : "DATE",
      {
        nonNullable: true,
      },
    ),
    dueDate: new FormControl(
      dateInputValue(this.context.task?.dueDate) ||
        (this.context.task ? "" : todayDateInputValue()),
      {
        nonNullable: true,
      },
    ),
    dueAt: new FormControl(dateTimeInputValue(this.context.task?.dueAt), {
      nonNullable: true,
    }),
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
        if (!this.form.controls.assigneeUserId.value && this.users()[0]) {
          this.form.controls.assigneeUserId.setValue(this.users()[0].id);
        }
      });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const request: TaskRequest = {
      title: value.title,
      description: value.description || undefined,
      status: value.status,
      priority: value.priority,
      assigneeUserId: value.assigneeUserId,
      caseId: this.context.caseId ?? this.context.task?.caseId ?? undefined,
      clientId:
        this.context.clientId ?? this.context.task?.clientId ?? undefined,
      deadlineId:
        this.context.deadlineId ?? this.context.task?.deadlineId ?? undefined,
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
    const operation = this.context.task
      ? this.api.updateTask(this.context.task.id, request)
      : this.api.createTask(request);
    operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (task) => this.dialogRef.close(task),
      error: () => this.saving.set(false),
    });
  }

  private toIsoDateTime(value: string): string {
    return new Date(value).toISOString();
  }
}
