import { Injectable, inject, signal } from "@angular/core";
import { OrganizationSettings } from "@law/api-interfaces";
import { OrganizationSettingsApiClient } from "@law/api-clients";
import { Observable, finalize, tap } from "rxjs";

@Injectable({ providedIn: "root" })
export class OrganizationSettingsStore {
  private readonly api = inject(OrganizationSettingsApiClient);
  readonly settings = signal<OrganizationSettings | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);

  load(force = false): void {
    if ((this.settings() && !force) || this.loading()) return;
    this.loading.set(true);
    this.error.set(false);
    this.api
      .get()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (settings) => this.settings.set(settings),
        error: () => this.error.set(true),
      });
  }

  update<K extends keyof OrganizationSettings>(
    key: K,
    request: Observable<OrganizationSettings[K]>,
  ): Observable<OrganizationSettings[K]> {
    return request.pipe(
      tap((section) =>
        this.settings.update((current) =>
          current ? { ...current, [key]: section } : current,
        ),
      ),
    );
  }

  refresh(): void {
    this.load(true);
  }
}
