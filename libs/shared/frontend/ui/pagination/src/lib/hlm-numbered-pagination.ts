import type { BooleanInput, NumberInput } from "@angular/cdk/coercion";
import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  model,
  numberAttribute,
} from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideChevronLeft, lucideChevronRight } from "@ng-icons/lucide";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmPagination } from "./hlm-pagination";
import { HlmPaginationContent } from "./hlm-pagination-content";
import { HlmPaginationEllipsis } from "./hlm-pagination-ellipsis";
import { HlmPaginationItem } from "./hlm-pagination-item";
import { HlmPaginationLink } from "./hlm-pagination-link";

export interface PaginationLabels {
  totalItems: string;
  pages: string;
  previous: string;
  next: string;
  itemsPerPage: string;
  navigation: string;
  page: string;
  morePages: string;
}

export const DEFAULT_PAGINATION_LABELS: PaginationLabels = {
  totalItems: "total items",
  pages: "pages",
  previous: "Previous",
  next: "Next",
  itemsPerPage: "Items per page",
  navigation: "Pagination",
  page: "Page",
  morePages: "More pages",
};

@Component({
  selector: "hlm-numbered-pagination",
  imports: [
    HlmPagination,
    HlmPaginationContent,
    HlmPaginationItem,
    NgIcon,
    HlmPaginationLink,
    HlmPaginationEllipsis,
    HlmSelectImports,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideChevronLeft, lucideChevronRight })],
  template: `
    <div
      class="flex flex-wrap items-center justify-between gap-3 py-2"
      [attr.inert]="disabled() ? '' : null"
      [attr.aria-busy]="disabled()"
    >
      <div class="flex items-center gap-1 text-sm text-muted-foreground">
        <b>{{ totalItems() }}</b>
        {{ labels().totalItems }} |
        <b>{{ _lastPageNumber() }}</b>
        {{ labels().pages }}
      </div>

      <nav
        hlmPagination
        class="order-last w-full sm:order-none sm:w-auto"
        [attr.aria-label]="labels().navigation"
      >
        <ul hlmPaginationContent>
          @if (showEdges() && !_isFirstPageActive()) {
            <li hlmPaginationItem>
              <button
                type="button"
                hlmPaginationLink
                [disabled]="disabled()"
                [attr.aria-label]="labels().previous"
                (click)="goToPrevious()"
              >
                <ng-icon name="lucideChevronLeft" aria-hidden="true" />
              </button>
            </li>
          }

          @for (page of _pages(); track page) {
            <li hlmPaginationItem>
              @if (page === "...") {
                <hlm-pagination-ellipsis [srOnlyText]="labels().morePages" />
              } @else {
                <button
                  type="button"
                  hlmPaginationLink
                  [disabled]="disabled()"
                  [attr.aria-label]="labels().page + ' ' + page"
                  [isActive]="currentPage() === page"
                  (click)="currentPage.set(page)"
                >
                  {{ page }}
                </button>
              }
            </li>
          }

          @if (showEdges() && !_isLastPageActive()) {
            <li hlmPaginationItem>
              <button
                type="button"
                hlmPaginationLink
                size="default"
                [disabled]="disabled()"
                [attr.aria-label]="labels().next"
                (click)="goToNext()"
              >
                <span class="hidden sm:block">{{ labels().next }}</span>
                <ng-icon name="lucideChevronRight" aria-hidden="true" />
              </button>
            </li>
          }
        </ul>
      </nav>

      <hlm-select
        [value]="itemsPerPage()"
        (valueChange)="setPageSize($event)"
        [disabled]="disabled()"
        class="ml-auto"
        [itemToString]="pageSizeToString"
      >
        <hlm-select-trigger
          class="w-fit"
          [attr.aria-label]="labels().itemsPerPage"
        >
          <hlm-select-value />
        </hlm-select-trigger>
        <hlm-select-content *hlmSelectPortal>
          <hlm-select-group>
            @for (pageSize of _pageSizesWithCurrent(); track pageSize) {
              <hlm-select-item [value]="pageSize">
                {{ pageSize }}
              </hlm-select-item>
            }
          </hlm-select-group>
        </hlm-select-content>
      </hlm-select>
    </div>
  `,
})
export class HlmNumberedPagination {
  public readonly labels = input<PaginationLabels>(DEFAULT_PAGINATION_LABELS);
  public readonly disabled = input(false);
  public readonly pageSizeToString = (
    value: number | null | undefined,
  ): string => String(value ?? "");

  protected setPageSize(value: number | null | undefined): void {
    if (value && !this.disabled()) this.itemsPerPage.set(value);
  }
  /**
   * The current (active) page.
   */
  public readonly currentPage = model.required<number>();

  /**
   * The number of items per paginated page.
   */
  public readonly itemsPerPage = model.required<number>();

  /**
   * The total number of items in the collection. Only useful when
   * doing server-side paging, where the collection size is limited
   * to a single page returned by the server API.
   */
  public readonly totalItems = input.required<number, NumberInput>({
    transform: numberAttribute,
  });

  /**
   * The number of page links to show.
   */
  public readonly maxSize = input<number, NumberInput>(7, {
    transform: numberAttribute,
  });

  /**
   * Show the first and last page buttons.
   */
  public readonly showEdges = input<boolean, BooleanInput>(true, {
    transform: booleanAttribute,
  });

  /**
   * The page sizes to show.
   * Defaults to [10, 20, 50, 100]
   */
  public readonly pageSizes = input<number[]>([10, 20, 50, 100]);

  protected readonly _pageSizesWithCurrent = computed(() => {
    const pageSizes = this.pageSizes();
    return pageSizes.includes(this.itemsPerPage())
      ? pageSizes // if current page size is included, return the same array
      : [...pageSizes, this.itemsPerPage()].sort((a, b) => a - b); // otherwise, add current page size and sort the array
  });

  protected readonly _isFirstPageActive = computed(
    () => this.currentPage() === 1,
  );
  protected readonly _isLastPageActive = computed(
    () => this.currentPage() === this._lastPageNumber(),
  );

  protected readonly _lastPageNumber = computed(() => {
    if (this.totalItems() < 1) {
      // when there are 0 or fewer (an error case) items, there are no "pages" as such,
      // but it makes sense to consider a single, empty page as the last page.
      return 1;
    }
    return Math.ceil(this.totalItems() / this.itemsPerPage());
  });

  protected readonly _pages = computed(() => {
    const correctedCurrentPage = outOfBoundCorrection(
      this.totalItems(),
      this.itemsPerPage(),
      this.currentPage(),
    );

    return createPageArray(
      correctedCurrentPage,
      this.itemsPerPage(),
      this.totalItems(),
      this.maxSize(),
    );
  });

  protected goToPrevious(): void {
    this.currentPage.set(this.currentPage() - 1);
  }

  protected goToNext(): void {
    this.currentPage.set(this.currentPage() + 1);
  }

  protected goToFirst(): void {
    this.currentPage.set(1);
  }

  protected goToLast(): void {
    this.currentPage.set(this._lastPageNumber());
  }
}

type Page = number | "...";

/**
 * Checks that the instance.currentPage property is within bounds for the current page range.
 * If not, return a correct value for currentPage, or the current value if OK.
 *
 * Copied from 'ngx-pagination' package
 */
export function outOfBoundCorrection(
  totalItems: number,
  itemsPerPage: number,
  currentPage: number,
): number {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  if (totalPages < currentPage && 0 < totalPages) {
    return totalPages;
  }

  if (currentPage < 1) {
    return 1;
  }

  return currentPage;
}

/**
 * Returns an array of Page objects to use in the pagination controls.
 *
 * Copied from 'ngx-pagination' package
 */
export function createPageArray(
  currentPage: number,
  itemsPerPage: number,
  totalItems: number,
  paginationRange: number,
): Page[] {
  // paginationRange could be a string if passed from attribute, so cast to number.
  paginationRange = +paginationRange;
  const pages: Page[] = [];

  // Return 1 as default page number
  // Make sense to show 1 instead of empty when there are no items
  const totalPages = Math.max(Math.ceil(totalItems / itemsPerPage), 1);
  const halfWay = Math.ceil(paginationRange / 2);

  const isStart = currentPage <= halfWay;
  const isEnd = totalPages - halfWay < currentPage;
  const isMiddle = !isStart && !isEnd;

  const ellipsesNeeded = paginationRange < totalPages;
  let i = 1;

  while (i <= totalPages && i <= paginationRange) {
    let label: number | "...";
    const pageNumber = calculatePageNumber(
      i,
      currentPage,
      paginationRange,
      totalPages,
    );
    const openingEllipsesNeeded = i === 2 && (isMiddle || isEnd);
    const closingEllipsesNeeded =
      i === paginationRange - 1 && (isMiddle || isStart);
    if (ellipsesNeeded && (openingEllipsesNeeded || closingEllipsesNeeded)) {
      label = "...";
    } else {
      label = pageNumber;
    }
    pages.push(label);
    i++;
  }

  return pages;
}

/**
 * Given the position in the sequence of pagination links [i],
 * figure out what page number corresponds to that position.
 *
 * Copied from 'ngx-pagination' package
 */
function calculatePageNumber(
  i: number,
  currentPage: number,
  paginationRange: number,
  totalPages: number,
) {
  const halfWay = Math.ceil(paginationRange / 2);
  if (i === paginationRange) {
    return totalPages;
  }

  if (i === 1) {
    return i;
  }

  if (paginationRange < totalPages) {
    if (totalPages - halfWay < currentPage) {
      return totalPages - paginationRange + i;
    }
    if (halfWay < currentPage) {
      return currentPage - halfWay + i;
    }
    return i;
  }

  return i;
}
