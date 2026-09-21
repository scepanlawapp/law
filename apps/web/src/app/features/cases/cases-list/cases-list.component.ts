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
import { CaseStatus, CaseSummary } from "@law/api-interfaces";
import {
  CaseListQuery,
  CasesApiClient,
  ClientsApiClient,
  ReferencesApiClient,
} from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import {
  HlmEmpty,
  HlmEmptyContent,
  HlmEmptyDescription,
  HlmEmptyHeader,
  HlmEmptyTitle,
} from "@spartan-ng/helm/empty";
import { HlmSelectImports } from "@spartan-ng/helm/select";
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
import { debounceTime, distinctUntilChanged, finalize, forkJoin } from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import {
  createSelectItemToString,
  type SelectOption,
} from "../../../shared/utils";

type CaseSort =
  | "updatedAt:desc"
  | "updatedAt:asc"
  | "caseNumber:asc"
  | "caseNumber:desc"
  | "name:asc"
  | "name:desc";

@Component({
  selector: "law-cases-list",
  standalone: true,
  templateUrl: "./cases-list.component.html",
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButton,
    HlmInput,
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
  readonly status = new FormControl<CaseStatus | "">("", {
    nonNullable: true,
  });
  readonly responsibleUserId = new FormControl("", { nonNullable: true });
  readonly sort = new FormControl<CaseSort>("updatedAt:desc", {
    nonNullable: true,
  });
  readonly items = signal<CaseSummary[]>([]);
  readonly page = signal(1);
  readonly pageCount = signal(1);
  readonly totalItems = signal(0);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly loaded = signal(false);
  readonly users = signal<Array<{ id: string; name: string }>>([]);
  readonly clients = signal(new Map<string, string>());
  readonly statusOptions: ReadonlyArray<SelectOption<CaseStatus | "">> = [
    { value: "", label: "cases.allStatuses" },
    { value: "DRAFT", label: "cases.status.DRAFT" },
    { value: "ACTIVE", label: "cases.status.ACTIVE" },
    { value: "ON_HOLD", label: "cases.status.ON_HOLD" },
    { value: "CLOSED", label: "cases.status.CLOSED" },
    { value: "ARCHIVED", label: "cases.status.ARCHIVED" },
  ];
  readonly sortOptions: ReadonlyArray<SelectOption<CaseSort>> = [
    { value: "updatedAt:desc", label: "cases.sort.updatedNewest" },
    { value: "updatedAt:asc", label: "cases.sort.updatedOldest" },
    { value: "caseNumber:asc", label: "cases.sort.numberAsc" },
    { value: "caseNumber:desc", label: "cases.sort.numberDesc" },
    { value: "name:asc", label: "cases.sort.nameAsc" },
    { value: "name:desc", label: "cases.sort.nameDesc" },
  ];
  readonly statusItemToString = createSelectItemToString(
    this.statusOptions,
    (key) => this.localization.translate(key),
  );
  readonly sortItemToString = createSelectItemToString(
    this.sortOptions,
    (key) => this.localization.translate(key),
  );
  readonly userItemToString = (value: string | null | undefined): string =>
    value
      ? (this.users().find((user) => user.id === value)?.name ?? value)
      : this.localization.translate("cases.allResponsibleUsers");

  private requestSequence = 0;
  private applyingUrlState = false;

  constructor() {
    forkJoin({
      users: this.references.users(),
      clients: this.clientsApi.list({ page: 1, pageSize: 100 }),
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
      .pipe(takeUntilDestroyed(this.destroyRef))
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
        this.page.set(this.positiveInteger(params.get("casePage")));
        this.applyingUrlState = false;
        this.load();
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

  load(): void {
    const sequence = ++this.requestSequence;
    const query: CaseListQuery = {
      clientId: this.clientId(),
      search: this.search.value || undefined,
      status: this.status.value || undefined,
      responsibleUserId: this.responsibleUserId.value || undefined,
      sort: this.sort.value,
      page: this.page(),
      pageSize: 20,
    };
    this.loading.set(true);
    this.error.set(false);
    this.api
      .list(query)
      .pipe(
        finalize(() => {
          if (sequence === this.requestSequence) this.loading.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          if (sequence !== this.requestSequence) return;
          this.items.set(response.items);
          this.page.set(response.meta.page);
          this.pageCount.set(response.meta.totalPages);
          this.totalItems.set(response.meta.totalItems);
          this.loaded.set(true);
        },
        error: () => {
          if (sequence === this.requestSequence) this.error.set(true);
        },
      });
  }

  changePage(page: number): void {
    if (page < 1 || page > this.pageCount() || this.loading()) return;
    this.updateQuery({ casePage: page });
  }

  clearFilters(): void {
    this.search.setValue("", { emitEvent: false });
    this.status.setValue("", { emitEvent: false });
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
    return new Intl.DateTimeFormat(
      this.localization.language() === "EN" ? "en" : "sr-Latn",
      { dateStyle: "medium" },
    ).format(new Date(value));
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
        caseSort: this.sort.value === "updatedAt:desc" ? null : this.sort.value,
        ...extra,
      },
      queryParamsHandling: "merge",
    });
  }

  private positiveInteger(value: string | null): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  }

  private caseStatus(value: string | null): CaseStatus | "" {
    return this.statusOptions.some((option) => option.value === value)
      ? (value as CaseStatus | "")
      : "";
  }

  private caseSort(value: string | null): CaseSort {
    return this.sortOptions.some((option) => option.value === value)
      ? (value as CaseSort)
      : "updatedAt:desc";
  }
}
