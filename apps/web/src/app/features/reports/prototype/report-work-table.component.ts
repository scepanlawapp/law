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
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { ReportMember, ReportRow } from "./report-model";
import { ReportFormat } from "./report-ui";
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
                  {{ "report." + column | translate }} {{ indicator(column) }}
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
                  {{ "report.enum." + row.workStatus | translate }}
                </span>
                <span class="mt-1 block text-muted-foreground">
                  {{
                    row.invoice?.reference ??
                      ("report.enum.NotInvoiced" | translate)
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
                    row.sharing === "missing" &&
                    (column === "potential" || column === "shareCollected")
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
                      {{ "report.category." + allocation.category | translate }}
                      · {{ format.percent(allocation.rate / 10000) }}
                    </span>
                  }
                  @if (!row.earnings.length) {
                    <span>{{ "report.enum." + row.sharing | translate }}</span>
                  }
                </td>
              }
              <td hlmTd>
                <span
                  class="inline-flex rounded-full border border-border px-2 py-1 text-sm"
                  [class.text-destructive]="
                    row.status === 'RequiresConfiguration'
                  "
                >
                  {{ "report.enum." + row.status | translate }}
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
  readonly sort = signal("caseName");
  readonly descending = signal(false);
  readonly amountColumns = computed<
    (
      | "estimated"
      | "invoiced"
      | "collected"
      | "balance"
      | "potential"
      | "shareCollected"
    )[]
  >(() =>
    this.detail()
      ? ["invoiced", "collected", "shareCollected", "potential"]
      : ["estimated", "invoiced", "collected", "balance", "potential"],
  );
  readonly sorted = computed(() =>
    [...this.rows()].sort((a, b) => {
      const key = this.sort() as keyof ReportRow;
      const first = a[key];
      const second = b[key];
      const comparison =
        typeof first === "number" && typeof second === "number"
          ? first - second
          : String(first).localeCompare(String(second));
      return comparison * (this.descending() ? -1 : 1);
    }),
  );
  sortBy(key: string) {
    if (this.sort() === key) this.descending.update((v) => !v);
    else {
      this.sort.set(key);
      this.descending.set(false);
    }
  }
  ariaSort(key: string) {
    return this.sort() === key
      ? this.descending()
        ? "descending"
        : "ascending"
      : "none";
  }
  indicator(key: string) {
    return this.sort() === key ? (this.descending() ? "↓" : "↑") : "";
  }
  memberName(id: string) {
    return (
      this.members().find((m) => m.id === id)?.name ??
      this.format.text("report.otherMember")
    );
  }
}
