import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { WorkspaceRole } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { monthEndGuard } from "./month-end.guard";

describe("monthEndGuard", () => {
  const activeWorkspace = signal<{ role: WorkspaceRole } | null>(null);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthState, useValue: { activeWorkspace } }],
    });
  });

  function run() {
    return TestBed.runInInjectionContext(() =>
      monthEndGuard({} as never, {} as never),
    );
  }

  it("allows the OWNER", () => {
    activeWorkspace.set({ role: WorkspaceRole.OWNER });
    expect(run()).toBe(true);
  });

  it.each([
    WorkspaceRole.ADMIN,
    WorkspaceRole.LAWYER,
    WorkspaceRole.MEMBER,
    null,
  ])("redirects %s to the statements", (role) => {
    activeWorkspace.set(role ? { role } : null);
    expect(TestBed.inject(Router).serializeUrl(run() as never)).toBe(
      "/finance/statements",
    );
  });
});
