import { Component, DestroyRef, inject, signal } from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { LegalClientDetail } from "@law/api-interfaces";
import { LegalClientsApiClient } from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "app-client-detail",
  standalone: true,
  imports: [HlmButton, RouterLink, TranslatePipe],
  templateUrl: "./client-detail.component.html",
})
export class ClientDetailComponent {
  private readonly api = inject(LegalClientsApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly client = signal<LegalClientDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly tab = signal<
    "overview" | "contacts" | "matters" | "documents" | "activity"
  >("overview");

  selectTab(value: string): void {
    if (["overview", "contacts", "matters", "documents", "activity"].includes(value)) {
      this.tab.set(value as typeof this.tab extends () => infer T ? T : never);
    }
  }

  constructor() {
    const clientId = this.route.snapshot.paramMap.get("clientId");
    if (!clientId) {
      this.loading.set(false);
      this.error.set(true);
      return;
    }
    this.api
      .get(clientId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (client) => {
          this.client.set(client);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }
}
