import { TestBed } from "@angular/core/testing";
import { BillingSetupApiClient } from "@law/api-clients";
import { RetainerAgreement } from "@law/api-interfaces";
import { BrnDialogRef } from "@spartan-ng/brain/dialog";
import { of, throwError } from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { ToastService } from "../../../shared/ui/toast/toast.service";
import {
  RetainerAgreementDialogComponent,
  RetainerAgreementDialogInput,
} from "./retainer-agreement-dialog.component";

let context: RetainerAgreementDialogInput = {
  clientId: "client-1",
  agreement: null,
};

jest.mock("@spartan-ng/brain/dialog", () => ({
  ...jest.requireActual("@spartan-ng/brain/dialog"),
  injectBrnDialogContext: () => context,
}));

const existing: RetainerAgreement = {
  id: "agreement-1",
  clientId: "client-1",
  title: "Paušal",
  monthlyFee: "100000.00",
  currency: "RSD",
  validFrom: "2026-01-01",
  validTo: null,
  includedMinutes: 1200,
  coveredCategoryIds: ["category-1"],
  overageRule: "ABSORBED",
  overageHourlyRate: null,
  outOfScopeRule: "HOURLY",
  outOfScopeHourlyRate: "9000.00",
  active: true,
};

describe("RetainerAgreementDialogComponent", () => {
  const api = {
    listCategories: jest.fn(),
    createRetainer: jest.fn(),
    updateRetainer: jest.fn(),
  };
  const dialogRef = { close: jest.fn() };
  const toast = { error: jest.fn(), success: jest.fn() };

  beforeAll(() => {
    // jsdom has no ResizeObserver; Spartan's select and combobox primitives observe size.
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
    context = { clientId: "client-1", agreement: null };
    api.listCategories.mockReturnValue(
      of([{ id: "category-1", name: "Ugovori", active: true, order: 0 }]),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: BillingSetupApiClient, useValue: api },
        { provide: BrnDialogRef, useValue: dialogRef },
        { provide: ToastService, useValue: toast },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "SR" },
        },
      ],
    });
  });

  function create() {
    const fixture = TestBed.createComponent(RetainerAgreementDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  function fillValid(
    form: RetainerAgreementDialogComponent["form"],
    patch: Record<string, unknown> = {},
  ) {
    form.patchValue({
      title: "Paušal",
      monthlyFee: "100000",
      validFrom: "2026-10-01",
      ...patch,
    });
  }

  it("is invalid with overage rule HOURLY and an empty rate, valid otherwise", () => {
    const { form } = create().componentInstance;
    fillValid(form, {
      overageRule: "HOURLY",
      overageHourlyRate: "",
      outOfScopeRule: "ABSORBED",
    });

    expect(form.invalid).toBe(true);
    expect(form.controls.overageHourlyRate.hasError("required")).toBe(true);

    form.controls.overageHourlyRate.setValue("8500");
    expect(form.valid).toBe(true);

    form.controls.overageHourlyRate.setValue("0");
    expect(form.invalid).toBe(true);
    expect(form.controls.overageHourlyRate.hasError("positive")).toBe(true);
  });

  it("disables and ignores a rate whose rule is not HOURLY", () => {
    const { form } = create().componentInstance;
    fillValid(form, { overageRule: "AT", outOfScopeRule: "HOURLY" });

    expect(form.controls.overageHourlyRate.disabled).toBe(true);
    // The out-of-scope rule is HOURLY, so its own rate is still required.
    expect(form.controls.outOfScopeHourlyRate.enabled).toBe(true);
    expect(form.invalid).toBe(true);

    form.controls.outOfScopeRule.setValue("ABSORBED");
    expect(form.controls.outOfScopeHourlyRate.disabled).toBe(true);
    expect(form.valid).toBe(true);
  });

  it("requires validFrom and rejects validTo before validFrom", () => {
    const { form } = create().componentInstance;
    fillValid(form, {
      overageRule: "ABSORBED",
      outOfScopeRule: "ABSORBED",
      validFrom: "",
    });
    expect(form.controls.validFrom.hasError("required")).toBe(true);

    fillValid(form, { validFrom: "2026-10-10", validTo: "2026-10-01" });
    expect(form.hasError("range")).toBe(true);

    form.controls.validTo.setValue("2026-10-10");
    expect(form.valid).toBe(true);
    form.controls.validTo.setValue("");
    expect(form.valid).toBe(true);
  });

  it("posts the request with hours converted to minutes and unused rates nulled", () => {
    api.createRetainer.mockReturnValue(of(existing));
    const component = create().componentInstance;
    fillValid(component.form, {
      monthlyFee: "100000,50",
      includedHours: 20,
      overageRule: "HOURLY",
      overageHourlyRate: "8500",
      outOfScopeRule: "AT",
    });
    component.setCovered(["category-1"]);

    component.submit();

    expect(api.createRetainer).toHaveBeenCalledWith("client-1", {
      title: "Paušal",
      monthlyFee: "100000.50",
      currency: "RSD",
      validFrom: "2026-10-01",
      validTo: null,
      includedMinutes: 1200,
      coveredCategoryIds: ["category-1"],
      overageRule: "HOURLY",
      overageHourlyRate: "8500",
      outOfScopeRule: "AT",
      outOfScopeHourlyRate: null,
    });
    expect(dialogRef.close).toHaveBeenCalledWith(existing);
  });

  it("shows a hint when the categories fail to load", () => {
    api.listCategories.mockReturnValue(throwError(() => ({ status: 500 })));
    const fixture = create();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "retainers.form.categoriesLoadError",
    );
  });

  it("does not submit an invalid form", () => {
    const component = create().componentInstance;
    fillValid(component.form, { overageRule: "HOURLY", overageHourlyRate: "" });

    component.submit();

    expect(api.createRetainer).not.toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it("edits an existing agreement through updateRetainer", () => {
    context = { clientId: "client-1", agreement: existing };
    api.updateRetainer.mockReturnValue(of(existing));
    const component = create().componentInstance;

    expect(component.form.controls.includedHours.value).toBe(20);
    component.submit();

    expect(api.updateRetainer).toHaveBeenCalledWith(
      "agreement-1",
      expect.objectContaining({
        includedMinutes: 1200,
        outOfScopeHourlyRate: "9000.00",
      }),
    );
    expect(api.createRetainer).not.toHaveBeenCalled();
  });

  it("shows an inline overlap error on 409 and keeps the dialog open", () => {
    api.createRetainer.mockReturnValue(throwError(() => ({ status: 409 })));
    const fixture = create();
    fillValid(fixture.componentInstance.form, {
      overageRule: "ABSORBED",
      outOfScopeRule: "ABSORBED",
    });

    fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')
        ?.textContent,
    ).toContain("retainers.form.overlap");
  });
});
