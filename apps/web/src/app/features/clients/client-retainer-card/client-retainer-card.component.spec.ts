import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import {
  BillingReportsApiClient,
  BillingSetupApiClient,
} from "@law/api-clients";
import {
  RetainerAgreement,
  RetainerUsage,
  WorkspaceRole,
} from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { of, throwError } from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { ClientRateDialogService } from "./client-rate-dialog.service";
import { ClientRetainerCardComponent } from "./client-retainer-card.component";
import { RetainerAgreementDialogService } from "./retainer-agreement-dialog.service";

const agreement: RetainerAgreement = {
  id: "agreement-1",
  clientId: "client-1",
  title: "Paušal Telenor",
  monthlyFee: "100000.00",
  currency: "RSD",
  validFrom: "2026-01-01",
  validTo: null,
  includedMinutes: 1200,
  coveredCategoryIds: [],
  overageRule: "HOURLY",
  overageHourlyRate: "9000.00",
  outOfScopeRule: "AT",
  outOfScopeHourlyRate: null,
  active: true,
};

function usage(coveredMinutes: number): RetainerUsage {
  return {
    client: {
      id: "client-1",
      clientNumber: "K-1",
      type: "COMPANY",
      displayName: "Telenor",
      status: "ACTIVE",
    },
    agreementId: "agreement-1",
    month: "2026-10",
    currency: "RSD",
    fee: "100000.00",
    includedMinutes: 1200,
    coveredMinutes,
    outOfScopeMinutes: 90,
    effectiveHourlyRate: "6250.00",
    targetHourlyRate: "8000.00",
  };
}

describe("ClientRetainerCardComponent", () => {
  const role = signal<WorkspaceRole | null>(WorkspaceRole.OWNER);
  const setup = { listRetainers: jest.fn(), getProfile: jest.fn() };
  const reports = { clientUsage: jest.fn() };
  const agreementDialog = { open: jest.fn() };
  const rateDialog = { open: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    role.set(WorkspaceRole.OWNER);
    setup.listRetainers.mockReturnValue(of([agreement]));
    setup.getProfile.mockReturnValue(
      of({ clientId: "client-1", hourlyRate: "12000.00", currency: "RSD" }),
    );
    reports.clientUsage.mockReturnValue(of(usage(960)));
    agreementDialog.open.mockReturnValue(of(null));
    rateDialog.open.mockReturnValue(of(null));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthState,
          useValue: { activeWorkspace: () => ({ role: role() }) },
        },
        { provide: BillingSetupApiClient, useValue: setup },
        { provide: BillingReportsApiClient, useValue: reports },
        { provide: RetainerAgreementDialogService, useValue: agreementDialog },
        { provide: ClientRateDialogService, useValue: rateDialog },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "SR" },
        },
      ],
    });
  });

  async function create(): Promise<
    ComponentFixture<ClientRetainerCardComponent>
  > {
    const fixture = TestBed.createComponent(ClientRetainerCardComponent);
    fixture.componentRef.setInput("clientId", "client-1");
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const query = (fixture: ComponentFixture<unknown>, testId: string) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      `[data-testid="${testId}"]`,
    );

  it("shows covered / included hours and the warning style at 80%", async () => {
    const fixture = await create();

    expect(query(fixture, "retainer-hours")?.textContent?.trim()).toBe(
      "16 / 20 h",
    );
    expect(query(fixture, "retainer-usage")?.dataset["usageState"]).toBe(
      "warning",
    );
    expect(query(fixture, "retainer-usage")?.className).toContain(
      "progress-indicator]]:bg-warning",
    );
    expect(query(fixture, "retainer-percent")?.className).toContain(
      "bg-warning",
    );
    expect(query(fixture, "retainer-percent")?.textContent).toContain("80%");
    expect(reports.clientUsage).toHaveBeenCalledWith(
      "client-1",
      expect.stringMatching(/^\d{4}-\d{2}$/),
    );
  });

  it("keeps the normal style below 80%", async () => {
    reports.clientUsage.mockReturnValue(of(usage(600)));
    const fixture = await create();

    expect(query(fixture, "retainer-hours")?.textContent?.trim()).toBe(
      "10 / 20 h",
    );
    expect(query(fixture, "retainer-usage")?.dataset["usageState"]).toBe("ok");
    expect(query(fixture, "retainer-percent")?.className).not.toContain(
      "bg-warning",
    );
  });

  it("shows out-of-scope hours and, for managers, effective vs target rate", async () => {
    const fixture = await create();

    expect(query(fixture, "retainer-out-of-scope")?.textContent?.trim()).toBe(
      "1,5 h",
    );
    expect(query(fixture, "retainer-rates")?.textContent).toContain("6.250");
    expect(query(fixture, "retainer-rates")?.textContent).toContain("8.000");
    expect(query(fixture, "retainer-edit")).not.toBeNull();
    expect(query(fixture, "client-rate-edit")).not.toBeNull();
  });

  it("hides rates and write actions from a lawyer", async () => {
    role.set(WorkspaceRole.LAWYER);
    const fixture = await create();

    expect(query(fixture, "retainer-hours")).not.toBeNull();
    expect(query(fixture, "retainer-rates")).toBeNull();
    expect(query(fixture, "retainer-edit")).toBeNull();
    expect(query(fixture, "client-rate-edit")).toBeNull();
  });

  it("renders nothing and calls no API for a member", async () => {
    role.set(WorkspaceRole.MEMBER);
    const fixture = await create();

    expect(query(fixture, "retainer-card")).toBeNull();
    expect(setup.listRetainers).not.toHaveBeenCalled();
    expect(reports.clientUsage).not.toHaveBeenCalled();
  });

  it("shows 'no retainer' with the create action when there is no agreement", async () => {
    setup.listRetainers.mockReturnValue(of([]));
    reports.clientUsage.mockReturnValue(of(null));
    const fixture = await create();

    expect(query(fixture, "retainer-none")?.textContent).toContain(
      "retainers.card.none",
    );
    expect(query(fixture, "retainer-edit")?.textContent).toContain(
      "retainers.card.create",
    );
    query(fixture, "retainer-edit")?.click();
    expect(agreementDialog.open).toHaveBeenCalledWith({
      clientId: "client-1",
      agreement: null,
    });
  });

  it("opens the edit dialog with the active agreement and reloads after saving", async () => {
    agreementDialog.open.mockReturnValue(of(agreement));
    const fixture = await create();

    query(fixture, "retainer-edit")?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(agreementDialog.open).toHaveBeenCalledWith({
      clientId: "client-1",
      agreement,
    });
    expect(setup.listRetainers).toHaveBeenCalledTimes(2);
    expect(reports.clientUsage).toHaveBeenCalledTimes(2);
  });

  it("hides the card when the API answers 403", async () => {
    setup.listRetainers.mockReturnValue(throwError(() => ({ status: 403 })));
    reports.clientUsage.mockReturnValue(throwError(() => ({ status: 403 })));
    const fixture = await create();

    expect(query(fixture, "retainer-card")).toBeNull();
  });
});
