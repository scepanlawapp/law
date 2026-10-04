import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { WorkspaceRole } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { teamTimeGuard } from "./team-time.guard";

describe("teamTimeGuard", () => {
  const activeWorkspace = signal<{ role: WorkspaceRole } | null>(null);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthState, useValue: { activeWorkspace } }],
    });
  });

  function run() {
    return TestBed.runInInjectionContext(() =>
      teamTimeGuard({} as never, {} as never),
    );
  }

  it.each([WorkspaceRole.OWNER, WorkspaceRole.ADMIN])("allows %s", (role) => {
    activeWorkspace.set({ role });
    expect(run()).toBe(true);
  });

  it.each([WorkspaceRole.LAWYER, WorkspaceRole.MEMBER, null])(
    "redirects %s to my time",
    (role) => {
      activeWorkspace.set(role ? { role } : null);
      const result = run();
      expect(TestBed.inject(Router).serializeUrl(result as never)).toBe(
        "/work/time",
      );
    },
  );
});
