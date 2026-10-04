import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { BillingReportsApiClient } from "@law/api-clients";
import type {
  ProfitabilityReport,
  ProfitabilityRow,
} from "@law/api-interfaces";
import { Observable, of, throwError } from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import {
  ProfitabilityComponent,
  isBelowTarget,
  presetRange,
  utilizationPercent,
} from "./profitability.component";

function row(
  id: string,
  overrides: Partial<ProfitabilityRow> = {},
): ProfitabilityRow {
  return {
    client: {
      id,
      clientNumber: id,
      type: "COMPANY",
      displayName: `Klijent ${id}`,
      status: "ACTIVE",
    },
    minutes: 600,
    revenue: [{ currency: "RSD", net: "50000.00" }],
    timeValue: "80000.00",
    unknownValueMinutes: 0,
    effectiveHourlyRate: "5000.00",
    comparable: true,
    writtenOffValue: "0.00",
    unbilledValue: "0.00",
    ...overrides,
  };
}

function report(
  rows: ProfitabilityRow[],
  overrides: Partial<ProfitabilityReport> = {},
): ProfitabilityReport {
  return {
    from: "2026-09-01",
    to: "2026-09-30",
    internalCurrency: "RSD",
    targetHourlyRate: "8000.00",
    rows,
    byPerson: [
      {
        user: { id: "u1", displayName: "Ana", email: null },
        loggedMinutes: 600,
        billedMinutes: 400,
      },
      {
        user: { id: "u2", displayName: "Marko", email: null },
        loggedMinutes: 0,
        billedMinutes: 0,
      },
    ],
    ...overrides,
  };
}

describe("profitability helpers", () => {
  it("computes the presets in office calendar terms", () => {
    expect(presetRange("LAST_MONTH", "2026-10-04")).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(presetRange("LAST_MONTH", "2026-01-15")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(presetRange("THIS_MONTH", "2026-10-04")).toEqual({
      from: "2026-10-01",
      to: "2026-10-04",
    });
    expect(presetRange("LAST_3_MONTHS", "2026-10-04")).toEqual({
      from: "2026-08-01",
      to: "2026-10-04",
    });
    expect(presetRange("LAST_3_MONTHS", "2026-02-10")).toEqual({
      from: "2025-12-01",
      to: "2026-02-10",
    });
  });

  it("compares rates as exact decimals", () => {
    expect(isBelowTarget("7999.99", "8000.00")).toBe(true);
    expect(isBelowTarget("8000.00", "8000")).toBe(false);
    expect(isBelowTarget("8000.001", "8000.00")).toBe(false);
    expect(isBelowTarget("7999.9999", "8000")).toBe(true);
    expect(isBelowTarget("9000", "8000")).toBe(false);
    expect(isBelowTarget(null, "8000")).toBe(false);
    expect(isBelowTarget("5000", null)).toBe(false);
  });

  it("rounds utilization to a whole percent and handles no logged time", () => {
    expect(utilizationPercent(600, 400)).toBe(67);
    expect(utilizationPercent(3, 1)).toBe(33);
    expect(utilizationPercent(0, 0)).toBeNull();
  });
});

describe("ProfitabilityComponent", () => {
  const api = { profitability: jest.fn() };

  beforeAll(() => {
    // jsdom has no ResizeObserver; Spartan's select primitive observes size.
    globalThis.ResizeObserver ??= class {
      observe(): void {
        // no layout in jsdom
      }
      unobserve(): void {
        // no layout in jsdom
      }
      disconnect(): void {
        // no layout in jsdom
      }
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: BillingReportsApiClient, useValue: api },
        {
          provide: LocalizationService,
          useValue: {
            translate: (key: string, params?: Record<string, unknown>) =>
              params ? `${key} ${JSON.stringify(params)}` : key,
            language: () => "SR",
          },
        },
      ],
    });
  });

  function create(
    result: Observable<ProfitabilityReport>,
  ): ComponentFixture<ProfitabilityComponent> {
    api.profitability.mockReturnValue(result);
    const fixture = TestBed.createComponent(ProfitabilityComponent);
    fixture.detectChanges();
    return fixture;
  }

  const root = (fixture: ComponentFixture<unknown>) =>
    fixture.nativeElement as HTMLElement;
  const rows = (fixture: ComponentFixture<unknown>) =>
    Array.from(
      root(fixture).querySelectorAll<HTMLElement>(
        '[data-testid="profitability-row"]',
      ),
    );

  it("requests last month by default", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-04T10:00:00Z"));
    try {
      create(of(report([])));
    } finally {
      jest.useRealTimers();
    }
    expect(api.profitability).toHaveBeenCalledWith("2026-09-01", "2026-09-30");
  });

  it("renders the rows in API order", () => {
    const fixture = create(of(report([row("zeta"), row("alfa"), row("mid")])));

    expect(
      rows(fixture).map((item) => item.querySelector("td")?.textContent),
    ).toEqual(["Klijent zeta", "Klijent alfa", "Klijent mid"]);
  });

  it("marks only a row below the target with text-destructive", () => {
    const fixture = create(
      of(
        report([
          row("below", { effectiveHourlyRate: "5000.00" }),
          row("above", { effectiveHourlyRate: "9000.00" }),
          row("none", { effectiveHourlyRate: null }),
        ]),
      ),
    );

    const cells = rows(fixture).map((item) =>
      item.querySelector<HTMLElement>('[data-testid="effective-rate"]'),
    );
    expect(
      cells.map((cell) => cell?.classList.contains("text-destructive")),
    ).toEqual([true, false, false]);
  });

  it("does not flag any row without a target rate", () => {
    const fixture = create(
      of(
        report([row("a", { effectiveHourlyRate: "1.00" })], {
          targetHourlyRate: null,
        }),
      ),
    );

    expect(root(fixture).querySelector(".text-destructive")).toBeNull();
  });

  it("notes a row that is not comparable and unknown value hours", () => {
    const fixture = create(
      of(
        report([
          row("a", {
            comparable: false,
            effectiveHourlyRate: null,
            timeValue: null,
            unknownValueMinutes: 90,
          }),
          row("b"),
        ]),
      ),
    );

    const [first, second] = rows(fixture);
    expect(
      first.querySelector('[data-testid="not-comparable"]')?.textContent,
    ).toContain("reports.profitability.notComparable");
    expect(
      first.querySelector('[data-testid="unknown-value"]')?.textContent,
    ).toContain('"hours":"1,5"');
    expect(second.querySelector('[data-testid="not-comparable"]')).toBeNull();
    expect(second.querySelector('[data-testid="unknown-value"]')).toBeNull();
    expect(root(fixture).textContent).toContain("reports.profitability.footer");
  });

  it("shows an empty state when there are no rows", () => {
    const fixture = create(of(report([])));

    expect(rows(fixture)).toHaveLength(0);
    expect(root(fixture).textContent).toContain("reports.profitability.empty");
  });

  it("shows an error and retries", () => {
    const fixture = create(throwError(() => new Error("boom")));
    expect(
      root(fixture).querySelector('[role="alert"]')?.textContent,
    ).toContain("reports.profitability.loadError");

    api.profitability.mockReturnValue(of(report([row("a")])));
    root(fixture)
      .querySelector<HTMLButtonElement>('[data-testid="retry"]')
      ?.click();
    fixture.detectChanges();

    expect(rows(fixture)).toHaveLength(1);
  });

  it("validates a custom range before requesting", () => {
    const fixture = create(of(report([])));
    const component = fixture.componentInstance;
    api.profitability.mockClear();

    component.setPreset("CUSTOM");
    component.customFrom.setValue("2026-09-30");
    component.customTo.setValue("2026-09-01");
    component.applyCustom();
    fixture.detectChanges();

    expect(api.profitability).not.toHaveBeenCalled();
    expect(root(fixture).textContent).toContain(
      "reports.profitability.rangeInvalid",
    );

    component.customTo.setValue("2026-09-30");
    component.applyCustom();
    expect(api.profitability).toHaveBeenCalledWith("2026-09-30", "2026-09-30");
  });

  it("shows logged, billed and utilization per person", () => {
    const fixture = create(of(report([row("a")])));
    fixture.componentInstance.tab.set("people");
    fixture.detectChanges();

    const people = Array.from(
      root(fixture).querySelectorAll<HTMLElement>(
        '[data-testid="profitability-person"]',
      ),
    ).map((item) =>
      Array.from(item.querySelectorAll("td")).map((cell) =>
        cell.textContent?.replace(/\s+/g, " ").trim(),
      ),
    );
    expect(people).toEqual([
      ["Ana", "10 h", "6,7 h", "67 %"],
      ["Marko", "0 h", "0 h", "—"],
    ]);
  });
});
