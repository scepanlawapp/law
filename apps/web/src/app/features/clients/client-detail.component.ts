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
import { forkJoin } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { loadCountryOptions } from "../../shared/utils/countries";
import { CasesListComponent } from "../cases/cases-list/cases-list.component";
import { DocumentUploadDialogService } from "../documents/document-upload-modal/document-upload-dialog.service";
import { ClientFormDialogService } from "./client-create-edit-modal/client-form-dialog.service";

type ClientTab =
  | "overview"
  | "cases"
  | "documents"
  | "activities"
  | "financials";

@Component({
  selector: "app-client-detail",
  standalone: true,
  templateUrl: "./client-detail.component.html",
  imports: [
    RouterLink,
    HlmButton,
    HlmSpinner,
    HlmTabs,
    HlmTabsContent,
    HlmTabsList,
    HlmTabsTrigger,
    CasesListComponent,
    TranslatePipe,
  ],
})
export class ClientDetailComponent {
  private readonly api = inject(ClientsApiClient);
  private readonly references = inject(ReferencesApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly localization = inject(LocalizationService);
  private readonly clientDialog = inject(ClientFormDialogService);
  private readonly uploadDialog = inject(DocumentUploadDialogService);

  readonly id = this.route.snapshot.paramMap.get("clientId")!;
  readonly client = signal<ClientDetail | null>(null);
  readonly addresses = signal<ClientAddress[]>([]);
  readonly contacts = signal<ClientContact[]>([]);
  readonly identificationDocuments = signal<ClientIdentificationDocument[]>([]);
  readonly users = signal(new Map<string, string>());
  readonly countries = signal(new Map<string, string>());
  readonly loading = signal(true);
  readonly error = signal(false);
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
    [...this.contacts()].sort(
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

  editClient(): void {
    this.clientDialog
      .edit(this.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((updated) => {
        if (updated) this.reload();
      });
  }

  openDocumentsUpload(): void {
    const client = this.client();
    if (!client) return;
    this.uploadDialog
      .open({
        clientId: client.id,
        clientLabel: this.title(),
        lockClient: true,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
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
