import { demoDataset } from "./report-fixtures";
import { ReportFilters, ReportRecord } from "./report-model";
import {
  aging,
  allocate,
  memberSummaries,
  monthRange,
  scopePersonal,
  selectRows,
  shiftMonth,
  timeline,
  totals,
  validRange,
} from "./report-selectors";
const filters: ReportFilters = {
  ...monthRange("2026-10"),
  basis: "work",
  member: "",
  client: "",
  caseId: "",
  status: "",
  sharing: "",
  workStatus: "",
  search: "",
  group: "week",
};
const fixture: ReportRecord = {
  id: "cross-month",
  performerId: "self",
  clientId: "client",
  client: "Demo",
  caseId: "case",
  caseName: "Demo case",
  titleKey: "report.event.0",
  workDate: "2026-08-20",
  workStatus: "completed",
  estimated: 5000000,
  invoice: { reference: "DEMO-1", date: "2026-09-01", amount: 5000000 },
  payments: [
    { date: "2026-09-15", amount: 1000000 },
    { date: "2026-10-03", amount: 3000000 },
  ],
  sharing: "configured",
  allocations: [
    { memberId: "self", category: "workShare", rate: 3000 },
    { memberId: "origin", category: "origination", rate: 1000 },
  ],
};
const small = {
  members: [
    { id: "self", name: "Demo", former: false },
    { id: "origin", name: "Other demo", former: false },
  ],
  records: [fixture],
};
describe("fictional reporting selectors", () => {
  it("reconciles eligible collections, attorney categories and retained revenue for every demo month", () => {
    const data = demoDataset("viewer");
    for (let month = 1; month <= 12; month++) {
      const rows = selectRows(data, {
        ...filters,
        ...monthRange(`2026-${String(month).padStart(2, "0")}`),
      });
      const sums = totals(rows);
      const members = memberSummaries(data, rows);
      expect(sums.eligibleCollected).toBe(sums.shareCollected + sums.retained);
      expect(members.reduce((s, m) => s + m.shareCollected, 0)).toBe(
        sums.shareCollected,
      );
      expect(members.reduce((s, m) => s + m.invoiced, 0)).toBe(sums.invoiced);
      expect(
        timeline(rows, "week").reduce((s, b) => s + (b.second ?? 0), 0),
      ).toBe(sums.collected);
      for (const row of rows) {
        expect(row.balance).toBeGreaterThanOrEqual(0);
        expect(row.potential).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it("keeps invoice-linked outstanding separate from period collections and distinguishes date dimensions", () => {
    expect(selectRows(small, filters)).toHaveLength(0);
    expect(selectRows(small, { ...filters, basis: "invoice" })).toHaveLength(0);
    const row = selectRows(small, { ...filters, basis: "collection" })[0];
    expect(row.invoiced).toBe(5000000);
    expect(row.collected).toBe(3000000);
    expect(row.collectedAsOf).toBe(4000000);
    expect(row.balance).toBe(1000000);
    expect(row.earnings[0]).toMatchObject({
      invoiced: 1500000,
      collected: 900000,
      potential: 300000,
    });
    expect(row.earnings[1]).toMatchObject({
      invoiced: 500000,
      collected: 300000,
      potential: 100000,
    });
    expect(aging([row], filters.to)[1].first).toBe(1000000);
  });
  it("excludes missing rules from the distribution without hiding their invoiced work or guessing potential", () => {
    const rows = selectRows(demoDataset("viewer"), {
      ...filters,
      ...monthRange("2026-10"),
      sharing: "missing",
      basis: "collection",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].invoiced).toBeGreaterThan(0);
    expect(rows[0].collected).toBeGreaterThan(0);
    expect(rows[0].eligibleCollected).toBe(0);
    expect(rows[0].retained).toBe(0);
    expect(rows[0].potential).toBe(0);
    expect(rows[0].status).toBe("RequiresConfiguration");
  });
  it("scopes before aggregation and preserves origination-only earnings without disclosing other allocations", () => {
    const personal = scopePersonal(
      demoDataset("authenticated-id"),
      "authenticated-id",
    );
    expect(personal.members.map((m) => m.id)).toEqual(["authenticated-id"]);
    expect(
      personal.records.every((r) =>
        r.allocations.every((a) => a.memberId === "authenticated-id"),
      ),
    ).toBe(true);
    expect(
      personal.records.some(
        (r) =>
          r.performerId === "other" &&
          r.allocations.some((a) => a.category === "origination"),
      ),
    ).toBe(true);
    const all = memberSummaries(
      demoDataset("authenticated-id"),
      selectRows(demoDataset("authenticated-id"), filters),
    ).find((m) => m.id === "authenticated-id");
    const own = memberSummaries(personal, selectRows(personal, filters))[0];
    expect(own).toEqual(all);
  });
  it("has deterministic fixtures and all collection/configuration scenarios", () => {
    expect(demoDataset("viewer")).toEqual(demoDataset("viewer"));
    const rows = selectRows(demoDataset("viewer"), {
      ...filters,
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(new Set(rows.map((r) => r.status))).toEqual(
      new Set([
        "NotInvoiced",
        "PartiallyCollected",
        "Uncollected",
        "FullyCollected",
        "RequiresConfiguration",
      ]),
    );
    expect(
      rows.some(
        (r) =>
          r.sharing === "excluded" && r.collected > 0 && r.shareCollected === 0,
      ),
    ).toBe(true);
    expect(
      memberSummaries(demoDataset("viewer"), rows).some(
        (m) => m.former && m.shareCollected > 0,
      ),
    ).toBe(true);
    expect(
      rows
        .filter((r) => !r.invoiced && r.workStatus === "completed")
        .reduce((s, r) => s + r.estimated, 0),
    ).toBe(totals(rows).uninvoiced);
  });
  it("filters entities, status, work status and sharing against the same rows", () => {
    const all = selectRows(demoDataset("viewer"), filters);
    for (const key of [
      "client",
      "caseId",
      "status",
      "sharing",
      "workStatus",
    ] as const) {
      const expectedValue = key === "client" ? all[0].clientId : all[0][key];
      const selected = selectRows(demoDataset("viewer"), {
        ...filters,
        [key]: expectedValue,
      });
      expect(selected.length).toBeGreaterThan(0);
      expect(
        selected.every(
          (r) => (key === "client" ? r.clientId : r[key]) === expectedValue,
        ),
      ).toBe(true);
    }
  });
  it("rounds minor units half up and handles month boundaries and invalid ranges", () => {
    expect(allocate(1, 5000)).toBe(1);
    expect(allocate(1, 4999)).toBe(0);
    expect(allocate(99999999, 3333)).toBe(33330000);
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthRange("2028-02").to).toBe("2028-02-29");
    expect(validRange("2026-02-30", "2026-03-31")).toBe(false);
    expect(validRange("2026-10-31", "2026-10-01")).toBe(false);
    expect(selectRows(small, { ...filters, from: "bad" })).toEqual([]);
  });
});
