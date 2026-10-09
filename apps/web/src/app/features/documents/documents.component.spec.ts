import { provideRouter } from "@angular/router";
import { TestBed } from "@angular/core/testing";
import {
  CasesApiClient,
  ClientsApiClient,
  DocumentsApiClient,
} from "@law/api-clients";
import { DocumentSummary } from "@law/api-interfaces";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { of, Subject, throwError } from "rxjs";
import { signal } from "@angular/core";
import { FormControl } from "@angular/forms";
import { LocalizationService } from "../../core/localization/localization.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { DocumentAssociationsDialogService } from "./document-associations/document-associations-dialog.service";
import { DocumentUploadDialogService } from "./document-upload-modal/document-upload-dialog.service";
import { DocumentMoveDialogComponent } from "./document-move-dialog.component";
import { DocumentsComponent } from "./documents.component";

describe("DocumentsComponent state helpers", () => {
  const interactiveComponent = () =>
    Object.assign(Object.create(DocumentsComponent.prototype), {
      selection: signal([
        { id: "folder", kind: "folder" },
        { id: "doc-1", kind: "file" },
      ]),
      bulkPending: signal(false),
      bulkError: signal(false),
      renamePending: signal(false),
      renameError: signal(false),
      renaming: signal(null),
      renameControl: new FormControl("Renamed", { nonNullable: true }),
      folders: signal([{ id: "folder", name: "Legal" }]),
      documents: signal([]),
      detailDocument: signal(null),
      destroyRef: { destroyed: false, onDestroy: () => () => undefined },
      documentsChanged: { emit: jest.fn() },
      toast: { success: jest.fn(), error: jest.fn() },
      localization: { translate: (key: string) => key },
      load: jest.fn(),
      closeDetail: jest.fn(),
      confirmDialog: { confirm: jest.fn(() => of(false)) },
    }) as DocumentsComponent;

  it("keeps failed bulk items selected while refreshing successful changes", () => {
    const component = interactiveComponent();
    const action = jest.fn((item) =>
      item.kind === "file" ? throwError(() => new Error("failed")) : of({}),
    );
    component.runBulk(action);
    expect(action).toHaveBeenCalledTimes(2);
    expect(component.selection()).toEqual([{ id: "doc-1", kind: "file" }]);
    expect(component.bulkError()).toBe(true);
    expect(component.bulkPending()).toBe(false);
    expect(component.load).toHaveBeenCalledWith(true);
    expect(component.documentsChanged.emit).toHaveBeenCalledTimes(1);
  });

  it("reuses confirmation and does not archive when cancelled", () => {
    const component = interactiveComponent();
    component.runBulk = jest.fn();
    component.archiveSelected();
    expect(
      (component as never as { confirmDialog: { confirm: jest.Mock } })
        .confirmDialog.confirm,
    ).toHaveBeenCalledWith(expect.objectContaining({ variant: "warning" }));
    expect(component.runBulk).not.toHaveBeenCalled();
    expect(component.bulkPending()).toBe(false);
  });

  it("prevents duplicate renames, retains failed input and applies server names on success", () => {
    const component = interactiveComponent();
    const request = new Subject<never>();
    const updateFolder = jest.fn(() => request);
    Object.assign(component, { documentsApi: { updateFolder } });
    component.renaming.set({ id: "folder", kind: "folder" });
    component.saveRename();
    component.saveRename();
    component.cancelRename();
    expect(updateFolder).toHaveBeenCalledTimes(1);
    expect(component.renaming()).not.toBeNull();
    request.error(new Error("failed"));
    expect(component.renamePending()).toBe(false);
    expect(component.renameError()).toBe(true);
    expect(component.renameControl.value).toBe("Renamed");
    updateFolder.mockReturnValue(of({ id: "folder", name: "Saved" }) as never);
    component.saveRename();
    expect(component.folders()[0].name).toBe("Saved");
    expect(component.renaming()).toBeNull();
    expect(component.documentsChanged.emit).toHaveBeenCalledTimes(1);
  });

  it("rejects empty names and supports cancellation without saving", () => {
    const component = interactiveComponent();
    component.renaming.set({ id: "folder", kind: "folder" });
    component.renameControl.setValue(" ");
    component.saveRename();
    expect(component.renameError()).toBe(true);
    component.cancelRename();
    expect(component.renaming()).toBeNull();
  });

  it("opens with Enter, toggles with Space, and ignores keys from child controls", () => {
    const component = interactiveComponent();
    component.openItem = jest.fn();
    component.selectItem = jest.fn();
    const target = {};
    const event = {
      key: "Enter",
      target,
      currentTarget: target,
      preventDefault: jest.fn(),
    } as unknown as KeyboardEvent;
    const item = { id: "folder", kind: "folder" as const };
    component.rowKey(event, item);
    expect(component.openItem).toHaveBeenCalledWith(item);
    component.rowKey({ ...event, key: " " } as KeyboardEvent, item);
    expect(component.selectItem).toHaveBeenCalledWith(
      item,
      expect.anything(),
      true,
    );
    component.rowKey({ ...event, target: {} } as KeyboardEvent, item);
    expect(component.openItem).toHaveBeenCalledTimes(1);
  });

  it("excludes selected folders and their descendants from the nested destination picker", () => {
    const folder = (id: string, parentId: string | null = null) => ({
      id,
      parentId,
      name: id,
      createdAt: "2026-10-06",
    });
    const dialog = Object.assign(
      Object.create(DocumentMoveDialogComponent.prototype),
      {
        context: { excludedFolderIds: ["selected"] },
        expanded: signal(new Set(["selected", "other"])),
        children: signal(
          new Map([
            [null, [folder("selected"), folder("other")]],
            ["selected", [folder("descendant", "selected")]],
            ["other", [folder("nested", "other")]],
          ]),
        ),
      },
    ) as DocumentMoveDialogComponent;
    expect(
      dialog.visibleFolders().map(({ folder, depth }) => [folder.id, depth]),
    ).toEqual([
      ["other", 0],
      ["nested", 1],
    ]);
  });
  const createComponent = () =>
    Object.create(DocumentsComponent.prototype) as DocumentsComponent;

  const createDocument = (
    overrides: Partial<DocumentSummary> = {},
  ): DocumentSummary => ({
    id: "doc-1",
    title: "Complaint",
    category: null,
    archived: false,
    archivedAt: null,
    aiAccess: false,
    aiStatus: "OFF",
    aiRetryable: false,
    documentKind: null,
    fromAssistantChat: false,
    cases: [
      {
        id: "case-1",
        caseNumber: "P-1/2026",
        name: "Complaint case",
        status: "ACTIVE",
        priority: "NORMAL",
      },
    ],
    clients: [
      {
        id: "client-1",
        clientNumber: "CL-1",
        type: "INDIVIDUAL",
        displayName: "Client One",
        status: "ACTIVE",
      },
    ],
    currentVersion: null,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-15T10:00:00.000Z",
    ...overrides,
  });

  it("treats unlinked documents as needs linking", () => {
    const component = createComponent();
    const linked = createDocument();
    const unlinked = createDocument({ cases: [], clients: [] });

    expect(component.isNeedsLinking(linked)).toBe(false);
    expect(component.isNeedsLinking(unlinked)).toBe(true);
  });

  it("selects on click without opening, supports modifiers, ranges and checkbox toggles", () => {
    const component = Object.assign(createComponent(), {
      selection: signal([]),
      bulkPending: signal(false),
      renamePending: signal(false),
      folders: () => [{ id: "folder" }],
      documents: () => [createDocument(), createDocument({ id: "doc-2" })],
      openFolder: jest.fn(),
      openDocumentDetail: jest.fn(),
    });
    const plain = { ctrlKey: false, metaKey: false, shiftKey: false };
    component.selectItem({ id: "folder", kind: "folder" }, plain);
    expect(component.selection()).toEqual([{ id: "folder", kind: "folder" }]);
    expect(component.openFolder).not.toHaveBeenCalled();
    component.selectItem(
      { id: "doc-2", kind: "file" },
      { ...plain, shiftKey: true },
    );
    expect(component.selection()).toHaveLength(3);
    component.selectItem(
      { id: "doc-1", kind: "file" },
      { ...plain, metaKey: true },
    );
    expect(component.isSelected("doc-1")).toBe(false);
    component.selectItem({ id: "doc-1", kind: "file" }, plain, true);
    expect(component.selection()).toHaveLength(3);
    component.selectItem({ id: "doc-2", kind: "file" }, plain);
    expect(component.selection()).toEqual([{ id: "doc-2", kind: "file" }]);
    expect(component.openDocumentDetail).not.toHaveBeenCalled();
  });

  it("uses immutable import time instead of metadata update time", () => {
    const component = createComponent();
    component.formatDateOnly = (value) => value ?? "";
    expect(component.lastUpdatedInfo(createDocument())).toBe(
      "2026-09-01T10:00:00.000Z",
    );
  });

  it("keeps all linked case and client values in the tooltip", () => {
    const component = createComponent();
    const document = createDocument();
    document.clients.push({
      ...document.clients[0],
      id: "second",
      displayName: "Client Two",
    });
    expect(component.linkedInfo(document)).toContain("Client One; Client Two");
    expect(component.getLinkedClientName(document)).toBe(
      "Client One; Client Two",
    );
  });

  it("applies fixed case context without adding a client filter", () => {
    const caseComponent = Object.assign(
      Object.create(DocumentsComponent.prototype),
      {
        fixedCaseId: () => "fixed-case",
        fixedClientId: () => undefined,
        currentFolderId: () => null,
        selectedTab: () => "all",
        selectedCaseIds: () => ["selected-case"],
        selectedClientId: { value: "" },
        selectedCategory: { value: "" },
        searchControl: { value: "" },
        page: () => 1,
        pageSize: () => 50,
      },
    ) as DocumentsComponent;

    expect(caseComponent.buildListQuery("false")).toMatchObject({
      caseIds: ["fixed-case"],
    });
    expect(caseComponent.buildListQuery("false").clientId).toBeUndefined();
  });

  it("keeps case selection available within a fixed client", () => {
    const component = Object.assign(
      Object.create(DocumentsComponent.prototype),
      {
        fixedCaseId: () => undefined,
        fixedClientId: () => "fixed-client",
        currentFolderId: () => null,
        selectedTab: () => "all",
        selectedCaseIds: () => ["selected-case"],
        selectedClientId: { value: "" },
        selectedCategory: { value: "" },
        searchControl: { value: "" },
        page: () => 1,
        pageSize: () => 50,
      },
    ) as DocumentsComponent;

    expect(component.buildListQuery("false")).toMatchObject({
      caseIds: ["selected-case"],
      clientId: "fixed-client",
    });
  });

  it("hides fixed relationship filters but keeps case selection for a client", () => {
    const caseComponent = Object.assign(
      Object.create(DocumentsComponent.prototype),
      {
        fixedCaseId: () => "fixed-case",
        fixedClientId: () => "fixed-client",
      },
    ) as DocumentsComponent;
    const clientComponent = Object.assign(
      Object.create(DocumentsComponent.prototype),
      {
        fixedCaseId: () => undefined,
        fixedClientId: () => "fixed-client",
      },
    ) as DocumentsComponent;

    expect(caseComponent.showCaseFilter()).toBe(false);
    expect(caseComponent.showClientFilter()).toBe(false);
    expect(clientComponent.showCaseFilter()).toBe(true);
    expect(clientComponent.showClientFilter()).toBe(false);
  });

  it("refreshes the list and emits documentsChanged after associations save", () => {
    const document = createDocument();
    const updated = { ...document, clients: [], cases: [] };
    const associationsDialog = { open: jest.fn(() => of(updated)) };
    const changes = { emit: jest.fn() };
    const component = Object.assign(
      Object.create(DocumentsComponent.prototype),
      {
        associationsDialog,
        fixedCaseId: () => undefined,
        fixedClientId: () => undefined,
        destroyRef: {
          destroyed: false,
          onDestroy: () => () => undefined,
        },
        documentsChanged: changes,
        toast: { success: jest.fn() },
        localization: { translate: (key: string) => key },
        load: jest.fn(),
      },
    ) as DocumentsComponent;

    component.openAssociations(document);

    expect(associationsDialog.open).toHaveBeenCalledWith({
      documentId: document.id,
      documentTitle: document.title,
      caseOptions: [{ id: "case-1", label: "P-1/2026 — Complaint case" }],
      clientOptions: [{ id: "client-1", label: "Client One" }],
      fixedCaseId: undefined,
      fixedClientId: undefined,
    });
    expect(component.load).toHaveBeenCalledTimes(1);
    expect(changes.emit).toHaveBeenCalledTimes(1);
  });

  it("does not refresh or emit documentsChanged when association editing is cancelled", () => {
    const associationsDialog = { open: jest.fn(() => of(undefined)) };
    const changes = { emit: jest.fn() };
    const component = Object.assign(
      Object.create(DocumentsComponent.prototype),
      {
        associationsDialog,
        fixedCaseId: () => undefined,
        fixedClientId: () => undefined,
        destroyRef: {
          destroyed: false,
          onDestroy: () => () => undefined,
        },
        documentsChanged: changes,
        toast: { success: jest.fn() },
        localization: { translate: (key: string) => key },
        load: jest.fn(),
      },
    ) as DocumentsComponent;

    component.openAssociations(createDocument());

    expect(component.load).not.toHaveBeenCalled();
    expect(changes.emit).not.toHaveBeenCalled();
  });
});

describe("DocumentsComponent AI access", () => {
  const document = (overrides: Partial<DocumentSummary> = {}) =>
    ({
      id: "doc-1",
      title: "Complaint",
      category: null,
      archived: false,
      archivedAt: null,
      aiAccess: false,
      aiStatus: "OFF",
      aiRetryable: false,
      documentKind: null,
      fromAssistantChat: false,
      cases: [],
      clients: [],
      currentVersion: null,
      createdByUserId: "u",
      updatedByUserId: "u",
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-15T10:00:00.000Z",
      ...overrides,
    }) as DocumentSummary;

  const page = (items: DocumentSummary[]) => ({
    items,
    meta: { page: 1, pageSize: 20, totalItems: items.length, totalPages: 1 },
  });

  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe(): void {
        // jsdom has no layout.
      }
      unobserve(): void {
        // jsdom has no layout.
      }
      disconnect(): void {
        // jsdom has no layout.
      }
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function setup(
    rows: DocumentSummary[],
    options: { confirm?: boolean; folders?: Array<{ id: string }> } = {},
  ) {
    const documentsApi = {
      list: jest.fn(() => of(page(rows))),
      browseFolders: jest.fn(() =>
        of({ folders: options.folders ?? [], breadcrumbs: [] }),
      ),
      statistics: jest.fn(() => of({})),
      get: jest.fn((id: string) =>
        of(rows.find((row) => row.id === id) as DocumentSummary),
      ),
      listVersions: jest.fn(() => of({ items: [] })),
      setAiAccess: jest.fn(),
      setAiAccessBulk: jest.fn(() => of({ updated: 1 })),
      reprocessAi: jest.fn(),
    };
    const confirmDialog = {
      confirm: jest.fn(() => of(options.confirm ?? true)),
    };
    const toast = { success: jest.fn(), error: jest.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: DocumentsApiClient, useValue: documentsApi },
        {
          provide: CasesApiClient,
          useValue: { list: () => of({ items: [] }) },
        },
        {
          provide: ClientsApiClient,
          useValue: { list: () => of({ items: [] }) },
        },
        { provide: ConfirmDialogService, useValue: confirmDialog },
        { provide: ToastService, useValue: toast },
        { provide: DocumentUploadDialogService, useValue: { open: jest.fn() } },
        {
          provide: DocumentAssociationsDialogService,
          useValue: { open: jest.fn() },
        },
        { provide: HlmDialogService, useValue: { open: jest.fn() } },
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
    const fixture = TestBed.createComponent(DocumentsComponent);
    fixture.detectChanges();
    return {
      fixture,
      component: fixture.componentInstance,
      documentsApi,
      confirmDialog,
      toast,
      el: fixture.nativeElement as HTMLElement,
    };
  }

  it("renders an AI status icon per document row", () => {
    const { el } = setup([
      document({ id: "a", aiStatus: "READY" }),
      document({ id: "b", aiStatus: "FAILED" }),
    ]);
    const labels = Array.from(
      el.querySelectorAll("law-document-ai-status [role='img']"),
    ).map((node) => node.getAttribute("aria-label"));
    expect(labels).toEqual(
      expect.arrayContaining([
        "documents.ai.status.READY",
        "documents.ai.status.FAILED",
      ]),
    );
  });

  it("defaults to 50, resets page size and clears filters with one request", () => {
    jest.useFakeTimers();
    const { component, documentsApi } = setup([document()]);
    expect(component.buildListQuery("false").pageSize).toBe(50);
    component.page.set(3);
    const calls = documentsApi.list.mock.calls.length;
    component.changePageSize(20);
    expect(component.page()).toBe(1);
    expect(documentsApi.list.mock.calls.length).toBe(calls + 1);
    expect(component.buildListQuery("false").pageSize).toBe(20);
    component.searchControl.setValue("test", { emitEvent: false });
    component.clearFilters();
    jest.advanceTimersByTime(500);
    expect(documentsApi.list.mock.calls.length).toBe(calls + 2);
  });

  it("enables AI for selected files only and refreshes", () => {
    const { component, documentsApi, toast } = setup(
      [document({ id: "a" }), document({ id: "b" })],
      { folders: [{ id: "folder-1" }] },
    );
    component.selection.set([
      { id: "folder-1", kind: "folder" },
      { id: "a", kind: "file" },
      { id: "b", kind: "file" },
    ]);
    documentsApi.setAiAccessBulk.mockReturnValue(of({ updated: 2 }));
    const loads = documentsApi.list.mock.calls.length;

    component.enableAiSelected();

    expect(documentsApi.setAiAccessBulk).toHaveBeenCalledWith({
      documentIds: ["a", "b"],
      aiAccess: true,
    });
    expect(documentsApi.list.mock.calls.length).toBe(loads + 1);
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining('"count":2'),
    );
    expect(component.bulkPending()).toBe(false);
  });

  it("does nothing when only folders are selected", () => {
    const { component, documentsApi } = setup([document()], {
      folders: [{ id: "folder-1" }],
    });
    component.selection.set([{ id: "folder-1", kind: "folder" }]);
    component.enableAiSelected();
    component.disableAiSelected();
    expect(documentsApi.setAiAccessBulk).not.toHaveBeenCalled();
  });

  it("confirms once before bulk disable and skips on cancel", () => {
    const { component, documentsApi, confirmDialog } = setup(
      [document({ id: "a", aiAccess: true })],
      { confirm: false },
    );
    component.selection.set([{ id: "a", kind: "file" }]);
    component.disableAiSelected();
    expect(confirmDialog.confirm).toHaveBeenCalledTimes(1);
    expect(confirmDialog.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: "documents.ai.confirmDisable" }),
    );
    expect(documentsApi.setAiAccessBulk).not.toHaveBeenCalled();
    expect(component.bulkPending()).toBe(false);
  });

  it("bulk disables after confirmation", () => {
    const { component, documentsApi } = setup([
      document({ id: "a", aiAccess: true }),
    ]);
    component.selection.set([{ id: "a", kind: "file" }]);
    component.disableAiSelected();
    expect(documentsApi.setAiAccessBulk).toHaveBeenCalledWith({
      documentIds: ["a"],
      aiAccess: false,
    });
  });

  it("asks for confirmation when disabling from the detail and keeps it on after cancel", () => {
    const { component, documentsApi, confirmDialog } = setup(
      [document({ id: "a", aiAccess: true, aiStatus: "READY" })],
      { confirm: false },
    );
    component.openDocumentDetail(component.documents()[0]);
    component.toggleDetailAi(false);
    expect(confirmDialog.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: "documents.ai.confirmDisable" }),
    );
    expect(documentsApi.setAiAccess).not.toHaveBeenCalled();
    expect(component.aiAccessControl.value).toBe(true);
  });

  it("disables from the detail once confirmed and updates the row", () => {
    const { component, documentsApi } = setup([
      document({ id: "a", aiAccess: true, aiStatus: "READY" }),
    ]);
    component.openDocumentDetail(component.documents()[0]);
    documentsApi.setAiAccess.mockReturnValue(
      of(document({ id: "a", aiAccess: false, aiStatus: "OFF" })),
    );
    component.toggleDetailAi(false);
    expect(documentsApi.setAiAccess).toHaveBeenCalledWith("a", false);
    expect(component.detailDocument()?.aiAccess).toBe(false);
    expect(component.documents()[0].aiStatus).toBe("OFF");
    expect(component.aiPending()).toBe(false);
  });

  it("enables from the detail without confirmation", () => {
    const { component, documentsApi, confirmDialog } = setup([
      document({ id: "a" }),
    ]);
    component.openDocumentDetail(component.documents()[0]);
    documentsApi.setAiAccess.mockReturnValue(
      of(document({ id: "a", aiAccess: true, aiStatus: "QUEUED" })),
    );
    component.toggleDetailAi(true);
    expect(confirmDialog.confirm).not.toHaveBeenCalled();
    expect(documentsApi.setAiAccess).toHaveBeenCalledWith("a", true);
  });

  it("shows kind and from-chat labels in the detail", () => {
    const { component, fixture, el } = setup([
      document({
        id: "a",
        aiAccess: true,
        aiStatus: "READY",
        documentKind: "ID_CARD",
        fromAssistantChat: true,
      }),
    ]);
    component.openDocumentDetail(component.documents()[0]);
    fixture.detectChanges();
    const text = el.textContent ?? "";
    expect(text).toContain("documents.ai.kind.ID_CARD");
    expect(text).toContain("documents.ai.fromChat");
  });

  it("offers reprocess when the document is retryable and calls reprocessAi", () => {
    const failed = document({
      id: "a",
      aiAccess: true,
      aiStatus: "FAILED",
      aiRetryable: true,
    });
    const { component, fixture, el, documentsApi } = setup([failed]);
    component.openDocumentDetail(failed);
    fixture.detectChanges();
    const button = Array.from(el.querySelectorAll("button")).find((node) =>
      node.textContent?.includes("documents.ai.reprocess"),
    ) as HTMLButtonElement;
    expect(button).toBeDefined();
    documentsApi.reprocessAi.mockReturnValue(
      of({ ...failed, aiStatus: "QUEUED", aiRetryable: false }),
    );
    button.click();
    expect(documentsApi.reprocessAi).toHaveBeenCalledWith("a");
    expect(component.detailDocument()?.aiStatus).toBe("QUEUED");
  });

  it.each(["QUEUED", "READY"] as const)(
    "offers reprocess for a retryable %s document (stalled queue or missing kind and facts)",
    (aiStatus) => {
      const stuck = document({
        id: "a",
        aiAccess: true,
        aiStatus,
        aiRetryable: true,
      });
      const { component, fixture, el, documentsApi } = setup([stuck]);
      component.openDocumentDetail(stuck);
      fixture.detectChanges();
      const button = Array.from(el.querySelectorAll("button")).find((node) =>
        node.textContent?.includes("documents.ai.reprocess"),
      ) as HTMLButtonElement;
      expect(button).toBeDefined();
      documentsApi.reprocessAi.mockReturnValue(of(stuck));
      component.reprocessDetailAi();
      expect(documentsApi.reprocessAi).toHaveBeenCalledWith("a");
    },
  );

  it.each(["READY", "QUEUED", "FAILED"] as const)(
    "hides reprocess when a %s document is not retryable",
    (aiStatus) => {
      const row = document({
        id: "a",
        aiAccess: true,
        aiStatus,
        aiRetryable: false,
      });
      const { component, fixture, el, documentsApi } = setup([row]);
      component.openDocumentDetail(row);
      fixture.detectChanges();
      expect(el.textContent).not.toContain("documents.ai.reprocess");
      component.reprocessDetailAi();
      expect(documentsApi.reprocessAi).not.toHaveBeenCalled();
    },
  );

  describe("polling", () => {
    it("polls every 5 s while a row is processing, keeps page and selection, and stops when ready", () => {
      jest.useFakeTimers();
      const processing = document({ id: "a", aiStatus: "PROCESSING" });
      const ready = document({ id: "a", aiStatus: "READY" });
      const { component, fixture, documentsApi } = setup([processing]);
      component.selection.set([{ id: "a", kind: "file" }]);
      component.page.set(1);
      const baseline = documentsApi.list.mock.calls.length;

      jest.advanceTimersByTime(4999);
      expect(documentsApi.list.mock.calls.length).toBe(baseline);
      jest.advanceTimersByTime(1);
      expect(documentsApi.list.mock.calls.length).toBe(baseline + 1);
      expect(component.selection()).toEqual([{ id: "a", kind: "file" }]);
      expect(component.loading()).toBe(false);

      documentsApi.list.mockImplementation(() => of(page([ready])));
      jest.advanceTimersByTime(5000);
      fixture.detectChanges();
      expect(component.documents()[0].aiStatus).toBe("READY");
      const afterReady = documentsApi.list.mock.calls.length;

      jest.advanceTimersByTime(30000);
      expect(documentsApi.list.mock.calls.length).toBe(afterReady);
    });

    describe("giving up on stuck rows", () => {
      const TICK = 5000;

      it("stops after 120 polls in which nothing changed", () => {
        jest.useFakeTimers();
        const { documentsApi } = setup([
          document({ id: "a", aiStatus: "QUEUED" }),
        ]);
        const baseline = documentsApi.list.mock.calls.length;

        jest.advanceTimersByTime(119 * TICK);
        expect(documentsApi.list.mock.calls.length).toBe(baseline + 119);
        jest.advanceTimersByTime(TICK);
        expect(documentsApi.list.mock.calls.length).toBe(baseline + 120);

        jest.advanceTimersByTime(30 * TICK);
        expect(documentsApi.list.mock.calls.length).toBe(baseline + 120);
      });

      it("restarts the count whenever a status changes", () => {
        jest.useFakeTimers();
        const { documentsApi, component } = setup([
          document({ id: "a", aiStatus: "QUEUED" }),
        ]);
        const baseline = documentsApi.list.mock.calls.length;
        jest.advanceTimersByTime(100 * TICK);
        documentsApi.list.mockImplementation(() =>
          of(page([document({ id: "a", aiStatus: "PROCESSING" })])),
        );

        jest.advanceTimersByTime(130 * TICK);

        // 100 + the change tick + 120 more, then it gives up.
        expect(documentsApi.list.mock.calls.length).toBe(baseline + 221);
        expect(component.documents()[0].aiStatus).toBe("PROCESSING");
      });

      it("resumes after the user reloads or mutates", () => {
        jest.useFakeTimers();
        const stuck = document({
          id: "a",
          aiAccess: false,
          aiStatus: "QUEUED",
        });
        const { documentsApi, component, fixture } = setup([stuck]);
        jest.advanceTimersByTime(130 * TICK);
        fixture.detectChanges();
        const exhausted = documentsApi.list.mock.calls.length;
        jest.advanceTimersByTime(10 * TICK);
        expect(documentsApi.list.mock.calls.length).toBe(exhausted);

        component.load();
        fixture.detectChanges();
        const afterReload = documentsApi.list.mock.calls.length;
        jest.advanceTimersByTime(3 * TICK);
        expect(documentsApi.list.mock.calls.length).toBe(afterReload + 3);

        jest.advanceTimersByTime(130 * TICK);
        fixture.detectChanges();
        const exhaustedAgain = documentsApi.list.mock.calls.length;
        component.openDocumentDetail(stuck);
        documentsApi.setAiAccess.mockReturnValue(
          of(document({ id: "a", aiAccess: true, aiStatus: "QUEUED" })),
        );
        component.toggleDetailAi(true);
        fixture.detectChanges();
        jest.advanceTimersByTime(2 * TICK);
        expect(documentsApi.list.mock.calls.length).toBeGreaterThanOrEqual(
          exhaustedAgain + 2,
        );
      });

      it("does not poll for a row that can be reprocessed by hand", () => {
        jest.useFakeTimers();
        const { documentsApi } = setup([
          document({ id: "a", aiStatus: "QUEUED", aiRetryable: true }),
        ]);
        const baseline = documentsApi.list.mock.calls.length;
        jest.advanceTimersByTime(20 * TICK);
        expect(documentsApi.list.mock.calls.length).toBe(baseline);
      });
    });

    it("does not poll when nothing is queued or processing", () => {
      jest.useFakeTimers();
      const { documentsApi } = setup([document({ aiStatus: "READY" })]);
      const baseline = documentsApi.list.mock.calls.length;
      jest.advanceTimersByTime(60000);
      expect(documentsApi.list.mock.calls.length).toBe(baseline);
    });

    it("reloads the open detail on each tick", () => {
      jest.useFakeTimers();
      const queued = document({ id: "a", aiAccess: true, aiStatus: "QUEUED" });
      const { component, documentsApi } = setup([queued]);
      component.openDocumentDetail(queued);
      const baseline = documentsApi.get.mock.calls.length;
      jest.advanceTimersByTime(5000);
      expect(documentsApi.get.mock.calls.length).toBe(baseline + 1);
    });

    it("skips a tick while the previous reload is still in flight", () => {
      jest.useFakeTimers();
      const processing = document({ id: "a", aiStatus: "PROCESSING" });
      const { documentsApi } = setup([processing]);
      const pending = new Subject<ReturnType<typeof page>>();
      documentsApi.list.mockReturnValue(pending as never);
      const baseline = documentsApi.list.mock.calls.length;
      jest.advanceTimersByTime(5000);
      jest.advanceTimersByTime(5000);
      expect(documentsApi.list.mock.calls.length).toBe(baseline + 1);
    });

    it("drops a stale poll that lands after a toggle response", () => {
      jest.useFakeTimers();
      const on = document({ id: "a", aiAccess: true, aiStatus: "PROCESSING" });
      const { component, documentsApi } = setup([on], { confirm: true });
      component.openDocumentDetail(component.documents()[0]);
      const stalePoll = new Subject<ReturnType<typeof page>>();
      const staleDetail = new Subject<DocumentSummary>();
      documentsApi.list.mockReturnValue(stalePoll as never);
      documentsApi.get.mockReturnValue(staleDetail as never);
      jest.advanceTimersByTime(5000);
      documentsApi.setAiAccess.mockReturnValue(
        of(document({ id: "a", aiAccess: false, aiStatus: "OFF" })),
      );

      component.toggleDetailAi(false);
      stalePoll.next(page([on]));
      stalePoll.complete();
      staleDetail.next(on);
      staleDetail.complete();

      expect(component.detailDocument()?.aiAccess).toBe(false);
      expect(component.aiAccessControl.value).toBe(false);
      expect(component.documents()[0].aiAccess).toBe(false);
    });

    it("drops a poll response that was started before the latest mutation", () => {
      jest.useFakeTimers();
      const on = document({ id: "a", aiAccess: true, aiStatus: "PROCESSING" });
      const { component, documentsApi } = setup([on]);
      component.openDocumentDetail(component.documents()[0]);
      const toggle = new Subject<DocumentSummary>();
      documentsApi.setAiAccess.mockReturnValue(toggle as never);
      // Poll begins while the toggle request is pending would be skipped, so
      // simulate a poll that began just before the mutation and is still open.
      const stalePoll = new Subject<ReturnType<typeof page>>();
      documentsApi.list.mockReturnValue(stalePoll as never);
      jest.advanceTimersByTime(5000);
      component.toggleDetailAi(false);
      toggle.next(document({ id: "a", aiAccess: false, aiStatus: "OFF" }));
      stalePoll.next(page([on]));
      expect(component.documents()[0].aiAccess).toBe(false);
    });

    it("keeps polling after a failed poll without unhandled errors", () => {
      jest.useFakeTimers();
      const { documentsApi, component } = setup([
        document({ aiStatus: "PROCESSING" }),
      ]);
      const baseline = documentsApi.list.mock.calls.length;
      documentsApi.list.mockReturnValueOnce(
        throwError(() => new Error("boom")) as never,
      );
      jest.advanceTimersByTime(5000);
      expect(documentsApi.list.mock.calls.length).toBe(baseline + 1);
      jest.advanceTimersByTime(5000);
      expect(documentsApi.list.mock.calls.length).toBe(baseline + 2);
      expect(component.error()).toBe(false);
    });

    it("does not poll while the page is hidden", () => {
      jest.useFakeTimers();
      const { documentsApi } = setup([document({ aiStatus: "PROCESSING" })]);
      const baseline = documentsApi.list.mock.calls.length;
      const spy = jest
        .spyOn(window.document, "visibilityState", "get")
        .mockReturnValue("hidden");
      jest.advanceTimersByTime(10000);
      expect(documentsApi.list.mock.calls.length).toBe(baseline);
      spy.mockReturnValue("visible");
      jest.advanceTimersByTime(5000);
      expect(documentsApi.list.mock.calls.length).toBe(baseline + 1);
      spy.mockRestore();
    });

    it("does not reset the switch from a poll while a disable confirmation is open", () => {
      jest.useFakeTimers();
      const on = document({ id: "a", aiAccess: true, aiStatus: "PROCESSING" });
      const { component, documentsApi, confirmDialog } = setup([on]);
      component.openDocumentDetail(component.documents()[0]);
      const answer = new Subject<boolean>();
      confirmDialog.confirm.mockReturnValue(answer as never);
      component.aiAccessControl.setValue(false, { emitEvent: false });
      component.toggleDetailAi(false);
      jest.advanceTimersByTime(5000);
      expect(documentsApi.get).toHaveBeenCalledTimes(2);
      expect(component.aiAccessControl.value).toBe(false);
      answer.next(false);
      expect(component.aiAccessControl.value).toBe(true);
    });

    it("clears the interval on destroy", () => {
      jest.useFakeTimers();
      const { fixture, documentsApi } = setup([
        document({ aiStatus: "PROCESSING" }),
      ]);
      const baseline = documentsApi.list.mock.calls.length;
      fixture.destroy();
      jest.advanceTimersByTime(30000);
      expect(documentsApi.list.mock.calls.length).toBe(baseline);
    });
  });
});
