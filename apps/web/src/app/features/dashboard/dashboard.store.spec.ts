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

  it("uses document pagination metadata for the workspace total", () => {
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
      page: 1,
      pageSize: 1,
    });
  });
});
