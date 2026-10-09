import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { AuthState } from "@law/security";
import { WorkspaceRole } from "@law/api-interfaces";
import { ReportDataService } from "./report-data.service";
import { companyReportsGuard } from "./reports.guard";
describe("mock report access boundary", () => {
  const session = signal<{ user: { id: string } } | null>({
    user: { id: "current-user" },
  });
  const workspace = signal({ role: WorkspaceRole.LAWYER });
  beforeEach(() => {
    session.set({ user: { id: "current-user" } });
    workspace.set({ role: WorkspaceRole.LAWYER });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthState,
          useValue: { session, activeWorkspace: workspace },
        },
      ],
    });
  });
  it.each([WorkspaceRole.LAWYER, WorkspaceRole.MEMBER])(
    "redirects %s away from company routes and does not return company data",
    (role) => {
      workspace.set({ role });
      expect(TestBed.inject(ReportDataService).company()).toEqual({
        members: [],
        records: [],
      });
      const result = TestBed.runInInjectionContext(() =>
        companyReportsGuard({} as never, {} as never),
      );
      expect(TestBed.inject(Router).serializeUrl(result as never)).toBe(
        "/reports/my-earnings",
      );
      const own = TestBed.inject(ReportDataService).personal();
      expect(own.members.map((m) => m.id)).toEqual(["current-user"]);
      expect(
        own.records.every((r) =>
          r.allocations.every((a) => a.memberId === "current-user"),
        ),
      ).toBe(true);
    },
  );
  it.each([WorkspaceRole.OWNER, WorkspaceRole.ADMIN])(
    "permits %s without adding a role switcher",
    (role) => {
      workspace.set({ role });
      expect(TestBed.inject(ReportDataService).company().members).toHaveLength(
        4,
      );
      expect(
        TestBed.runInInjectionContext(() =>
          companyReportsGuard({} as never, {} as never),
        ),
      ).toBe(true);
    },
  );
  it("returns no personal records when the session is absent", () => {
    session.set(null);
    expect(TestBed.inject(ReportDataService).personal()).toEqual({
      members: [],
      records: [],
    });
  });
});
