import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { SortDirection } from "@law/api-interfaces";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { ReportMember, ReportRow } from "./report-model";
import { ReportFormat, ariaSortOf, sortIndicator } from "./report-ui";
import {
  REPORT_ALLOCATION_CATEGORY_LABELS,
  REPORT_COLLECTION_STATUS_LABELS,
  REPORT_SHARING_LABELS,
  REPORT_WORK_SORT_FIELDS,
  REPORT_WORK_STATUS_LABELS,
  ReportWorkSortField,
} from "../../../shared/models";
import { ReportCollectionStatus, ReportSharing } from "../../../shared/models";

type AmountColumn = Exclude<ReportWorkSortField, "caseName" | "workDate">;

const DETAIL_AMOUNT_COLUMNS: AmountColumn[] = [
  "invoiced",
  "collected",
  "shareCollected",
  "potential",
];
const OUTSTANDING_AMOUNT_COLUMNS: AmountColumn[] = [
  "estimated",
  "invoiced",
  "collected",
  "balance",
  "potential",
];
/** Amounts that need a sharing rule to be known. */
const SHARE_COLUMNS: readonly AmountColumn[] = ["potential", "shareCollected"];
@Component({
  selector: "law-report-work-table",
  standalone: true,
  host: { class: "block min-w-0" },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton, HlmTableImports, TranslatePipe],
  template: `
    <div class="overflow-x-auto rounded-xl border border-border bg-card">
      <table hlmTable class="min-w-[1100px] w-full text-sm">
        <caption class="sr-only">
          {{
            (detail() ? "report.detailTable" : "report.outstandingTable")
              | translate
          }}
        </caption>
        <thead hlmTHead>
          <tr hlmTr>
            @if (!personal()) {
              <th hlmTh scope="col">{{ "report.attorney" | translate }}</th>
            }
            <th hlmTh scope="col" [attr.aria-sort]="ariaSort('caseName')">
              <button
                hlmBtn
                variant="ghost"
                size="sm"
                (click)="sortBy('caseName')"
              >
                {{ "report.caseClient" | translate }}
                {{ indicator("caseName") }}
              </button>
            </th>
            <th hlmTh scope="col">{{ "report.event" | translate }}</th>
            <th hlmTh scope="col" [attr.aria-sort]="ariaSort('workDate')">
              <button
                hlmBtn
                variant="ghost"
                size="sm"
                (click)="sortBy('workDate')"
              >
                {{ "report.workDate" | translate }} {{ indicator("workDate") }}
              </button>
            </th>
            <th hlmTh scope="col">{{ "report.invoiceDate" | translate }}</th>
            @for (column of amountColumns(); track column) {
              <th
                hlmTh
                scope="col"
                class="text-right"
                [attr.aria-sort]="ariaSort(column)"
              >
                <button
                  hlmBtn
                  variant="ghost"
                  size="sm"
                  (click)="sortBy(column)"
                >
                  {{ sortFields[column].label | translate }}
                  {{ indicator(column) }}
                </button>
              </th>
            }
            @if (detail()) {
              <th hlmTh scope="col">{{ "report.categoryRate" | translate }}</th>
            }
            <th hlmTh scope="col">
              {{ "report.collectionStatus" | translate }}
            </th>
            <th hlmTh scope="col">
              <span class="sr-only">{{ "report.details" | translate }}</span>
            </th>
          </tr>
        </thead>
        <tbody hlmTBody>
          @for (row of sorted(); track row.id) {
            <tr hlmTr>
              @if (!personal()) {
                <td hlmTd>{{ memberName(row.performerId) }}</td>
              }
              <td hlmTd>
                <span class="font-medium">{{ row.caseName }}</span>
                <span class="mt-1 block text-muted-foreground">
                  {{ row.client }}
                </span>
              </td>
              <td hlmTd>
                {{ row.titleKey | translate }}
                <span class="mt-1 block text-muted-foreground">
                  {{ workStatusLabels[row.workStatus] | translate }}
                </span>
                <span class="mt-1 block text-muted-foreground">
                  {{
                    row.invoice?.reference ??
                      (statusLabels[ReportCollectionStatus.NOT_INVOICED]
                        | translate)
                  }}
                </span>
              </td>
              <td hlmTd class="whitespace-nowrap">
                {{ format.date(row.workDate) }}
              </td>
              <td hlmTd class="whitespace-nowrap">
                {{ format.date(row.invoice?.date) }}
              </td>
              @for (column of amountColumns(); track column) {
                <td hlmTd class="whitespace-nowrap text-right tabular-nums">
                  @if (
                    row.sharing === ReportSharing.MISSING &&
                    shareColumns.includes(column)
                  ) {
                    {{ "report.unavailable" | translate }}
                  } @else {
                    {{ format.money(row[column]) }}
                  }
                </td>
              }
              @if (detail()) {
                <td hlmTd>
                  @for (
                    allocation of row.earnings;
                    track allocation.category + allocation.memberId
                  ) {
                    <span class="block whitespace-nowrap">
                      {{ categoryLabels[allocation.category] | translate }}
                      · {{ format.percent(allocation.rate / 10000) }}
                    </span>
                  }
                  @if (!row.earnings.length) {
                    <span>{{ sharingLabels[row.sharing] | translate }}</span>
                  }
                </td>
              }
              <td hlmTd>
                <span
                  class="inline-flex rounded-full border border-border px-2 py-1 text-sm"
                  [class.text-destructive]="
                    row.status === ReportCollectionStatus.REQUIRES_CONFIGURATION
                  "
                >
                  {{ statusLabels[row.status] | translate }}
                </span>
              </td>
              <td hlmTd>
                <button
                  hlmBtn
                  variant="ghost"
                  size="sm"
                  (click)="selected.emit(row)"
                  [attr.data-report-record]="row.id"
                  [attr.aria-label]="
                    ('report.details' | translate) +
                    ': ' +
                    (row.titleKey | translate) +
                    ' ' +
                    row.caseName
                  "
                >
                  {{ "report.details" | translate }}
                </button>
              </td>
            </tr>
          } @empty {
            <tr hlmTr>
              <td
                hlmTd
                [attr.colspan]="personal() ? 11 : 12"
                class="h-28 text-center text-muted-foreground"
              >
                {{ "report.empty" | translate }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class ReportWorkTableComponent {
  readonly rows = input.required<ReportRow[]>();
  readonly members = input<ReportMember[]>([]);
  readonly detail = input(false);
  readonly personal = input(false);
  readonly selected = output<ReportRow>();
  readonly format = inject(ReportFormat);
  readonly ReportCollectionStatus = ReportCollectionStatus;
  readonly ReportSharing = ReportSharing;
  readonly sortFields = REPORT_WORK_SORT_FIELDS;
  readonly statusLabels = REPORT_COLLECTION_STATUS_LABELS;
  readonly sharingLabels = REPORT_SHARING_LABELS;
  readonly workStatusLabels = REPORT_WORK_STATUS_LABELS;
  readonly categoryLabels = REPORT_ALLOCATION_CATEGORY_LABELS;
  readonly shareColumns = SHARE_COLUMNS;
  readonly sortField = signal<ReportWorkSortField>("caseName");
  readonly sortDirection = signal<SortDirection>(SortDirection.ASC);
  readonly amountColumns = computed(() =>
    this.detail() ? DETAIL_AMOUNT_COLUMNS : OUTSTANDING_AMOUNT_COLUMNS,
  );
  readonly sorted = computed(() => {
    const key = this.sortField();
    const factor = this.sortDirection() === SortDirection.DESC ? -1 : 1;
    return [...this.rows()].sort((a, b) => {
      const first = a[key];
      const second = b[key];
      const comparison =
        typeof first === "number" && typeof second === "number"
          ? first - second
          : String(first).localeCompare(String(second));
      return comparison * factor;
    });
  });
  sortBy(key: ReportWorkSortField) {
    if (this.sortField() === key)
      this.sortDirection.update((direction) =>
        direction === SortDirection.ASC
          ? SortDirection.DESC
          : SortDirection.ASC,
      );
    else {
      this.sortField.set(key);
      this.sortDirection.set(SortDirection.ASC);
    }
  }
  ariaSort(key: ReportWorkSortField) {
    return ariaSortOf(this.sortField() === key, this.sortDirection());
  }
  indicator(key: ReportWorkSortField) {
    return sortIndicator(this.sortField() === key, this.sortDirection());
  }
  memberName(id: string) {
    return (
      this.members().find((m) => m.id === id)?.name ??
      this.format.text("report.otherMember")
    );
  }
}
