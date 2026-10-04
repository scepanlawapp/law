import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { WorkspaceRole } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { profitabilityGuard } from "./profitability.guard";

describe("profitabilityGuard", () => {
  const activeWorkspace = signal<{ role: WorkspaceRole } | null>(null);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthState, useValue: { activeWorkspace } }],
    });
  });

  const run = () =>
    TestBed.runInInjectionContext(() =>
      profitabilityGuard({} as never, {} as never),
    );

  it.each([WorkspaceRole.OWNER, WorkspaceRole.ADMIN])("allows %s", (role) => {
    activeWorkspace.set({ role });
    expect(run()).toBe(true);
  });

  it.each([WorkspaceRole.LAWYER, WorkspaceRole.MEMBER, null])(
    "redirects %s to reports",
    (role) => {
      activeWorkspace.set(role ? { role } : null);
      expect(TestBed.inject(Router).serializeUrl(run() as never)).toBe(
        "/reports",
      );
    },
  );
});
