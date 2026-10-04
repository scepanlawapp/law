import { ComponentFixture, TestBed } from "@angular/core/testing";
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from "@angular/router";
import {
  BillingSetupApiClient,
  ClientsApiClient,
  FinancialsApiClient,
  WorkEntriesApiClient,
} from "@law/api-clients";
import { WorkEntry } from "@law/api-interfaces";
import { of } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { ClientFormDialogService } from "../clients/client-create-edit-modal/client-form-dialog.service";
import { BillingStatementLineImportDialogService } from "./billing-statement-line-import-dialog.service";
import { FinanceStatementCreateComponent } from "./finance-statement-create.component";

const client = {
  id: "client-1",
  clientNumber: "KL-1",
  displayName: "Telenor",
  type: "COMPANY" as const,
  status: "ACTIVE" as const,
};

function entry(id: string, treatment: WorkEntry["treatment"]): WorkEntry {
  return {
    id,
    user: { id: "user-1", displayName: "Ana Anić", email: null },
    client,
    case: null,
    workDate: "2026-09-10",
    minutes: 60,
    timerStartedAt: null,
    description: `Rad ${id}`,
    serviceCategory: null,
    treatment,
    status: "CONFIRMED",
    writeOffReason: null,
    source: "MANUAL",
    sourceType: null,
    sourceId: null,
    statementId: null,
    aiParsed: false,
    createdAt: "2026-09-10T08:00:00.000Z",
    updatedAt: "2026-09-10T08:00:00.000Z",
  };
}

describe("FinanceStatementCreateComponent with work entries", () => {
  const workEntries = { get: jest.fn() };
  const setup = { getProfile: jest.fn() };

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

  function create(): ComponentFixture<FinanceStatementCreateComponent> {
    const fixture = TestBed.createComponent(FinanceStatementCreateComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    workEntries.get.mockImplementation((id: string) =>
      of(entry(id, id === "e1" ? "HOURLY" : "AT")),
    );
    setup.getProfile.mockReturnValue(
      of({ clientId: client.id, hourlyRate: "100.00", currency: "EUR" }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: WorkEntriesApiClient, useValue: workEntries },
        { provide: BillingSetupApiClient, useValue: setup },
        { provide: FinancialsApiClient, useValue: {} },
        {
          provide: ClientsApiClient,
          useValue: {
            list: () =>
              of({
                items: [client],
                meta: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
              }),
          },
        },
        { provide: ClientFormDialogService, useValue: {} },
        { provide: BillingStatementLineImportDialogService, useValue: {} },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "SR" },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({}),
              queryParamMap: convertToParamMap({
                clientId: client.id,
                workEntryIds: ["e1", "e2"],
              }),
            },
          },
        },
      ],
    });
  });

  it("defaults the currency to the client's profile and prices HOURLY work", () => {
    const fixture = create();
    const component = fixture.componentInstance;

    expect(component.form.controls.currency.value).toBe("EUR");
    const [hourly, flagged] = component.form.controls.lines.controls;
    expect(hourly.controls.netAmount.value).toBe(100);
    expect(hourly.controls.pricingRequired.value).toBe(false);
    expect(flagged.controls.pricingRequired.value).toBe(true);
    expect(component.pricingRequiredCount()).toBe(1);
  });

  it("clears the flag when the user prices a flagged row", () => {
    const fixture = create();
    const flagged = fixture.componentInstance.form.controls.lines.at(1);

    flagged.controls.netAmount.setValue(250);
    fixture.detectChanges();

    expect(flagged.controls.pricingRequired.value).toBe(false);
    expect(fixture.componentInstance.pricingRequiredCount()).toBe(0);
  });

  it("hints at an unpriced, unflagged row", () => {
    const fixture = create();
    const lines = fixture.componentInstance.form.controls.lines;
    const element = fixture.nativeElement as HTMLElement;
    expect(
      element.querySelector('[data-testid="price-required-hint"]'),
    ).toBeNull();

    lines.at(0).controls.netAmount.setValue(0);
    lines.at(0).controls.pricingRequired.setValue(false);
    fixture.detectChanges();

    expect(
      element.querySelector('[data-testid="price-required-hint"]'),
    ).toBeTruthy();
  });
});
