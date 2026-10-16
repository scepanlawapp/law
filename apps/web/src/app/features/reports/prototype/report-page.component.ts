import { DOCUMENT } from "@angular/common";
import {
  afterNextRender,
  Injector,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSidebarTrigger } from "@spartan-ng/helm/sidebar";
import { HlmLabel } from "@spartan-ng/helm/label";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { AuthState } from "@law/security";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { canManageBilling, officeMonth } from "../../../shared/billing";
import { ReportDataService } from "./report-data.service";
import { ReportFilters, ReportRow, ChartDatum } from "./report-model";
import {
  aging,
  memberSummaries,
  monthRange,
  selectRows,
  timeline,
  totals,
} from "./report-selectors";
import { ReportFiltersComponent } from "./report-filters.component";
import {
  ReportChartComponent,
  ReportDistributionComponent,
  ReportFormat,
  ReportKpiComponent,
  ariaSortOf,
  sortIndicator,
} from "./report-ui";
import { ReportWorkTableComponent } from "./report-work-table.component";
import { SortDirection } from "@law/api-interfaces";
import {
  REPORT_ALLOCATION_CATEGORY_LABELS,
  REPORT_ALLOCATION_REASON_LABELS,
  REPORT_COLLECTION_STATUS_LABELS,
  REPORT_DATE_BASIS_LABELS,
  REPORT_EARNINGS_SORT_FIELDS,
  REPORT_SHARING_LABELS,
  REPORT_VIEW_DESCRIPTION_LABELS,
  REPORT_VIEW_LABELS,
  ReportEarningsSortField,
  SortKind,
} from "../../../shared/models";
import {
  ReportAllocationCategory,
  ReportCollectionStatus,
  ReportDateBasis,
  ReportGroup,
  ReportSharing,
  ReportView,
} from "../../../shared/models";

const EARNINGS_COLUMNS = (
  Object.keys(REPORT_EARNINGS_SORT_FIELDS) as ReportEarningsSortField[]
).filter(
  (field): field is Exclude<ReportEarningsSortField, "name"> =>
    REPORT_EARNINGS_SORT_FIELDS[field].kind === SortKind.NUMBER,
);

function dateBasisFromQuery(value: string | null): ReportDateBasis {
  return value === ReportDateBasis.INVOICE ||
    value === ReportDateBasis.COLLECTION
    ? value
    : ReportDateBasis.WORK;
}

function groupFromQuery(value: string | null): ReportGroup {
  return value === ReportGroup.DAY || value === ReportGroup.MONTH
    ? value
    : ReportGroup.WEEK;
}

@Component({
  selector: "law-report-page",
  standalone: true,
  host: { class: "block min-w-0" },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    HlmSidebarTrigger,
    HlmButton,
    HlmInput,
    HlmLabel,
    HlmTableImports,
    TranslatePipe,
    ReportFiltersComponent,
    ReportChartComponent,
    ReportDistributionComponent,
    ReportKpiComponent,
    ReportWorkTableComponent,
  ],
  templateUrl: "./report-page.component.html",
})
export class ReportPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthState);
  private readonly source = inject(ReportDataService);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  readonly format = inject(ReportFormat);
  readonly ReportView = ReportView;
  readonly ReportCollectionStatus = ReportCollectionStatus;
  readonly viewLabels = REPORT_VIEW_LABELS;
  readonly viewDescriptionLabels = REPORT_VIEW_DESCRIPTION_LABELS;
  readonly basisLabels = REPORT_DATE_BASIS_LABELS;
  readonly categoryLabels = REPORT_ALLOCATION_CATEGORY_LABELS;
  readonly reasonLabels = REPORT_ALLOCATION_REASON_LABELS;
  readonly sharingLabels = REPORT_SHARING_LABELS;
  readonly statusLabels = REPORT_COLLECTION_STATUS_LABELS;
  readonly earningsSortFields = REPORT_EARNINGS_SORT_FIELDS;
  readonly routeData = toSignal(this.route.data, {
    initialValue: this.route.snapshot.data,
  });
  readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly view = computed(() => this.routeData()["view"] as ReportView);
  readonly personal = computed(() => this.view() === ReportView.PERSONAL);
  readonly detail = computed(
    () => this.personal() || this.view() === ReportView.DETAIL,
  );
  readonly canManage = computed(() =>
    canManageBilling(this.auth.activeWorkspace()?.role),
  );
  readonly data = computed(() =>
    this.personal() ? this.source.personal() : this.source.company(),
  );
  readonly memberId = computed(() =>
    this.personal()
      ? (this.auth.session()?.user.id ?? "")
      : (this.params().get("memberId") ?? ""),
  );
  readonly selectedMember = computed(() =>
    this.data().members.find((m) => m.id === this.memberId()),
  );
  readonly filters = computed<ReportFilters>(() => {
    const q = this.query();
    const defaultRange = monthRange(officeMonth());
    return {
      from: q.get("from") ?? defaultRange.from,
      to: q.get("to") ?? defaultRange.to,
      basis: dateBasisFromQuery(q.get("basis")),
      group: groupFromQuery(q.get("group")),
      member: this.detail() ? "" : (q.get("member") ?? ""),
      client: q.get("client") ?? "",
      caseId: q.get("caseId") ?? "",
      status: q.get("status") ?? "",
      sharing: q.get("sharing") ?? "",
      workStatus: q.get("workStatus") ?? "",
      search: q.get("search") ?? "",
    };
  });
  readonly detailQuery = computed(() => ({ ...this.filters(), search: "" }));
  readonly baseRows = computed(() => {
    let rows = selectRows(this.data(), this.filters());
    const search = this.filters()
      .search.trim()
      .toLocaleLowerCase(this.format.localization.locale());
    if (search)
      rows = rows.filter((r) =>
        this.detail() || this.view() === ReportView.OUTSTANDING
          ? [r.client, r.caseName, this.format.text(r.titleKey)].some((v) =>
              v.toLocaleLowerCase().includes(search),
            )
          : this.data().members.some(
              (m) =>
                m.name.toLocaleLowerCase().includes(search) &&
                (r.performerId === m.id ||
                  r.earnings.some((a) => a.memberId === m.id)),
            ),
      );
    if (this.detail())
      rows = rows
        .filter(
          (r) =>
            r.performerId === this.memberId() ||
            r.earnings.some((a) => a.memberId === this.memberId()),
        )
        .map((r) => {
          const earnings = r.earnings.filter(
            (a) => a.memberId === this.memberId(),
          );
          return {
            ...r,
            earnings,
            allocations: r.allocations.filter(
              (a) => a.memberId === this.memberId(),
            ),
            shareInvoiced: earnings.reduce((s, a) => s + a.invoiced, 0),
            shareCollected: earnings.reduce((s, a) => s + a.collected, 0),
            potential: earnings.reduce((s, a) => s + a.potential, 0),
            origination: earnings
              .filter(
                (a) => a.category === ReportAllocationCategory.ORIGINATION,
              )
              .reduce((s, a) => s + a.collected, 0),
            retained: 0,
          };
        });
    return rows;
  });
  readonly sums = computed(() => totals(this.baseRows()));
  readonly own = computed(() =>
    memberSummaries(this.data(), this.baseRows()).find(
      (m) => m.id === this.memberId(),
    ),
  );
  readonly earningsSort = signal<ReportEarningsSortField>("shareCollected");
  readonly earningsSortDirection = signal<SortDirection>(SortDirection.DESC);
  readonly members = computed(() =>
    memberSummaries(this.data(), this.baseRows())
      .filter(
        (m) =>
          (!this.filters().member || m.id === this.filters().member) &&
          (!this.filters().search ||
            m.name
              .toLocaleLowerCase()
              .includes(this.filters().search.toLocaleLowerCase())),
      )
      .sort((a, b) => {
        const key = this.earningsSort();
        const av = a[key],
          bv = b[key];
        return (
          (typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv))) *
          (this.earningsSortDirection() === SortDirection.DESC ? -1 : 1)
        );
      }),
  );
  readonly workRows = computed(() =>
    this.baseRows().filter(
      (r) =>
        this.view() !== ReportView.OUTSTANDING ||
        this.filters().status ||
        r.balance > 0 ||
        !r.invoiced ||
        r.status === ReportCollectionStatus.REQUIRES_CONFIGURATION,
    ),
  );
  readonly kpis = computed<{ label: string; value: number; count?: boolean }[]>(
    () => {
      const s = this.sums();
      const own = this.own();
      if (this.detail())
        return [
          { label: "report.invoicedWork", value: own?.invoiced ?? 0 },
          { label: "report.collectedWork", value: own?.collected ?? 0 },
          { label: "report.shareInvoiced", value: s.shareInvoiced },
          { label: "report.shareCollected", value: s.shareCollected },
          { label: "report.potential", value: s.potential },
          { label: "report.origination", value: s.origination },
        ];
      if (this.view() === ReportView.OUTSTANDING)
        return [
          { label: "report.uninvoiced", value: s.uninvoiced },
          { label: "report.balance", value: s.balance },
          { label: "report.potential", value: s.potential },
          { label: "report.casesBalance", value: s.cases, count: true },
        ];
      if (this.view() === ReportView.OVERVIEW)
        return [
          { label: "report.invoiced", value: s.invoiced },
          { label: "report.eligibleCollected", value: s.eligibleCollected },
          { label: "report.attributed", value: s.shareCollected },
          { label: "report.retained", value: s.retained },
        ];
      return [
        { label: "report.invoicedWork", value: s.invoiced },
        { label: "report.collectedWork", value: s.collected },
        { label: "report.shareCollected", value: s.shareCollected },
        { label: "report.retained", value: s.retained },
      ];
    },
  );
  readonly comparison = computed(() =>
    timeline(
      this.view() === ReportView.OVERVIEW
        ? this.baseRows().map((r) => ({ ...r, collected: r.eligibleCollected }))
        : this.baseRows(),
      this.filters().group,
      this.detail(),
    ),
  );
  readonly ranking = computed<ChartDatum[]>(() =>
    this.members()
      .map((m) => ({
        label: m.name,
        first:
          this.view() === ReportView.OUTSTANDING
            ? m.potential
            : m.shareCollected,
        route: ["/reports/earnings", m.id],
      }))
      .sort((a, b) => b.first - a.first),
  );
  readonly workComparison = computed<ChartDatum[]>(() =>
    this.members().map((m) => ({
      label: m.name,
      first: m.invoiced,
      second: m.collected,
      route: ["/reports/earnings", m.id],
    })),
  );
  readonly age = computed(() => aging(this.baseRows(), this.filters().to));
  readonly byCase = computed<ChartDatum[]>(() =>
    [...new Set(this.baseRows().map((r) => r.caseName))].map((label) => ({
      label,
      first: this.baseRows()
        .filter((r) => r.caseName === label)
        .reduce((s, r) => s + r.shareCollected, 0),
    })),
  );
  readonly categories = computed<ChartDatum[]>(() => [
    {
      label:
        REPORT_ALLOCATION_CATEGORY_LABELS[ReportAllocationCategory.WORK_SHARE],
      first: this.sums().shareCollected - this.sums().origination,
    },
    {
      label:
        REPORT_ALLOCATION_CATEGORY_LABELS[ReportAllocationCategory.ORIGINATION],
      first: this.sums().origination,
    },
  ]);
  readonly selectedId = signal<string | null>(null);
  readonly selected = computed(() =>
    this.baseRows().find((r) => r.id === this.selectedId()),
  );
  readonly missing = computed(
    () =>
      this.baseRows().filter((r) => r.sharing === ReportSharing.MISSING).length,
  );
  readonly earningsColumns = EARNINGS_COLUMNS;
  updateFilters(filters: ReportFilters) {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: filters,
      replaceUrl: true,
    });
    this.selectedId.set(null);
  }
  search(value: string) {
    this.updateFilters({ ...this.filters(), search: value });
  }
  sortMembers(key: ReportEarningsSortField) {
    if (this.earningsSort() === key)
      this.earningsSortDirection.update((direction) =>
        direction === SortDirection.DESC
          ? SortDirection.ASC
          : SortDirection.DESC,
      );
    else {
      this.earningsSort.set(key);
      this.earningsSortDirection.set(
        REPORT_EARNINGS_SORT_FIELDS[key].kind === SortKind.TEXT
          ? SortDirection.ASC
          : SortDirection.DESC,
      );
    }
  }
  sortLabel(key: ReportEarningsSortField) {
    return sortIndicator(
      this.earningsSort() === key,
      this.earningsSortDirection(),
    );
  }
  ariaSort(key: ReportEarningsSortField) {
    return ariaSortOf(
      this.earningsSort() === key,
      this.earningsSortDirection(),
    );
  }
  allocationMemberName(id: string) {
    return (
      this.data().members.find((member) => member.id === id)?.name ??
      this.format.text("report.otherMember")
    );
  }
  drilldown(row: ReportRow) {
    this.selectedId.set(row.id);
    afterNextRender(
      () => {
        const heading = this.document.getElementById("allocation-title");
        heading?.scrollIntoView({ behavior: "smooth", block: "start" });
        heading?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }
  closeDrilldown() {
    const id = this.selectedId();
    this.selectedId.set(null);
    this.document
      .querySelector<HTMLElement>(`[data-report-record="${id}"]`)
      ?.focus();
  }
}
