import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { of, throwError } from "rxjs";
import { RevenueSharingApiClient } from "@law/api-clients";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import {
  defaultRevenueConfiguration,
  RevenueSettingsResponse,
  REVENUE_ORIGINS,
  REVENUE_MODES,
  REVENUE_BASES,
  REVENUE_SCOPES,
  REVENUE_CATEGORIES,
  REVENUE_COMBINATIONS,
  REVENUE_AGREEMENT_TYPES,
  REVENUE_DEPARTURE_POLICIES,
  REVENUE_RATE_STATES,
} from "@law/api-interfaces";
import { LocalizationService } from "../../core/localization/localization.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { RevenueSharingComponent } from "./revenue-sharing.component";
import { RevenueRoleModelSheetComponent } from "./revenue-role-model-sheet.component";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const memberId = "11111111-1111-4111-8111-111111111111";
describe("Revenue sharing page", () => {
  let fixture: ComponentFixture<RevenueSharingComponent>;
  let component: RevenueSharingComponent;
  let api: {
    get: jest.Mock;
    references: jest.Mock;
    history: jest.Mock;
    publish: jest.Mock;
    preview: jest.Mock;
  };
  let confirmation: jest.Mock;
  beforeEach(async () => {
    globalThis.ResizeObserver = class {
      observe() {
        /* No layout measurement in jsdom. */
      }
      unobserve() {
        /* No layout measurement in jsdom. */
      }
      disconnect() {
        /* No layout measurement in jsdom. */
      }
    };
    if (!globalThis.structuredClone)
      globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
    const settings: RevenueSettingsResponse = {
      version: 0,
      effectiveFrom: null,
      configuration: defaultRevenueConfiguration(),
    };
    api = {
      get: jest.fn(() => of(settings)),
      references: jest.fn(() =>
        of({
          members: [
            { id: memberId, name: "Ana", role: "LAWYER", status: "ACTIVE" },
          ],
          clients: [],
          cases: [],
          events: [],
        }),
      ),
      history: jest.fn(() => of([])),
      publish: jest.fn((body) =>
        of({
          version: 1,
          effectiveFrom: body.effectiveFrom,
          configuration: body.configuration,
        }),
      ),
      preview: jest.fn(() =>
        of({ warnings: ["REQUIRES_CONFIGURATION"], explanations: [] }),
      ),
    };
    confirmation = jest.fn(() => of(true));
    await TestBed.configureTestingModule({
      imports: [RevenueSharingComponent],
      providers: [
        provideRouter([]),
        { provide: RevenueSharingApiClient, useValue: api },
        {
          provide: HlmDialogService,
          useValue: { open: jest.fn(() => ({ closed$: of(undefined) })) },
        },
        { provide: ConfirmDialogService, useValue: { confirm: confirmation } },
        { provide: ToastService, useValue: { success: jest.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RevenueSharingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  it("loads real API settings disabled by default", () => {
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(component.form.controls.enabled.value).toBe(false);
    expect(component.loading()).toBe(false);
    expect(component.dirty()).toBe(false);
    expect(component.memberRoles()).toEqual(["LAWYER"]);
    expect(component.tabOptions.map((option) => option.value)).toEqual([
      "overview",
      "models",
      "team",
      "special",
      "history",
    ]);
    expect(fixture.nativeElement.textContent).toContain("revenue.title");
  });
  it("opens the matching role editor from both overview and model cards without publishing", () => {
    const original = component.configuration();
    const overviewCard = fixture.nativeElement.querySelector(
      '[data-overview-role="LAWYER"]',
    ) as HTMLButtonElement;
    overviewCard.click();
    fixture.detectChanges();
    expect(component.tab()).toBe("models");
    expect(component.selectedRoleModel()).toBe("LAWYER");

    component.closeRoleModel();
    component.tab.set("models");
    fixture.detectChanges();
    const modelCard = fixture.nativeElement.querySelector(
      '[data-model-role="LAWYER"]',
    ) as HTMLButtonElement;
    modelCard.click();
    fixture.detectChanges();
    expect(component.selectedRoleModel()).toBe("LAWYER");
    expect(component.configuration()).toEqual(original);
    expect(api.publish).not.toHaveBeenCalled();
  });
  it("shows conditional role-model preview fields without changing saved configuration", () => {
    const original = component.configuration();
    component.openRoleModel("LAWYER");
    fixture.detectChanges();
    const sheet = fixture.debugElement.query(
      By.directive(RevenueRoleModelSheetComponent),
    ).componentInstance as RevenueRoleModelSheetComponent;

    sheet.form.controls.compensationType.setValue("FIXED");
    expect(sheet.showsFixedAmount()).toBe(true);
    expect(sheet.showsPercentages()).toBe(false);
    sheet.form.controls.compensationType.setValue("PERCENTAGE");
    expect(sheet.showsFixedAmount()).toBe(false);
    expect(sheet.showsPercentages()).toBe(true);
    sheet.form.controls.compensationType.setValue("COMBINED");
    expect(sheet.showsFixedAmount()).toBe(true);
    expect(sheet.showsPercentages()).toBe(true);
    expect(component.configuration()).toEqual(original);
    expect(api.publish).not.toHaveBeenCalled();
  });
  it("marks the effective version by date instead of treating the highest number as current", () => {
    const effective = {
      ...defaultRevenueConfiguration(),
      id: "effective-version",
      version: 2,
      effectiveFrom: "2026-01-01",
    } as unknown as RevenueHistoryEntry;
    const scheduled = {
      ...effective,
      id: "scheduled-version",
      version: 9,
      effectiveFrom: "2099-01-01",
    };
    component.history.set([scheduled, effective]);
    expect(component.effectiveVersion()?.id).toBe(effective.id);
    expect(component.versionStatus(effective)).toBe("CURRENT");
    expect(component.versionStatus(scheduled)).toBe("SCHEDULED");
  });
  it("updates the typed form and unsaved state through the actual enable switch", () => {
    const control = fixture.nativeElement.querySelector(
      "#revenue-enabled",
    ) as HTMLElement;
    control.click();
    fixture.detectChanges();
    expect(component.form.controls.enabled.value).toBe(true);
    expect(component.dirty()).toBe(true);
  });
  it("blocks browser unload only while edits are unsaved", () => {
    const clean = new Event("beforeunload", { cancelable: true });
    component.beforeUnload(clean as BeforeUnloadEvent);
    expect(clean.defaultPrevented).toBe(false);
    component.formChanged.set(true);
    const dirty = new Event("beforeunload", { cancelable: true });
    component.beforeUnload(dirty as BeforeUnloadEvent);
    expect(dirty.defaultPrevented).toBe(true);
  });
  it("publishes edited settings only after confirmation and clears dirty state", async () => {
    component.form.controls.enabled.setValue(true);
    component.form.markAsDirty();
    component.formChanged.set(true);
    expect(component.publicationSummary().length).toBeGreaterThan(0);
    expect(component.publicationSummary()[0].oldValue).not.toBe(
      component.publicationSummary()[0].newValue,
    );
    await component.publish({
      effectiveFrom: "2026-10-15",
      reason: "Policy update",
    });
    expect(api.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 0,
        configuration: expect.objectContaining({ enabled: true }),
      }),
    );
    expect(component.loaded()?.version).toBe(1);
    expect(component.dirty()).toBe(false);
  });
  it("retains input and shows a translated conflict error on failed save", async () => {
    api.publish.mockReturnValue(
      throwError(() => ({ error: { code: "revenue.VERSION_CONFLICT" } })),
    );
    component.form.controls.enabled.setValue(true);
    component.formChanged.set(true);
    await component.publish({
      effectiveFrom: "2026-10-15",
      reason: "Policy update",
    });
    expect(component.form.controls.enabled.value).toBe(true);
    expect(component.error()).toBe("revenue.error.VERSION_CONFLICT");
    expect(component.saving()).toBe(false);
  });
  it("can cancel publication and protect unsaved navigation", async () => {
    confirmation.mockReturnValue(of(false));
    component.formChanged.set(true);
    component.openPublicationDialog();
    expect(api.publish).not.toHaveBeenCalled();
    expect(await component.confirmLeave()).toBe(false);
  });
  it("stages an excluded member agreement without publishing or calculating earnings", async () => {
    await component.editAgreement(memberId);
    component.agreementEditor.controls.agreementType.setValue("EXCLUDED");
    component.stageAgreement();
    expect(component.agreements()[0].agreementType).toBe("EXCLUDED");
    expect(component.dirty()).toBe(true);
    expect(api.publish).not.toHaveBeenCalled();
    expect(api.preview).not.toHaveBeenCalled();
  });
  it("allows past agreement closure but locks historical rates", async () => {
    await component.editAgreement(memberId, {
      id: memberId,
      memberId,
      agreementType: "INHERIT",
      effectiveFrom: "2000-01-01",
      effectiveTo: null,
      rates: defaultRevenueConfiguration().rates,
      originationRate: { state: "INHERIT", percentage: null },
      selfOrigination: null,
      departurePolicy: "RETAIN_EARNINGS_ON_PRIOR_WORK",
      departureCutoffDate: null,
      description: "",
    });
    expect(component.agreementEditor.controls.rates.disabled).toBe(true);
    expect(component.agreementEditor.controls.effectiveTo.enabled).toBe(true);
  });
  it("previews currently edited settings and never publishes the preview", () => {
    component.form.controls.enabled.setValue(true);
    component.simulator.patchValue({ memberId, amount: "100000" });
    component.preview();
    expect(api.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: expect.objectContaining({ enabled: true }),
      }),
    );
    expect(component.previewResult()?.warnings).toContain(
      "REQUIRES_CONFIGURATION",
    );
    expect(api.publish).not.toHaveBeenCalled();
  });
  it("prevents publication of an unstaged agreement edit", async () => {
    await component.editAgreement(memberId);
    component.editorChanged.set(true);
    await component.publish({
      effectiveFrom: "2026-10-15",
      reason: "Policy update",
    });
    expect(api.publish).not.toHaveBeenCalled();
    expect(component.error()).toBe("revenue.unstaged");
  });
});

describe("Revenue localization", () => {
  const root = resolve(__dirname, "../../../../public/i18n");
  const sr = JSON.parse(
    readFileSync(resolve(root, "ser.json"), "utf8"),
  ) as Record<string, string>;
  const en = JSON.parse(
    readFileSync(resolve(root, "eng.json"), "utf8"),
  ) as Record<string, string>;
  it("has matching Serbian and English keys, including all displayed enums", () => {
    const keys = Object.keys(sr)
      .filter((k) => k.startsWith("revenue."))
      .sort();
    expect(keys).toEqual(
      Object.keys(en)
        .filter((k) => k.startsWith("revenue."))
        .sort(),
    );
    for (const value of [
      ...REVENUE_ORIGINS,
      ...REVENUE_MODES,
      ...REVENUE_BASES,
      ...REVENUE_SCOPES,
      ...REVENUE_CATEGORIES,
      ...REVENUE_COMBINATIONS,
      ...REVENUE_AGREEMENT_TYPES,
      ...REVENUE_DEPARTURE_POLICIES,
      ...REVENUE_RATE_STATES,
    ]) {
      expect(sr["revenue.enum." + value]).toBeTruthy();
      expect(en["revenue.enum." + value]).toBeTruthy();
    }
  });
  it("localizes every literal feature key used in templates and TypeScript", () => {
    for (const file of [
      "revenue-sharing.component.ts",
      "revenue-sharing.component.html",
      "revenue-publish-dialog.component.ts",
      "revenue-agreement-dialog.component.ts",
      "revenue-rule-dialog.component.ts",
      "revenue-role-model-sheet.component.ts",
      "revenue-rate.component.ts",
      "revenue-select.component.ts",
    ]) {
      const source = readFileSync(resolve(__dirname, file), "utf8");
      const keys = [
        ...source.matchAll(/['"](revenue\.[A-Za-z][A-Za-z0-9_.]+)['"]/g),
      ]
        .map((m) => m[1])
        .filter((k) => !k.endsWith("."));
      for (const key of keys) {
        expect(sr[key]).toBeTruthy();
        expect(en[key]).toBeTruthy();
      }
    }
  });
  it("keeps Serbian as the default language", () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(LocalizationService).language()).toBe("SR");
  });
});
