import { TestBed } from "@angular/core/testing";
import { ActivatedRoute } from "@angular/router";
import {
  CasesApiClient,
  ChatApiClient,
  DocumentsApiClient,
  ReferencesApiClient,
} from "@law/api-clients";
import { AuthState } from "@law/security";
import { NEVER, of } from "rxjs";
import { LocalizationService } from "../../core/localization/localization.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { DocumentUploadDialogService } from "../documents/document-upload-modal/document-upload-dialog.service";
import { CaseDetailComponent } from "./case-detail.component";

/** Every call the component makes on load never answers, so only the form is under test. */
const silentApi = (overrides: Record<string, unknown> = {}) =>
  new Proxy(overrides, {
    get: (target, name: string) =>
      name in target ? target[name] : jest.fn(() => NEVER),
  });

describe("CaseDetailComponent activity duration", () => {
  const createActivity = jest.fn();
  let component: CaseDetailComponent;

  beforeEach(() => {
    createActivity.mockReset().mockReturnValue(of({}));
    TestBed.configureTestingModule({
      providers: [
        { provide: CasesApiClient, useValue: silentApi({ createActivity }) },
        { provide: DocumentsApiClient, useValue: silentApi() },
        { provide: ChatApiClient, useValue: silentApi() },
        { provide: ReferencesApiClient, useValue: silentApi() },
        { provide: AuthState, useValue: silentApi() },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => "case-1" } } },
        },
        {
          provide: ToastService,
          useValue: { success: jest.fn(), error: jest.fn() },
        },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key },
        },
        { provide: ConfirmDialogService, useValue: {} },
        { provide: DocumentUploadDialogService, useValue: {} },
      ],
    });
    TestBed.overrideComponent(CaseDetailComponent, {
      set: { template: "", imports: [] },
    });
    component = TestBed.createComponent(CaseDetailComponent).componentInstance;
  });

  const fillBasics = (type: "PHONE_CALL" | "NOTE") =>
    component.activityForm.patchValue({
      type,
      title: "Call",
      activityDate: "2026-10-04",
    });

  it("hides and disables the duration for a note", () => {
    expect(component.activityTakesDuration()).toBe(false);
    expect(component.activityForm.controls.durationMinutes.disabled).toBe(true);
  });

  it("sends a valid duration for a phone call", () => {
    fillBasics("PHONE_CALL");
    component.setActivityMinutes(30);

    component.addActivity();

    expect(createActivity).toHaveBeenCalledWith(
      "case-1",
      expect.objectContaining({ type: "PHONE_CALL", durationMinutes: 30 }),
    );
  });

  it("drops an invalid duration when the type changes back to a note", () => {
    fillBasics("PHONE_CALL");
    component.activityForm.controls.durationMinutes.setValue(5000);
    expect(component.activityForm.valid).toBe(false);

    component.activityForm.controls.type.setValue("NOTE");

    expect(component.activityForm.valid).toBe(true);
    component.addActivity();
    expect(createActivity).toHaveBeenCalledTimes(1);
    expect(createActivity.mock.calls[0][1]).not.toHaveProperty(
      "durationMinutes",
    );
  });

  it("rejects a fractional duration", () => {
    fillBasics("PHONE_CALL");
    component.activityForm.controls.durationMinutes.setValue(1.5);

    expect(component.activityForm.valid).toBe(false);
    expect(
      component.activityForm.controls.durationMinutes.hasError("integer"),
    ).toBe(true);
    component.addActivity();
    expect(createActivity).not.toHaveBeenCalled();
  });
});
