import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@law/auth";
import {
  AuthRateLimitGuard,
  AuthRuntimeConfig,
  CsrfOriginGuard,
} from "@law/auth";

function contextFor(request: {
  method: string;
  headers: Record<string, string>;
}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe("authentication guards", () => {
  it("rejects requests without a session cookie", async () => {
    const guard = new AuthGuard({ currentUser: jest.fn() } as never);

    await expect(
      guard.canActivate(contextFor({ method: "GET", headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("loads the authenticated session onto the request", async () => {
    const session = { user: { id: "user-1" } };
    const currentUser = jest.fn().mockResolvedValue(session);
    const request = {
      method: "GET",
      headers: { cookie: "law_session=session-token" },
    };
    const guard = new AuthGuard({ currentUser } as never);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(currentUser).toHaveBeenCalledWith("session-token");
    expect(request).toHaveProperty("auth", session);
  });

  it("rejects state-changing requests from another origin", () => {
    process.env.AUTH_FRONTEND_ORIGIN = "http://localhost:4200";
    const guard = new CsrfOriginGuard(new AuthRuntimeConfig());

    expect(() =>
      guard.canActivate(
        contextFor({
          method: "POST",
          headers: { origin: "http://malicious.test" },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it("throttles repeated attempts from the same client and route", () => {
    const guard = new AuthRateLimitGuard();
    const request = {
      method: "POST",
      path: "/auth/login",
      ip: "127.0.0.1",
      headers: {},
    };
    const context = contextFor(request);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(guard.canActivate(context)).toBe(true);
    }
    expect(() => guard.canActivate(context)).toThrow("Too many attempts");
  });
});
