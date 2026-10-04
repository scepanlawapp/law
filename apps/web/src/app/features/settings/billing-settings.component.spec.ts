import { TestBed } from "@angular/core/testing";
import { BillingSetupApiClient, ReferencesApiClient } from "@law/api-clients";
import { of } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { BillingSettingsComponent } from "./billing-settings.component";

describe("BillingSettingsComponent", () => {
  const api = {
    getWorkspaceConfig: jest.fn(),
    updateWorkspaceConfig: jest.fn(),
    listCategories: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    listRates: jest.fn(),
    createRate: jest.fn(),
  };
  const references = { users: jest.fn() };
  const toast = { success: jest.fn(), error: jest.fn() };

  beforeAll(() => {
    // jsdom has no ResizeObserver; Spartan's select primitives observe size.
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
    api.getWorkspaceConfig.mockReturnValue(
      of({
        targetHourlyRate: "8000.00",
        internalCurrency: "RSD",
        defaultVatRate: "20",
        paymentTermDays: 15,
      }),
    );
    api.listCategories.mockReturnValue(
      of([
        { id: "c1", name: "Ugovori", active: true, order: 0 },
        { id: "c2", name: "Sudski postupci", active: true, order: 1 },
        { id: "c3", name: "Konsultacije", active: false, order: 2 },
      ]),
    );
    api.listRates.mockReturnValue(
      of([
        {
          id: "r1",
          userId: "u1",
          hourlyValue: "7000.00",
          currency: "RSD",
          effectiveFrom: "2025-01-01",
        },
        {
          id: "r2",
          userId: "u1",
          hourlyValue: "9000.00",
          currency: "RSD",
          effectiveFrom: "2026-01-01",
        },
        {
          id: "r3",
          userId: "u1",
          hourlyValue: "99999.00",
          currency: "RSD",
          effectiveFrom: "2999-01-01",
        },
      ]),
    );
    references.users.mockReturnValue(
      of([
        {
          userId: "u1",
          user: {
            firstName: "Ana",
            lastName: "Ilić",
            email: "ana@example.com",
          },
        },
        {
          userId: "u2",
          user: { firstName: null, lastName: null, email: "marko@example.com" },
        },
      ]),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: BillingSetupApiClient, useValue: api },
        { provide: ReferencesApiClient, useValue: references },
        { provide: ToastService, useValue: toast },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "SR" },
        },
      ],
    });
  });

  function create() {
    const fixture = TestBed.createComponent(BillingSettingsComponent);
    fixture.detectChanges();
    return fixture;
  }

  it("posts { userId, hourlyValue, currency, effectiveFrom } from the rate form", () => {
    const created = {
      id: "r4",
      userId: "u2",
      hourlyValue: "8500.50",
      currency: "EUR",
      effectiveFrom: "2026-11-01",
    };
    api.createRate.mockReturnValue(of(created));
    const component = create().componentInstance;

    component.openRateForm("u2");
    component.rateForm.setValue({
      hourlyValue: "8500,50",
      currency: "EUR",
      effectiveFrom: "2026-11-01",
    });
    component.submitRate();

    expect(api.createRate).toHaveBeenCalledWith({
      userId: "u2",
      hourlyValue: "8500.50",
      currency: "EUR",
      effectiveFrom: "2026-11-01",
    });
    expect(component.rateUserId()).toBeNull();
    expect(component.rates()).toContainEqual(created);
  });

  it("does not post an empty or non-positive rate", () => {
    const component = create().componentInstance;
    component.openRateForm("u1");

    component.submitRate();
    component.rateForm.controls.hourlyValue.setValue("0");
    component.submitRate();

    expect(api.createRate).not.toHaveBeenCalled();
  });

  it("shows each user's current rate, ignoring future-dated ones", () => {
    const rows = create().componentInstance.userRows();

    expect(rows.map((row) => row.name)).toEqual([
      "Ana Ilić",
      "marko@example.com",
    ]);
    expect(rows[0].rate?.hourlyValue).toBe("9000.00");
    expect(rows[1].rate).toBeNull();
  });

  it("saves the workspace config with normalized values", () => {
    api.updateWorkspaceConfig.mockImplementation((body) => of(body));
    const component = create().componentInstance;

    component.configForm.patchValue({
      targetHourlyRate: "8500,00",
      defaultVatRate: "20",
      paymentTermDays: 30,
    });
    component.saveConfig();

    expect(api.updateWorkspaceConfig).toHaveBeenCalledWith({
      targetHourlyRate: "8500.00",
      internalCurrency: "RSD",
      defaultVatRate: "20",
      paymentTermDays: 30,
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it("sends a cleared target as null and rejects invalid values", () => {
    api.updateWorkspaceConfig.mockImplementation((body) => of(body));
    const component = create().componentInstance;

    component.configForm.controls.paymentTermDays.setValue(400);
    component.saveConfig();
    expect(api.updateWorkspaceConfig).not.toHaveBeenCalled();

    component.configForm.patchValue({
      targetHourlyRate: "",
      paymentTermDays: 0,
    });
    component.saveConfig();
    expect(api.updateWorkspaceConfig).toHaveBeenCalledWith(
      expect.objectContaining({ targetHourlyRate: null, paymentTermDays: 0 }),
    );
  });

  it("moves a category by renumbering only the rows whose order changed", () => {
    api.updateCategory.mockImplementation(
      (id: string, body: { order: number }) =>
        of({ id, name: id, active: true, order: body.order }),
    );
    const component = create().componentInstance;

    component.moveCategory(component.categories()[1], -1);

    expect(api.updateCategory).toHaveBeenCalledTimes(2);
    expect(api.updateCategory).toHaveBeenCalledWith("c2", { order: 0 });
    expect(api.updateCategory).toHaveBeenCalledWith("c1", { order: 1 });
    expect(component.categories().map((category) => category.id)).toEqual([
      "c2",
      "c1",
      "c3",
    ]);
  });

  it("does nothing when moving the first category up", () => {
    const component = create().componentInstance;

    component.moveCategory(component.categories()[0], -1);

    expect(api.updateCategory).not.toHaveBeenCalled();
  });

  it("adds a category after the last order and toggles activity", () => {
    api.createCategory.mockReturnValue(
      of({ id: "c4", name: "Nova", active: true, order: 3 }),
    );
    api.updateCategory.mockImplementation((id: string, body: object) =>
      of({ id, name: "Konsultacije", active: true, order: 2, ...body }),
    );
    const component = create().componentInstance;

    component.newCategoryName.setValue("  Nova ");
    component.addCategory();
    expect(api.createCategory).toHaveBeenCalledWith({ name: "Nova", order: 3 });

    component.setCategoryActive(component.categories()[2], true);
    expect(api.updateCategory).toHaveBeenCalledWith("c3", { active: true });
  });
});
