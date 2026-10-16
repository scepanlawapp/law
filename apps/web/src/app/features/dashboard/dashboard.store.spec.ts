import { TestBed } from "@angular/core/testing";
import {
  CalendarApiClient,
  CasesApiClient,
  ClientsApiClient,
  DocumentsApiClient,
  EventsApiClient,
  ReferencesApiClient,
  WorkManagementApiClient,
} from "@law/api-clients";
import { AuthState } from "@law/security";
import { of } from "rxjs";
import { DashboardStore } from "./dashboard.store";

const page = (totalItems: number) => ({
  items: [],
  meta: {
    page: 1,
    pageSize: 1,
    totalItems,
    totalPages: totalItems ? totalItems : 1,
    hasNextPage: false,
    hasPreviousPage: false,
    sort: [],
  },
});

describe("DashboardStore", () => {
  const casesApi = { list: jest.fn() };
  const clientsApi = { list: jest.fn() };
  const workApi = {
    listTasks: jest.fn(),
    listDeadlines: jest.fn(),
    listActivity: jest.fn(),
  };
  const eventsApi = { list: jest.fn() };
  const calendarApi = { list: jest.fn() };
  const referencesApi = { users: jest.fn() };
  const documentsApi = { list: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        DashboardStore,
        { provide: CasesApiClient, useValue: casesApi },
        { provide: ClientsApiClient, useValue: clientsApi },
        { provide: WorkManagementApiClient, useValue: workApi },
        { provide: EventsApiClient, useValue: eventsApi },
        { provide: CalendarApiClient, useValue: calendarApi },
        { provide: ReferencesApiClient, useValue: referencesApi },
        { provide: DocumentsApiClient, useValue: documentsApi },
        {
          provide: AuthState,
          useValue: {
            session: jest.fn(() => ({
              user: { id: "user-1" },
              memberships: [{ workspaceId: "workspace-1" }],
            })),
          },
        },
      ],
    });
  });

  it("uses document pagination metadata for the current user total", () => {
    casesApi.list.mockReturnValue(of(page(6)));
    eventsApi.list.mockReturnValue(of(page(3)));
    workApi.listTasks
      .mockReturnValueOnce(of(page(4)))
      .mockReturnValueOnce(of(page(1)));
    workApi.listDeadlines.mockReturnValue(of(page(2)));
    documentsApi.list.mockReturnValue(of(page(9)));

    const store = TestBed.inject(DashboardStore);
    store.loadStats();

    expect(store.totalDocumentsCount()).toBe(9);
    expect(documentsApi.list).toHaveBeenCalledWith({
      archived: "all",
      createdByUserId: "user-1",
      page: 1,
      pageSize: 1,
    });
  });
  it("scopes all summary queries to the user", () => {
    casesApi.list.mockReturnValue(of(page(2)));
    eventsApi.list.mockReturnValue(of(page(3)));
    workApi.listTasks.mockReturnValue(of(page(4)));
    workApi.listDeadlines.mockReturnValue(of(page(1)));
    documentsApi.list.mockReturnValue(of(page(5)));
    const store = TestBed.inject(DashboardStore);
    store.loadStats();
    expect(casesApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ assignedUserId: "user-1", status: "ACTIVE" }),
    );
    expect(eventsApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ["user-1"] }),
    );
    expect(workApi.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeUserIds: ["user-1"] }),
    );
    expect(workApi.listDeadlines).toHaveBeenCalledWith(
      expect.objectContaining({ responsibleUserIds: ["user-1"] }),
    );
    expect(store.activeCasesCount()).toBe(2);
  });

  it("requests assigned cases in last-modified order before limiting the preview", () => {
    casesApi.list.mockReturnValue(of(page(0)));
    const store = TestBed.inject(DashboardStore);
    store.loadCasesPreview();
    expect(casesApi.list).toHaveBeenCalledWith({
      assignedUserId: "user-1",
      sort: "updatedAt:desc",
      page: 1,
      pageSize: 100,
    });
    expect(clientsApi.list).not.toHaveBeenCalled();
    expect(store.casesError()).toBe(false);
  });

  it("requests only activities performed by the current user", () => {
    workApi.listActivity.mockReturnValue(of(page(0)));
    referencesApi.users.mockReturnValue(of([]));
    TestBed.inject(DashboardStore).loadActivity();
    expect(workApi.listActivity).toHaveBeenCalledWith({
      actorUserId: "user-1",
      page: 1,
      pageSize: 100,
    });
  });

  it("requests only the user's unfinished calendar items in the next seven days", () => {
    calendarApi.list.mockReturnValue(of({ items: [] }));
    TestBed.inject(DashboardStore).loadObligations();
    const query = calendarApi.list.mock.calls[0][0];
    expect(query).toEqual(
      expect.objectContaining({
        userIds: ["user-1"],
        sourceTypes: ["EVENT", "TASK", "DEADLINE"],
        statuses: ["SCHEDULED", "TODO", "IN_PROGRESS", "OPEN"],
        limit: 4,
      }),
    );
    expect(Date.parse(query.to) - Date.parse(query.from)).toBe(7 * 86400000);
  });

  it("does not send unscoped requests without a signed-in user", () => {
    jest.spyOn(TestBed.inject(AuthState), "session").mockReturnValue(null);
    TestBed.inject(DashboardStore).refreshAll();
    for (const api of [casesApi, eventsApi, documentsApi, calendarApi])
      expect(api.list).not.toHaveBeenCalled();
    expect(workApi.listActivity).not.toHaveBeenCalled();
  });
});
