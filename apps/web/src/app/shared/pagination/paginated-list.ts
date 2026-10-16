import {
  DestroyRef,
  Signal,
  WritableSignal,
  computed,
  inject,
  signal,
} from "@angular/core";
import { PaginationMeta } from "@law/api-interfaces";
import { Observable, Subscription } from "rxjs";

export const PAGE_SIZE_OPTIONS: readonly number[] = [10, 20, 50, 100];
/** The only page size the app uses unless a user picks another one. */
export const DEFAULT_PAGE_SIZE = 100;

export interface PageRequest {
  readonly page: number;
  readonly pageSize: number;
}

/** First page at the default size, for lookups and option lists. */
export const FIRST_PAGE: PageRequest = { page: 1, pageSize: DEFAULT_PAGE_SIZE };

export type PageMeta = Pick<PaginationMeta, "totalItems" | "totalPages">;

/** Any server page: `PaginatedResponse<T>` and feature-specific page types fit. */
export interface PageResponse<T> {
  readonly items: T[];
  readonly meta: PageMeta;
}

/** What the `law-pagination` control needs from any paginated source. */
export interface Paginator {
  readonly page: Signal<number>;
  readonly pageSize: Signal<number>;
  readonly totalItems: Signal<number>;
  readonly pageCount: Signal<number>;
  readonly loading: Signal<boolean>;
  changePage(page: number): void;
  changePageSize(pageSize: number): void;
}

export interface PageStateOptions {
  /** Supply when the total is derived elsewhere (e.g. a local list). */
  readonly totalItems?: Signal<number>;
  /** Supply when the owner tracks its own request state. */
  readonly loading?: Signal<boolean>;
  /** Runs after the pager changes the page or page size. */
  readonly onChange?: (request: PageRequest) => void;
}

/** Page bookkeeping without fetching; the owner loads data in `onChange`. */
export class PageState implements Paginator {
  readonly page = signal(1);
  readonly pageSize: WritableSignal<number>;
  readonly totalItems: Signal<number>;
  readonly loading: Signal<boolean>;
  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.totalItems() / this.pageSize())),
  );
  protected readonly total = signal(0);
  protected readonly busy = signal(false);
  protected onChange?: (request: PageRequest) => void;

  constructor(options: PageStateOptions = {}) {
    this.pageSize = signal(DEFAULT_PAGE_SIZE);
    this.totalItems = options.totalItems ?? this.total.asReadonly();
    this.loading = options.loading ?? this.busy.asReadonly();
    this.onChange = options.onChange;
  }

  get request(): PageRequest {
    return { page: this.page(), pageSize: this.pageSize() };
  }

  changePage(page: number): void {
    if (
      this.loading() ||
      page < 1 ||
      page > this.pageCount() ||
      page === this.page()
    )
      return;
    this.page.set(page);
    this.onChange?.(this.request);
  }

  changePageSize(pageSize: number): void {
    if (this.loading() || pageSize < 1 || pageSize === this.pageSize()) return;
    this.pageSize.set(pageSize);
    this.page.set(1);
    this.onChange?.(this.request);
  }

  /** Back to page one with no known total. */
  clear(): void {
    this.total.set(0);
    this.page.set(1);
  }

  /**
   * Records the server totals for `page`. Returns the last valid page when
   * `page` is past the end (the caller should reload it), otherwise `null`.
   */
  applyPage(page: number, meta: PageMeta): number | null {
    const lastPage = Math.max(1, meta.totalPages ?? 1);
    this.total.set(meta.totalItems ?? 0);
    this.page.set(Math.min(page, lastPage));
    return page > lastPage ? lastPage : null;
  }
}

export interface PaginatedListOptions<T> {
  readonly fetch: (request: PageRequest) => Observable<PageResponse<T>>;
  /** URL-driven lists navigate instead of loading; the route handler calls `load()`. */
  readonly navigate?: (request: PageRequest) => void;
  readonly onError?: (error: unknown) => void;
}

/** Server-paginated list: page state, items, request cancellation and clamping. */
export class PaginatedList<T> extends PageState {
  readonly items = signal<T[]>([]);
  readonly error = signal(false);
  readonly loaded = signal(false);
  /** For load-more / infinite scroll lists. */
  readonly hasMore = computed(
    () => this.loaded() && !this.error() && this.page() < this.pageCount(),
  );
  private sequence = 0;
  private subscription?: Subscription;

  constructor(
    private readonly options: PaginatedListOptions<T>,
    destroyRef: DestroyRef,
  ) {
    super();
    this.onChange = options.navigate ?? ((request) => this.load(request.page));
    destroyRef.onDestroy(() => this.cancel());
  }

  /** Loads `page` and replaces the items. */
  load(page = this.page()): void {
    this.fetchPage(page, false);
  }

  /** Starts over from the first page, e.g. after a filter change. */
  reset(): void {
    this.load(1);
  }

  /** Appends the next page. */
  loadMore(): void {
    if (this.loading() || !this.hasMore()) return;
    this.fetchPage(this.page() + 1, true);
  }

  /** Drops the in-flight request; its response will be ignored. */
  cancel(): void {
    this.sequence++;
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.busy.set(false);
  }

  /** Clears items and totals without a request. */
  override clear(): void {
    this.cancel();
    this.items.set([]);
    this.error.set(false);
    super.clear();
  }

  /** Applies a page fetched outside `load()`, e.g. a silent refresh. */
  setResponse(page: number, response: PageResponse<T>): void {
    this.applyPage(page, response.meta);
    this.items.set(response.items);
    this.loaded.set(true);
  }

  private fetchPage(page: number, append: boolean): void {
    const sequence = ++this.sequence;
    this.subscription?.unsubscribe();
    this.busy.set(true);
    this.error.set(false);
    const subscription = new Subscription();
    this.subscription = subscription;
    subscription.add(
      this.options.fetch({ page, pageSize: this.pageSize() }).subscribe({
        next: (response) => {
          if (sequence !== this.sequence) return;
          const lastPage = this.applyPage(page, response.meta);
          if (lastPage !== null && !append) {
            if (this.options.navigate) {
              this.busy.set(false);
              this.options.navigate({
                page: lastPage,
                pageSize: this.pageSize(),
              });
            } else {
              this.fetchPage(lastPage, false);
            }
            return;
          }
          this.items.update((items) =>
            append ? [...items, ...response.items] : response.items,
          );
          this.loaded.set(true);
          this.busy.set(false);
        },
        error: (error: unknown) => {
          if (sequence !== this.sequence) return;
          this.error.set(true);
          this.busy.set(false);
          this.options.onError?.(error);
        },
        complete: () => {
          if (sequence === this.sequence) this.busy.set(false);
        },
      }),
    );
  }
}

/** Creates a `PaginatedList` bound to the current injection context's lifetime. */
export function injectPaginatedList<T>(
  options: PaginatedListOptions<T>,
): PaginatedList<T> {
  return new PaginatedList(options, inject(DestroyRef));
}

export interface LocalPaginationOptions {
  readonly loading?: Signal<boolean>;
}

/** Client-side pages over an in-memory list. */
export class LocalPagination<T> extends PageState {
  readonly items = computed(() => {
    const start =
      (Math.min(this.page(), this.pageCount()) - 1) * this.pageSize();
    return this.source().slice(start, start + this.pageSize());
  });

  constructor(
    private readonly source: Signal<readonly T[]>,
    options: LocalPaginationOptions = {},
  ) {
    super({ ...options, totalItems: computed(() => source().length) });
  }

  /** Back to the first page, e.g. after a filter change. */
  reset(): void {
    this.page.set(1);
  }

  /** Keeps the page in range after the source shrinks. */
  clamp(): void {
    this.page.update((page) => Math.min(page, this.pageCount()));
  }
}
