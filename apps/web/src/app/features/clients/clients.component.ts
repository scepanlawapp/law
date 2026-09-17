import { Component, DestroyRef, inject, signal } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { debounceTime, distinctUntilChanged, startWith, switchMap } from "rxjs";
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

@Component({
  selector: "app-clients",
  standalone: true,
  templateUrl: "./clients.component.html",
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButton,
    HlmInput,
    HlmTable,
    HlmTableContainer,
    HlmTBody,
    HlmTd,
    HlmTh,
    HlmTHead,
    HlmTr,
    TranslatePipe,
    HlmSpinner,
  ],
})
export class ClientsComponent {
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly references = inject(ReferencesApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly clientDialog = inject(ClientFormDialogService);
  readonly search = new FormControl("", { nonNullable: true });
  readonly items = signal<ClientSummary[]>([]);
  readonly page = signal(1);
  readonly pageCount = signal(1);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly users = signal(new Map<string, string>());
  private sequence = 0;

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
    this.search.valueChanges
      .pipe(
        startWith(this.search.value),
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((search) => {
          this.page.set(1);
          return this.load(search, 1);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  load(
    search = this.search.value,
    page = this.page(),
  ): ReturnType<ClientsApiClient["list"]> {
    const sequence = ++this.sequence;
    this.loading.set(true);
    this.error.set(false);
    return this.clientsApi.list({ search, page, pageSize: 20 }).pipe(
      switchMap((response) => {
        if (sequence === this.sequence) {
          this.items.set(response.items);
          this.page.set(response.meta.page);
          this.pageCount.set(response.meta.totalPages);
          this.loading.set(false);
        }
        return [];
      }),
    );
  }

  changePage(page: number): void {
    if (page < 1 || page > this.pageCount() || this.loading()) return;
    this.load(this.search.value, page)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  retry(): void {
    this.changePage(this.page());
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
