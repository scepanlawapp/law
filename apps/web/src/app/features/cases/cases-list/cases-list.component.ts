import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, Params, Router, RouterLink } from "@angular/router";
import { CaseStatus, CaseSummary, SortDirection } from "@law/api-interfaces";
import {
  CaseListQuery,
  CasesApiClient,
  ClientsApiClient,
  ReferencesApiClient,
} from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { PaginationComponent } from "../../../shared/ui/pagination/pagination.component";
import {
  HlmEmpty,
  HlmEmptyContent,
  HlmEmptyDescription,
  HlmEmptyHeader,
  HlmEmptyTitle,
} from "@spartan-ng/helm/empty";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import {
  HlmCombobox,
  HlmComboboxContent,
  HlmComboboxEmpty,
  HlmComboboxInput,
  HlmComboboxItem,
  HlmComboboxList,
  HlmComboboxPortal,
  HlmComboboxTrigger,
  HlmComboboxValue,
} from "@spartan-ng/helm/combobox";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import {
  HlmTable,
  HlmTableContainer,
  HlmTBody,
  HlmTd,
  HlmTh,
  HlmTHead,
  HlmTr,
} from "@spartan-ng/helm/table";
import { debounceTime, distinctUntilChanged, forkJoin } from "rxjs";
import {
  DEFAULT_PAGE_SIZE,
  FIRST_PAGE,
  PAGE_SIZE_OPTIONS,
  injectPaginatedList,
} from "../../../shared/pagination/paginated-list";
import { LocalizationService } from "../../../core/localization/localization.service";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import {
  STATUS_BADGE_BASE_CLASSES,
  priorityBadgeClass,
  statusBadgeClass,
} from "../../../shared/status-badge";
import {
  ALL_OPTION_VALUE,
  AllOptionValue,
  CASE_PRIORITY_LABELS,
  CASE_SORT_FIELDS,
  CASE_STATUS_LABELS,
  CaseSortField,
  SortValue,
  createSelectItemToString,
  createSortItemToString,
  filterOptionsFrom,
  isSortValue,
  sortOptions,
  sortValue,
} from "../../../shared/models";

const DEFAULT_CASE_SORT = sortValue<CaseSortField>(
  "updatedAt",
  SortDirection.DESC,
);

@Component({
  selector: "law-cases-list",
  standalone: true,
  host: { class: "block min-w-0 max-w-full" },
  templateUrl: "./cases-list.component.html",
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButton,
    HlmCombobox,
    HlmComboboxContent,
    HlmComboboxEmpty,
    HlmComboboxInput,
    HlmComboboxItem,
    HlmComboboxList,
    HlmComboboxPortal,
    HlmComboboxTrigger,
    HlmComboboxValue,
    HlmInput,
    PaginationComponent,
    HlmEmpty,
    HlmEmptyContent,
    HlmEmptyDescription,
    HlmEmptyHeader,
    HlmEmptyTitle,
    HlmSelectImports,
    HlmSpinner,
    HlmTable,
    HlmTableContainer,
    HlmTBody,
    HlmTd,
    HlmTh,
    HlmTHead,
    HlmTr,
    TranslatePipe,
  ],
})
export class CasesListComponent implements OnInit {
  private readonly api = inject(CasesApiClient);
  private readonly clientsApi = inject(ClientsApiClient);
  private readonly references = inject(ReferencesApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly localization = inject(LocalizationService);

  readonly clientId = input<string>();
  readonly showHeading = input(true);
  readonly search = new FormControl("", { nonNullable: true });
  readonly status = new FormControl<CaseStatus | AllOptionValue>(
    ALL_OPTION_VALUE,
    { nonNullable: true },
  );
  readonly responsibleUserId = new FormControl("", { nonNullable: true });
  readonly sort = new FormControl<SortValue<CaseSortField>>(DEFAULT_CASE_SORT, {
    nonNullable: true,
  });
  readonly list = injectPaginatedList<CaseSummary>({
    fetch: (request) =>
      this.api.list({
        clientId: this.clientId(),
        search: this.search.value || undefined,
        status: this.status.value || undefined,
        responsibleUserId: this.responsibleUserId.value || undefined,
        sort: this.sort.value,
        ...request,
      } satisfies CaseListQuery),
    navigate: ({ page, pageSize }) =>
      this.updateQuery({ casePage: page, casePageSize: pageSize }),
  });
  readonly statusBadgeBaseClasses = STATUS_BADGE_BASE_CLASSES;
  readonly statusBadgeClass = statusBadgeClass;
  readonly priorityBadgeClass = priorityBadgeClass;
  readonly users = signal<Array<{ id: string; name: string }>>([]);
  readonly clients = signal(new Map<string, string>());
  readonly statusLabels = CASE_STATUS_LABELS;
  readonly priorityLabels = CASE_PRIORITY_LABELS;
  readonly statusOptions = filterOptionsFrom(
    CASE_STATUS_LABELS,
    "cases.allStatuses",
  );
  readonly sortOptions = sortOptions(CASE_SORT_FIELDS);
  readonly statusItemToString = createSelectItemToString(
    this.statusOptions,
    (key) => this.localization.translate(key),
  );
  readonly sortItemToString = createSortItemToString(
    CASE_SORT_FIELDS,
    (key, params) => this.localization.translate(key, params),
  );
  readonly userItemToString = (value: string | null | undefined): string =>
    value
      ? (this.users().find((user) => user.id === value)?.name ?? value)
      : this.localization.translate("cases.allResponsibleUsers");

  private applyingUrlState = false;

  constructor() {
    forkJoin({
      users: this.references.users(),
      clients: this.clientsApi.list(FIRST_PAGE),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ users, clients }) => {
        this.users.set(
          users.map((membership) => ({
            id: membership.userId,
            name:
              [membership.user.firstName, membership.user.lastName]
                .filter(Boolean)
                .join(" ") || membership.user.email,
          })),
        );
        this.clients.set(
          new Map(
            clients.items.map((client) => [client.id, client.displayName]),
          ),
        );
      });
  }

  ngOnInit(): void {
    this.route.queryParamMap
      .pipe(
        distinctUntilChanged((previous, current) =>
          [
            "caseSearch",
            "caseStatus",
            "caseResponsibleUserId",
            "caseSort",
            "casePage",
            "casePageSize",
          ].every((key) => previous.get(key) === current.get(key)),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((params) => {
        this.applyingUrlState = true;
        this.search.setValue(params.get("caseSearch") ?? "", {
          emitEvent: false,
        });
        this.status.setValue(this.caseStatus(params.get("caseStatus")), {
          emitEvent: false,
        });
        this.responsibleUserId.setValue(
          params.get("caseResponsibleUserId") ?? "",
          { emitEvent: false },
        );
        this.sort.setValue(this.caseSort(params.get("caseSort")), {
          emitEvent: false,
        });
        const pageSize = Number(params.get("casePageSize"));
        this.list.pageSize.set(
          PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
        );
        this.applyingUrlState = false;
        this.list.load(this.positiveInteger(params.get("casePage")));
      });

    this.search.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.updateQuery({ casePage: 1 }));
    this.status.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateQuery({ casePage: 1 }));
    this.responsibleUserId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateQuery({ casePage: 1 }));
    this.sort.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateQuery({ casePage: 1 }));
  }

  setResponsibleUserId(value: string | null | undefined): void {
    this.responsibleUserId.setValue(value ?? "");
    this.responsibleUserId.markAsDirty();
    this.responsibleUserId.markAsTouched();
  }

  clearFilters(): void {
    this.search.setValue("", { emitEvent: false });
    this.status.setValue(ALL_OPTION_VALUE, { emitEvent: false });
    this.responsibleUserId.setValue("", { emitEvent: false });
    this.updateQuery({ casePage: 1 });
  }

  userName(userId: string): string {
    return this.users().find((user) => user.id === userId)?.name ?? userId;
  }

  clientName(clientId: string): string {
    return this.clients().get(clientId) ?? clientId;
  }

  formatDate(value: string | null): string {
    if (!value) return this.localization.translate("common.notProvided");
    return new Intl.DateTimeFormat(this.localization.locale(), {
      dateStyle: "medium",
    }).format(new Date(value));
  }

  emptyMessageKey(): string {
    if (this.hasFilters()) return "cases.noFilterResults";
    return this.clientId() ? "cases.emptyForClient" : "cases.empty";
  }

  hasFilters(): boolean {
    return !!(
      this.search.value ||
      this.status.value ||
      this.responsibleUserId.value
    );
  }

  emptyTitleKey(): string {
    if (this.hasFilters()) return "cases.noFilterResultsTitle";
    return this.clientId() ? "cases.emptyForClientTitle" : "cases.emptyTitle";
  }

  caseCreateQueryParams(): Params | null {
    const clientId = this.clientId();
    return clientId ? { clientId, returnUrl: this.router.url } : null;
  }

  private updateQuery(extra: Record<string, string | number | null>): void {
    if (this.applyingUrlState) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        caseSearch: this.search.value || null,
        caseStatus: this.status.value || null,
        caseResponsibleUserId: this.responsibleUserId.value || null,
        caseSort:
          this.sort.value === DEFAULT_CASE_SORT ? null : this.sort.value,
        ...extra,
      },
      queryParamsHandling: "merge",
    });
  }

  private positiveInteger(value: string | null): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  }

  private caseStatus(value: string | null): CaseStatus | AllOptionValue {
    return this.statusOptions.some((option) => option.value === value)
      ? (value as CaseStatus | AllOptionValue)
      : ALL_OPTION_VALUE;
  }

  private caseSort(value: string | null): SortValue<CaseSortField> {
    return isSortValue(CASE_SORT_FIELDS, value) ? value : DEFAULT_CASE_SORT;
  }
}
