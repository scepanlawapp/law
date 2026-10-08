import { DocumentSummary } from "@law/api-interfaces";
import { of, Subject, throwError } from "rxjs";
import { signal } from "@angular/core";
import { FormControl } from "@angular/forms";
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
