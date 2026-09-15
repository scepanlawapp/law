import { Component, inject, signal } from "@angular/core";
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { ClientType } from "@law/api-interfaces";
import {
  ClientRequest,
  ClientsApiClient,
  ReferencesApiClient,
} from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { LocalizationService } from "../../core/localization/localization.service";
import { ToastService } from "../../shared/ui/toast/toast.service";

type ContactPerson = {
  id: string;
  name: string;
  relationshipType: string;
  jobTitle: string;
  email: string;
  phone: string;
  isPrimary: boolean;
};

@Component({
  selector: "app-client-form",
  standalone: true,
  templateUrl: "./client-form.component.html",
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    HlmButton,
    HlmField,
    HlmFieldLabel,
    HlmInput,
    TranslatePipe,
  ],
})
export class ClientFormComponent {
  private readonly api = inject(ClientsApiClient);
  private readonly refs = inject(ReferencesApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);
  readonly clientId = this.route.snapshot.paramMap.get("clientId");
  readonly saving = signal(false);
  readonly loading = signal(!!this.clientId);
  readonly users = signal<Array<{ userId: string; label: string }>>([]);
  readonly tags = signal<Array<{ id: string; name: string }>>([]);
  readonly contactPersons = signal<ContactPerson[]>([]);
  readonly form = new FormGroup({
    type: new FormControl<ClientType>("INDIVIDUAL", { nonNullable: true }),
    firstName: new FormControl(""),
    lastName: new FormControl(""),
    legalName: new FormControl(""),
    tradeName: new FormControl(""),
    displayName: new FormControl("", {
      validators: [Validators.maxLength(320)],
    }),
    organizationName: new FormControl(""),
    email: new FormControl("", { validators: [Validators.email] }),
    phone: new FormControl(""),
    website: new FormControl(""),
    preferredLanguage: new FormControl(""),
    notes: new FormControl(""),
    responsibleUserId: new FormControl(""),
    tagIds: new FormControl<string[]>([], { nonNullable: true }),
  });

  constructor() {
    this.refs.users().subscribe({
      next: (items) =>
        this.users.set(
          items.map((item) => ({
            userId: item.userId,
            label:
              [item.user.firstName, item.user.lastName]
                .filter(Boolean)
                .join(" ") || item.user.email,
          })),
        ),
    });
    this.refs.tags().subscribe({
      next: (items) => this.tags.set(items.filter((item) => item.isActive)),
    });
    if (this.clientId)
      this.api.get(this.clientId).subscribe({
        next: (item) => {
          const isOrganization = item.type === "ORGANIZATION";
          this.form.patchValue({
            type: item.type,
            firstName: item.firstName ?? "",
            lastName: item.lastName ?? "",
            legalName: isOrganization ? (item.organizationName ?? "") : "",
            organizationName: item.organizationName ?? "",
            displayName: item.displayName ?? "",
            email: item.email ?? "",
            phone: item.phone ?? "",
            website: item.website ?? "",
            preferredLanguage: item.preferredLanguage ?? "",
            notes: item.notes ?? "",
            responsibleUserId: item.responsibleUserId ?? "",
            tagIds: item.tags.map((tag) => tag.id),
          });
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.toast.error(this.localization.translate("clients.loadError"));
        },
      });
  }

  isOrganization(): boolean {
    return this.form.controls.type.value === "ORGANIZATION";
  }

  addContactPerson(): void {
    this.contactPersons.update((people) => [
      ...people,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: "",
        relationshipType: "",
        jobTitle: "",
        email: "",
        phone: "",
        isPrimary: false,
      },
    ]);
  }

  removeContactPerson(id: string): void {
    this.contactPersons.update((people) =>
      people.filter((person) => person.id !== id),
    );
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const hasPersonName = !!raw.firstName?.trim() && !!raw.lastName?.trim();
    const hasOrganizationName =
      !!raw.legalName?.trim() || !!raw.organizationName?.trim();
    if (
      (!this.isOrganization() && !hasPersonName) ||
      (this.isOrganization() && !hasOrganizationName)
    ) {
      this.form.markAllAsTouched();
      return;
    }

    const request: ClientRequest = {
      type: raw.type,
      firstName: raw.firstName?.trim() || undefined,
      lastName: raw.lastName?.trim() || undefined,
      displayName: raw.displayName?.trim() || undefined,
      organizationName: this.isOrganization()
        ? raw.legalName?.trim() || raw.organizationName?.trim() || undefined
        : undefined,
      email: raw.email?.trim() || undefined,
      phone: raw.phone?.trim() || undefined,
      website: raw.website?.trim() || undefined,
      preferredLanguage: raw.preferredLanguage?.trim() || undefined,
      notes: raw.notes?.trim() || undefined,
      responsibleUserId: raw.responsibleUserId || undefined,
      tagIds: raw.tagIds,
    };

    this.saving.set(true);
    const action = this.clientId
      ? this.api.update(this.clientId, request)
      : this.api.create(request);
    action.subscribe({
      next: (client) => {
        this.toast.success(this.localization.translate("clients.saved"));
        this.router.navigate(["/clients", client.id]);
      },
      error: () => {
        this.saving.set(false);
        this.toast.error(this.localization.translate("clients.saveError"));
      },
    });
  }
}
