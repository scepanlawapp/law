import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
} from "@angular/core";
import {
  HlmNumberedPagination,
  HlmNumberedPaginationQueryParams,
  PaginationLabels,
} from "@spartan-ng/helm/pagination";
import { LocalizationService } from "../../../core/localization/localization.service";

@Component({
  selector: "law-pagination",
  standalone: true,
  host: { class: "block min-w-0" },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmNumberedPagination, HlmNumberedPaginationQueryParams],
  template: `
    @if (queryParams()) {
      <hlm-numbered-pagination-query-params
        [currentPage]="currentPage()"
        [itemsPerPage]="itemsPerPage()"
        [totalItems]="totalItems()"
        [labels]="labels()"
        [maxSize]="5"
        [pageParam]="pageParam()"
        [disabled]="disabled()"
        [attr.inert]="disabled() ? '' : null"
        [attr.aria-busy]="disabled()"
        (itemsPerPageChange)="itemsPerPage.set($event)"
      />
    } @else {
      <hlm-numbered-pagination
        [currentPage]="currentPage()"
        [itemsPerPage]="itemsPerPage()"
        [totalItems]="totalItems()"
        [labels]="labels()"
        [maxSize]="5"
        [disabled]="disabled()"
        (currentPageChange)="currentPage.set($event)"
        (itemsPerPageChange)="itemsPerPage.set($event)"
      />
    }
  `,
})
export class PaginationComponent {
  private readonly localization = inject(LocalizationService);
  readonly currentPage = model.required<number>();
  readonly itemsPerPage = model.required<number>();
  readonly totalItems = input.required<number>();
  readonly disabled = input(false);
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
