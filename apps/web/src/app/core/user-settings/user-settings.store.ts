import { computed, effect, inject, Injectable, signal } from "@angular/core";
import { UserSettingsApiClient } from "@law/api-clients";
import {
  UserSettingsPreferences,
  UserSettingsProfile,
  UserSettingsResponse,
  UserSettingsUpdateRequest,
} from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { catchError, Observable, of, tap } from "rxjs";

@Injectable({ providedIn: "root" })
export class UserSettingsStore {
  private readonly api = inject(UserSettingsApiClient);
  private readonly auth = inject(AuthState);

  readonly settings = signal<UserSettingsResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);

  readonly profile = computed<UserSettingsProfile | null>(
    () => this.settings()?.profile ?? null,
  );
  readonly preferences = computed<UserSettingsPreferences | null>(
    () => this.settings()?.preferences ?? null,
  );

  private loadedUserId: string | null = null;

  constructor() {
    effect(() => {
      const userId = this.auth.session()?.user.id ?? null;
      if (userId === this.loadedUserId) return;

      this.loadedUserId = userId;
      if (!userId) {
        this.settings.set(null);
        this.loading.set(false);
        this.error.set(false);
        return;
      }

      this.load().subscribe();
    });
  }

  load(): Observable<UserSettingsResponse | null> {
    this.loading.set(true);
    this.error.set(false);

    return this.api.get().pipe(
      tap((response) => {
        this.settings.set(response);
        this.loading.set(false);
      }),
      catchError(() => {
        this.loading.set(false);
        this.error.set(true);
        return of(null);
      }),
    );
  }

  update(request: UserSettingsUpdateRequest): Observable<UserSettingsResponse> {
    return this.api.update(request).pipe(
      tap((updated) => {
        this.settings.set(updated);
      }),
    );
  }

  /** Patch the cached profile locally, e.g. after an avatar upload that bypasses `update()`. */
  patchProfile(patch: Partial<UserSettingsProfile>): void {
    const current = this.settings();
    if (!current) return;

    this.settings.set({
      ...current,
      profile: { ...current.profile, ...patch },
    });
  }
}
