import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from "@angular/core";
import { DatePipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { RevenueSharingApiClient } from "@law/api-clients";
import { RevenueHistoryEntry } from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { PaginationComponent } from "../../shared/ui/pagination/pagination.component";
import { RevenueVersionDialogComponent } from "./revenue-version-dialog.component";

@Component({
  selector: "law-revenue-versions",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    HlmButton,
    HlmSpinner,
    HlmTableImports,
    TranslatePipe,
    PaginationComponent,
  ],
  templateUrl: "./revenue-versions.component.html",
})
export class RevenueVersionsComponent {
  private readonly api = inject(RevenueSharingApiClient);
  private readonly dialogs = inject(HlmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private request = 0;
  private activeDialog: RevenueVersionDialogComponent | null = null;
  readonly versions = signal<RevenueHistoryEntry[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly total = signal(0);
  constructor() {
    this.load();
  }
  load() {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set(false);
    this.api
      .listVersions({ page: this.page(), pageSize: this.pageSize() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (request !== this.request) return;
          this.versions.set(result.items);
          this.total.set(result.meta.totalItems);
          this.loading.set(false);
        },
        error: () => {
          if (request === this.request) {
            this.error.set(true);
            this.loading.set(false);
          }
        },
      });
  }
  changePage(page: number) {
    this.page.set(page);
    this.load();
  }
  changePageSize(size: number) {
    this.pageSize.set(size);
    this.page.set(1);
    this.load();
  }
  async confirmLeave() {
    if (!this.activeDialog) return true;
    if (!(await this.activeDialog.confirmLeave())) return false;
    this.activeDialog.close();
    return true;
  }
  create() {
    if (this.activeDialog) return;
    const ref = this.dialogs.open<boolean>(RevenueVersionDialogComponent, {
      contentClass:
        "w-[calc(100vw-2rem)] sm:max-w-6xl h-[calc(100dvh-4rem)] flex flex-col overflow-hidden",
      context: {
        register: (dialog: RevenueVersionDialogComponent) => {
          this.activeDialog = dialog;
        },
      },
      showCloseButton: false,
      disableClose: true,
      closeOnOutsidePointerEvents: false,
    });
    ref.closed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((saved) => {
      this.activeDialog = null;
      if (saved) {
        this.page.set(1);
        this.load();
      }
    });
  }
}
