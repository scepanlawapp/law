import {
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from "@angular/core";
import {
  AbstractControl,
  FormControl,
  FormArray,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import { ClientDetail, ClientStatus, ClientType } from "@law/api-interfaces";
import {
  AuthApiClient,
  ClientRequest,
  ClientAddress,
  ClientAddressRequest,
  ClientContact,
  ClientContactRequest,
  ClientIdentificationDocument,
  ClientIdentificationDocumentRequest,
  ClientsApiClient,
  ReferencesApiClient,
} from "@law/api-clients";
import {
  forkJoin,
  map,
  Observable,
  switchMap,
  defaultIfEmpty,
  tap,
} from "rxjs";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideUserRound,
  lucideMapPin,
  lucideContactRound,
  lucideIdCard,
  lucideFileText,
} from "@ng-icons/lucide";
import { HlmTabsImports } from "@spartan-ng/helm/tabs";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from "@spartan-ng/helm/dialog";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmLabel } from "@spartan-ng/helm/label";
import { HlmRadioGroupImports } from "@spartan-ng/helm/radio-group";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmSwitch } from "@spartan-ng/helm/switch";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import { ClientFormDialogContext } from "./client-form-dialog.models";
import { LocalizationService } from "../../../core/localization/localization.service";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { CollapsibleSectionComponent } from "../../../shared/ui/collapsible-section/collapsible-section.component";
import { CountrySelectComponent } from "../../../shared/ui/country-select/country-select.component";
import { ToastService } from "../../../shared/ui/toast/toast.service";
import { SelectOption, createSelectItemToString } from "../../../shared/utils";
import { HlmDialogImports } from "@spartan-ng/helm/dialog";

type ClientAddressType =
  | "REGISTERED"
  | "DELIVERY"
  | "BILLING"
  | "OFFICE"
  | "POSTAL";

const DEFAULT_COUNTRY_CODE = "RS";

@Component({
  selector: "law-client-form",
  standalone: true,
  templateUrl: "./client-form.component.html",
  providers: [
    provideIcons({
      lucideUserRound,
      lucideMapPin,
      lucideContactRound,
      lucideIdCard,
      lucideFileText,
    }),
  ],
  imports: [
    HlmTabsImports,
    NgIcon,
    ReactiveFormsModule,
    HlmButton,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmField,
    HlmFieldLabel,
    HlmInput,
    HlmLabel,
    HlmRadioGroupImports,
    HlmSelectImports,
    HlmSpinner,
    HlmSwitch,
    HlmDialogImports,
    HlmTextarea,
    CountrySelectComponent,
    CollapsibleSectionComponent,
    TranslatePipe,
  ],
  host: {
    class: "flex min-h-0 flex-1 flex-col gap-6",
  },
})
export class ClientFormComponent {
  private readonly auth = inject(AuthApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(ClientsApiClient);
  private readonly refs = inject(ReferencesApiClient);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly dialogRef = inject(BrnDialogRef<ClientDetail>);
  private readonly dialogContext =
    injectBrnDialogContext<ClientFormDialogContext>();
  readonly clientId = this.dialogContext.clientId;
  readonly saving = signal(false);
  readonly loading = signal(!!this.clientId);
  readonly users = signal<Array<{ userId: string; label: string }>>([]);
  readonly tags = signal<Array<{ id: string; name: string }>>([]);
  readonly clientTypeOptions: ReadonlyArray<SelectOption<ClientType>> = [
    { value: "INDIVIDUAL", label: "clients.individual" },
    { value: "ORGANIZATION", label: "clients.organization" },
  ];
  readonly statusOptions: ReadonlyArray<SelectOption<ClientStatus>> = [
    { value: "PROSPECT", label: "clients.status.PROSPECT" },
    { value: "ACTIVE", label: "clients.status.ACTIVE" },
    { value: "INACTIVE", label: "clients.status.INACTIVE" },
  ];
  readonly addressTypeOptions: ReadonlyArray<SelectOption<ClientAddressType>> =
    [
      { value: "REGISTERED", label: "clients.addressType.REGISTERED" },
      { value: "DELIVERY", label: "clients.addressType.DELIVERY" },
      { value: "BILLING", label: "clients.addressType.BILLING" },
      { value: "OFFICE", label: "clients.addressType.OFFICE" },
      { value: "POSTAL", label: "clients.addressType.POSTAL" },
    ];
  readonly statusItemToString = createSelectItemToString(
    this.statusOptions,
    (key) => this.localization.translate(key),
  );
  readonly addressTypeItemToString = createSelectItemToString(
    this.addressTypeOptions,
    (key) => this.localization.translate(key),
  );
  readonly responsibleUserItemToString = (
    value: string | null | undefined,
  ): string => this.users().find((user) => user.userId === value)?.label ?? "";
  readonly addresses = new FormArray<ReturnType<typeof this.createAddressForm>>(
    [],
  );
  readonly identificationDocuments = new FormArray([
    this.createIdentificationDocumentForm(),
  ]);
  readonly contacts = new FormArray([this.createContactForm(undefined, true)]);
  readonly activeSection = signal("basic");
  readonly sections = [
    { id: "basic", label: "clients.basicInfo", icon: "lucideUserRound" },
    { id: "addresses", label: "clients.addresses", icon: "lucideMapPin" },
    { id: "contacts", label: "clients.contacts", icon: "lucideContactRound" },
    {
      id: "identification",
      label: "clients.identificationSection",
      icon: "lucideIdCard",
    },
    {
      id: "additional",
      label: "clients.additionalInformation",
      icon: "lucideFileText",
    },
  ];
  private readonly removedContactIds = new Set<string>();
  private savedClientId = this.clientId;
  readonly loadFailed = signal(false);
  primaryContact() {
    return (
      this.contacts.controls.find(
        (contact) => contact.controls.isPrimary.value,
      ) ?? this.contacts.controls[0]
    );
  }
  private readonly addressExtraExpanded = new WeakMap<
    AbstractControl,
    boolean
  >();
  private readonly contactNotesExpanded = new WeakMap<
    AbstractControl,
    boolean
  >();
  readonly form = new FormGroup({
    type: new FormControl<ClientType>("INDIVIDUAL", { nonNullable: true }),
    status: new FormControl<ClientStatus>("ACTIVE", { nonNullable: true }),
    firstName: new FormControl(""),
    lastName: new FormControl(""),
    displayName: new FormControl("", {
      validators: [Validators.maxLength(320)],
    }),
    organizationName: new FormControl(""),
    isDomestic: new FormControl(true, { nonNullable: true }),
    isPublicSector: new FormControl(false, { nonNullable: true }),
    jbkjs: new FormControl(""),
    jmbg: new FormControl(""),
    taxNumber: new FormControl(""),
    registrationNumber: new FormControl(""),
    website: new FormControl(""),
    preferredLanguage: new FormControl(""),
    notes: new FormControl(""),
    responsibleUserId: new FormControl(""),
    tagIds: new FormControl<string[]>([], { nonNullable: true }),
  });
  constructor() {
    this.applyTypeValidators(this.form.controls.type.value);
    this.form.controls.type.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => {
        this.applyTypeValidators(type);
      });
    this.refs
      .users()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
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
    this.refs
      .tags()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => this.tags.set(items.filter((item) => item.isActive)),
      });
    if (!this.clientId) {
      this.auth
        .me()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (session) =>
            this.form.controls.responsibleUserId.setValue(session.user.id),
        });
    }
    if (this.clientId)
      forkJoin({
        client: this.api.get(this.clientId),
        addresses: this.api.listAddresses(this.clientId),
        documents: this.api.listIdentificationDocuments(this.clientId),
        contacts: this.api.listContacts(this.clientId),
      })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: ({ client, addresses, documents, contacts }) => {
            this.form.patchValue({
              responsibleUserId: client.responsibleUser?.id ?? "",
              tagIds: client.tags.map((tag) => tag.id),
            });
            this.form.patchValue(client);
            this.replaceForms(
              this.addresses,
              addresses,
              (address) => this.createAddressForm(address),
              () => this.createAddressForm(),
              false,
            );
            this.replaceForms(
              this.identificationDocuments,
              documents,
              (document) => this.createIdentificationDocumentForm(document),
              () => this.createIdentificationDocumentForm(),
            );
            const activeContacts = contacts.filter(
              (contact) => contact.status !== "INACTIVE",
            );
            this.replaceForms(
              this.contacts,
              activeContacts,
              (contact) => this.createContactForm(contact),
              () => this.createContactForm(undefined, true),
            );
            if (!activeContacts.some((contact) => contact.isPrimary)) {
              const matchingIndex = activeContacts.findIndex(
                (contact) =>
                  (client.email && contact.email === client.email) ||
                  (client.phone && contact.phone === client.phone),
              );
              if (matchingIndex >= 0) this.selectPrimaryContact(matchingIndex);
              else if (client.email || client.phone) {
                const primary = this.createContactForm(undefined, true);
                primary.patchValue({
                  firstName: client.firstName ?? "",
                  lastName: client.lastName ?? "",
                  email: client.email ?? "",
                  phone: client.phone ?? "",
                });
                if (!activeContacts.length) this.contacts.clear();
                this.contacts.insert(0, primary);
              } else this.selectPrimaryContact(0);
            }
            this.loading.set(false);
          },
          error: () => {
            this.loading.set(false);
            this.loadFailed.set(true);
            this.toast.error(this.localization.translate("clients.loadError"));
          },
        });
  }

  private createAddressForm(address?: ClientAddress, isPrimaryDefault = false) {
    return new FormGroup({
      id: new FormControl(address?.id ?? "", { nonNullable: true }),
      addressType: new FormControl<ClientAddressType>(
        this.toClientAddressType(address?.addressType),
        {
          nonNullable: true,
          validators: [Validators.required],
        },
      ),
      street: new FormControl(address?.street ?? "", {
        nonNullable: true,
        validators: [Validators.required],
      }),
      streetAdditional: new FormControl(address?.streetAdditional ?? ""),
      city: new FormControl(address?.city ?? "", {
        nonNullable: true,
        validators: [Validators.required],
      }),
      postalCode: new FormControl(address?.postalCode ?? "", {
        nonNullable: true,
        validators: [Validators.required],
      }),
      stateOrRegion: new FormControl(address?.stateOrRegion ?? ""),
      country: new FormControl(address?.country ?? DEFAULT_COUNTRY_CODE, {
        nonNullable: true,
        validators: [Validators.required],
      }),
      note: new FormControl(address?.note ?? ""),
      isPrimary: new FormControl(address?.isPrimary ?? isPrimaryDefault, {
        nonNullable: true,
      }),
    });
  }

  private createIdentificationDocumentForm(
    document?: ClientIdentificationDocument,
  ) {
    return new FormGroup({
      id: new FormControl(document?.id ?? "", { nonNullable: true }),
      type: new FormControl(document?.type ?? "", { nonNullable: true }),
      number: new FormControl(document?.number ?? "", { nonNullable: true }),
      issuedDate: new FormControl(this.dateInputValue(document?.issuedDate), {
        nonNullable: true,
      }),
      expiredDate: new FormControl(this.dateInputValue(document?.expiredDate), {
        nonNullable: true,
      }),
      country: new FormControl(document?.country ?? "", {
        nonNullable: true,
      }),
    });
  }

  private createContactForm(contact?: ClientContact, isPrimaryDefault = false) {
    return new FormGroup({
      id: new FormControl(contact?.id ?? "", { nonNullable: true }),
      firstName: new FormControl(contact?.firstName ?? "", {
        nonNullable: true,
      }),
      lastName: new FormControl(contact?.lastName ?? "", {
        nonNullable: true,
      }),
      position: new FormControl(contact?.position ?? ""),
      email: new FormControl(contact?.email ?? "", {
        validators: [Validators.email],
      }),
      phone: new FormControl(contact?.phone ?? ""),
      isPrimary: new FormControl(contact?.isPrimary ?? isPrimaryDefault, {
        nonNullable: true,
      }),
      notes: new FormControl(contact?.notes ?? ""),
    });
  }

  private dateInputValue(value: string | null | undefined): string {
    return value ? value.slice(0, 10) : "";
  }

  private toClientAddressType(
    value: string | null | undefined,
  ): ClientAddressType {
    return this.addressTypeOptions.some((option) => option.value === value)
      ? (value as ClientAddressType)
      : "REGISTERED";
  }

  private replaceForms<T>(
    collection: FormArray,
    items: T[],
    create: (item: T) => FormGroup,
    createEmpty: () => FormGroup,
    addEmptyWhenNoItems = true,
  ): void {
    collection.clear();
    for (const item of items) collection.push(create(item));
    if (!items.length && addEmptyWhenNoItems) collection.push(createEmpty());
  }

  addAddress(): void {
    this.addresses.push(
      this.createAddressForm(undefined, !this.addresses.length),
    );
  }

  removeAddress(index: number): void {
    this.addresses.removeAt(index);
  }

  addIdentificationDocument(): void {
    this.identificationDocuments.push(this.createIdentificationDocumentForm());
  }

  removeIdentificationDocument(index: number): void {
    if (this.identificationDocuments.length > 1)
      this.identificationDocuments.removeAt(index);
  }

  addContact(): void {
    this.contacts.push(this.createContactForm());
  }

  removeContact(index: number): void {
    const contact = this.contacts.at(index);
    if (contact.controls.id.value)
      this.removedContactIds.add(contact.controls.id.value);
    const wasPrimary = contact.controls.isPrimary.value;
    this.contacts.removeAt(index);
    if (!this.contacts.length)
      this.contacts.push(this.createContactForm(undefined, true));
    else if (wasPrimary) this.selectPrimaryContact(0);
  }
  isOrganization(): boolean {
    return this.form.controls.type.value === "ORGANIZATION";
  }

  selectPrimaryAddress(index: number): void {
    this.addresses.controls.forEach((group, i) =>
      group.controls.isPrimary.setValue(i === index),
    );
  }

  selectPrimaryContact(index: number): void {
    this.contacts.controls.forEach((group, i) =>
      group.controls.isPrimary.setValue(i === index),
    );
  }

  isAddressExtraExpanded(group: AbstractControl): boolean {
    return this.addressExtraExpanded.get(group) ?? false;
  }

  setAddressExtraExpanded(group: AbstractControl, value: boolean): void {
    this.addressExtraExpanded.set(group, value);
  }

  isContactNotesExpanded(group: AbstractControl): boolean {
    return this.contactNotesExpanded.get(group) ?? false;
  }

  setContactNotesExpanded(group: AbstractControl, value: boolean): void {
    this.contactNotesExpanded.set(group, value);
  }

  toggleTag(tagId: string, checked: boolean): void {
    const current = this.form.controls.tagIds.value;
    this.form.controls.tagIds.setValue(
      checked ? [...current, tagId] : current.filter((id) => id !== tagId),
    );
  }

  /** Reveal invalid controls before focusing them, including hidden panels. */
  private expandInvalidSectionsAndFocus(): void {
    if (
      this.form.controls.displayName.invalid ||
      this.form.controls.website.invalid ||
      this.form.controls.preferredLanguage.invalid
    )
      this.activeSection.set("additional");
    else if (this.form.invalid || this.primaryContact().controls.email.invalid)
      this.activeSection.set("basic");
    else if (this.addresses.invalid) this.activeSection.set("addresses");
    else if (this.contacts.invalid) this.activeSection.set("contacts");
    else if (this.identificationDocuments.invalid)
      this.activeSection.set("identification");
    setTimeout(() => {
      const invalid = this.elementRef.nativeElement.querySelector(
        `[data-client-panel="${this.activeSection()}"] input.ng-invalid, [data-client-panel="${this.activeSection()}"] textarea.ng-invalid`,
      );
      if (invalid instanceof HTMLElement) invalid.focus();
    });
  }

  private applyTypeValidators(type: ClientType): void {
    if (type === "ORGANIZATION") {
      this.form.controls.organizationName.setValidators([Validators.required]);
      this.form.controls.firstName.clearValidators();
      this.form.controls.lastName.clearValidators();
    } else {
      this.form.controls.organizationName.clearValidators();
      this.form.controls.firstName.setValidators([Validators.required]);
      this.form.controls.lastName.setValidators([Validators.required]);
      this.form.controls.isPublicSector.setValue(false, { emitEvent: false });
      this.form.controls.jbkjs.setValue("", { emitEvent: false });
    }

    this.form.controls.organizationName.updateValueAndValidity({
      emitEvent: false,
    });
    this.form.controls.firstName.updateValueAndValidity({ emitEvent: false });
    this.form.controls.lastName.updateValueAndValidity({ emitEvent: false });
  }

  private markAllFormSectionsAsTouched(): void {
    this.form.markAllAsTouched();
    this.addresses.markAllAsTouched();
    this.identificationDocuments.markAllAsTouched();
    this.contacts.markAllAsTouched();
  }

  submit(): void {
    if (
      this.form.invalid ||
      this.addresses.invalid ||
      this.contacts.invalid ||
      this.identificationDocuments.invalid ||
      this.saving() ||
      this.loadFailed()
    ) {
      this.markAllFormSectionsAsTouched();
      this.expandInvalidSectionsAndFocus();
      return;
    }
    const raw = this.form.getRawValue();
    if (
      (!this.isOrganization() &&
        (!raw.firstName?.trim() || !raw.lastName?.trim())) ||
      (this.isOrganization() && !raw.organizationName?.trim())
    ) {
      this.markAllFormSectionsAsTouched();
      this.expandInvalidSectionsAndFocus();
      return;
    }
    const request: ClientRequest = {
      type: raw.type,
      status: raw.status,
      firstName: raw.firstName?.trim() || undefined,
      lastName: raw.lastName?.trim() || undefined,
      displayName: raw.displayName?.trim() || undefined,
      organizationName: raw.organizationName?.trim() || undefined,
      isDomestic: raw.isDomestic,
      isPublicSector: raw.isPublicSector,
      jbkjs: raw.jbkjs?.trim() || undefined,
      jmbg: raw.jmbg?.trim() || undefined,
      taxNumber: raw.taxNumber?.trim() || undefined,
      registrationNumber: raw.registrationNumber?.trim() || undefined,

      website: raw.website?.trim() || undefined,
      preferredLanguage: raw.preferredLanguage?.trim() || undefined,
      notes: raw.notes?.trim() || undefined,
      responsibleUserId: raw.responsibleUserId || undefined,
      tagIds: raw.tagIds,
    };
    const addressRequests = this.addressRequests();
    const documentRequests = this.documentRequests();
    const contactRequests = this.contactRequests();
    if (
      addressRequests === null ||
      documentRequests === null ||
      contactRequests === null
    ) {
      this.markAllFormSectionsAsTouched();
      if (addressRequests === null) this.activeSection.set("addresses");
      if (documentRequests === null) this.activeSection.set("identification");
      if (contactRequests === null) this.activeSection.set("contacts");
      this.saving.set(false);
      this.toast.error(this.localization.translate("clients.saveError"));
      return;
    }
    const primary = this.primaryContact().getRawValue();
    request.primaryContact = {
      id: primary.id || undefined,
      firstName: primary.firstName.trim(),
      lastName: primary.lastName.trim(),
      email: primary.email?.trim() ?? "",
      phone: primary.phone?.trim() ?? "",
      position: primary.position?.trim() ?? "",
      notes: primary.notes?.trim() ?? "",
    };
    this.saving.set(true);
    const action = this.savedClientId
      ? this.api.update(this.savedClientId, request)
      : this.api.create(request);
    action
      .pipe(
        tap((client) => (this.savedClientId = client.id)),
        switchMap((client) =>
          this.api.listContacts(client.id).pipe(
            tap((contacts) => {
              const primary = contacts.find(
                (contact) => contact.isPrimary && contact.status !== "INACTIVE",
              );
              if (primary)
                this.primaryContact().controls.id.setValue(primary.id);
            }),
            map(() => client),
          ),
        ),
        switchMap((client) =>
          forkJoin([
            ...addressRequests.map((row) => this.saveAddress(client.id, row)),
            ...documentRequests.map((request) =>
              this.saveIdentificationDocument(client.id, request),
            ),
            ...contactRequests
              .filter((row) => !row.request.isPrimary)
              .map((row) => this.saveContact(client.id, row)),
            ...[...this.removedContactIds].map((id) =>
              this.api
                .deactivateContact(client.id, id)
                .pipe(tap(() => this.removedContactIds.delete(id))),
            ),
          ])
            // An empty forkJoin completes without emitting, which would skip `next` below.
            .pipe(
              defaultIfEmpty(null),
              switchMap(() => this.api.get(client.id)),
            ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (client) => {
          this.toast.success(this.localization.translate("clients.saved"));
          this.dialogRef.close(client);
        },
        error: () => {
          this.saving.set(false);
          this.toast.error(this.localization.translate("clients.saveError"));
        },
      });
  }

  private addressRequests(): Array<{
    id?: string;
    request: ClientAddressRequest;
  }> | null {
    const rows = this.addresses.getRawValue();
    const populated = rows.filter((row) =>
      [
        row.street,
        row.streetAdditional,
        row.city,
        row.postalCode,
        row.stateOrRegion,
        row.note,
      ].some((value) => value?.trim()),
    );
    if (
      populated.some(
        (row) =>
          !row.addressType.trim() ||
          !row.street.trim() ||
          !row.city.trim() ||
          !row.postalCode.trim() ||
          !row.country.trim(),
      )
    )
      return null;
    return populated.map(({ id, ...row }) => ({
      id: id || undefined,
      request: {
        ...row,
        streetAdditional: row.streetAdditional?.trim() || undefined,
        stateOrRegion: row.stateOrRegion?.trim() || undefined,
        note: row.note?.trim() || undefined,
        addressType: row.addressType.trim(),
        street: row.street.trim(),
        city: row.city.trim(),
        postalCode: row.postalCode.trim(),
        country: row.country.trim(),
      },
    }));
  }

  private documentRequests(): Array<{
    id?: string;
    request: ClientIdentificationDocumentRequest;
  }> | null {
    const rows = this.identificationDocuments.getRawValue();
    const populated = rows.filter((row) =>
      [row.type, row.number, row.issuedDate, row.expiredDate, row.country].some(
        (value) => value?.trim(),
      ),
    );
    if (
      populated.some(
        (row) => !row.type.trim() || !row.number.trim() || !row.country.trim(),
      )
    )
      return null;
    return populated.map(({ id, ...row }) => ({
      id: id || undefined,
      request: {
        ...row,
        type: row.type.trim(),
        number: row.number.trim(),
        country: row.country.trim(),
        issuedDate: row.issuedDate || undefined,
        expiredDate: row.expiredDate || undefined,
      },
    }));
  }

  private contactRequests(): Array<{
    id?: string;
    request: ClientContactRequest;
  }> | null {
    const rows = this.contacts.getRawValue();
    const populated = rows.filter(
      (row) =>
        row.id ||
        [
          row.firstName,
          row.lastName,
          row.position,
          row.email,
          row.phone,
          row.notes,
        ].some((value) => value?.trim()),
    );
    if (
      populated.some(
        (row) =>
          !row.isPrimary &&
          ![row.firstName, row.lastName, row.email, row.phone].some((value) =>
            value?.trim(),
          ),
      )
    )
      return null;
    return populated.map(({ id, ...row }) => ({
      id: id || undefined,
      request: {
        ...row,
        firstName: row.firstName.trim(),
        lastName: row.lastName.trim(),
        position: row.position?.trim() || undefined,
        email: row.email?.trim() ?? "",
        phone: row.phone?.trim() ?? "",
        notes: row.notes?.trim() || undefined,
      },
    }));
  }

  private saveAddress(
    clientId: string,
    row: { id?: string; request: ClientAddressRequest },
  ): Observable<unknown> {
    return row.id
      ? this.api.updateAddress(clientId, row.id, row.request)
      : this.api.createAddress(clientId, row.request);
  }

  private saveIdentificationDocument(
    clientId: string,
    row: { id?: string; request: ClientIdentificationDocumentRequest },
  ): Observable<unknown> {
    return row.id
      ? this.api.updateIdentificationDocument(clientId, row.id, row.request)
      : this.api.createIdentificationDocument(clientId, row.request);
  }

  private saveContact(
    clientId: string,
    row: { id?: string; request: ClientContactRequest },
  ): Observable<unknown> {
    return row.id
      ? this.api.updateContact(clientId, row.id, row.request)
      : this.api.createContact(clientId, row.request);
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
