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
  ClientSummary,
  TaskDetail,
  TaskStatus,
} from "@law/api-interfaces";
import {
  CasesApiClient,
  ClientsApiClient,
  ReferencesApiClient,
  TaskRequest,
  WorkManagementApiClient,
} from "@law/api-clients";
import { AuthState } from "@law/security";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmCombobox,
  HlmComboboxContent,
  HlmComboboxEmpty,
  HlmComboboxInput,
  HlmComboboxItem,
  HlmComboboxList,
  HlmComboboxPortal,
  HlmComboboxTrigger,
  HlmComboboxValue,
} from "@spartan-ng/helm/combobox";
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
import { TaskCompletionService } from "../task-completion.service";
import { TaskDialogContext } from "./task-dialog.models";
import {
  STATUS_BADGE_BASE_CLASSES,
  priorityBadgeClass,
  statusBadgeClass,
} from "../../../shared/status-badge";

@Component({
  selector: "law-task-dialog",
  standalone: true,
  templateUrl: "./task-dialog.component.html",
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmCombobox,
    HlmComboboxContent,
    HlmComboboxEmpty,
    HlmComboboxInput,
    HlmComboboxItem,
    HlmComboboxList,
    HlmComboboxPortal,
    HlmComboboxTrigger,
    HlmComboboxValue,
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
  readonly statusBadgeBaseClasses = STATUS_BADGE_BASE_CLASSES;
  readonly statusBadgeClass = statusBadgeClass;
  readonly priorityBadgeClass = priorityBadgeClass;
  private readonly api = inject(WorkManagementApiClient);
  private readonly taskCompletion = inject(TaskCompletionService);
  private readonly casesApi = inject(CasesApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly references = inject(ReferencesApiClient);
  private readonly auth = inject(AuthState);
  private readonly context = injectBrnDialogContext<TaskDialogContext>();
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly dialogRef = inject(BrnDialogRef<TaskDetail>);
  readonly users = signal<Array<{ id: string; name: string }>>([]);
  readonly cases = signal<CaseSummary[]>([]);
  readonly clients = signal<ClientSummary[]>([]);
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
  readonly clientItemToString = (value: string | null | undefined): string => {
    if (!value) return this.localization.translate("work.noClient");
    return (
      this.clients().find((client) => client.id === value)?.displayName ?? value
    );
  };
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
    clientId: new FormControl(
      this.context.clientId ?? this.context.task?.client?.id ?? "",
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
    this.form.controls.caseId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((caseId) => {
        if (!caseId) return;
        const caseItem = this.cases().find((item) => item.id === caseId);
        if (caseItem) {
          this.form.controls.clientId.setValue(caseItem.client.id, {
            emitEvent: false,
          });
        }
      });
    this.form.controls.clientId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((clientId) => {
        const caseId = this.form.controls.caseId.value;
        const caseItem = this.cases().find((item) => item.id === caseId);
        if (caseItem && caseItem.client.id !== clientId) {
          this.form.controls.caseId.setValue("", { emitEvent: false });
        }
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
      .subscribe((response) => {
        this.cases.set(response.items);
        const caseItem = response.items.find(
          (item) => item.id === this.form.controls.caseId.value,
        );
        if (caseItem && !this.form.controls.clientId.value) {
          this.form.controls.clientId.setValue(caseItem.client.id, {
            emitEvent: false,
          });
        }
      });
    this.clientsApi
      .list({ page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((response) => this.clients.set(response.items));
  }

  submit(): void {
    if (this.saving()) return;
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
      clientId: value.clientId || undefined,
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
    const completing =
      value.status === "DONE" && this.context.task?.status !== "DONE";
    const operation = completing
      ? this.taskCompletion.complete(request, this.context.task?.id)
      : this.context.task
        ? this.api.updateTask(this.context.task.id, request)
        : this.api.createTask(request);
    operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (task) => {
        this.saving.set(false);
        if (task) this.dialogRef.close(task);
        else
          this.form.controls.status.setValue(
            this.context.task?.status ?? "TODO",
          );
      },
      error: () => this.saving.set(false),
    });
  }

  setClientId(value: string | null | undefined): void {
    this.form.controls.clientId.setValue(value ?? "");
  }

  setCaseId(value: string | null | undefined): void {
    this.form.controls.caseId.setValue(value ?? "");
  }

  setAssigneeUserId(value: string | null | undefined): void {
    this.form.controls.assigneeUserId.setValue(value ?? "");
    this.form.controls.assigneeUserId.markAsTouched();
  }

  private toIsoDateTime(value: string): string {
    return new Date(value).toISOString();
  }
}
