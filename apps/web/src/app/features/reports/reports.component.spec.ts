import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { WorkspaceRole } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { LocalizationService } from "../../core/localization/localization.service";
import { ReportsComponent } from "./reports.component";

describe("ReportsComponent", () => {
  const activeWorkspace = signal<{ role: WorkspaceRole } | null>(null);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthState, useValue: { activeWorkspace } },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "SR" },
        },
      ],
    });
  });

  const card = (role: WorkspaceRole) => {
    activeWorkspace.set({ role });
    const fixture = TestBed.createComponent(ReportsComponent);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="profitability-card"]',
    );
  };

  it.each([WorkspaceRole.OWNER, WorkspaceRole.ADMIN])(
    "links to profitability for %s",
    (role) => {
      expect(card(role)?.getAttribute("href")).toBe("/reports/profitability");
    },
  );

  it.each([WorkspaceRole.LAWYER, WorkspaceRole.MEMBER])(
    "hides the profitability card for %s",
    (role) => {
      expect(card(role)).toBeNull();
    },
  );
});
