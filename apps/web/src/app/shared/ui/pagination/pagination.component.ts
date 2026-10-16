import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from "@angular/core";
import {
  HlmNumberedPagination,
  HlmNumberedPaginationQueryParams,
  PaginationLabels,
} from "@spartan-ng/helm/pagination";
import { LocalizationService } from "../../../core/localization/localization.service";
import { PAGE_SIZE_OPTIONS, Paginator } from "../../pagination/paginated-list";

@Component({
  selector: "law-pagination",
  standalone: true,
  host: { class: "block min-w-0" },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmNumberedPagination, HlmNumberedPaginationQueryParams],
  template: `
    @let state = paginator();
    @if (queryParams()) {
      <hlm-numbered-pagination-query-params
        [currentPage]="state.page()"
        [itemsPerPage]="state.pageSize()"
        [totalItems]="state.totalItems()"
        [pageSizes]="pageSizes"
        [labels]="labels()"
        [maxSize]="5"
        [pageParam]="pageParam()"
        [disabled]="state.loading()"
        [attr.inert]="state.loading() ? '' : null"
        [attr.aria-busy]="state.loading()"
        (itemsPerPageChange)="state.changePageSize($event)"
      />
    } @else {
      <hlm-numbered-pagination
        [currentPage]="state.page()"
        [itemsPerPage]="state.pageSize()"
        [totalItems]="state.totalItems()"
        [pageSizes]="pageSizes"
        [labels]="labels()"
        [maxSize]="5"
        [disabled]="state.loading()"
        (currentPageChange)="state.changePage($event)"
        (itemsPerPageChange)="state.changePageSize($event)"
      />
    }
  `,
})
export class PaginationComponent {
  private readonly localization = inject(LocalizationService);
  readonly paginator = input.required<Paginator>();
  readonly pageSizes = [...PAGE_SIZE_OPTIONS];
  /** Page links are router links on `pageParam`; the route drives the paginator. */
  readonly queryParams = input(false);
  readonly pageParam = input("page");
  readonly labels = computed<PaginationLabels>(() => ({
    totalItems: this.localization.translate("pagination.totalItems"),
    pages: this.localization.translate("pagination.pages"),
    previous: this.localization.translate("pagination.previous"),
    next: this.localization.translate("pagination.next"),
    itemsPerPage: this.localization.translate("pagination.itemsPerPage"),
    navigation: this.localization.translate("pagination.navigation"),
    page: this.localization.translate("pagination.page"),
    morePages: this.localization.translate("pagination.morePages"),
  }));
}
