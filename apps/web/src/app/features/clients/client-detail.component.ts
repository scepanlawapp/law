import { Component, inject, signal } from "@angular/core";
import { RouterLink, ActivatedRoute } from "@angular/router";
import { ClientDetail } from "@law/api-interfaces";
import {
  ClientsApiClient,
  ClientAddress,
  ClientContact,
  DomainActivity,
} from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmTabs,
  HlmTabsContent,
  HlmTabsList,
  HlmTabsTrigger,
} from "@spartan-ng/helm/tabs";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { LocalizationService } from "../../core/localization/localization.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ClientFormDialogService } from "./client-create-edit-modal/client-form-dialog.service";

@Component({
  selector: "app-client-detail",
  standalone: true,
  templateUrl: "./client-detail.component.html",
  imports: [
    RouterLink,
    HlmButton,
    HlmTabs,
    HlmTabsContent,
    HlmTabsList,
    HlmTabsTrigger,
    TranslatePipe,
  ],
})
export class ClientDetailComponent {
  private readonly api = inject(ClientsApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly local = inject(LocalizationService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly clientDialog = inject(ClientFormDialogService);
  readonly id = this.route.snapshot.paramMap.get("clientId")!;
  readonly client = signal<ClientDetail | null>(null);
  readonly loading = signal(true);
  readonly addresses = signal<ClientAddress[]>([]);
  readonly contacts = signal<ClientContact[]>([]);
  readonly activities = signal<DomainActivity[]>([]);
  readonly clientCases = signal<{
    items: Array<{ id: string; caseNumber: string; name: string }>;
    meta: { page: number; totalPages: number };
  } | null>(null);
  constructor() {
    this.reload();
  }
  reload(): void {
    this.loading.set(true);
    this.api.get(this.id).subscribe({
      next: (client) => {
        this.client.set(client);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error(this.local.translate("clients.loadError"));
      },
    });
  }
  editClient(): void {
    this.clientDialog.edit(this.id).subscribe((updated) => {
      if (!updated) return;
      this.reload();
      this.load("addresses");
      this.load("contacts");
    });
  }
  load(tab: string): void {
    if (tab === "cases")
      this.api
        .listCases(this.id, { page: 1, pageSize: 20 })
        .subscribe({ next: (result) => this.clientCases.set(result) });
    if (tab === "activities")
      this.api
        .listActivities(this.id, { page: 1, pageSize: 20 })
        .subscribe({ next: (result) => this.activities.set(result.items) });
    if (tab === "contacts")
      this.api
        .listContacts(this.id)
        .subscribe({ next: (items) => this.contacts.set(items) });
    if (tab === "addresses")
      this.api
        .listAddresses(this.id)
        .subscribe({ next: (items) => this.addresses.set(items) });
  }
  archive(): void {
    this.confirm
      .confirm({
        title: this.local.translate("clients.archive"),
        message: this.local.translate("clients.archiveConfirm"),
        variant: "danger",
      })
      .subscribe((ok) => {
        if (ok)
          this.api.archive(this.id).subscribe({
            next: () => {
              this.toast.success(this.local.translate("clients.saved"));
              this.reload();
            },
            error: () =>
              this.toast.error(this.local.translate("clients.saveError")),
          });
      });
  }
  activate(): void {
    this.api.activate(this.id).subscribe({
      next: () => {
        this.toast.success(this.local.translate("clients.saved"));
        this.reload();
      },
      error: () => this.toast.error(this.local.translate("clients.saveError")),
    });
  }
  deactivateContact(contactId: string): void {
    this.confirm
      .confirm({
        title: this.local.translate("clients.deactivate"),
        message: this.local.translate("clients.deactivateConfirm"),
        variant: "danger",
      })
      .subscribe((ok) => {
        if (ok)
          this.api
            .deactivateContact(this.id, contactId)
            .subscribe({ next: () => this.load("contacts") });
      });
  }
  removeAddress(addressId: string): void {
    this.confirm
      .confirm({
        title: this.local.translate("clients.remove"),
        message: this.local.translate("clients.removeConfirm"),
        variant: "danger",
      })
      .subscribe((ok) => {
        if (ok)
          this.api
            .removeAddress(this.id, addressId)
            .subscribe({ next: () => this.load("addresses") });
      });
  }
}
