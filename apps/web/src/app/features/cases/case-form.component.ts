import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { CasePriority, CaseStatus } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import {
  CaseRequest,
  CasesApiClient,
  ClientsApiClient,
  ReferencesApiClient,
} from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { LocalizationService } from "../../core/localization/localization.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { ClientFormDialogService } from "../clients/client-create-edit-modal/client-form-dialog.service";
import { ReferenceDataService } from "../../shared/reference-data.service";
import { ReferenceCreateDialogComponent } from "../../shared/ui/reference-create-dialog/reference-create-dialog.component";
import {
  createSelectItemToString,
  type SelectOption,
} from "../../shared/utils";
import { HlmSpinner } from "@spartan-ng/helm/spinner";

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function toDateInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

@Component({
  selector: "law-case-form",
  standalone: true,
  templateUrl: "./case-form.component.html",
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButton,
    HlmField,
    HlmFieldLabel,
    HlmInput,
    HlmSelectImports,
    HlmTextarea,
    TranslatePipe,
    HlmSpinner,
  ],
})
export class CaseFormComponent {
  private readonly api = inject(CasesApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly refs = inject(ReferencesApiClient);
  private readonly referenceData = inject(ReferenceDataService);
  private readonly auth = inject(AuthState);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly local = inject(LocalizationService);
  private readonly dialog = inject(HlmDialogService);
  private readonly clientDialog = inject(ClientFormDialogService);
  private readonly destroyRef = inject(DestroyRef);
  readonly caseId = this.route.snapshot.paramMap.get("caseId");
  readonly returnUrl = this.internalReturnUrl(
    this.route.snapshot.queryParamMap.get("returnUrl"),
  );
  readonly saving = signal(false);
  readonly loading = signal(!!this.caseId);
  readonly clients = signal<Array<{ id: string; name: string }>>([]);
  readonly users = signal<Array<{ id: string; name: string }>>([]);
  readonly types = this.referenceData.caseTypes;
  readonly areas = this.referenceData.practiceAreas;
  readonly priorityOptions: ReadonlyArray<SelectOption<CasePriority>> = [
    { value: "LOW", label: "cases.priority.LOW" },
    { value: "NORMAL", label: "cases.priority.NORMAL" },
    { value: "HIGH", label: "cases.priority.HIGH" },
    { value: "URGENT", label: "cases.priority.URGENT" },
  ];
  readonly statusOptions: ReadonlyArray<SelectOption<CaseStatus>> = [
    { value: "DRAFT", label: "cases.status.DRAFT" },
    { value: "ACTIVE", label: "cases.status.ACTIVE" },
    { value: "ON_HOLD", label: "cases.status.ON_HOLD" },
    { value: "CLOSED", label: "cases.status.CLOSED" },
    { value: "ARCHIVED", label: "cases.status.ARCHIVED" },
  ];
  readonly clientItemToString = (value: string | null | undefined): string =>
    this.clients().find((client) => client.id === value)?.name ?? "";
  readonly responsibleUserItemToString = (
    value: string | null | undefined,
  ): string => this.users().find((user) => user.id === value)?.name ?? "";
  readonly priorityItemToString = createSelectItemToString(
    this.priorityOptions,
    (key) => this.local.translate(key),
  );
  readonly statusItemToString = createSelectItemToString(
    this.statusOptions,
    (key) => this.local.translate(key),
  );
  readonly caseTypeItemToString = (value: string | null | undefined): string =>
    this.types().find((type) => type.id === value)?.name ?? "";
  readonly practiceAreaItemToString = (
    value: string | null | undefined,
  ): string => this.areas().find((area) => area.id === value)?.name ?? "";
  readonly form = new FormGroup({
    clientId: new FormControl(
      this.route.snapshot.queryParamMap.get("clientId") ?? "",
      { nonNullable: true, validators: [Validators.required] },
    ),
    caseNumber: new FormControl("", {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(40),
        Validators.pattern(/^[A-Za-z0-9/.-]+$/),
      ],
    }),
    name: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(320)],
    }),
    responsibleUserId: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    description: new FormControl(""),
    opposingPartyName: new FormControl(""),
    opposingPartyAddress: new FormControl(""),
    caseTypeId: new FormControl(""),
    practiceAreaId: new FormControl(""),
    status: new FormControl<CaseStatus>("ACTIVE", { nonNullable: true }),
    priority: new FormControl<CasePriority>("NORMAL", { nonNullable: true }),
    openedDate: new FormControl(this.caseId ? "" : todayDateInputValue()),
    externalReference: new FormControl(""),
    confidentialityLevel: new FormControl(""),
  });
  constructor() {
    this.clientsApi
      .list({ page: 1, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) =>
          this.clients.set(
            response.items.map((item) => ({
              id: item.id,
              name: item.displayName,
            })),
          ),
      });
    this.referenceData.loadCaseTypes();
    this.referenceData.loadPracticeAreas();
    this.refs
      .users()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) =>
          this.users.set(
            items.map((item) => ({
              id: item.userId,
              name:
                [item.user.firstName, item.user.lastName]
                  .filter(Boolean)
                  .join(" ") || item.user.email,
            })),
          ),
      });
    if (!this.caseId) {
      const format = this.auth.activeWorkspace()?.caseNumberFormat ?? "YYYY-N";
      this.api
        .nextNumber(format)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (value) =>
            this.form.controls.caseNumber.setValue(value.caseNumber),
        });
    }
    if (this.caseId)
      this.api
        .get(this.caseId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (item) => {
            this.form.patchValue({
              ...item,
              openedDate: toDateInputValue(item.openedDate),
            });
            this.form.controls.clientId.disable();
            this.form.controls.responsibleUserId.disable();
            this.loading.set(false);
          },
          error: () => {
            this.loading.set(false);
            this.toast.error(this.local.translate("cases.loadError"));
          },
        });
  }

  openClientDialog(): void {
    this.clientDialog
      .create()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((client) => {
        if (!client) return;
        this.clients.update((items) => [
          ...items,
          { id: client.id, name: client.displayName },
        ]);
        this.form.controls.clientId.setValue(client.id);
      });
  }

  openCaseTypeDialog(): void {
    this.openReferenceDialog(
      "cases.createType",
      "cases.createTypeDescription",
      "cases.type",
      (name) =>
        this.referenceData
          .createCaseType(name)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (item) => this.form.controls.caseTypeId.setValue(item.id),
            error: () =>
              this.toast.error(
                this.local.translate("cases.referenceSaveError"),
              ),
          }),
    );
  }

  openPracticeAreaDialog(): void {
    this.openReferenceDialog(
      "cases.createArea",
      "cases.createAreaDescription",
      "cases.area",
      (name) =>
        this.referenceData
          .createPracticeArea(name)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (item) => this.form.controls.practiceAreaId.setValue(item.id),
            error: () =>
              this.toast.error(
                this.local.translate("cases.referenceSaveError"),
              ),
          }),
    );
  }

  private openReferenceDialog(
    title: string,
    description: string,
    nameLabel: string,
    create: (name: string) => void,
  ): void {
    this.dialog
      .open<string>(ReferenceCreateDialogComponent, {
        contentClass: "sm:max-w-md",
        context: { title, description, nameLabel },
      })
      .closed$.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((name) => {
        if (!name?.trim()) return;
        create(name.trim());
      });
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const request: CaseRequest = {
      clientId: raw.clientId,
      caseNumber: raw.caseNumber.trim(),
      name: raw.name.trim(),
      responsibleUserId: raw.responsibleUserId,
      description: raw.description?.trim() || undefined,
      caseTypeId: raw.caseTypeId || undefined,
      practiceAreaId: raw.practiceAreaId || undefined,
      status: raw.status,
      priority: raw.priority,
      openedDate: raw.openedDate || undefined,
      externalReference: raw.externalReference?.trim() || undefined,
      confidentialityLevel: raw.confidentialityLevel?.trim() || undefined,
      opposingPartyName: raw.opposingPartyName?.trim() || undefined,
      opposingPartyAddress: raw.opposingPartyAddress?.trim() || undefined,
    };
    this.saving.set(true);
    const action = this.caseId
      ? this.api.update(this.caseId, request)
      : this.api.create(request);
    action.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (item) => {
        this.toast.success(this.local.translate("cases.saved"));
        if (!this.caseId && this.returnUrl) {
          void this.router.navigateByUrl(this.returnUrl);
        } else {
          void this.router.navigate(["/cases", item.id]);
        }
      },
      error: () => {
        this.saving.set(false);
        this.toast.error(this.local.translate("cases.saveError"));
      },
    });
  }

  private internalReturnUrl(value: string | null): string | null {
    return value?.startsWith("/") && !value.startsWith("//") ? value : null;
  }
}
