import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { ClientDetail } from "@law/api-interfaces";
import {
  ClientAddress,
  ClientAddressRequest,
  ClientContact,
  ClientIdentificationDocument,
  ClientsApiClient,
  ReferencesApiClient,
} from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import {
  HlmTabs,
  HlmTabsContent,
  HlmTabsList,
  HlmTabsTrigger,
} from "@spartan-ng/helm/tabs";
import { finalize, forkJoin, Observable, switchMap } from "rxjs";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideBuilding2,
  lucideEllipsis,
  lucideFileText,
  lucideHouse,
  lucideMail,
  lucideMapPin,
  lucidePencil,
  lucidePhone,
  lucidePlus,
  lucideStar,
  lucideStickyNote,
  lucideTrash2,
  lucideUserRound,
  lucideUsers,
} from "@ng-icons/lucide";
import { HlmDropdownMenuImports } from "@spartan-ng/helm/dropdown-menu";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { loadCountryOptions } from "../../shared/utils/countries";
import { CasesListComponent } from "../cases/cases-list/cases-list.component";
import { DocumentsComponent } from "../documents/documents.component";
import { ClientFormDialogService } from "./client-create-edit-modal/client-form-dialog.service";
import { ClientFormTab } from "./client-create-edit-modal/client-form-dialog.models";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ClientRetainerCardComponent } from "./client-retainer-card/client-retainer-card.component";
import {
  STATUS_BADGE_BASE_CLASSES,
  statusBadgeClass,
} from "../../shared/status-badge";

type ClientTab =
  | "overview"
  | "cases"
  | "documents"
  | "activities"
  | "financials";

@Component({
  selector: "law-client-detail",
  standalone: true,
  templateUrl: "./client-detail.component.html",
  styleUrl: "./client-detail.component.css",
  providers: [
    provideIcons({
      lucideBuilding2,
      lucideEllipsis,
      lucideFileText,
      lucideHouse,
      lucideMail,
      lucideMapPin,
      lucidePencil,
      lucidePhone,
      lucidePlus,
      lucideStar,
      lucideStickyNote,
      lucideTrash2,
      lucideUserRound,
      lucideUsers,
    }),
  ],
  imports: [
    NgIcon,
    HlmDropdownMenuImports,
    HlmTooltip,
    RouterLink,
    HlmButton,
    HlmSpinner,
    HlmTabs,
    HlmTabsContent,
    HlmTabsList,
    HlmTabsTrigger,
    CasesListComponent,
    DocumentsComponent,
    ClientRetainerCardComponent,
    TranslatePipe,
  ],
})
export class ClientDetailComponent {
  readonly statusBadgeBaseClasses = STATUS_BADGE_BASE_CLASSES;
  readonly statusBadgeClass = statusBadgeClass;
  private readonly api = inject(ClientsApiClient);
  private readonly references = inject(ReferencesApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly localization = inject(LocalizationService);
  private readonly clientDialog = inject(ClientFormDialogService);
  private readonly confirmation = inject(ConfirmDialogService);

  readonly id = this.route.snapshot.paramMap.get("clientId")!;
  readonly client = signal<ClientDetail | null>(null);
  readonly addresses = signal<ClientAddress[]>([]);
  readonly contacts = signal<ClientContact[]>([]);
  readonly identificationDocuments = signal<ClientIdentificationDocument[]>([]);
  readonly users = signal(new Map<string, string>());
  readonly countries = signal(new Map<string, string>());
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly pending = signal<string | null>(null);
  readonly confirming = signal(false);
  readonly mutationError = signal(false);
  readonly addressTypes = [
    "REGISTERED",
    "DELIVERY",
    "BILLING",
    "OFFICE",
    "POSTAL",
  ] as const;
  readonly selectedTab = signal<ClientTab>(
    this.toTab(this.route.snapshot.queryParamMap.get("tab")),
  );
  readonly casesOpened = signal(this.selectedTab() === "cases");
  readonly sortedAddresses = computed(() =>
    [...this.addresses()].sort(
      (first, second) => Number(second.isPrimary) - Number(first.isPrimary),
    ),
  );
  readonly sortedContacts = computed(() =>
    this.contacts()
      .filter((contact) => contact.status !== "INACTIVE")
      .sort(
        (first, second) => Number(second.isPrimary) - Number(first.isPrimary),
      ),
  );
  readonly title = computed(() => {
    const client = this.client();
    if (!client) return "";
    return client.type === "ORGANIZATION"
      ? client.organizationName || client.displayName
      : [client.firstName, client.lastName].filter(Boolean).join(" ") ||
          client.displayName;
  });
  readonly secondaryName = computed(() => {
    const client = this.client();
    return client && client.displayName !== this.title()
      ? client.displayName
      : null;
  });

  constructor() {
    this.reload();
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const tab = this.toTab(params.get("tab"));
        this.selectedTab.set(tab);
        if (tab === "cases") this.casesOpened.set(true);
      });
    effect(() => {
      const language = this.localization.language();
      void loadCountryOptions(language).then((countries) =>
        this.countries.set(
          new Map(countries.map((country) => [country.code, country.name])),
        ),
      );
    });
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(false);
    this.mutationError.set(false);
    forkJoin({
      client: this.api.get(this.id),
      addresses: this.api.listAddresses(this.id),
      contacts: this.api.listContacts(this.id),
      identificationDocuments: this.api.listIdentificationDocuments(this.id),
      users: this.references.users(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({
          client,
          addresses,
          contacts,
          identificationDocuments,
          users,
        }) => {
          this.client.set(client);
          this.addresses.set(addresses);
          this.contacts.set(contacts);
          this.identificationDocuments.set(identificationDocuments);
          this.users.set(
            new Map(
              users.map((membership) => [
                membership.userId,
                [membership.user.firstName, membership.user.lastName]
                  .filter(Boolean)
                  .join(" ") || membership.user.email,
              ]),
            ),
          );
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  selectTab(tab: string): void {
    const selectedTab = this.toTab(tab);
    this.selectedTab.set(selectedTab);
    if (selectedTab === "cases") this.casesOpened.set(true);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: selectedTab === "overview" ? null : selectedTab },
      queryParamsHandling: "merge",
    });
  }

  editClient(initialTab: ClientFormTab = "basic"): void {
    if (this.pending() || this.confirming()) return;
    this.clientDialog
      .edit(this.id, initialTab)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((updated) => {
        if (updated) this.reload();
      });
  }

  updateAddress(
    addressId: string,
    changes: Partial<ClientAddressRequest>,
  ): void {
    const address = this.addresses().find((item) => item.id === addressId);
    if (!address || this.pending() || this.confirming()) return;
    const request: ClientAddressRequest = {
      addressType: address.addressType,
      street: address.street,
      streetAdditional: address.streetAdditional ?? "",
      city: address.city,
      postalCode: address.postalCode,
      stateOrRegion: address.stateOrRegion ?? "",
      country: address.country,
      note: address.note ?? "",
      isPrimary: address.isPrimary,
      ...changes,
    };
    this.mutate(addressId, this.api.updateAddress(this.id, addressId, request));
  }

  setPrimaryContact(contactId: string): void {
    const contact = this.contacts().find((item) => item.id === contactId);
    if (
      !contact ||
      contact.isPrimary ||
      contact.status !== "ACTIVE" ||
      this.pending() ||
      this.confirming()
    )
      return;
    this.mutate(
      contactId,
      this.api.updateContact(this.id, contactId, { isPrimary: true }),
    );
  }

  deleteRecord(kind: "address" | "contact", recordId: string): void {
    if (this.pending() || this.confirming() || !this.canDelete(kind, recordId))
      return;
    this.confirming.set(true);
    this.confirmation
      .confirm({
        title: "clients.delete",
        message:
          kind === "address"
            ? "clients.removeConfirm"
            : "clients.deleteContactConfirm",
        confirmText: "clients.delete",
        variant: "danger",
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        this.confirming.set(false);
        if (!confirmed || this.pending() || !this.canDelete(kind, recordId))
          return;
        this.mutate(
          recordId,
          kind === "address"
            ? this.api.removeAddress(this.id, recordId)
            : this.api.deactivateContact(this.id, recordId),
        );
      });
  }

  private canDelete(kind: "address" | "contact", recordId: string): boolean {
    const record =
      kind === "address"
        ? this.addresses().find((item) => item.id === recordId)
        : this.contacts().find(
            (item) => item.id === recordId && item.status === "ACTIVE",
          );
    return !!record && !record.isPrimary;
  }

  private mutate(recordId: string, request: Observable<unknown>): void {
    this.pending.set(recordId);
    this.mutationError.set(false);
    request
      .pipe(
        switchMap(() =>
          forkJoin({
            client: this.api.get(this.id),
            addresses: this.api.listAddresses(this.id),
            contacts: this.api.listContacts(this.id),
          }),
        ),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.pending.set(null)),
      )
      .subscribe({
        next: ({ client, addresses, contacts }) => {
          this.client.set(client);
          this.addresses.set(addresses);
          this.contacts.set(contacts);
        },
        error: () => this.mutationError.set(true),
      });
  }

  responsibleUserName(userId: string | null): string {
    return userId
      ? (this.users().get(userId) ?? userId)
      : this.localization.translate("common.notProvided");
  }

  countryName(code: string): string {
    return this.countries().get(code.toUpperCase()) ?? code;
  }

  formatDate(value: string | null): string {
    if (!value) return this.localization.translate("common.notProvided");
    return new Intl.DateTimeFormat(
      this.localization.language() === "EN" ? "en" : "sr-Latn",
      { dateStyle: "medium" },
    ).format(new Date(value));
  }

  displayValue(value: string | null | undefined): string {
    return value?.trim() || this.localization.translate("common.notProvided");
  }

  tagNames(client: ClientDetail): string {
    return (
      client.tags.map((tag) => tag.name).join(", ") ||
      this.localization.translate("common.notProvided")
    );
  }

  private toTab(value: string | null): ClientTab {
    return ["cases", "documents", "activities", "financials"].includes(
      value ?? "",
    )
      ? (value as ClientTab)
      : "overview";
  }
}
