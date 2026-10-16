import {
  ExecutionContext,
  HttpException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  AuthRateLimitGuard,
  AuthRateLimitStore,
  AuthService,
  InMemoryAuthRateLimitStore,
} from "@law/auth";

function contextFor(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

const request = (ip: string, path: string) => ({
  method: "POST",
  path,
  ip,
  headers: {},
});

describe("AuthRateLimitGuard", () => {
  it("allows five attempts then 429", async () => {
    const store = new InMemoryAuthRateLimitStore();
    const hit = jest.spyOn(store, "hit");
    const guard = new AuthRateLimitGuard(store);
    const context = contextFor(request("127.0.0.1", "/auth/login"));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }
    const error = await guard.canActivate(context).catch((e) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(429);
    expect(error.message).toBe("Too many attempts");
    expect(hit).toHaveBeenCalledWith("ip:127.0.0.1:/auth/login", 60_000);
  });

  it("separate paths and IPs have separate buckets", async () => {
    const guard = new AuthRateLimitGuard(new InMemoryAuthRateLimitStore());
    const login = contextFor(request("10.0.0.1", "/auth/login"));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await guard.canActivate(login);
    }
    await expect(guard.canActivate(login)).rejects.toBeInstanceOf(
      HttpException,
    );
    await expect(
      guard.canActivate(
        contextFor(request("10.0.0.1", "/auth/password/forgot")),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor(request("10.0.0.2", "/auth/login"))),
    ).resolves.toBe(true);
  });

  it("case and trailing-slash path variants share one bucket", async () => {
    const guard = new AuthRateLimitGuard(new InMemoryAuthRateLimitStore());
    const variants = [
      "/api/auth/login",
      "/api/auth/LOGIN",
      "/api/auth/login/",
      "/api/auth/Login//",
      "/api/auth/login",
    ];
    for (const path of variants) {
      await expect(
        guard.canActivate(contextFor(request("10.0.0.9", path))),
      ).resolves.toBe(true);
    }
    await expect(
      guard.canActivate(contextFor(request("10.0.0.9", "/API/auth/login/"))),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it("store failure answers 503", async () => {
    const store: AuthRateLimitStore = {
      hit: jest.fn().mockRejectedValue(new Error("redis down")),
      peek: jest.fn().mockRejectedValue(new Error("redis down")),
    };
    const guard = new AuthRateLimitGuard(store);

    await expect(
      guard.canActivate(contextFor(request("127.0.0.1", "/auth/login"))),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe("InMemoryAuthRateLimitStore", () => {
  it("counts hits per key and restarts after the window", async () => {
    jest.useFakeTimers();
    try {
      const store = new InMemoryAuthRateLimitStore();
      expect(await store.hit("k", 1000)).toBe(1);
      expect(await store.hit("k", 1000)).toBe(2);
      expect(await store.hit("other", 1000)).toBe(1);
      jest.advanceTimersByTime(1000);
      expect(await store.hit("k", 1000)).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("peek reads the current count without incrementing and expires with the window", async () => {
    jest.useFakeTimers();
    try {
      const store = new InMemoryAuthRateLimitStore();
      expect(await store.peek("k")).toBe(0);
      await store.hit("k", 1000);
      await store.hit("k", 1000);
      expect(await store.peek("k")).toBe(2);
      expect(await store.peek("k")).toBe(2);
      jest.advanceTimersByTime(1000);
      expect(await store.peek("k")).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

function createService(store: AuthRateLimitStore) {
  const prisma = {
    user: { findUnique: jest.fn() },
    authToken: {
      create: jest.fn((arg: unknown) => ({ name: "create", arg })),
      updateMany: jest.fn((arg: unknown) => ({ name: "updateMany", arg })),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };
  const mail = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };
  const service = new AuthService(
    prisma as never,
    mail as never,
    store,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma, mail };
}

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

describe("per-email password reset throttle", () => {
  it("fourth reset request in an hour is throttled silently", async () => {
    const store = new InMemoryAuthRateLimitStore();
    const hit = jest.spyOn(store, "hit");
    const { service, prisma, mail } = createService(store);
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "foo@example.com",
      status: "ACTIVE",
    });

    for (const email of [
      "Foo@Example.com ",
      "foo@example.com",
      " FOO@example.com",
    ]) {
      await service.requestPasswordReset(email);
    }
    expect(prisma.authToken.create).toHaveBeenCalledTimes(3);
    expect(mail.sendPasswordReset).toHaveBeenCalledTimes(3);
    expect(hit).toHaveBeenCalledWith(
      `pwreset-email:${sha256("foo@example.com")}`,
      3_600_000,
    );

    await expect(
      service.requestPasswordReset("foo@example.com"),
    ).resolves.toBeUndefined();

    expect(prisma.authToken.create).toHaveBeenCalledTimes(3);
    expect(mail.sendPasswordReset).toHaveBeenCalledTimes(3);
    expect(prisma.auditEvent.create).toHaveBeenLastCalledWith({
      data: {
        eventType: "PASSWORD_RESET_THROTTLED",
        outcome: "FAILURE",
        metadata: { emailHash: sha256("foo@example.com") },
      },
    });
    for (const [key] of hit.mock.calls) {
      expect(key).not.toContain("foo@example.com");
    }
    expect(JSON.stringify(prisma.auditEvent.create.mock.calls)).not.toContain(
      "foo@example.com",
    );
  });

  it("throttle applies to unknown emails without revealing anything", async () => {
    const { service, prisma, mail } = createService(
      new InMemoryAuthRateLimitStore(),
    );
    prisma.user.findUnique.mockResolvedValue(null);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(
        service.requestPasswordReset("ghost@example.com"),
      ).resolves.toBeUndefined();
    }

    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    expect(prisma.authToken.create).not.toHaveBeenCalled();
    for (const [arg] of prisma.auditEvent.create.mock.calls) {
      expect(arg.data).not.toHaveProperty("userId");
    }
  });

  it("store failure answers 503", async () => {
    const { service, prisma } = createService({
      hit: jest.fn().mockRejectedValue(new Error("redis down")),
      peek: jest.fn().mockRejectedValue(new Error("redis down")),
    });

    await expect(
      service.requestPasswordReset("foo@example.com"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
