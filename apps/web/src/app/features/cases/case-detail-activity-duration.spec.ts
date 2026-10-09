import { TestBed } from "@angular/core/testing";
import { ActivatedRoute } from "@angular/router";
import {
  CasesApiClient,
  ChatApiClient,
  DocumentsApiClient,
  ReferencesApiClient,
} from "@law/api-clients";
import { AuthState } from "@law/security";
import { NEVER, Subject, of } from "rxjs";
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
  const listActivities = jest.fn();
  const listResponsibilities = jest.fn();
  const caseLinks = jest.fn();
  let component: CaseDetailComponent;

  beforeEach(() => {
    createActivity.mockReset().mockReturnValue(of({}));
    const emptyPage = {
      items: [],
      meta: { page: 1, totalItems: 0, totalPages: 0 },
    };
    listActivities.mockReset().mockReturnValue(of(emptyPage));
    listResponsibilities.mockReset().mockReturnValue(of(emptyPage));
    caseLinks
      .mockReset()
      .mockReturnValue(of({ sessions: emptyPage, drafts: emptyPage }));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CasesApiClient,
          useValue: silentApi({
            createActivity,
            listActivities,
            listResponsibilities,
          }),
        },
        { provide: DocumentsApiClient, useValue: silentApi() },
        { provide: ChatApiClient, useValue: silentApi({ caseLinks }) },
        { provide: ReferencesApiClient, useValue: silentApi() },
        {
          provide: AuthState,
          useValue: silentApi({
            session: () => ({ memberships: [{ workspaceId: "workspace-1" }] }),
          }),
        },
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

  it("defaults every page-button case collection to 50 and resets on size changes", () => {
    component.loadActivities(true);
    component.loadResponsibilities(true);
    component.loadAssistantLinks();
    expect(listActivities).toHaveBeenLastCalledWith(
      "case-1",
      expect.objectContaining({ page: 1, pageSize: 50 }),
    );
    expect(listResponsibilities).toHaveBeenLastCalledWith("case-1", {
      page: 1,
      pageSize: 50,
    });
    expect(caseLinks).toHaveBeenLastCalledWith("workspace-1", "case-1", {
      page: 1,
      draftPage: 1,
      pageSize: 50,
    });
    component.activitiesPage.set(3);
    component.changeActivitiesPageSize(20);
    expect(listActivities).toHaveBeenCalledTimes(2);
    expect(listActivities).toHaveBeenLastCalledWith(
      "case-1",
      expect.objectContaining({ page: 1, pageSize: 20 }),
    );
    component.responsibilitiesPage.set(3);
    component.changeResponsibilitiesPageSize(100);
    expect(listResponsibilities).toHaveBeenCalledTimes(2);
    expect(listResponsibilities).toHaveBeenLastCalledWith("case-1", {
      page: 1,
      pageSize: 100,
    });
    component.assistantSessionsPage.set(3);
    component.assistantDraftsPage.set(2);
    component.changeAssistantPageSize(20);
    expect(caseLinks).toHaveBeenCalledTimes(2);
    expect(caseLinks).toHaveBeenLastCalledWith("workspace-1", "case-1", {
      page: 1,
      draftPage: 1,
      pageSize: 20,
    });
  });

  it("drops stale activity responses when filtering and clamps after deletion", () => {
    const stale = new Subject<unknown>();
    listActivities.mockReturnValueOnce(stale);
    component.loadActivities(true);
    component.setActivityTypes(["NOTE"]);
    stale.next({
      items: [{ id: "stale" }],
      meta: { page: 3, totalItems: 150, totalPages: 3 },
    });
    expect(component.activities()).toEqual([]);
    expect(component.activitiesPage()).toBe(1);
    listActivities.mockReturnValueOnce(
      of({ items: [], meta: { page: 3, totalItems: 2, totalPages: 1 } }),
    );
    component.activitiesPage.set(3);
    component.loadActivities(true);
    expect(listActivities).toHaveBeenLastCalledWith(
      "case-1",
      expect.objectContaining({ page: 1, pageSize: 50 }),
    );
    expect(component.activitiesPage()).toBe(1);
  });
});
