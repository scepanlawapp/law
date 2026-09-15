import { Component, DestroyRef, inject, signal } from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatterDetail } from "@law/api-interfaces";
import { MattersApiClient } from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "app-matter-detail",
  standalone: true,
  imports: [HlmButton, RouterLink, TranslatePipe],
  templateUrl: "./matter-detail.component.html",
})
export class MatterDetailComponent {
  private readonly api = inject(MattersApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly matter = signal<MatterDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly tab = signal<
    "overview" | "documents" | "participants" | "proceedings" | "activity"
  >("overview");

  selectTab(value: string): void {
    if (["overview", "documents", "participants", "proceedings", "activity"].includes(value)) {
      this.tab.set(value as typeof this.tab extends () => infer T ? T : never);
    }
  }

  constructor() {
    const matterId = this.route.snapshot.paramMap.get("matterId");
    if (!matterId) {
      this.loading.set(false);
      this.error.set(true);
      return;
    }
    this.api
      .get(matterId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (matter) => {
          this.matter.set(matter);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }
}
