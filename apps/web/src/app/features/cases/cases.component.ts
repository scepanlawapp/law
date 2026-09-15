import { Component, DestroyRef, inject, signal } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  debounceTime,
  distinctUntilChanged,
  finalize,
  startWith,
  switchMap,
  tap,
} from "rxjs";
import { MatterSummary } from "@law/api-interfaces";
import { MattersApiClient } from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "app-cases",
  standalone: true,
  templateUrl: "./cases.component.html",
  imports: [
    HlmButton,
    HlmInput,
    HlmTableImports,
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
  ],
})
export class CasesComponent {
  private readonly api = inject(MattersApiClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly search = new FormControl("", { nonNullable: true });
  readonly matters = signal<MatterSummary[]>([]);
  readonly page = signal(1);
  readonly totalPages = signal(0);
  readonly loading = signal(false);
  readonly error = signal(false);

  constructor() {
    this.search.valueChanges
      .pipe(
        startWith(""),
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((search) => {
          this.page.set(1);
          return this.load(search);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  nextPage(): void {
    if (this.page() >= this.totalPages()) return;
    this.page.update((value) => value + 1);
    this.load(this.search.value).subscribe();
  }

  previousPage(): void {
    if (this.page() <= 1) return;
    this.page.update((value) => value - 1);
    this.load(this.search.value).subscribe();
  }

  retry(): void {
    this.load(this.search.value).subscribe();
  }

  private load(search: string) {
    this.loading.set(true);
    this.error.set(false);
    return this.api
      .list({ page: this.page(), pageSize: 20, search: search.trim() })
      .pipe(
        tap({
          next: (response) => {
            this.matters.set(response.items);
            this.totalPages.set(response.meta.totalPages);
          },
          error: () => this.error.set(true),
        }),
        finalize(() => this.loading.set(false)),
      );
  }
}
