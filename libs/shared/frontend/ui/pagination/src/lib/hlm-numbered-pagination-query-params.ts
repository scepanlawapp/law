import type { BooleanInput, NumberInput } from "@angular/cdk/coercion";
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  numberAttribute,
} from "@angular/core";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { classes } from "@spartan-ng/helm/utils";
import {
  createPageArray,
  outOfBoundCorrection,
  DEFAULT_PAGINATION_LABELS,
  type PaginationLabels,
} from "./hlm-numbered-pagination";
import { HlmPagination } from "./hlm-pagination";
import { HlmPaginationContent } from "./hlm-pagination-content";
import { HlmPaginationEllipsis } from "./hlm-pagination-ellipsis";
import { HlmPaginationItem } from "./hlm-pagination-item";
import { HlmPaginationLink } from "./hlm-pagination-link";
import { HlmPaginationNext } from "./hlm-pagination-next";
import { HlmPaginationPrevious } from "./hlm-pagination-previous";

@Component({
  selector: "hlm-numbered-pagination-query-params",
  imports: [
    HlmPagination,
    HlmPaginationContent,
    HlmPaginationItem,
    HlmPaginationPrevious,
    HlmPaginationNext,
    HlmPaginationLink,
    HlmPaginationEllipsis,
    HlmSelectImports,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
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
            <hlm-pagination-previous
              [link]="link()"
              [queryParams]="pageQuery(currentPage() - 1)"
              [text]="labels().previous"
              [aria-label]="labels().previous"
              queryParamsHandling="merge"
            />
          </li>
        }

        @for (page of _pages(); track page) {
          <li hlmPaginationItem>
            @if (page === "...") {
              <hlm-pagination-ellipsis [srOnlyText]="labels().morePages" />
            } @else {
              <a
                hlmPaginationLink
                [link]="link()"
                [queryParams]="pageQuery(page)"
                [attr.aria-label]="labels().page + ' ' + page"
                queryParamsHandling="merge"
                [isActive]="currentPage() === page"
              >
                {{ page }}
              </a>
            }
          </li>
        }

        @if (showEdges() && !_isLastPageActive()) {
          <li hlmPaginationItem>
            <hlm-pagination-next
              [link]="link()"
              [queryParams]="pageQuery(currentPage() + 1)"
              [text]="labels().next"
              [aria-label]="labels().next"
              queryParamsHandling="merge"
            />
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
            <hlm-select-item [value]="pageSize">{{ pageSize }}</hlm-select-item>
          }
        </hlm-select-group>
      </hlm-select-content>
    </hlm-select>
  `,
})
export class HlmNumberedPaginationQueryParams {
  public readonly labels = input<PaginationLabels>(DEFAULT_PAGINATION_LABELS);
  public readonly disabled = input(false);
  public readonly pageParam = input("page");
  public readonly pageSizeToString = (
    value: number | null | undefined,
  ): string => String(value ?? "");
  protected pageQuery(page: number): Record<string, number> {
    return { [this.pageParam()]: page };
  }
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
   * The URL path to use for the pagination links.
   * Defaults to '.' (current path).
   */
  public readonly link = input<string>(".");

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

  constructor() {
    classes(() => "flex flex-wrap items-center justify-between gap-3 py-2");
  }
}
