import { EventDialogService } from "../../calendar/event-dialog/event-dialog.service";
import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import {
  ReferencesApiClient,
  BillingSetupApiClient,
  CasesApiClient,
  EventsApiClient,
  ClientsApiClient,
  OrganizationSettingsApiClient,
  WorkEntriesApiClient,
  WorkManagementApiClient,
} from "@law/api-clients";
import {
  RetainerAgreement,
  WorkCaptureParseResponse,
  WorkEntry,
  PricingSuggestionResponse,
} from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { BrnDialogRef } from "@spartan-ng/brain/dialog";
import { NEVER, of, Subject, throwError } from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { ConfirmDialogService } from "../../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../../shared/ui/toast/toast.service";
import { QuickCaptureDialogComponent } from "./quick-capture-dialog.component";
import { QuickCaptureInput } from "./quick-capture.models";

import { TaskDialogService } from "../../work-management/task-dialog/task-dialog.service";

jest.mock("../../work-management/task-dialog/task-dialog.service", () => ({
  TaskDialogService: class TaskDialogService {},
}));

jest.mock("../../calendar/event-dialog/event-dialog.service", () => ({
  EventDialogService: class EventDialogService {},
}));

let context: QuickCaptureInput = { mode: "create" };

jest.mock("@spartan-ng/brain/dialog", () => ({
  ...jest.requireActual("@spartan-ng/brain/dialog"),
  injectBrnDialogContext: () => context,
}));

const clientRef = (id: string, displayName: string) => ({
  id,
  clientNumber: id,
  type: "COMPANY" as const,
  displayName,
  status: "ACTIVE" as const,
});

const savedEntry = { id: "entry-1" } as WorkEntry;

function parseResult(
  overrides: Partial<WorkCaptureParseResponse> = {},
): WorkCaptureParseResponse {
  return {
    ok: true,
    clientId: null,
    clientCandidates: [],
    caseId: null,
    caseCandidates: [],
    minutes: null,
    serviceCategoryId: null,
    description: null,
    ...overrides,
  };
}

describe("QuickCaptureDialogComponent", () => {
  beforeAll(() => {
    // jsdom has no ResizeObserver; Spartan's form-field and select primitives observe size.
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

  const eventDialog = { open: jest.fn(() => of(undefined)) };
  const taskDialog = { open: jest.fn(() => of(undefined)) };
  const tasks = {
    getTask: jest.fn(() => of({ id: "task-1", title: "Prepare submission" })),
  };
  const dialogRef = { close: jest.fn() };
  const confirmation = { confirm: jest.fn() };
  const entries = {
    actions: jest.fn(),
    remove: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    parse: jest.fn(),
    suggestPrice: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    confirm: jest.fn(),
    confirmFromSource: jest.fn(),
  };
  const billing = {
    listRetainers: jest.fn(),
    listCategories: jest.fn(),
    getProfile: jest.fn(),
  };
  const clients = { list: jest.fn(), get: jest.fn() };
  const cases = { list: jest.fn(), get: jest.fn() };
  const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
  const authSession = signal({
    user: { id: "user-1" },
    memberships: [{ role: "OWNER" }],
  });

  function render() {
    TestBed.configureTestingModule({
      imports: [QuickCaptureDialogComponent],
      providers: [
        { provide: BrnDialogRef, useValue: dialogRef },
        { provide: ConfirmDialogService, useValue: confirmation },
        { provide: EventDialogService, useValue: eventDialog },
        { provide: TaskDialogService, useValue: taskDialog },
        { provide: WorkManagementApiClient, useValue: tasks },
        { provide: WorkEntriesApiClient, useValue: entries },
        { provide: BillingSetupApiClient, useValue: billing },
        {
          provide: OrganizationSettingsApiClient,
          useValue: {
            get: jest.fn(() =>
              of({ currency: { defaultCurrencyCode: "RSD" } }),
            ),
          },
        },
        { provide: ClientsApiClient, useValue: clients },
        {
          provide: EventsApiClient,
          useValue: {
            get: jest.fn(() => of({ id: "event-1", title: "Hearing" })),
          },
        },
        { provide: CasesApiClient, useValue: cases },
        {
          provide: ReferencesApiClient,
          useValue: {
            users: jest.fn(() =>
              of([
                {
                  userId: "user-1",
                  user: { firstName: "Ana", lastName: null, email: "ana@test" },
                },
                {
                  userId: "user-2",
                  user: {
                    firstName: "Marko",
                    lastName: null,
                    email: "marko@test",
                  },
                },
              ]),
            ),
          },
        },
        { provide: ToastService, useValue: toast },
        {
          provide: AuthState,
          useValue: { session: authSession },
        },
        {
          provide: LocalizationService,
          useValue: {
            translate: jest.fn((key: string) => key),
            language: signal("SR"),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(QuickCaptureDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  const buttons = (root: HTMLElement) => [
    ...root.querySelectorAll<HTMLButtonElement>("button"),
  ];
  const buttonWithText = (root: HTMLElement, text: string) =>
    buttons(root).find((button) => button.textContent?.includes(text));

  beforeEach(() => {
    jest.clearAllMocks();
    context = { mode: "create" };
    authSession.set({
      user: { id: "user-1" },
      memberships: [{ role: "OWNER" }],
    });
    entries.suggestPrice.mockReturnValue(NEVER);
    entries.list.mockReturnValue(
      of({
        items: [
          { client: clientRef("client-2", "Beta d.o.o.") },
          { client: clientRef("client-2", "Beta d.o.o.") },
          { client: clientRef("client-1", "Alfa d.o.o.") },
        ],
        meta: {},
      }),
    );
    entries.get.mockReturnValue(NEVER);
    entries.create.mockReturnValue(of(savedEntry));
    entries.update.mockReturnValue(of(savedEntry));
    entries.confirm.mockReturnValue(of(savedEntry));
    entries.confirmFromSource.mockReturnValue(of(savedEntry));
    billing.listRetainers.mockReturnValue(of([]));
    billing.listCategories.mockReturnValue(of([]));
    billing.getProfile.mockReturnValue(
      of({ clientId: "client-1", hourlyRate: null, currency: "RSD" }),
    );
    clients.list.mockReturnValue(
      of({
        items: [
          { id: "client-1", displayName: "Alfa d.o.o." },
          { id: "client-2", displayName: "Beta d.o.o." },
          { id: "client-3", displayName: "Gama d.o.o." },
        ],
      }),
    );
    clients.get.mockReturnValue(NEVER);
    cases.list.mockReturnValue(of({ items: [] }));
    cases.get.mockReturnValue(NEVER);
  });

  function fillValid(
    component: QuickCaptureDialogComponent,
    values: Partial<Record<string, unknown>> = {},
  ) {
    component.form.patchValue({
      clientId: "client-1",
      minutes: 30,
      title: "Pregled ugovora",
      workDate: "2026-10-04",
      ...values,
    });
  }

  function priceResult(
    overrides: Partial<PricingSuggestionResponse> = {},
  ): PricingSuggestionResponse {
    return {
      status: "SUGGESTED",
      suggestedPrice: "5000.00",
      currency: "EUR",
      explanation: "100 points at 50 EUR per point",
      reviewRequired: true,
      confidence: "EVIDENCE_BACKED_SUGGESTION",
      calculation: {
        formula: "points * pointValue",
        operands: { base: "100", unitValue: "50" },
        rounding: "ROUND_HALF_UP",
      },
      sources: [
        {
          id: "chunk",
          sourceId: "tariff",
          versionId: "version-1",
          version: 1,
          kind: "LEGAL_TARIFF",
          title: "Tariff",
          reference: "Tarifni broj 1",
          sourceUrl: null,
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          excerpt: "100 points; 50 EUR per point",
        },
      ],
      missingInformation: [],
      warnings: [],
      alternatives: [],
      ...overrides,
    };
  }

  it("locks money fields, changes Suggest price to Cancel, and blocks save while pricing", () => {
    const pending = new Subject<PricingSuggestionResponse>();
    entries.suggestPrice.mockReturnValue(pending);
    const fixture = render();
    const component = fixture.componentInstance;
    fillValid(component, {
      value: "42.00",
      currency: "RSD",
      description: "Current description",
    });
    component.suggestPrice();
    fixture.detectChanges();
    expect(component.pricing()).toBe(true);
    expect(component.form.controls.value.disabled).toBe(true);
    expect(component.form.controls.currency.disabled).toBe(true);
    expect(
      buttonWithText(fixture.nativeElement, "time.pricing.cancel")?.disabled,
    ).toBe(false);
    expect(fixture.nativeElement.textContent).toContain("time.pricing.loading");
    expect(entries.suggestPrice).toHaveBeenCalledWith({
      kind: "UNSAVED",
      work: expect.objectContaining({
        title: "Pregled ugovora",
        description: "Current description",
        clientId: "client-1",
        workDate: "2026-10-04",
        minutes: 30,
      }),
    });
    component.submit();
    expect(entries.create).not.toHaveBeenCalled();
    component.cancelPricing();
  });

  it("populates value and currency without saving and shows formula and source evidence", () => {
    entries.suggestPrice.mockReturnValue(
      of(priceResult({ suggestedPrice: "0.00" })),
    );
    const fixture = render();
    const component = fixture.componentInstance;
    fillValid(component);
    component.suggestPrice();
    fixture.detectChanges();
    expect(component.form.controls.value.value).toBe("0.00");
    expect(component.form.controls.currency.value).toBe("EUR");
    expect(component.form.controls.value.enabled).toBe(true);
    expect(component.form.controls.currency.enabled).toBe(true);
    expect(component.form.controls.value.dirty).toBe(true);
    expect(component.pricing()).toBe(false);
    expect(entries.create).not.toHaveBeenCalled();
    expect(entries.update).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain(
      "100 points at 50 EUR per point",
    );
    expect(fixture.nativeElement.textContent).toContain("points * pointValue");
    expect(fixture.nativeElement.textContent).toContain(
      "100 points; 50 EUR per point",
    );
    expect(fixture.nativeElement.textContent).toContain("version-1");
    component.form.controls.value.setValue("99.00");
    expect(component.form.controls.value.value).toBe("99.00");
  });

  it("cancels from the same button, restores controls and ignores a late response", () => {
    const pending = new Subject<PricingSuggestionResponse>();
    entries.suggestPrice.mockReturnValue(pending);
    const fixture = render();
    const component = fixture.componentInstance;
    fillValid(component, { value: "42.00", currency: "RSD" });
    component.suggestPrice();
    expect(pending.observed).toBe(true);
    component.suggestPrice();
    expect(pending.observed).toBe(false);
    pending.next(priceResult());
    fixture.detectChanges();
    expect(component.form.controls.value.value).toBe("42.00");
    expect(component.form.controls.currency.value).toBe("RSD");
    expect(component.form.controls.value.enabled).toBe(true);
    expect(component.form.controls.currency.enabled).toBe(true);
    expect(component.pricingResult()).toBeNull();
    expect(component.pricingMessage()).toBe("time.pricing.cancelled");
    expect(
      buttonWithText(fixture.nativeElement, "time.pricing.suggest"),
    ).toBeDefined();
  });

  it("disables and guards price suggestions for non-billable work", () => {
    const fixture = render();
    const component = fixture.componentInstance;
    fillValid(component, { treatment: "NON_BILLABLE" });
    fixture.detectChanges();
    expect(
      buttonWithText(fixture.nativeElement, "time.pricing.suggest")?.disabled,
    ).toBe(true);
    component.suggestPrice();
    expect(entries.suggestPrice).not.toHaveBeenCalled();
  });

  it("cancels stale requests when work changes or becomes non-billable", () => {
    const pending = new Subject<PricingSuggestionResponse>();
    entries.suggestPrice.mockReturnValue(pending);
    const component = render().componentInstance;
    fillValid(component, { value: "42.00" });
    component.suggestPrice();
    component.form.controls.description.setValue("Changed work");
    expect(pending.observed).toBe(false);
    expect(component.pricing()).toBe(false);
    component.suggestPrice();
    component.form.controls.treatment.setValue("NON_BILLABLE");
    expect(pending.observed).toBe(false);
    expect(component.form.controls.value.value).toBe("42.00");
  });

  it("restores fields after errors and allows retry", () => {
    entries.suggestPrice.mockReturnValue(
      throwError(() => new Error("Unavailable")),
    );
    const component = render().componentInstance;
    fillValid(component, { value: "42.00" });
    component.suggestPrice();
    expect(component.pricingMessage()).toBe("time.pricing.failed");
    expect(component.pricing()).toBe(false);
    expect(component.form.controls.value.enabled).toBe(true);
    expect(component.form.controls.currency.enabled).toBe(true);
    expect(component.form.controls.value.value).toBe("42.00");
    entries.suggestPrice.mockReturnValue(of(priceResult()));
    component.suggestPrice();
    expect(component.form.controls.value.value).toBe("5000.00");
  });

  it("shows missing information and alternatives without overwriting existing money", () => {
    const result = priceResult({
      status: "NEEDS_INFORMATION",
      suggestedPrice: null,
      currency: null,
      calculation: null,
      missingInformation: [
        {
          key: "claimValue",
          label: "Claim value",
          reason: "Needed for tariff band",
          type: "DECIMAL",
        },
      ],
    });
    entries.suggestPrice.mockReturnValue(of(result));
    const fixture = render();
    const component = fixture.componentInstance;
    fillValid(component, { value: "42.00", currency: "RSD" });
    component.suggestPrice();
    fixture.detectChanges();
    expect(component.form.controls.value.value).toBe("42.00");
    expect(fixture.nativeElement.textContent).toContain(
      "Needed for tariff band",
    );
    const alternative = {
      suggestedPrice: "100.00",
      currency: "EUR",
      explanation: "Client agreement",
      calculation: {
        formula: "base",
        operands: { base: "100" },
        rounding: "ROUND_HALF_UP",
      },
      sources: priceResult().sources,
    };
    entries.suggestPrice.mockReturnValue(
      of(
        priceResult({
          status: "NEEDS_REVIEW",
          suggestedPrice: null,
          alternatives: [alternative],
        }),
      ),
    );
    component.suggestPrice();
    fixture.detectChanges();
    expect(component.form.controls.value.value).toBe("42.00");
    expect(fixture.nativeElement.textContent).toContain("Client agreement");
  });

  it("does not enable previously disabled money controls after cancellation", () => {
    const component = render().componentInstance;
    fillValid(component);
    component.form.controls.value.disable({ emitEvent: false });
    component.suggestPrice();
    component.cancelPricing();
    expect(component.form.controls.value.disabled).toBe(true);
    expect(component.form.controls.currency.enabled).toBe(true);
  });

  it("unsubscribes pricing on dialog destruction and hides it for unauthorized roles", () => {
    const pending = new Subject<PricingSuggestionResponse>();
    entries.suggestPrice.mockReturnValue(pending);
    const fixture = render();
    fillValid(fixture.componentInstance);
    fixture.componentInstance.suggestPrice();
    fixture.destroy();
    expect(pending.observed).toBe(false);
    TestBed.resetTestingModule();
    authSession.set({
      user: { id: "user-1" },
      memberships: [{ role: "LAWYER" }],
    });
    const other = render();
    fillValid(other.componentInstance);
    other.componentInstance.suggestPrice();
    expect(
      buttonWithText(other.nativeElement, "time.pricing.suggest"),
    ).toBeUndefined();
    expect(entries.suggestPrice).toHaveBeenCalledTimes(1);
  });

  it("is invalid without a client", () => {
    const { componentInstance: component } = render();
    component.form.patchValue({ minutes: 30, title: "Rad" });
    expect(component.form.controls.clientId.hasError("required")).toBe(true);
    expect(component.form.invalid).toBe(true);

    component.form.controls.clientId.setValue("client-1");
    expect(component.form.valid).toBe(true);
  });

  it("allows event capture without a client and defaults to non-billable", () => {
    context = { mode: "create", eventId: "event-1" };
    const { componentInstance: component } = render();
    component.form.controls.title.setValue("Ročište");

    expect(component.form.controls.clientId.hasError("required")).toBe(false);
    expect(component.form.controls.treatment.value).toBe("NON_BILLABLE");
    expect(component.form.valid).toBe(true);

    component.submit();

    expect(entries.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        clientId: null,
      }),
    );
  });

  it("requires a one-sentence title of at most 200 characters", () => {
    const { componentInstance: component } = render();
    fillValid(component, { title: "   " });
    expect(component.form.controls.title.invalid).toBe(true);
    component.form.controls.title.setValue("x".repeat(201));
    expect(component.form.controls.title.hasError("maxlength")).toBe(true);
    component.form.controls.title.setValue("Poziv sa klijentom");
    expect(component.form.valid).toBe(true);
  });

  it("makes the duration and the description optional", () => {
    const { componentInstance: component } = render();
    fillValid(component, { minutes: null, description: "" });
    expect(component.form.valid).toBe(true);
  });

  it("uses the client billing currency ahead of the organization default", () => {
    context = { mode: "create", clientId: "client-1" };
    billing.getProfile.mockReturnValueOnce(
      of({ clientId: "client-1", hourlyRate: "80.00", currency: "EUR" }),
    );
    const component = render().componentInstance;

    expect(component.form.controls.currency.value).toBe("EUR");
  });

  it("accepts an explicit zero work value and submits it independently", () => {
    const component = render().componentInstance;
    fillValid(component);
    component.form.patchValue({ value: "0", currency: "EUR" });
    expect(component.form.valid).toBe(true);

    component.submit();

    expect(entries.create).toHaveBeenCalledWith(
      expect.objectContaining({ value: "0.00", currency: "EUR" }),
    );
  });

  it("validates money precision and requires currency only when a value exists", () => {
    const component = render().componentInstance;
    fillValid(component);
    component.form.controls.value.setValue("12.345");
    expect(component.form.controls.value.hasError("workValue")).toBe(true);
    component.form.patchValue({ value: "12.50", currency: "" });
    expect(component.form.hasError("workValueCurrency")).toBe(true);
    component.form.controls.value.setValue("");
    expect(component.form.valid).toBe(true);
  });

  it("requires minutes when confirming a stopped timer", () => {
    context = {
      mode: "confirm-timer",
      entryId: "entry-1",
      clientId: "client-1",
      requireMinutes: true,
      title: "Rad",
    };
    const { componentInstance: component } = render();
    component.form.controls.minutes.setValue(null);
    expect(component.form.controls.minutes.hasError("required")).toBe(true);
  });

  it("lists recent clients first, without duplicates", () => {
    const { componentInstance: component } = render();
    expect(component.clientOptions().map((client) => client.id)).toEqual([
      "client-2",
      "client-1",
      "client-3",
    ]);
    expect(entries.list).toHaveBeenCalledWith({
      userIds: ["user-1"],
      page: 1,
      pageSize: 20,
    });
  });

  it("searches clients on the server with a debounce while typing", () => {
    jest.useFakeTimers();
    try {
      const { componentInstance: component } = render();
      clients.list.mockClear();
      clients.list.mockReturnValue(
        of({ items: [{ id: "client-9", displayName: "Alfa Omega" }] }),
      );

      component.searchClients("al");
      component.searchClients("alfa");
      jest.advanceTimersByTime(249);
      expect(clients.list).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);

      expect(clients.list).toHaveBeenCalledTimes(1);
      expect(clients.list).toHaveBeenCalledWith({
        page: 1,
        pageSize: 100,
        status: "ACTIVE",
        search: "alfa",
      });
      // A search shows only the server's matches, not the recent clients.
      expect(component.clientOptions().map((client) => client.id)).toEqual([
        "client-9",
      ]);
      component.setClientId("client-9");
      expect(component.clientItemToString("client-9")).toBe("Alfa Omega");
    } finally {
      jest.useRealTimers();
    }
  });

  it("sets 30 minutes from the 30 chip", () => {
    const fixture = render();
    const chip = buttonWithText(
      fixture.nativeElement,
      "30 time.capture.minuteUnit",
    );
    chip?.click();
    expect(fixture.componentInstance.form.controls.minutes.value).toBe(30);
  });

  it("rejects durations outside 1..1440 minutes", () => {
    const { componentInstance: component } = render();
    component.form.controls.minutes.setValue(0);
    expect(component.form.controls.minutes.invalid).toBe(true);
    component.form.controls.minutes.setValue(1441);
    expect(component.form.controls.minutes.invalid).toBe(true);
    component.form.controls.minutes.setValue(1440);
    expect(component.form.controls.minutes.valid).toBe(true);
  });

  it("rejects fractional durations", () => {
    const { componentInstance: component } = render();
    component.form.controls.minutes.setValue(30.5);
    expect(component.form.controls.minutes.hasError("integer")).toBe(true);
    component.form.controls.minutes.setValue(30);
    expect(component.form.controls.minutes.valid).toBe(true);
  });

  describe("AI fill", () => {
    it("keeps the form and shows the hint when parse fails", () => {
      entries.parse.mockReturnValue(of(parseResult({ ok: false })));
      const fixture = render();
      const component = fixture.componentInstance;
      component.form.patchValue({ description: "Ručno", minutes: 15 });
      component.form.controls.title.setValue("nešto nejasno");
      fixture.detectChanges();

      buttonWithText(fixture.nativeElement, "time.capture.fill")?.click();
      fixture.detectChanges();

      expect(entries.parse).toHaveBeenCalledWith({ text: "nešto nejasno" });
      expect(component.form.getRawValue()).toMatchObject({
        clientId: "",
        description: "Ručno",
        minutes: 15,
      });
      expect(component.aiParsed()).toBe(false);
      expect(fixture.nativeElement.textContent).toContain(
        "time.capture.parseFailed",
      );
    });

    it("shows the hint when the request itself fails", () => {
      entries.parse.mockReturnValue(throwError(() => new Error("timeout")));
      const fixture = render();
      fixture.componentInstance.form.controls.title.setValue("Alfa 30 min");
      fixture.componentInstance.fillFromText();
      expect(fixture.componentInstance.parseFailed()).toBe(true);
      expect(fixture.componentInstance.aiParsed()).toBe(false);
    });

    it("fills the form and flags aiParsed for a single client match", () => {
      entries.parse.mockReturnValue(
        of(
          parseResult({
            clientId: "client-2",
            minutes: 45,
            description: "Telefonski razgovor",
          }),
        ),
      );
      const fixture = render();
      const component = fixture.componentInstance;
      component.form.controls.title.setValue(
        "Beta 45 minuta telefonski razgovor",
      );
      component.fillFromText();

      expect(component.form.controls.clientId.value).toBe("client-2");
      expect(component.form.controls.minutes.value).toBe(45);
      // The parsed summary replaces the sentence the user typed.
      expect(component.form.controls.title.value).toBe("Telefonski razgovor");
      expect(component.aiParsed()).toBe(true);
      expect(component.parseFailed()).toBe(false);
    });

    it("derives the client from the case when only the case matched", () => {
      cases.get.mockReturnValue(
        of({
          id: "case-9",
          caseNumber: "P-9/2026",
          name: "Spor",
          client: clientRef("client-3", "Gama d.o.o."),
        }),
      );
      entries.parse.mockReturnValue(of(parseResult({ caseId: "case-9" })));
      const component = render().componentInstance;
      component.form.controls.title.setValue("spor P-9");
      component.fillFromText();

      expect(cases.get).toHaveBeenCalledWith("case-9");
      expect(component.form.controls.clientId.value).toBe("client-3");
      expect(component.form.controls.caseId.value).toBe("case-9");
      expect(component.aiParsed()).toBe(true);
    });

    it("only flags aiParsed once the matched case has been loaded", () => {
      const lookup = new Subject<unknown>();
      cases.get.mockReturnValue(lookup);
      entries.parse.mockReturnValue(of(parseResult({ caseId: "case-9" })));
      const component = render().componentInstance;
      component.form.controls.title.setValue("spor P-9");
      component.fillFromText();

      expect(component.aiParsed()).toBe(false);
      expect(component.parseFailed()).toBe(false);
      lookup.next({
        id: "case-9",
        caseNumber: "P-9/2026",
        name: "Spor",
        client: clientRef("client-3", "Gama d.o.o."),
      });
      expect(component.aiParsed()).toBe(true);
    });

    it("shows the hint when the matched case cannot be loaded", () => {
      cases.get.mockReturnValue(throwError(() => new Error("404")));
      entries.parse.mockReturnValue(of(parseResult({ caseId: "case-9" })));
      const component = render().componentInstance;
      component.form.controls.title.setValue("spor P-9");
      component.fillFromText();

      expect(component.aiParsed()).toBe(false);
      expect(component.parseFailed()).toBe(true);
    });

    it("offers ambiguous candidates and leaves the field empty", () => {
      entries.parse.mockReturnValue(
        of(
          parseResult({
            clientCandidates: [
              clientRef("client-1", "Alfa d.o.o."),
              clientRef("client-3", "Gama d.o.o."),
            ],
            minutes: 20,
          }),
        ),
      );
      const fixture = render();
      const component = fixture.componentInstance;
      component.form.controls.title.setValue("a 20 minuta");
      component.fillFromText();
      fixture.detectChanges();

      expect(component.form.controls.clientId.value).toBe("");
      expect(component.aiParsed()).toBe(true);
      const chip = buttonWithText(fixture.nativeElement, "Gama d.o.o.");
      chip?.click();
      expect(component.form.controls.clientId.value).toBe("client-3");
    });

    it("does not flag aiParsed when parse filled nothing", () => {
      entries.parse.mockReturnValue(of(parseResult()));
      const component = render().componentInstance;
      component.form.controls.title.setValue("???");
      component.fillFromText();
      expect(component.aiParsed()).toBe(false);
      expect(component.parseFailed()).toBe(true);
    });
  });

  it("hides the date and the AI box when confirming from a source", () => {
    context = {
      mode: "confirm-source",
      minutes: 45,
      title: "Ročište",
      source: { sourceType: "EVENT", sourceId: "event-1" },
    };
    const fixture = render();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector("#capture-date")).toBeNull();
    expect(root.querySelector("#capture-title")).not.toBeNull();
    expect(buttonWithText(root, "time.capture.fill")).toBeFalsy();
    expect(root.querySelector("#capture-minutes")).not.toBeNull();
  });

  it("shows the date and the AI box when creating", () => {
    const root: HTMLElement = render().nativeElement;
    expect(root.querySelector("#capture-date")).not.toBeNull();
    expect(root.querySelector("#capture-title")).not.toBeNull();
    expect(buttonWithText(root, "time.capture.fill")).toBeTruthy();
  });

  it("clears the case when the client changes", () => {
    const { componentInstance: component } = render();
    component.form.controls.clientId.setValue("client-1");
    component.form.controls.caseId.setValue("case-1");
    component.form.controls.clientId.setValue("client-2");
    expect(component.form.controls.caseId.value).toBe("");
  });

  it("selects the client of a chosen case", () => {
    cases.list.mockReturnValue(
      of({
        items: [
          {
            id: "case-5",
            caseNumber: "P-5/2026",
            name: "Naknada",
            client: clientRef("client-2", "Beta d.o.o."),
          },
        ],
      }),
    );
    const { componentInstance: component } = render();
    component.setCaseId("case-5");
    expect(component.form.controls.clientId.value).toBe("client-2");
    expect(component.form.controls.caseId.value).toBe("case-5");
  });

  describe("treatment", () => {
    const agreement: RetainerAgreement = {
      id: "a1",
      clientId: "client-1",
      title: "Paušal",
      monthlyFee: "1000.00",
      currency: "EUR",
      validFrom: "2026-01-01",
      validTo: null,
      includedMinutes: null,
      coveredCategoryIds: ["cat-1"],
      overageRule: "HOURLY",
      overageHourlyRate: "100.00",
      outOfScopeRule: "HOURLY",
      outOfScopeHourlyRate: "100.00",
      active: true,
    };

    it("pre-fills the treatment from the client's retainers and category", () => {
      billing.listRetainers.mockReturnValue(of([agreement]));
      const { componentInstance: component } = render();
      component.form.controls.clientId.setValue("client-1");
      component.form.controls.serviceCategoryId.setValue("cat-1");
      expect(billing.listRetainers).toHaveBeenCalledWith("client-1");
      expect(component.form.controls.treatment.value).toBe("RETAINER");

      component.form.controls.serviceCategoryId.setValue("cat-2");
      expect(component.form.controls.treatment.value).toBe("HOURLY");
    });

    it("keeps a treatment the user picked", () => {
      billing.listRetainers.mockReturnValue(of([agreement]));
      const { componentInstance: component } = render();
      component.form.controls.treatment.setValue("AT");
      component.form.controls.treatment.markAsDirty();
      component.form.controls.clientId.setValue("client-1");
      expect(component.form.controls.treatment.value).toBe("AT");
    });

    it("leaves the treatment to the API when retainers cannot be read", () => {
      billing.listRetainers.mockReturnValue(throwError(() => new Error("403")));
      const { componentInstance: component } = render();
      fillValid(component);
      component.submit();
      expect(entries.create.mock.calls[0][0].treatment).toBeUndefined();
    });
  });

  it("keeps capture open after atomic save failure and prevents duplicate submits", () => {
    const pending = new Subject<WorkEntry>();
    const save = jest.fn(() => pending);
    context = { mode: "create", clientId: "client-1", title: "Pregled", save };
    const { componentInstance: component } = render();
    component.submit();
    component.submit();
    expect(save).toHaveBeenCalledTimes(1);
    expect(entries.create).not.toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
    pending.error(new Error("Failed"));
    expect(component.saving()).toBe(false);
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(component.form.controls.title.value).toBe("Pregled");
    save.mockReturnValue(of(savedEntry) as Subject<WorkEntry>);
    component.submit();
    expect(dialogRef.close).toHaveBeenCalledWith(savedEntry);
  });

  it("finishes without new work even when capture fields are invalid, and keeps errors retryable", () => {
    const pending = new Subject<WorkEntry>();
    const finishWithoutNewWork = jest.fn(() => pending);
    context = { mode: "create", finishWithoutNewWork };
    const { componentInstance: component } = render();
    expect(component.form.invalid).toBe(true);
    component.finishWithoutNewWork();
    component.finishWithoutNewWork();
    expect(finishWithoutNewWork).toHaveBeenCalledTimes(1);
    expect(entries.create).not.toHaveBeenCalled();
    pending.error(new Error("No work remains"));
    expect(component.saving()).toBe(false);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });
  it("saves task linkage when capturing work independently", () => {
    context = {
      mode: "create",
      taskId: "task-1",
      clientId: "client-1",
      title: "Review",
    };
    const { componentInstance: component } = render();
    component.submit();
    expect(entries.create).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: "task-1" }),
    );
  });

  describe("task entry deletion", () => {
    const editable = {
      canEdit: true,
      canDelete: true,
      deleteBlockedReason: null,
    };
    const last = {
      ...editable,
      canDelete: false,
      deleteBlockedReason: "LAST_TASK_ENTRY",
    };
    beforeEach(() => {
      context = {
        mode: "edit",
        entryId: "entry-1",
        manageEntry: true,
        onDeleted: jest.fn(),
      };
      entries.get.mockReturnValue(
        of({
          ...savedEntry,
          client: clientRef("client-1", "Client"),
          case: null,
          minutes: null,
          title: "Existing work",
          status: "CONFIRMED",
          user: { id: "user-1", displayName: "Ana" },
          description: "Notes",
          workDate: "2026-10-08",
          serviceCategory: null,
          treatment: "UNDECIDED",
        }),
      );
      entries.actions.mockReturnValue(of(editable));
      entries.remove.mockReturnValue(of(undefined));
      confirmation.confirm.mockReturnValue(of(true));
    });
    it("disables delete and explains how to remove the last task entry", () => {
      entries.actions.mockReturnValue(of(last));
      const fixture = render();
      const button = buttonWithText(fixture.nativeElement, "common.delete");
      expect(button?.disabled).toBe(true);
      expect(fixture.nativeElement.textContent).toContain(
        "work.entries.lastEntryInfo",
      );
      fixture.componentInstance.deleteEntry();
      expect(confirmation.confirm).not.toHaveBeenCalled();
      expect(entries.remove).not.toHaveBeenCalled();
    });
    it("does not delete if confirmation is cancelled", () => {
      confirmation.confirm.mockReturnValue(of(false));
      const fixture = render();
      fixture.componentInstance.deleteEntry();
      expect(confirmation.confirm).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "danger" }),
      );
      expect(entries.remove).not.toHaveBeenCalled();
      expect(context.onDeleted).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(fixture.componentInstance.saving()).toBe(false);
    });
    it("checks again before confirming, deletes once and refreshes the caller", () => {
      const pending = new Subject<void>();
      entries.remove.mockReturnValue(pending);
      const fixture = render();
      fixture.componentInstance.deleteEntry();
      fixture.componentInstance.deleteEntry();
      expect(entries.actions).toHaveBeenCalledTimes(2);
      expect(entries.remove).toHaveBeenCalledTimes(1);
      expect(dialogRef.close).not.toHaveBeenCalled();
      pending.next();
      pending.complete();
      expect(context.onDeleted).toHaveBeenCalledTimes(1);
      expect(dialogRef.close).toHaveBeenCalledWith();
    });
    it("stops deletion when the pre-confirmation check finds only one entry", () => {
      const fixture = render();
      entries.actions.mockReturnValue(of(last));
      fixture.componentInstance.deleteEntry();
      expect(confirmation.confirm).not.toHaveBeenCalled();
      expect(entries.remove).not.toHaveBeenCalled();
      expect(toast.info).toHaveBeenCalledWith("work.entries.lastEntryInfo");
    });
    it("shows the last-entry message if another deletion wins the race", () => {
      entries.remove.mockReturnValue(
        throwError(() => ({ error: { code: "LAST_TASK_WORK_ENTRY" } })),
      );
      const fixture = render();
      fixture.componentInstance.deleteEntry();
      expect(fixture.componentInstance.entryActions()?.canDelete).toBe(false);
      expect(toast.info).toHaveBeenCalledWith("work.entries.lastEntryInfo");
      expect(context.onDeleted).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
    });
    it("keeps entered data and allows retry after a deletion error", () => {
      entries.remove.mockReturnValue(throwError(() => new Error("Offline")));
      const fixture = render();
      fixture.componentInstance.deleteEntry();
      expect(fixture.componentInstance.saving()).toBe(false);
      expect(fixture.componentInstance.form.controls.title.value).toBe(
        "Existing work",
      );
      expect(toast.error).toHaveBeenCalledWith("work.entries.deleteError");
      expect(dialogRef.close).not.toHaveBeenCalled();
    });
    it("opens billed entries for viewing with no save action", () => {
      entries.actions.mockReturnValue(
        of({ canEdit: false, canDelete: false, deleteBlockedReason: "BILLED" }),
      );
      const fixture = render();
      expect(fixture.componentInstance.form.disabled).toBe(true);
      expect(
        [
          ...fixture.nativeElement.querySelectorAll('input[type="radio"]'),
        ].every((radio) => (radio as HTMLInputElement).disabled),
      ).toBe(true);
      expect(
        buttonWithText(fixture.nativeElement, "common.save"),
      ).toBeUndefined();
      expect(
        buttonWithText(fixture.nativeElement, "common.delete"),
      ).toBeUndefined();
      fixture.componentInstance.submit();
      expect(entries.update).not.toHaveBeenCalled();
    });
  });

  it("shows the linked task and opens its details without closing capture", async () => {
    context = { mode: "create", taskId: "task-1" };
    const fixture = render();
    const button = buttonWithText(fixture.nativeElement, "Prepare submission");
    expect(button).toBeDefined();
    button?.click();
    await fixture.whenStable();
    expect(taskDialog.open).toHaveBeenCalledWith({
      task: { id: "task-1", title: "Prepare submission" },
    });
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it("keeps capture usable when opening the task fails", () => {
    context = { mode: "create", taskId: "task-1" };
    const fixture = render();
    tasks.getTask.mockReturnValueOnce(throwError(() => new Error("offline")));
    fixture.componentInstance.openLinkedTask();
    expect(toast.error).toHaveBeenCalledWith("time.capture.taskLoadError");
    expect(fixture.componentInstance.openingTask()).toBe(false);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it("selects treatment through radios and disables them during save", () => {
    const fixture = render();
    const hourly = fixture.nativeElement.querySelector(
      'input[type="radio"][value="HOURLY"]',
    ) as HTMLInputElement;
    hourly.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.form.controls.treatment.value).toBe(
      "HOURLY",
    );
    fixture.componentInstance.saving.set(true);
    fixture.detectChanges();
    expect(hourly.disabled).toBe(true);
  });

  describe("view mode", () => {
    const entry = {
      id: "view-1",
      taskId: "task-1",
      title: "Filed appeal",
      description: "Detailed notes",
      status: "BILLED",
      client: clientRef("client-1", "Client"),
      case: { id: "case-1", caseNumber: "2026-1", name: "Case" },
      user: { id: "user-1", displayName: "Ana" },
      workDate: "2026-10-08",
      minutes: 45,
      treatment: "HOURLY",
      serviceCategory: { id: "cat-1", name: "Research" },
    };
    beforeEach(() => {
      context = { mode: "view", entryId: "view-1", manageEntry: true };
      entries.get.mockReturnValue(of(entry));
    });
    it("shows saved details with only navigation and close actions", () => {
      const fixture = render();
      const root = fixture.nativeElement as HTMLElement;
      expect(root.textContent).toContain("Filed appeal");
      expect(root.textContent).toContain("Detailed notes");
      expect(root.textContent).toContain("Research");
      expect(root.textContent).toContain("time.status.billed");
      expect(root.querySelector("input, textarea, select, form")).toBeNull();
      expect(buttonWithText(root, "time.capture.fill")).toBeUndefined();
      expect(buttonWithText(root, "common.delete")).toBeUndefined();
      expect(buttonWithText(root, "common.save")).toBeUndefined();
      expect(buttonWithText(root, "Prepare submission")).toBeDefined();
      expect(clients.list).not.toHaveBeenCalled();
      expect(billing.listCategories).not.toHaveBeenCalled();
      expect(entries.actions).not.toHaveBeenCalled();
      fixture.componentInstance.submit();
      fixture.componentInstance.deleteEntry();
      expect(entries.update).not.toHaveBeenCalled();
      expect(entries.remove).not.toHaveBeenCalled();
      buttonWithText(root, "common.close")?.click();
      expect(dialogRef.close).toHaveBeenCalled();
    });
    it("keeps a failed load retryable", () => {
      entries.get.mockReturnValueOnce(throwError(() => new Error("offline")));
      const fixture = render();
      expect(fixture.nativeElement.textContent).toContain(
        "work.entries.loadEntryError",
      );
      buttonWithText(fixture.nativeElement, "work.retry")?.click();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain("Filed appeal");
    });
    it("switches a stale edit request to view when the server returns a billed entry", () => {
      context = { mode: "edit", entryId: "view-1" };
      const fixture = render();
      expect(fixture.componentInstance.readOnly()).toBe(true);
      expect(fixture.nativeElement.querySelector("form")).toBeNull();
      expect(fixture.nativeElement.textContent).toContain("Filed appeal");
    });
  });

  it("edits written-off work and restores it only when Confirmed is selected", () => {
    context = { mode: "edit", entryId: "written-off" };
    entries.get.mockReturnValue(
      of({
        id: "written-off",
        status: "WRITTEN_OFF",
        client: clientRef("client-1", "Client"),
        case: null,
        minutes: 30,
        title: "Written off",
        description: "Notes",
        workDate: "2026-10-08",
        serviceCategory: null,
        treatment: "HOURLY",
      }),
    );
    const fixture = render();
    expect(fixture.componentInstance.readOnly()).toBe(false);
    expect(
      fixture.nativeElement.querySelector("#capture-restore-status"),
    ).not.toBeNull();
    fixture.componentInstance.restoredStatus.setValue("CONFIRMED");
    fixture.componentInstance.submit();
    expect(entries.update).toHaveBeenCalledWith(
      "written-off",
      expect.objectContaining({ status: "CONFIRMED", title: "Written off" }),
    );
  });

  it("hydrates and resubmits an existing work value and currency", () => {
    context = { mode: "edit", entryId: "priced-entry" };
    entries.get.mockReturnValue(
      of({
        ...savedEntry,
        client: clientRef("client-1", "Client"),
        case: null,
        minutes: 30,
        title: "Priced work",
        description: "",
        workDate: "2026-10-08",
        serviceCategory: null,
        treatment: "HOURLY",
        status: "CONFIRMED",
        value: "125.40",
        currency: "EUR",
      }),
    );
    const component = render().componentInstance;

    expect(component.form.controls.value.value).toBe("125.40");
    expect(component.form.controls.currency.value).toBe("EUR");
    component.submit();

    expect(entries.update).toHaveBeenCalledWith(
      "priced-entry",
      expect.objectContaining({ value: "125.40", currency: "EUR" }),
    );
  });

  it("defaults the user selector to the current user and submits a different selection", () => {
    context = { mode: "create", clientId: "client-1", title: "Work" };
    const fixture = render();
    const component = fixture.componentInstance;
    expect(component.form.controls.userId.value).toBe("user-1");
    expect(component.userItemToString("user-1")).toBe("Ana");
    expect(fixture.nativeElement.querySelector("#capture-user")).not.toBeNull();
    component.form.controls.userId.setValue("user-2");
    component.submit();
    expect(entries.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-2" }),
    );
  });
  it("uses a source-provided performer for capture", () => {
    context = { mode: "create", userId: "user-2" };
    const fixture = render();
    expect(fixture.componentInstance.form.controls.userId.value).toBe("user-2");
  });
  it.each(["user-2", null])(
    "preserves the saved performer %s in edit mode",
    (userId) => {
      context = { mode: "edit", entryId: "entry-1" };
      entries.get.mockReturnValue(
        of({
          ...savedEntry,
          user: userId ? { id: userId, displayName: "Marko" } : null,
          client: clientRef("client-1", "Client"),
          case: null,
          minutes: 30,
          title: "Work",
          description: "",
          workDate: "2026-10-09",
          serviceCategory: null,
          treatment: "NON_BILLABLE",
          status: "CONFIRMED",
        }),
      );
      const fixture = render();
      const component = fixture.componentInstance;
      expect(component.form.controls.userId.value).toBe(userId ?? "");
      component.submit();
      expect(entries.update).toHaveBeenCalledWith(
        "entry-1",
        expect.objectContaining({ userId }),
      );
    },
  );

  it("keeps explicit non-billable treatment when selecting a client and submits it", () => {
    context = {
      mode: "create",
      eventId: "event-1",
      title: "Internal meeting",
      treatment: "NON_BILLABLE",
    };
    const fixture = render();
    const component = fixture.componentInstance;
    component.form.controls.clientId.setValue("client-1");
    fixture.detectChanges();
    expect(component.form.controls.treatment.value).toBe("NON_BILLABLE");
    component.submit();
    expect(entries.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        treatment: "NON_BILLABLE",
      }),
    );
  });

  it("persists the event link and opens the event from the capture header", async () => {
    context = {
      mode: "create",
      eventId: "event-1",
      clientId: "client-1",
      title: "Hearing work",
    };
    const fixture = render();
    expect(fixture.nativeElement.textContent).toContain("Hearing");
    fixture.componentInstance.openLinkedEvent();
    await fixture.whenStable();
    expect(eventDialog.open).toHaveBeenCalledWith({
      event: { id: "event-1", title: "Hearing" },
    });
    expect(dialogRef.close).not.toHaveBeenCalled();
    fixture.componentInstance.submit();
    expect(entries.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "event-1" }),
    );
  });
  describe("save", () => {
    it("creates a MANUAL entry when nothing was parsed", () => {
      const { componentInstance: component } = render();
      fillValid(component);
      component.submit();
      expect(entries.create).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: "client-1",
          minutes: 30,
          title: "Pregled ugovora",
          description: "",
          workDate: "2026-10-04",
          source: "MANUAL",
          aiParsed: false,
        }),
      );
      expect(dialogRef.close).toHaveBeenCalledWith(savedEntry);
    });

    it("creates an untimed entry when no duration is given", () => {
      const { componentInstance: component } = render();
      fillValid(component, { minutes: null });
      component.submit();
      expect(entries.create).toHaveBeenCalledWith(
        expect.objectContaining({ minutes: null, title: "Pregled ugovora" }),
      );
    });

    it("creates a QUICK_CAPTURE entry after a successful parse", () => {
      entries.parse.mockReturnValue(of(parseResult({ clientId: "client-1" })));
      const { componentInstance: component } = render();
      component.form.controls.title.setValue("Alfa");
      component.fillFromText();
      fillValid(component);
      component.submit();
      expect(entries.create).toHaveBeenCalledWith(
        expect.objectContaining({ source: "QUICK_CAPTURE", aiParsed: true }),
      );
    });

    it("does not save an invalid form", () => {
      const { componentInstance: component } = render();
      component.submit();
      expect(entries.create).not.toHaveBeenCalled();
      expect(component.form.controls.clientId.touched).toBe(true);
    });

    it("stays open and reports a failed save", () => {
      entries.create.mockReturnValue(throwError(() => new Error("500")));
      const { componentInstance: component } = render();
      fillValid(component);
      component.submit();
      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith("time.capture.saveError");
      expect(component.saving()).toBe(false);
    });

    it("updates then confirms the timer entry", () => {
      context = {
        mode: "confirm-timer",
        entryId: "entry-1",
        clientId: "client-1",
        minutes: 12,
        title: "Rad",
        workDate: "2026-10-04",
      };
      const { componentInstance: component } = render();
      expect(entries.get).toHaveBeenCalledWith("entry-1");
      component.submit();
      expect(entries.update).toHaveBeenCalledWith(
        "entry-1",
        expect.objectContaining({ clientId: "client-1", minutes: 12 }),
      );
      expect(entries.confirm).toHaveBeenCalledWith("entry-1", {
        userId: "user-1",
        minutes: 12,
        title: "Rad",
        description: "",
        value: null,
        currency: "RSD",
      });
      expect(entries.create).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith(savedEntry);
    });

    it("confirms from a source without needing a client", () => {
      context = {
        mode: "confirm-source",
        minutes: 45,
        title: "Ročište",
        source: { sourceType: "EVENT", sourceId: "event-1" },
      };
      const { componentInstance: component } = render();
      component.submit();
      expect(entries.confirmFromSource).toHaveBeenCalledWith({
        userId: "user-1",
        sourceType: "EVENT",
        sourceId: "event-1",
        minutes: 45,
        title: "Ročište",
        description: "",
        value: null,
        currency: "RSD",
      });
    });

    it("updates an existing entry in edit mode", () => {
      context = {
        mode: "edit",
        entryId: "entry-7",
        clientId: "client-1",
        minutes: 60,
        title: "Izmena",
      };
      const { componentInstance: component } = render();
      component.submit();
      expect(entries.update).toHaveBeenCalledWith(
        "entry-7",
        expect.objectContaining({ minutes: 60, title: "Izmena" }),
      );
      expect(entries.confirm).not.toHaveBeenCalled();
    });
  });
});
