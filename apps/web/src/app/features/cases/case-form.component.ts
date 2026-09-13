import { Component, inject, signal } from "@angular/core";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { CasePriority } from "@law/api-interfaces";
import {
  CaseRequest,
  CasesApiClient,
  ClientsApiClient,
  ReferencesApiClient,
} from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { LocalizationService } from "../../core/localization/localization.service";
import { ToastService } from "../../shared/ui/toast/toast.service";

@Component({
  selector: "app-case-form",
  standalone: true,
  templateUrl: "./case-form.component.html",
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButton,
    HlmField,
    HlmFieldLabel,
    HlmInput,
    TranslatePipe,
  ],
})
export class CaseFormComponent {
  private readonly api = inject(CasesApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly refs = inject(ReferencesApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly local = inject(LocalizationService);
  readonly caseId = this.route.snapshot.paramMap.get("caseId");
  readonly saving = signal(false);
  readonly loading = signal(!!this.caseId);
  readonly clients = signal<Array<{ id: string; name: string }>>([]);
  readonly users = signal<Array<{ id: string; name: string }>>([]);
  readonly types = signal<Array<{ id: string; name: string }>>([]);
  readonly areas = signal<Array<{ id: string; name: string }>>([]);
  readonly form = new FormGroup({
    clientId: new FormControl(
      this.route.snapshot.queryParamMap.get("clientId") ?? "",
      { nonNullable: true, validators: [Validators.required] },
    ),
    name: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(320)],
    }),
    responsibleUserId: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    description: new FormControl(""),
    caseTypeId: new FormControl(""),
    practiceAreaId: new FormControl(""),
    priority: new FormControl<CasePriority>("NORMAL", { nonNullable: true }),
    openedDate: new FormControl(""),
    externalReference: new FormControl(""),
    confidentialityLevel: new FormControl(""),
  });
  constructor() {
    this.clientsApi
      .list({ page: 1, pageSize: 100 })
      .subscribe({
        next: (response) =>
          this.clients.set(
            response.items.map((item) => ({
              id: item.id,
              name: item.displayName,
            })),
          ),
      });
    this.refs
      .users()
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
    this.refs
      .caseTypes()
      .subscribe({
        next: (items) => this.types.set(items.filter((item) => item.isActive)),
      });
    this.refs
      .practiceAreas()
      .subscribe({
        next: (items) => this.areas.set(items.filter((item) => item.isActive)),
      });
    if (this.caseId)
      this.api.get(this.caseId).subscribe({
        next: (item) => {
          this.form.patchValue(item);
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
  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const request: CaseRequest = {
      clientId: raw.clientId,
      name: raw.name.trim(),
      responsibleUserId: raw.responsibleUserId,
      description: raw.description?.trim() || undefined,
      caseTypeId: raw.caseTypeId || undefined,
      practiceAreaId: raw.practiceAreaId || undefined,
      priority: raw.priority,
      openedDate: raw.openedDate || undefined,
      externalReference: raw.externalReference?.trim() || undefined,
      confidentialityLevel: raw.confidentialityLevel?.trim() || undefined,
    };
    this.saving.set(true);
    const action = this.caseId
      ? this.api.update(this.caseId, request)
      : this.api.create(request);
    action.subscribe({
      next: (item) => {
        this.toast.success(this.local.translate("cases.saved"));
        this.router.navigate(["/cases", item.id]);
      },
      error: () => {
        this.saving.set(false);
        this.toast.error(this.local.translate("cases.saveError"));
      },
    });
  }
}
