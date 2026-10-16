import { Component, DestroyRef, inject, signal } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { debounceTime, distinctUntilChanged } from "rxjs";
import { PaginationComponent } from "../../shared/ui/pagination/pagination.component";
import { injectPaginatedList } from "../../shared/pagination/paginated-list";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ClientSummary } from "@law/api-interfaces";
import { ClientsApiClient, ReferencesApiClient } from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import {
  HlmTable,
  HlmTableContainer,
  HlmTBody,
  HlmTd,
  HlmTh,
  HlmTHead,
  HlmTr,
} from "@spartan-ng/helm/table";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ClientFormDialogService } from "./client-create-edit-modal/client-form-dialog.service";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import {
  HlmEmpty,
  HlmEmptyContent,
  HlmEmptyDescription,
  HlmEmptyHeader,
  HlmEmptyTitle,
} from "@spartan-ng/helm/empty";
import {
  STATUS_BADGE_BASE_CLASSES,
  statusBadgeClass,
} from "../../shared/status-badge";
import { CLIENT_STATUS_LABELS, CLIENT_TYPE_LABELS } from "../../shared/models";

@Component({
  selector: "law-clients",
  standalone: true,
  host: { class: "block min-w-0 max-w-full" },
  templateUrl: "./clients.component.html",
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButton,
    HlmInput,
    PaginationComponent,
    HlmTable,
    HlmTableContainer,
    HlmTBody,
    HlmTd,
    HlmTh,
    HlmTHead,
    HlmTr,
    TranslatePipe,
    HlmSpinner,
    HlmEmpty,
    HlmEmptyContent,
    HlmEmptyDescription,
    HlmEmptyHeader,
    HlmEmptyTitle,
  ],
})
export class ClientsComponent {
  readonly statusBadgeBaseClasses = STATUS_BADGE_BASE_CLASSES;
  readonly statusBadgeClass = statusBadgeClass;
  readonly typeLabels = CLIENT_TYPE_LABELS;
  readonly statusLabels = CLIENT_STATUS_LABELS;
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly references = inject(ReferencesApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly clientDialog = inject(ClientFormDialogService);
  readonly search = new FormControl("", { nonNullable: true });
  readonly list = injectPaginatedList<ClientSummary>({
    fetch: (request) =>
      this.clientsApi.list({ search: this.search.value, ...request }),
  });
  readonly users = signal(new Map<string, string>());

  constructor() {
    this.references
      .users()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (users) =>
          this.users.set(
            new Map(
              users.map((membership) => [
                membership.userId,
                [membership.user.firstName, membership.user.lastName]
                  .filter(Boolean)
                  .join(" ") || membership.user.email,
              ]),
            ),
          ),
      });
    this.list.load();
    this.search.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.list.reset());
  }

  clearSearch(): void {
    this.search.setValue("");
  }
  userName(userId: string | null): string {
    return userId ? (this.users().get(userId) ?? userId) : "";
  }
  openClient(clientId: string): void {
    this.router.navigate(["/clients", clientId]);
  }

  createClient(): void {
    this.clientDialog
      .create()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((client) => {
        if (!client) return;
        this.router.navigate(["/clients", client.id]);
      });
  }
}
