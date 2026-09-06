import { TestBed } from "@angular/core/testing";
import { of } from "rxjs";
import { ChatApiClient } from "@law/api-clients";
import { AuthState } from "@law/security";
import { AuthenticatedComponent } from "./authenticated.component";

describe("AuthenticatedComponent", () => {
  it("disables send until there is text or a file", () => {
    const fixture = TestBed.configureTestingModule({
      imports: [AuthenticatedComponent],
      providers: [
        {
          provide: AuthState,
          useValue: {
            session: () => ({
              user: { email: "lawyer@example.test" },
              memberships: [{ workspaceId: "workspace-1" }],
            }),
            logout: jest.fn(),
          },
        },
        {
          provide: ChatApiClient,
          useValue: {
            listSessions: () => of([]),
            createSession: jest.fn(),
            getSession: jest.fn(),
            sendMessage: jest.fn(),
            eventsUrl: jest.fn(),
          },
        },
      ],
    }).createComponent(AuthenticatedComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.canSend()).toBe(false);
    fixture.componentInstance.draft = "Tužba";
    expect(fixture.componentInstance.canSend()).toBe(true);
  });
});
