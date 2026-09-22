import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { UserSettingsApiClient } from "@law/api-clients";
import { UserSettingsResponse } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { of, throwError } from "rxjs";
import { UserSettingsStore } from "./user-settings.store";

const mockResponse: UserSettingsResponse = {
  profile: {
    firstName: "Petar",
    lastName: "Petrovic",
    username: "ppetrovic",
    email: "petar@example.com",
    phone: "+381601234567",
    jobTitle: "Advokat",
    avatarUrl: "https://example.com/avatar.jpg",
  },
  preferences: {
    theme: "CHARCOAL",
    language: "SR",
    accentColor: "GOLD",
    finish: "METALLIC",
    workspaceNotifications: true,
    dateTimeFormat: "TWENTY_FOUR_HOUR",
    timeZone: "Europe/Belgrade",
  },
};

describe("UserSettingsStore", () => {
  let store: UserSettingsStore;
  const sessionSignal = signal<{ user: { id: string } } | null>(null);
  const api = {
    get: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sessionSignal.set(null);
    api.get.mockReturnValue(of(mockResponse));
    api.update.mockReturnValue(of(mockResponse));

    TestBed.configureTestingModule({
      providers: [
        UserSettingsStore,
        { provide: UserSettingsApiClient, useValue: api },
        { provide: AuthState, useValue: { session: sessionSignal } },
      ],
    });

    store = TestBed.inject(UserSettingsStore);
  });

  it("initializes with null settings", () => {
    expect(store.settings()).toBeNull();
    expect(store.profile()).toBeNull();
    expect(store.preferences()).toBeNull();
    expect(store.loading()).toBe(false);
    expect(store.error()).toBe(false);
  });

  it("loads settings via load() and exposes profile and preferences", (done) => {
    store.load().subscribe((result) => {
      expect(result).toEqual(mockResponse);
      expect(store.settings()).toEqual(mockResponse);
      expect(store.profile()?.email).toBe("petar@example.com");
      expect(store.preferences()?.theme).toBe("CHARCOAL");
      expect(store.loading()).toBe(false);
      expect(store.error()).toBe(false);
      done();
    });
  });

  it("handles load error gracefully", (done) => {
    api.get.mockReturnValue(throwError(() => new Error("Network error")));

    store.load().subscribe((result) => {
      expect(result).toBeNull();
      expect(store.settings()).toBeNull();
      expect(store.error()).toBe(true);
      expect(store.loading()).toBe(false);
      done();
    });
  });

  it("updates settings and signal via update()", (done) => {
    const updated: UserSettingsResponse = {
      ...mockResponse,
      profile: {
        ...mockResponse.profile,
        firstName: "Marko",
      },
    };
    api.update.mockReturnValue(of(updated));

    store.update({ profile: { firstName: "Marko" } }).subscribe((result) => {
      expect(result).toEqual(updated);
      expect(store.profile()?.firstName).toBe("Marko");
      done();
    });
  });
});
