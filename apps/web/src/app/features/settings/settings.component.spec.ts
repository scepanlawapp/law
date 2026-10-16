import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { WorkspaceRole } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { LocalizationService } from "../../core/localization/localization.service";
import { SettingsComponent } from "./settings.component";

describe("SettingsComponent menu", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key, language: () => "SR" },
        },
      ],
    });
    TestBed.inject(AuthState).session.set({
      user: { id: "u1", email: "u@example.com", status: "ACTIVE" },
      memberships: [
        {
          workspaceId: "w1",
          workspaceName: "Kancelarija",
          role: WorkspaceRole.MEMBER,
        },
      ],
    });
  });

  it("lists security right after profile for every role", () => {
    const menu =
      TestBed.createComponent(SettingsComponent).componentInstance.menu();

    expect(menu[0].path).toBe("profile");
    expect(menu[1]).toMatchObject({
      path: "security",
      label: "settings.security",
      icon: "lucideShieldCheck",
    });
  });
});
