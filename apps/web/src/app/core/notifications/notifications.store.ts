import { computed, effect, inject, Injectable, signal } from "@angular/core";
import { NotificationsApiClient } from "@law/api-clients";
import { NotificationDto } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { catchError, finalize, Observable, of, tap } from "rxjs";

const PAGE_SIZE = 10;

@Injectable({ providedIn: "root" })
export class NotificationsStore {
  private readonly api = inject(NotificationsApiClient);
  private readonly auth = inject(AuthState);
  private loadedUserId: string | null = null;

  readonly items = signal<NotificationDto[]>([]);
  readonly unreadCount = signal(0);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly error = signal(false);
  readonly page = signal(0);
  readonly hasMore = signal(false);
  readonly hasUnread = computed(() => this.unreadCount() > 0);

  constructor() {
    effect(() => {
      const userId = this.auth.session()?.user.id ?? null;
      if (userId === this.loadedUserId) return;
      this.loadedUserId = userId;
      this.reset();
      if (userId) this.refreshUnreadCount().subscribe();
    });
  }

  open(): void {
    this.refreshUnreadCount().subscribe();
    if (this.page() === 0 && !this.loading()) this.loadFirstPage().subscribe();
  }

  retry(): void {
    this.loadFirstPage().subscribe();
  }

  loadMore(): void {
    if (!this.hasMore() || this.loadingMore()) return;
    const nextPage = this.page() + 1;
    this.loadingMore.set(true);
    this.api
      .list(nextPage, PAGE_SIZE)
      .pipe(finalize(() => this.loadingMore.set(false)))
      .subscribe({
        next: (response) => {
          const byId = new Map(this.items().map((item) => [item.id, item]));
          for (const item of response.items) byId.set(item.id, item);
          this.items.set([...byId.values()]);
          this.page.set(response.meta.page);
          this.hasMore.set(response.meta.hasNextPage);
        },
      });
  }

  markRead(item: NotificationDto): void {
    if (item.isRead) return;
    this.patchRead(item.id);
    this.unreadCount.update((count) => Math.max(0, count - 1));
    this.api.markRead(item.id).subscribe({
      error: () => {
        this.refreshUnreadCount().subscribe();
        this.loadFirstPage().subscribe();
      },
    });
  }

  markAllRead(): void {
    if (!this.hasUnread()) return;
    const previousItems = this.items();
    const previousCount = this.unreadCount();
    const readAt = new Date().toISOString();
    this.items.update((items) =>
      items.map((item) => ({
        ...item,
        isRead: true,
        readAt: item.readAt ?? readAt,
      })),
    );
    this.unreadCount.set(0);
    this.api.markAllRead().subscribe({
      error: () => {
        this.items.set(previousItems);
        this.unreadCount.set(previousCount);
        this.refreshUnreadCount().subscribe();
      },
    });
  }

  refreshUnreadCount(): Observable<unknown> {
    return this.api.unreadCount().pipe(
      tap((response) => this.unreadCount.set(response.count)),
      catchError(() => of(null)),
    );
  }

  private loadFirstPage(): Observable<unknown> {
    this.loading.set(true);
    this.error.set(false);
    return this.api.list(1, PAGE_SIZE).pipe(
      tap((response) => {
        this.items.set(response.items);
        this.page.set(1);
        this.hasMore.set(response.meta.hasNextPage);
      }),
      catchError(() => {
        this.error.set(true);
        return of(null);
      }),
      finalize(() => this.loading.set(false)),
    );
  }

  private patchRead(id: string): void {
    const readAt = new Date().toISOString();
    this.items.update((items) =>
      items.map((item) =>
        item.id === id ? { ...item, isRead: true, readAt } : item,
      ),
    );
  }

  private reset(): void {
    this.items.set([]);
    this.unreadCount.set(0);
    this.page.set(0);
    this.hasMore.set(false);
    this.error.set(false);
    this.loading.set(false);
    this.loadingMore.set(false);
  }
}
