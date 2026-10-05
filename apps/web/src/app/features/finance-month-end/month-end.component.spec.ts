import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import {
  BillingReportsApiClient,
  WorkEntriesApiClient,
} from "@law/api-clients";
import {
  MonthEndPrecheck,
  MonthEndRunResult,
  WorkEntry,
} from "@law/api-interfaces";
import { Subject, of, throwError } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { officeMonth, previousMonth } from "../../shared/billing";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { QuickCaptureDialogService } from "../time/quick-capture/quick-capture-dialog.service";
import { WriteOffDialogService } from "../time/write-off-dialog/write-off-dialog.service";
import { MonthEndComponent } from "./month-end.component";

const telenor = {
  id: "client-1",
  clientNumber: "KL-1",
  displayName: "Telenor",
  type: "COMPANY" as const,
  status: "ACTIVE" as const,
};
const delta = { ...telenor, id: "client-2", displayName: "Delta" };

function entry(overrides: Partial<WorkEntry>): WorkEntry {
  return {
    id: "entry-1",
    user: { id: "user-1", displayName: "Ana Anić", email: null },
    client: telenor,
    case: null,
    workDate: "2026-09-10",
    minutes: 30,
    timerStartedAt: null,
    title: "Pregled ugovora",
    description: "",
    serviceCategory: null,
    treatment: "UNDECIDED",
    status: "PROPOSED",
    writeOffReason: null,
    source: "MANUAL",
    sourceType: null,
    sourceId: null,
    invoiceId: null,
    aiParsed: false,
    createdAt: "2026-09-10T08:00:00.000Z",
    updatedAt: "2026-09-10T08:00:00.000Z",
    ...overrides,
  };
}

const proposed = entry({});
const undecided = entry({
  id: "entry-2",
  status: "CONFIRMED",
  title: "Poziv sa klijentom",
});

const precheck: MonthEndPrecheck = {
  month: "2026-09",
  clients: [{ client: telenor, open: [proposed, undecided] }],
};
const emptyPrecheck: MonthEndPrecheck = { month: "2026-09", clients: [] };

const result: MonthEndRunResult = {
  month: "2026-09",
  statements: [
    {
      invoiceId: "invoice-1",
      client: telenor,
      currency: "RSD",
      created: true,
      addedLines: 3,
      attachedEntries: 0,
      pricingRequiredLines: 2,
    },
    {
      invoiceId: "invoice-2",
      client: delta,
      currency: "RSD",
      created: false,
      addedLines: 1,
      attachedEntries: 2,
      pricingRequiredLines: 0,
    },
    {
      invoiceId: "invoice-3",
      client: { ...delta, id: "client-3", displayName: "Gama" },
      currency: "EUR",
      created: false,
      addedLines: 0,
      attachedEntries: 0,
      pricingRequiredLines: 0,
    },
    {
      invoiceId: "",
      client: { ...delta, id: "client-4", displayName: "Omega" },
      currency: "RSD",
      created: false,
      addedLines: 0,
      attachedEntries: 0,
      pricingRequiredLines: 0,
      conflict: "Work entry is unavailable for the invoice client",
    },
    {
      invoiceId: "invoice-5",
      client: { ...delta, id: "client-5", displayName: "Sigma" },
      currency: "RSD",
      created: false,
      addedLines: 0,
      attachedEntries: 4,
      pricingRequiredLines: 0,
    },
  ],
};

describe("MonthEndComponent", () => {
  const reports = { precheck: jest.fn(), runMonthEnd: jest.fn() };
  const entries = { writeOff: jest.fn() };
  const capture = { open: jest.fn() };
  const writeOffDialog = { open: jest.fn() };
  const confirmDialog = { confirm: jest.fn() };
  const toast = { success: jest.fn(), error: jest.fn() };

  function create(month = "2026-09"): ComponentFixture<MonthEndComponent> {
    const fixture = TestBed.createComponent(MonthEndComponent);
    fixture.componentInstance.month.setValue(month);
    fixture.detectChanges();
    return fixture;
  }

  const byId = (fixture: ComponentFixture<unknown>, testId: string) =>
    (fixture.nativeElement as HTMLElement).querySelector(
      `[data-testid="${testId}"]`,
    ) as HTMLElement | null;
  const all = (fixture: ComponentFixture<unknown>, testId: string) =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        `[data-testid="${testId}"]`,
      ),
    ) as HTMLElement[];
  const button = (row: HTMLElement, label: string) =>
    Array.from(row.querySelectorAll("button")).find((item) =>
      item.textContent?.includes(label),
    ) as HTMLButtonElement;

  beforeEach(() => {
    jest.clearAllMocks();
    reports.precheck.mockReturnValue(of(precheck));
    reports.runMonthEnd.mockReturnValue(of(result));
    capture.open.mockReturnValue(of(null));
    writeOffDialog.open.mockReturnValue(of(null));
    confirmDialog.confirm.mockReturnValue(of(true));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: BillingReportsApiClient, useValue: reports },
        { provide: WorkEntriesApiClient, useValue: entries },
        { provide: QuickCaptureDialogService, useValue: capture },
        { provide: WriteOffDialogService, useValue: writeOffDialog },
        { provide: ConfirmDialogService, useValue: confirmDialog },
        { provide: ToastService, useValue: toast },
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

  it("defaults to the previous month and loads its precheck", () => {
    const fixture = TestBed.createComponent(MonthEndComponent);
    fixture.detectChanges();

    const expected = previousMonth(officeMonth());
    expect(fixture.componentInstance.month.value).toBe(expected);
    expect(reports.precheck).toHaveBeenCalledWith(expected);
  });

  it("lists the open entries per client with confirm and write-off actions", () => {
    const fixture = create();

    expect(reports.precheck).toHaveBeenCalledWith("2026-09");
    const rows = all(fixture, "precheck-entry");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Pregled ugovora");
    expect(button(rows[0], "common.confirm")).toBeTruthy();
    expect(button(rows[0], "time.review.writeOff")).toBeTruthy();
    // A confirmed entry without a treatment is edited, not confirmed again.
    expect(button(rows[1], "common.confirm")).toBeUndefined();
    expect(button(rows[1], "common.edit")).toBeTruthy();
  });

  it("confirms a proposed entry in the capture dialog and reloads", () => {
    capture.open.mockReturnValue(of(entry({ status: "CONFIRMED" })));
    const fixture = create();
    const loaded = reports.precheck.mock.calls.length;

    button(all(fixture, "precheck-entry")[0], "common.confirm").click();

    expect(capture.open).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "confirm-timer",
        entryId: "entry-1",
        clientId: "client-1",
      }),
    );
    expect(reports.precheck).toHaveBeenCalledTimes(loaded + 1);
  });

  it("writes an entry off with the entered reason and reloads", () => {
    writeOffDialog.open.mockReturnValue(of("Greška u unosu"));
    entries.writeOff.mockReturnValue(of(entry({ status: "WRITTEN_OFF" })));
    const fixture = create();
    const loaded = reports.precheck.mock.calls.length;

    button(all(fixture, "precheck-entry")[0], "time.review.writeOff").click();

    expect(entries.writeOff).toHaveBeenCalledWith("entry-1", {
      reason: "Greška u unosu",
    });
    expect(toast.success).toHaveBeenCalledWith("time.writeOff.done");
    expect(reports.precheck).toHaveBeenCalledTimes(loaded + 1);
  });

  it("does not write off when the dialog is dismissed", () => {
    const fixture = create();
    const loaded = reports.precheck.mock.calls.length;

    button(all(fixture, "precheck-entry")[0], "time.review.writeOff").click();

    expect(entries.writeOff).not.toHaveBeenCalled();
    expect(reports.precheck).toHaveBeenCalledTimes(loaded);
  });

  it("runs the month end after confirmation and renders every result row", () => {
    const fixture = create("2026-09");

    (byId(fixture, "run-month-end") as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(confirmDialog.confirm).toHaveBeenCalledTimes(1);
    expect(reports.runMonthEnd).toHaveBeenCalledWith("2026-09");

    const rows = all(fixture, "result-row");
    expect(rows).toHaveLength(5);
    const text = (index: number) => rows[index].textContent ?? "";
    // Created invoice: link, counts.
    expect(text(0)).toContain("Telenor");
    expect(text(0)).toContain("finance.monthEnd.created");
    expect(rows[0].querySelector("a")?.getAttribute("href")).toBe(
      "/finance/invoices/invoice-1",
    );
    expect(text(0)).toContain("3");
    expect(text(0)).toContain("2");
    // Updated invoice.
    expect(text(1)).toContain("finance.monthEnd.updated");
    expect(rows[1].querySelector("a")?.getAttribute("href")).toBe(
      "/finance/invoices/invoice-2",
    );
    // Nothing changed, but the row is still listed and linked.
    expect(text(2)).toContain("Gama");
    expect(text(2)).toContain("finance.monthEnd.noChanges");
    expect(rows[2].querySelector("a")?.getAttribute("href")).toBe(
      "/finance/invoices/invoice-3",
    );
    // Lost claim: an error-styled "not billed" row with the reason, never
    // "no changes". No invoice id: still listed, no link.
    expect(text(3)).toContain("Omega");
    expect(text(3)).not.toContain("finance.monthEnd.noChanges");
    const conflict = rows[3].querySelector('[data-testid="result-conflict"]');
    expect(conflict?.textContent).toContain("finance.monthEnd.notBilled");
    expect(conflict?.textContent).toContain(
      "Work entry is unavailable for the invoice client",
    );
    expect(conflict?.className).toContain("text-destructive");
    expect(rows[3].querySelector("a")).toBeNull();
    // Attach-only: covered work joined the existing fee line.
    expect(text(4)).toContain("Sigma");
    expect(text(4)).toContain("finance.monthEnd.attachedToFee");
    expect(text(4)).toContain('"count":4');
    expect(text(4)).not.toContain("finance.monthEnd.noChanges");
    // A row that also added lines mentions the attached work separately.
    expect(
      rows[1].querySelector('[data-testid="result-attached"]')?.textContent,
    ).toContain('"count":2');
  });

  it("does not run when the confirmation is declined", () => {
    confirmDialog.confirm.mockReturnValue(of(false));
    const fixture = create();

    (byId(fixture, "run-month-end") as HTMLButtonElement).click();

    expect(reports.runMonthEnd).not.toHaveBeenCalled();
    expect(byId(fixture, "result-table")).toBeNull();
  });

  it("runs without a confirmation when nothing is open", () => {
    reports.precheck.mockReturnValue(of(emptyPrecheck));
    const fixture = create();

    expect(all(fixture, "precheck-entry")).toHaveLength(0);
    (byId(fixture, "run-month-end") as HTMLButtonElement).click();

    expect(confirmDialog.confirm).not.toHaveBeenCalled();
    expect(reports.runMonthEnd).toHaveBeenCalledWith("2026-09");
  });

  it("disables the run until the precheck has loaded", () => {
    reports.precheck.mockReturnValue(throwError(() => new Error("boom")));
    const fixture = create();

    expect((byId(fixture, "run-month-end") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(byId(fixture, "precheck-error")).toBeTruthy();
  });

  it("reports a failed run and keeps the page usable", () => {
    reports.runMonthEnd.mockReturnValue(throwError(() => new Error("boom")));
    const fixture = create();

    (byId(fixture, "run-month-end") as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(toast.error).toHaveBeenCalledWith("finance.monthEnd.runError");
    expect(byId(fixture, "result-table")).toBeNull();
    expect((byId(fixture, "run-month-end") as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("drops the previous result when another month is picked", () => {
    const fixture = create("2026-09");
    (byId(fixture, "run-month-end") as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(byId(fixture, "result-table")).toBeTruthy();

    fixture.componentInstance.month.setValue("2026-08");
    fixture.detectChanges();

    expect(byId(fixture, "result-table")).toBeNull();
    expect(reports.precheck).toHaveBeenLastCalledWith("2026-08");
  });

  it("disables the month while a run is in flight and re-enables it after", () => {
    const run = new Subject<MonthEndRunResult>();
    reports.runMonthEnd.mockReturnValue(run);
    const fixture = create();

    (byId(fixture, "run-month-end") as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.month.disabled).toBe(true);

    run.next(result);
    fixture.detectChanges();
    expect(fixture.componentInstance.month.enabled).toBe(true);
  });

  it("says so when the run returns no statements", () => {
    reports.runMonthEnd.mockReturnValue(
      of({ month: "2026-09", statements: [] }),
    );
    const fixture = create();

    (byId(fixture, "run-month-end") as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(byId(fixture, "result-empty")).toBeTruthy();
    expect(all(fixture, "result-row")).toHaveLength(0);
  });
});
