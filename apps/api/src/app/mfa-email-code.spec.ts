import {
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import {
  AuthRateLimitStore,
  AuthSessionIssuer,
  InMemoryAuthRateLimitStore,
  MfaChallengeService,
  MfaController,
  MfaFailureThrottle,
  MfaSecretCipher,
  MfaVerificationService,
  TrustedDeviceService,
  generateTotpSecret,
} from "@law/auth";

const TEST_KEY = "test-mfa-encryption-key-0123456789abcdef";
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const user = {
  id: "user-1",
  email: "ana@example.com",
  status: "ACTIVE",
  passwordHash: (() => {
    const salt = randomBytes(16).toString("hex");
    return `${salt}:${scryptSync("x", salt, 64).toString("hex")}`;
  })(),
  memberships: [],
};

const loginChallenge = (id = "challenge-1") => ({
  id,
  userId: user.id,
  scope: "LOGIN",
  attempts: 0,
  createdAt: new Date(),
});

const reserveAttempt = {
  where: {
    id: "challenge-1",
    purpose: "MFA_CHALLENGE",
    consumedAt: null,
    expiresAt: { gt: expect.any(Date) },
    attempts: { lt: 5 },
  },
  data: { attempts: { increment: 1 } },
};

function createHarness(
  store: AuthRateLimitStore = new InMemoryAuthRateLimitStore(),
) {
  const previous = process.env.AUTH_MFA_ENCRYPTION_KEY;
  process.env.AUTH_MFA_ENCRYPTION_KEY = TEST_KEY;
  const cipher = new MfaSecretCipher();
  if (previous === undefined) delete process.env.AUTH_MFA_ENCRYPTION_KEY;
  else process.env.AUTH_MFA_ENCRYPTION_KEY = previous;

  const encrypted = cipher.encrypt(generateTotpSecret());
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    userMfa: {
      findUnique: jest.fn().mockResolvedValue({
        userId: user.id,
        totpSecretCiphertext: encrypted.ciphertext,
        totpSecretIv: encrypted.iv,
        totpSecretAuthTag: encrypted.authTag,
        enabledAt: new Date("2026-10-01T00:00:00Z"),
        lastUsedStep: null,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    mfaRecoveryCode: { findFirst: jest.fn().mockResolvedValue(null) },
    authToken: {
      create: jest.fn((arg: { data: { expiresAt: Date } }) => arg),
      findFirst: jest.fn().mockResolvedValue(loginChallenge()),
      findUnique: jest.fn().mockResolvedValue({ attempts: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
    authSession: { create: jest.fn().mockResolvedValue({}) },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
    trustedDevice: { create: jest.fn().mockResolvedValue({}) },
  };
  const mail = { sendMfaEmailCode: jest.fn().mockResolvedValue(undefined) };
  const verification = new MfaVerificationService(
    prisma as never,
    new MfaChallengeService(prisma as never),
    cipher,
    new AuthSessionIssuer(prisma as never),
    new TrustedDeviceService(prisma as never),
    mail as never,
    store,
    new MfaFailureThrottle(prisma as never, store),
  );
  return { prisma, mail, verification, store };
}

const auditTypes = (prisma: { auditEvent: { create: jest.Mock } }) =>
  prisma.auditEvent.create.mock.calls.map(
    ([arg]: [{ data: { eventType: string } }]) => arg.data.eventType,
  );

const sentCode = (mail: { sendMfaEmailCode: jest.Mock }, call = 0): string =>
  mail.sendMfaEmailCode.mock.calls[call][1] as string;

describe("MfaVerificationService.sendEmailCode", () => {
  it("issues a 6-digit code, consumes earlier unused ones, enqueues email, audits MFA_EMAIL_CODE_SENT", async () => {
    const { verification, prisma, mail } = createHarness();
    const before = Date.now();

    await verification.sendEmailCode("raw-challenge");

    expect(mail.sendMfaEmailCode).toHaveBeenCalledTimes(1);
    expect(mail.sendMfaEmailCode).toHaveBeenCalledWith(
      { id: user.id, email: user.email },
      expect.stringMatching(/^\d{6}$/),
    );
    const code = sentCode(mail);
    expect(prisma.authToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        purpose: "MFA_EMAIL_CODE",
        consumedAt: null,
      },
      data: { consumedAt: expect.any(Date) },
    });
    const [{ data }] = prisma.authToken.create.mock.calls[0];
    expect(data).toMatchObject({
      userId: user.id,
      purpose: "MFA_EMAIL_CODE",
      tokenHash: sha256(`challenge-1:${code}`),
    });
    const ttl = data.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(10 * 60_000 - 50);
    expect(ttl).toBeLessThanOrEqual(10 * 60_000 + 1000);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: "MFA_EMAIL_CODE_SENT",
        outcome: "SUCCESS",
        userId: user.id,
      },
    });
    const audits = JSON.stringify(prisma.auditEvent.create.mock.calls);
    expect(audits).not.toContain(code);
    expect(audits).not.toContain(user.email);
    // Sending a code never spends a verification attempt.
    expect(prisma.authToken.updateMany).not.toHaveBeenCalledWith(
      reserveAttempt,
    );
  });

  it("4th request for one challenge → resolves but nothing sent", async () => {
    const { verification, prisma, mail } = createHarness();

    for (let i = 0; i < 4; i += 1) {
      await expect(
        verification.sendEmailCode("raw-challenge"),
      ).resolves.toBeUndefined();
    }

    expect(mail.sendMfaEmailCode).toHaveBeenCalledTimes(3);
    expect(prisma.authToken.create).toHaveBeenCalledTimes(3);
    expect(
      auditTypes(prisma).filter((type) => type === "MFA_EMAIL_CODE_SENT"),
    ).toHaveLength(3);
  });

  it("6th request in an hour for one user → resolves but nothing sent", async () => {
    const { verification, prisma, mail } = createHarness();
    const challenges = ["c1", "c1", "c1", "c2", "c2", "c2"];

    for (const id of challenges) {
      prisma.authToken.findFirst.mockResolvedValue(loginChallenge(id));
      await expect(
        verification.sendEmailCode(`raw-${id}`),
      ).resolves.toBeUndefined();
    }

    expect(mail.sendMfaEmailCode).toHaveBeenCalledTimes(5);
    expect(prisma.authToken.create).toHaveBeenCalledTimes(5);
  });

  it("counts under the documented store keys", async () => {
    const store = {
      hit: jest.fn().mockResolvedValue(1),
      peek: jest.fn().mockResolvedValue(0),
    };
    const { verification } = createHarness(store);

    await verification.sendEmailCode("raw-challenge");

    expect(store.hit).toHaveBeenCalledWith(
      "mfa-email:challenge:challenge-1",
      expect.any(Number),
    );
    expect(store.hit).toHaveBeenCalledWith(
      "mfa-email:user:user-1",
      60 * 60 * 1000,
    );
  });

  it("no-op for a user without enabled TOTP", async () => {
    const { verification, prisma, mail } = createHarness();
    prisma.userMfa.findUnique.mockResolvedValue(null);

    await expect(
      verification.sendEmailCode("raw-challenge"),
    ).resolves.toBeUndefined();

    prisma.userMfa.findUnique.mockResolvedValue({
      userId: user.id,
      enabledAt: null,
    });
    await expect(
      verification.sendEmailCode("raw-challenge"),
    ).resolves.toBeUndefined();

    expect(mail.sendMfaEmailCode).not.toHaveBeenCalled();
    expect(prisma.authToken.create).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it("no-op for a user who is no longer ACTIVE", async () => {
    const { verification, prisma, mail } = createHarness();
    prisma.user.findUnique.mockResolvedValue({ ...user, status: "DISABLED" });

    await verification.sendEmailCode("raw-challenge");

    expect(mail.sendMfaEmailCode).not.toHaveBeenCalled();
    expect(prisma.authToken.create).not.toHaveBeenCalled();
  });

  it("missing, invalid or non-LOGIN challenge → 401 MFA_CHALLENGE_INVALID", async () => {
    const { verification, prisma, mail } = createHarness();

    const missing = await verification
      .sendEmailCode(undefined)
      .catch((caught: unknown) => caught);
    prisma.authToken.findFirst.mockResolvedValue(null);
    const unknown = await verification
      .sendEmailCode("raw-challenge")
      .catch((caught: unknown) => caught);

    for (const error of [missing, unknown]) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        error: "MFA_CHALLENGE_INVALID",
      });
    }
    expect(prisma.authToken.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ scope: "LOGIN" }),
    });
    expect(mail.sendMfaEmailCode).not.toHaveBeenCalled();
  });

  it("rate-limit store failure → 503 and nothing sent", async () => {
    const { verification, prisma, mail } = createHarness({
      hit: jest.fn().mockRejectedValue(new Error("redis down")),
      peek: jest.fn().mockRejectedValue(new Error("redis down")),
    });

    await expect(
      verification.sendEmailCode("raw-challenge"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mail.sendMfaEmailCode).not.toHaveBeenCalled();
    expect(prisma.authToken.create).not.toHaveBeenCalled();
  });
});

describe("email fallback within 72 h of a password change", () => {
  const HOUR = 60 * 60 * 1000;
  const recent = () => new Date(Date.now() - HOUR);

  it("sendEmailCode silently does nothing (still resolves)", async () => {
    const { verification, prisma, mail } = createHarness();
    prisma.user.findUnique.mockResolvedValue({
      ...user,
      passwordChangedAt: recent(),
    });

    await expect(
      verification.sendEmailCode("raw-challenge"),
    ).resolves.toBeUndefined();

    expect(mail.sendMfaEmailCode).not.toHaveBeenCalled();
    expect(prisma.authToken.create).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it("sendEmailCode works again once 72 h have passed", async () => {
    const { verification, prisma, mail } = createHarness();
    prisma.user.findUnique.mockResolvedValue({
      ...user,
      passwordChangedAt: new Date(Date.now() - 73 * HOUR),
    });

    await verification.sendEmailCode("raw-challenge");

    expect(mail.sendMfaEmailCode).toHaveBeenCalledTimes(1);
  });

  it("verify with method EMAIL → 401 MFA_CODE_INVALID even for a valid code, counted as a failed attempt", async () => {
    const { verification, prisma, store } = createHarness();
    prisma.user.findUnique.mockResolvedValue({
      ...user,
      passwordChangedAt: recent(),
    });
    prisma.authToken.findFirst.mockImplementation(
      async (arg: { where: { purpose: string } }) =>
        arg.where.purpose === "MFA_EMAIL_CODE"
          ? { id: "email-code-1" }
          : loginChallenge(),
    );

    const error = await verification
      .verify("raw-challenge", {
        method: "EMAIL",
        code: "123456",
        rememberDevice: false,
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getResponse()).toMatchObject({
      error: "MFA_CODE_INVALID",
    });
    expect(prisma.authToken.updateMany).toHaveBeenCalledWith(reserveAttempt);
    expect(prisma.authToken.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: "MFA_VERIFY",
        outcome: "FAILURE",
        userId: user.id,
        metadata: { method: "EMAIL" },
      },
    });
    expect(await store.peek("mfa-fail:user:user-1")).toBe(1);
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });
});

describe("MfaVerificationService.sendEmailCode for a throttled account", () => {
  it("→ 429 MFA_ACCOUNT_THROTTLED and nothing sent", async () => {
    const store = new InMemoryAuthRateLimitStore();
    for (let i = 0; i < 11; i += 1) {
      await store.hit("mfa-fail:user:user-1", 60_000);
    }
    const { verification, prisma, mail } = createHarness(store);

    const error = await verification
      .sendEmailCode("raw-challenge")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).getResponse()).toMatchObject({
      error: "MFA_ACCOUNT_THROTTLED",
    });
    expect(mail.sendMfaEmailCode).not.toHaveBeenCalled();
    expect(prisma.authToken.create).not.toHaveBeenCalled();
  });
});

describe("MfaVerificationService.verify with method EMAIL", () => {
  const dto = (code: string) => ({
    method: "EMAIL" as const,
    code,
    rememberDevice: false,
  });

  it("accepts the code once within 10 min: consumes it, consumes the challenge, issues a session, audits method EMAIL", async () => {
    const { verification, prisma } = createHarness();
    prisma.authToken.findFirst.mockImplementation(
      async (arg: { where: { purpose: string } }) =>
        arg.where.purpose === "MFA_EMAIL_CODE"
          ? { id: "email-code-1" }
          : loginChallenge(),
    );

    const result = await verification.verify("raw-challenge", dto("123456"));

    expect(prisma.authToken.findFirst).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        purpose: "MFA_EMAIL_CODE",
        tokenHash: sha256("challenge-1:123456"),
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const calls = prisma.authToken.updateMany.mock.calls.map(([arg]) => arg);
    expect(calls[0]).toEqual(reserveAttempt);
    expect(calls).toContainEqual({
      where: { id: "email-code-1", consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
    expect(calls).toContainEqual({
      where: { id: "challenge-1", consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
    expect(prisma.authSession.create).toHaveBeenCalledTimes(1);
    expect(result.userId).toBe(user.id);
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: "MFA_VERIFY",
        outcome: "SUCCESS",
        userId: user.id,
        metadata: { method: "EMAIL" },
      },
    });
    expect(JSON.stringify(prisma.auditEvent.create.mock.calls)).not.toContain(
      "123456",
    );
  });

  it("spaces in the submitted code are ignored", async () => {
    const { verification, prisma } = createHarness();
    prisma.authToken.findFirst.mockImplementation(
      async (arg: { where: { purpose: string } }) =>
        arg.where.purpose === "MFA_EMAIL_CODE"
          ? { id: "email-code-1" }
          : loginChallenge(),
    );

    await verification.verify("raw-challenge", dto("123 456"));

    expect(prisma.authToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tokenHash: sha256("challenge-1:123456"),
        }),
      }),
    );
  });

  it("expired (or unknown) code → 401 MFA_CODE_INVALID, counts as a failed attempt, no session", async () => {
    const { verification, prisma } = createHarness();
    // The expiry is part of the lookup, so an expired code is simply not found.
    prisma.authToken.findFirst.mockImplementation(
      async (arg: { where: { purpose: string } }) =>
        arg.where.purpose === "MFA_EMAIL_CODE" ? null : loginChallenge(),
    );

    const error = await verification
      .verify("raw-challenge", dto("123456"))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getResponse()).toMatchObject({
      error: "MFA_CODE_INVALID",
    });
    expect(prisma.authToken.updateMany).toHaveBeenCalledWith(reserveAttempt);
    expect(prisma.authToken.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: "MFA_VERIFY",
        outcome: "FAILURE",
        userId: user.id,
        metadata: { method: "EMAIL" },
      },
    });
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it("code issued for another challenge → 401 (lookup is bound to this challenge id)", async () => {
    const { verification, prisma } = createHarness();
    const otherChallengeHash = sha256("challenge-2:123456");
    prisma.authToken.findFirst.mockImplementation(
      async (arg: { where: { purpose: string; tokenHash?: string } }) =>
        arg.where.purpose === "MFA_EMAIL_CODE"
          ? arg.where.tokenHash === otherChallengeHash
            ? { id: "email-code-for-2" }
            : null
          : loginChallenge("challenge-1"),
    );

    await expect(
      verification.verify("raw-challenge", dto("123456")),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it("code lost to a concurrent request (update count 0) → 401", async () => {
    const { verification, prisma } = createHarness();
    prisma.authToken.findFirst.mockImplementation(
      async (arg: { where: { purpose: string } }) =>
        arg.where.purpose === "MFA_EMAIL_CODE"
          ? { id: "email-code-1" }
          : loginChallenge(),
    );
    prisma.authToken.updateMany
      .mockResolvedValueOnce({ count: 1 }) // reservation
      .mockResolvedValueOnce({ count: 0 }); // code claimed elsewhere

    await expect(
      verification.verify("raw-challenge", dto("123456")),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it("reserves the attempt before the code is looked up; no attempt left → 401 without evaluating", async () => {
    const { verification, prisma } = createHarness();
    prisma.authToken.updateMany.mockResolvedValueOnce({ count: 0 });

    const error = await verification
      .verify("raw-challenge", dto("123456"))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getResponse()).toMatchObject({
      error: "MFA_CHALLENGE_INVALID",
    });
    // Only the challenge lookup ran; the email code was never evaluated.
    expect(prisma.authToken.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it("5th wrong email code locks the challenge", async () => {
    const { verification, prisma } = createHarness();
    prisma.authToken.findFirst.mockImplementation(
      async (arg: { where: { purpose: string } }) =>
        arg.where.purpose === "MFA_EMAIL_CODE" ? null : loginChallenge(),
    );
    prisma.authToken.findUnique.mockResolvedValue({ attempts: 5 });

    const error = await verification
      .verify("raw-challenge", dto("000000"))
      .catch((caught: unknown) => caught);

    expect((error as UnauthorizedException).getResponse()).toMatchObject({
      error: "MFA_CHALLENGE_INVALID",
    });
    expect(auditTypes(prisma)).toContain("MFA_CHALLENGE_LOCKED");
  });

  it("an enabled-less user cannot verify by email code", async () => {
    const { verification, prisma } = createHarness();
    prisma.userMfa.findUnique.mockResolvedValue(null);

    await expect(
      verification.verify("raw-challenge", dto("123456")),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });
});

describe("MfaController.emailCode", () => {
  const request = (cookie?: string) =>
    ({ headers: cookie ? { cookie } : {} }) as never;

  it("passes the challenge cookie to the service and returns nothing", async () => {
    const verification = {
      sendEmailCode: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new MfaController(
      verification as never,
      { production: true } as never,
      {} as never,
      {} as never,
    );

    await expect(
      controller.emailCode(request("law_mfa_challenge=challenge-token")),
    ).resolves.toBeUndefined();

    expect(verification.sendEmailCode).toHaveBeenCalledWith("challenge-token");
  });

  it("is rate limited, answers 204 and sits behind the CSRF guard", () => {
    const handler = MfaController.prototype.emailCode;
    expect(Reflect.getMetadata("__httpCode__", handler)).toBe(204);
    const guards = Reflect.getMetadata("__guards__", handler) as {
      name: string;
    }[];
    expect(guards.map((guard) => guard.name)).toContain("AuthRateLimitGuard");
    const classGuards = Reflect.getMetadata("__guards__", MfaController) as {
      name: string;
    }[];
    expect(classGuards.map((guard) => guard.name)).toContain("CsrfOriginGuard");
  });
});
