import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import {
  CasePriority,
  CaseSummary,
  TaskDetail,
  TaskStatus,
} from "@law/api-interfaces";
import {
  CasesApiClient,
  ReferencesApiClient,
  TaskRequest,
  WorkManagementApiClient,
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
import {
  dateInputValue,
  dateTimeInputValue,
  DueTargetMode,
  taskDueMode,
} from "../work-management-utils";
import { TaskDialogContext } from "./task-dialog.models";

@Component({
  selector: "law-task-dialog",
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
  private readonly casesApi = inject(CasesApiClient);
  private readonly references = inject(ReferencesApiClient);
  private readonly auth = inject(AuthState);
  private readonly context = injectBrnDialogContext<TaskDialogContext>();
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly dialogRef = inject(BrnDialogRef<TaskDetail>);
  readonly users = signal<Array<{ id: string; name: string }>>([]);
  readonly cases = signal<CaseSummary[]>([]);
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
  readonly taskStatusItemToString = (
    value: string | null | undefined,
  ): string =>
    value
      ? this.localization.translate(`work.taskStatus.${value.toLowerCase()}`)
      : "";
  readonly priorityItemToString = (value: string | null | undefined): string =>
    value
      ? this.localization.translate(`work.priority.${value.toLowerCase()}`)
      : "";
  readonly dueModeItemToString = (value: string | null | undefined): string =>
    value
      ? this.localization.translate(`work.dueMode.${value.toLowerCase()}`)
      : "";
  readonly userItemToString = (value: string | null | undefined): string =>
    this.users().find((user) => user.id === value)?.name ?? "";
  readonly caseItemToString = (value: string | null | undefined): string => {
    if (!value) return this.localization.translate("work.noCase");
    const caseItem = this.cases().find((item) => item.id === value);
    return caseItem ? `${caseItem.caseNumber} — ${caseItem.name}` : value;
  };
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
    assigneeUserId: new FormControl(
      this.context.task?.assigneeUser.id ?? this.auth.session()?.user.id ?? "",
      { nonNullable: true, validators: [Validators.required] },
    ),
    caseId: new FormControl(
      this.context.caseId ?? this.context.task?.case?.id ?? "",
      { nonNullable: true },
    ),
    dueMode: new FormControl<DueTargetMode>(taskDueMode(this.context.task), {
      nonNullable: true,
    }),
    dueDate: new FormControl(dateInputValue(this.context.task?.dueDate), {
      nonNullable: true,
    }),
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
    const request: TaskRequest = {
      title: value.title,
      description: value.description || undefined,
      status: value.status,
      priority: value.priority,
      assigneeUserId: value.assigneeUserId,
      caseId: value.caseId || undefined,
      clientId:
        this.context.clientId ?? this.context.task?.client?.id ?? undefined,
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
