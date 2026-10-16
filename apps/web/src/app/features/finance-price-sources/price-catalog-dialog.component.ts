import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FinancialsApiClient } from "@law/api-clients";
import { PriceSourceSummary, PriceSourceVersion } from "@law/api-interfaces";
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog";
import {
  HlmDialogHeader,
  HlmDialogTitle,
  HlmDialogDescription,
  HlmDialogFooter,
} from "@spartan-ng/helm/dialog";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { LocalizationService } from "../../core/localization/localization.service";
import { PriceCatalogDeleteService } from "./price-catalog-delete.service";

@Component({
  selector: "law-price-catalog-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmDialogHeader,
    HlmDialogTitle,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmButton,
    HlmSpinner,
    TranslatePipe,
  ],
  template: `
    <hlm-dialog-header>
      <h2 hlmDialogTitle>{{ source.title }}</h2>
      <p hlmDialogDescription>
        {{ "finance.catalogViewDescription" | translate }}
      </p>
    </hlm-dialog-header>
    <div class="my-4 space-y-4 text-sm">
      @if (loading()) {
        <hlm-spinner />
      }
      @if (error()) {
        <p role="alert" class="text-destructive">{{ error() | translate }}</p>
        <button hlmBtn variant="outline" (click)="load()">
          {{ "finance.retry" | translate }}
        </button>
      }
      @if (source.sourceUrl) {
        <p class="break-all">
          {{ "finance.sourceUrl" | translate }}: {{ source.sourceUrl }}
        </p>
      }
      @for (version of versions(); track version.id; let first = $first) {
        <details [open]="first" class="rounded-lg border border-border p-4">
          <summary class="cursor-pointer font-medium">
            v{{ version.version }} ·
            {{ formatDate(version.createdAt) }}
          </summary>
          <p class="mt-3 whitespace-pre-wrap break-words">
            {{ version.rawText }}
          </p>
        </details>
      } @empty {
        @if (!loading() && !error()) {
          <p>{{ "finance.noPriceSources" | translate }}</p>
        }
      }
    </div>
    <hlm-dialog-footer>
      <button
        hlmBtn
        variant="destructive"
        [disabled]="deleting()"
        (click)="remove()"
      >
        @if (deleting()) {
          <hlm-spinner />
        }
        {{ "finance.deleteCatalog" | translate }}
      </button>
    </hlm-dialog-footer>
  `,
})
export class PriceCatalogDialogComponent {
  readonly source = injectBrnDialogContext<{ source: PriceSourceSummary }>()
    .source;
  private readonly ref = inject<BrnDialogRef<boolean>>(BrnDialogRef);
  private readonly api = inject(FinancialsApiClient);
  private readonly deletion = inject(PriceCatalogDeleteService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly localization = inject(LocalizationService);
  readonly versions = signal<PriceSourceVersion[]>([]);
  readonly loading = signal(false);
  readonly deleting = signal(false);
  readonly error = signal("");
  constructor() {
    this.load();
  }
  formatDate(value: string): string {
    return new Intl.DateTimeFormat(this.localization.locale(), {
      dateStyle: "medium",
    }).format(new Date(value));
  }
  load(): void {
    this.loading.set(true);
    this.error.set("");
    this.api
      .priceSourceVersions(this.source.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (versions) => {
          this.versions.set(versions);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set("finance.loadError");
        },
      });
  }
  remove(): void {
    if (this.deleting()) return;
    this.deleting.set(true);
    this.deletion
      .remove(this.source)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (deleted) => {
          this.deleting.set(false);
          if (deleted) this.ref.close(true);
        },
        error: () => {
          this.deleting.set(false);
          this.error.set("finance.deleteCatalogError");
        },
      });
  }
}
