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
  CaseSummary,
  ClientSummary,
  DeadlineDetail,
  DeadlineType,
} from "@law/api-interfaces";
import {
  CasesApiClient,
  ClientsApiClient,
  DeadlineRequest,
  ReferencesApiClient,
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
export class DeadlineDialogComponent {
  private readonly api = inject(WorkManagementApiClient);
  private readonly casesApi = inject(CasesApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly references = inject(ReferencesApiClient);
  private readonly auth = inject(AuthState);
  private readonly context = injectBrnDialogContext<DeadlineDialogContext>();
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly dialogRef = inject(BrnDialogRef<DeadlineDetail>);
  readonly users = signal<Array<{ id: string; name: string }>>([]);
  readonly cases = signal<CaseSummary[]>([]);
  readonly clients = signal<ClientSummary[]>([]);
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
        (this.context.deadline
          ? ""
          : (this.context.dueDate ?? todayDateInputValue())),
      {
        nonNullable: true,
      },
    ),
    dueAt: new FormControl(dateTimeInputValue(this.context.deadline?.dueAt), {
      nonNullable: true,
    }),
    responsibleUserId: new FormControl(
      this.context.deadline?.responsibleUser.id ??
        this.auth.session()?.user.id ??
        "",
      { nonNullable: true, validators: [Validators.required] },
    ),
    caseId: new FormControl(
      this.context.caseId ?? this.context.deadline?.case?.id ?? "",
      { nonNullable: true },
    ),
    clientId: new FormControl(
      this.context.clientId ?? this.context.deadline?.client?.id ?? "",
      { nonNullable: true },
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
      caseId: value.caseId || undefined,
      clientId: value.clientId || undefined,
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

  setClientId(value: string | null | undefined): void {
    this.form.controls.clientId.setValue(value ?? "");
  }

  setCaseId(value: string | null | undefined): void {
    this.form.controls.caseId.setValue(value ?? "");
  }

  setResponsibleUserId(value: string | null | undefined): void {
    this.form.controls.responsibleUserId.setValue(value ?? "");
    this.form.controls.responsibleUserId.markAsTouched();
  }

  private toIsoDateTime(value: string): string {
    return new Date(value).toISOString();
  }
}
