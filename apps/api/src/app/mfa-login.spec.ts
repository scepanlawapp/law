import {
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { Secret, TOTP } from "otpauth";
import {
  AuthController,
  AuthRateLimitStore,
  AuthService,
  InMemoryAuthRateLimitStore,
  AuthSessionIssuer,
  MFA_CHALLENGE_COOKIE,
  MfaChallengeService,
  MfaController,
  MfaFailureThrottle,
  MfaSecretCipher,
  MfaVerificationService,
  TrustedDeviceService,
  generateTotpSecret,
  hashRecoveryCode,
  readCookie,
} from "@law/auth";

// Mirrors HARDCODED_WORKSPACE_ID (@law/core is lazy-loaded elsewhere in specs).
const HARDCODED_WORKSPACE_ID =
  process.env["AUTH_BOOTSTRAP_WORKSPACE_ID"] ??
  "11111111-1111-4111-a111-111111111111";
const PASSWORD = "CorrectHorse123!";
const TEST_KEY = "test-mfa-encryption-key-0123456789abcdef";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function passwordHash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function cipherWithKey(key: string | undefined): MfaSecretCipher {
  const previous = process.env.AUTH_MFA_ENCRYPTION_KEY;
  if (key === undefined) delete process.env.AUTH_MFA_ENCRYPTION_KEY;
  else process.env.AUTH_MFA_ENCRYPTION_KEY = key;
  try {
    return new MfaSecretCipher();
  } finally {
    if (previous === undefined) delete process.env.AUTH_MFA_ENCRYPTION_KEY;
    else process.env.AUTH_MFA_ENCRYPTION_KEY = previous;
  }
}

const user = {
  id: "user-1",
  email: "ana@example.com",
  status: "ACTIVE",
  passwordHash: passwordHash(PASSWORD),
  memberships: [
    {
      workspaceId: HARDCODED_WORKSPACE_ID,
      role: "OWNER",
      workspace: { name: "Kancelarija" },
    },
  ],
};

function createHarness(
  options: { key?: string | undefined; store?: AuthRateLimitStore } = {},
) {
  const key = "key" in options ? options.key : TEST_KEY;
  const store = options.store ?? new InMemoryAuthRateLimitStore();
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue(user),
    },
    userMfa: {
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    mfaRecoveryCode: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    organizationSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    authToken: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue({ attempts: 1 }),
      update: jest.fn((arg: unknown) => arg),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    workspaceMember: { updateMany: jest.fn((arg: unknown) => arg) },
    $transaction: jest.fn(
      async (arg: unknown): Promise<unknown> =>
        typeof arg === "function" ? arg(prisma) : arg,
    ),
    authSession: { create: jest.fn().mockResolvedValue({}) },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
    trustedDevice: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const cipher = cipherWithKey(key);
  const sessions = new AuthSessionIssuer(prisma as never);
  const challenges = new MfaChallengeService(prisma as never);
  const trustedDevices = new TrustedDeviceService(prisma as never);
  const throttle = new MfaFailureThrottle(prisma as never, store);
  const authService = new AuthService(
    prisma as never,
    {} as never,
    store,
    sessions,
    challenges,
    cipher,
    trustedDevices,
    throttle,
  );
  const verification = new MfaVerificationService(
    prisma as never,
    challenges,
    cipher,
    sessions,
    trustedDevices,
    { sendMfaEmailCode: jest.fn() } as never,
    store,
    throttle,
  );
  return { prisma, cipher, authService, verification, store };
}

function enabledMfa(
  cipher: MfaSecretCipher,
  secret: string,
  lastUsedStep: bigint | null = null,
) {
  const encrypted = cipher.encrypt(secret);
  return {
    userId: user.id,
    totpSecretCiphertext: encrypted.ciphertext,
    totpSecretIv: encrypted.iv,
    totpSecretAuthTag: encrypted.authTag,
    enabledAt: new Date("2026-10-01T00:00:00Z"),
    lastUsedStep,
  };
}

const loginChallenge = {
  id: "challenge-1",
  userId: user.id,
  scope: "LOGIN",
  attempts: 0,
  createdAt: new Date(),
};

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

const auditTypes = (prisma: { auditEvent: { create: jest.Mock } }) =>
  prisma.auditEvent.create.mock.calls.map(
    ([arg]: [{ data: { eventType: string } }]) => arg.data.eventType,
  );

describe("AuthService.login with two-factor enforcement", () => {
  it("user without 2FA and policy off → AUTHENTICATED with session token", async () => {
    const { authService, prisma } = createHarness();

    const result = await authService.login(user.email, PASSWORD);

    expect(result.result).toEqual({
      status: "AUTHENTICATED",
      session: {
        user: { id: user.id, email: user.email, status: "ACTIVE" },
        memberships: [
          {
            workspaceId: HARDCODED_WORKSPACE_ID,
            workspaceName: "Kancelarija",
            role: "OWNER",
          },
        ],
      },
    });
    expect(result.sessionToken).toEqual(expect.any(String));
    expect(result.challengeToken).toBeUndefined();
    expect(prisma.authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: user.id,
        refreshTokenHash: sha256(result.sessionToken as string),
      }),
    });
    expect(prisma.organizationSettings.findUnique).toHaveBeenCalledWith({
      where: { workspaceId: HARDCODED_WORKSPACE_ID },
      select: { mfaRequired: true },
    });
    expect(prisma.authToken.create).not.toHaveBeenCalled();
  });

  it("user with enabled 2FA → MFA_REQUIRED, methods [TOTP, RECOVERY, EMAIL], challenge created with scope LOGIN, no session", async () => {
    const { authService, prisma, cipher } = createHarness();
    prisma.userMfa.findUnique.mockResolvedValue(
      enabledMfa(cipher, generateTotpSecret()),
    );

    const before = Date.now();
    const result = await authService.login(user.email, PASSWORD, "ignored");

    expect(result.result).toEqual({
      status: "MFA_REQUIRED",
      methods: ["TOTP", "RECOVERY", "EMAIL"],
    });
    expect(result.sessionToken).toBeUndefined();
    expect(result.challengeToken).toEqual(expect.any(String));
    expect(prisma.authSession.create).not.toHaveBeenCalled();
    const [{ data }] = prisma.authToken.create.mock.calls[0];
    expect(data).toMatchObject({
      userId: user.id,
      purpose: "MFA_CHALLENGE",
      scope: "LOGIN",
      tokenHash: sha256(result.challengeToken as string),
    });
    const ttl = data.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(5 * 60_000 - 50);
    expect(ttl).toBeLessThanOrEqual(5 * 60_000 + 1000);
  });

  it("password changed within 72 h → MFA_REQUIRED without the EMAIL method", async () => {
    const { authService, prisma, cipher } = createHarness();
    prisma.user.findUnique.mockResolvedValue({
      ...user,
      passwordChangedAt: new Date(Date.now() - 71 * 60 * 60 * 1000),
    });
    prisma.userMfa.findUnique.mockResolvedValue(
      enabledMfa(cipher, generateTotpSecret()),
    );

    const result = await authService.login(user.email, PASSWORD);

    expect(result.result).toEqual({
      status: "MFA_REQUIRED",
      methods: ["TOTP", "RECOVERY"],
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ passwordChangedAt: true }),
      }),
    );
  });

  it("password changed more than 72 h ago → EMAIL offered again", async () => {
    const { authService, prisma, cipher } = createHarness();
    prisma.user.findUnique.mockResolvedValue({
      ...user,
      passwordChangedAt: new Date(Date.now() - 73 * 60 * 60 * 1000),
    });
    prisma.userMfa.findUnique.mockResolvedValue(
      enabledMfa(cipher, generateTotpSecret()),
    );

    const result = await authService.login(user.email, PASSWORD);

    expect(result.result).toEqual({
      status: "MFA_REQUIRED",
      methods: ["TOTP", "RECOVERY", "EMAIL"],
    });
  });

  it("policy on and user not enrolled → MFA_ENROLLMENT_REQUIRED, challenge scope ENROLLMENT", async () => {
    const { authService, prisma } = createHarness();
    prisma.organizationSettings.findUnique.mockResolvedValue({
      mfaRequired: true,
    });

    const result = await authService.login(user.email, PASSWORD);

    expect(result.result).toEqual({ status: "MFA_ENROLLMENT_REQUIRED" });
    expect(result.sessionToken).toBeUndefined();
    expect(prisma.authSession.create).not.toHaveBeenCalled();
    expect(prisma.authToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purpose: "MFA_CHALLENGE",
        scope: "ENROLLMENT",
        tokenHash: sha256(result.challengeToken as string),
      }),
    });
  });

  it("pending (not enabled) 2FA with policy off → AUTHENTICATED", async () => {
    const { authService, prisma, cipher } = createHarness();
    prisma.userMfa.findUnique.mockResolvedValue({
      ...enabledMfa(cipher, generateTotpSecret()),
      enabledAt: null,
    });

    const result = await authService.login(user.email, PASSWORD);

    expect(result.result.status).toBe("AUTHENTICATED");
  });

  it("enabled 2FA but cipher unavailable → 503 and no session", async () => {
    const { authService, prisma } = createHarness({ key: undefined });
    prisma.userMfa.findUnique.mockResolvedValue({
      userId: user.id,
      totpSecretCiphertext: "x",
      totpSecretIv: "y",
      totpSecretAuthTag: "z",
      enabledAt: new Date(),
      lastUsedStep: null,
    });

    await expect(
      authService.login(user.email, PASSWORD),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.authSession.create).not.toHaveBeenCalled();
    expect(prisma.authToken.create).not.toHaveBeenCalled();
  });

  it("without the cipher key a user without 2FA still logs in", async () => {
    const { authService } = createHarness({ key: undefined });

    const result = await authService.login(user.email, PASSWORD);

    expect(result.result.status).toBe("AUTHENTICATED");
  });

  it("wrong password → 401 without challenge or session", async () => {
    const { authService, prisma } = createHarness();

    await expect(
      authService.login(user.email, "wrong-password"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.authToken.create).not.toHaveBeenCalled();
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });
});

describe("AuthService.acceptInvitation honours the 2FA policy", () => {
  const invitation = {
    id: "invite-1",
    userId: user.id,
    user: { ...user, status: "INVITED" },
  };

  it("policy off → AUTHENTICATED with session token", async () => {
    const { authService, prisma } = createHarness();
    prisma.authToken.findFirst.mockResolvedValue(invitation);

    const result = await authService.acceptInvitation(
      "raw-invitation",
      PASSWORD,
    );

    expect(result.result.status).toBe("AUTHENTICATED");
    expect(result.sessionToken).toEqual(expect.any(String));
    expect(result.challengeToken).toBeUndefined();
    expect(prisma.authSession.create).toHaveBeenCalledTimes(1);
    expect(prisma.authToken.create).not.toHaveBeenCalled();
  });

  it("policy on → MFA_ENROLLMENT_REQUIRED with ENROLLMENT challenge and no session", async () => {
    const { authService, prisma } = createHarness();
    prisma.authToken.findFirst.mockResolvedValue(invitation);
    prisma.organizationSettings.findUnique.mockResolvedValue({
      mfaRequired: true,
    });

    const result = await authService.acceptInvitation(
      "raw-invitation",
      PASSWORD,
    );

    expect(result.result).toEqual({ status: "MFA_ENROLLMENT_REQUIRED" });
    expect(result.sessionToken).toBeUndefined();
    expect(prisma.authSession.create).not.toHaveBeenCalled();
    expect(prisma.authToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: user.id,
        purpose: "MFA_CHALLENGE",
        scope: "ENROLLMENT",
        tokenHash: sha256(result.challengeToken as string),
      }),
    });
    // The invitation itself is still accepted and consumed.
    expect(prisma.authToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: "invite-1",
        purpose: "INVITATION",
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { consumedAt: expect.any(Date) },
    });
    expect(prisma.workspaceMember.updateMany).toHaveBeenCalled();
  });

  it("sets the password, claims the invitation, activates the membership and revokes trusted devices in one transaction", async () => {
    const { authService, prisma } = createHarness();
    prisma.authToken.findFirst.mockResolvedValue(invitation);
    const tx = {
      user: {
        update: jest
          .fn()
          .mockResolvedValue({ id: user.id, passwordChangedAt: new Date() }),
      },
      authToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      workspaceMember: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      trustedDevice: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    prisma.$transaction.mockImplementation(async (arg: unknown) => {
      expect(typeof arg).toBe("function");
      return (arg as (client: unknown) => unknown)(tx);
    });

    const result = await authService.acceptInvitation(
      "raw-invitation",
      PASSWORD,
    );

    expect(result.result.status).toBe("AUTHENTICATED");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.workspaceMember.updateMany).not.toHaveBeenCalled();
    expect(tx.authToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: "invite-1",
        purpose: "INVITATION",
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { consumedAt: expect.any(Date) },
    });
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: user.id },
        data: {
          passwordHash: expect.stringMatching(/^[0-9a-f]+:[0-9a-f]+$/),
          passwordChangedAt: expect.any(Date),
          status: "ACTIVE",
        },
      }),
    );
    expect(tx.workspaceMember.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, status: "INVITED" },
      data: { status: "ACTIVE" },
    });
    expect(tx.trustedDevice.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("an invitation claimed by a concurrent request → 401 and nothing else written", async () => {
    const { authService, prisma } = createHarness();
    prisma.authToken.findFirst.mockResolvedValue(invitation);
    prisma.authToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      authService.acceptInvitation("raw-invitation", PASSWORD),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.workspaceMember.updateMany).not.toHaveBeenCalled();
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });
});

describe("MfaVerificationService.verify", () => {
  function totpHarness(lastUsedStep: bigint | null = null) {
    const harness = createHarness();
    const secret = generateTotpSecret();
    harness.prisma.userMfa.findUnique.mockResolvedValue(
      enabledMfa(harness.cipher, secret, lastUsedStep),
    );
    harness.prisma.authToken.findFirst.mockResolvedValue(loginChallenge);
    const code = new TOTP({ secret: Secret.fromBase32(secret) }).generate();
    return { ...harness, secret, code };
  }

  it("verify TOTP success consumes challenge, updates lastUsedStep conditionally, issues session, audits MFA_VERIFY method TOTP", async () => {
    const { verification, prisma, code } = totpHarness();

    const result = await verification.verify("raw-challenge", {
      method: "TOTP",
      code,
      rememberDevice: false,
    });

    expect(prisma.authToken.findFirst).toHaveBeenCalledWith({
      where: {
        purpose: "MFA_CHALLENGE",
        tokenHash: sha256("raw-challenge"),
        scope: "LOGIN",
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) },
        attempts: { lt: 5 },
      },
    });
    const step = BigInt(Math.floor(Date.now() / 30_000));
    const [update] = prisma.userMfa.updateMany.mock.calls[0];
    expect(update.where).toEqual({
      userId: user.id,
      enabledAt: { not: null },
      OR: [
        { lastUsedStep: null },
        { lastUsedStep: { lt: update.data.lastUsedStep } },
      ],
    });
    expect(update.data.lastUsedStep - step <= BigInt(1)).toBe(true);
    expect(step - update.data.lastUsedStep <= BigInt(1)).toBe(true);
    expect(prisma.authToken.updateMany).toHaveBeenCalledWith({
      where: { id: "challenge-1", consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
    expect(prisma.authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: user.id,
        refreshTokenHash: sha256(result.token),
      }),
    });
    expect(result.userId).toBe(user.id);
    expect(result.session.user.id).toBe(user.id);
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: "MFA_VERIFY",
        outcome: "SUCCESS",
        userId: user.id,
        metadata: { method: "TOTP" },
      },
    });
    expect(JSON.stringify(prisma.auditEvent.create.mock.calls)).not.toContain(
      code,
    );
  });

  it("verify replay: lastUsedStep conditional update count 0 → 401", async () => {
    const { verification, prisma, code } = totpHarness();
    prisma.userMfa.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      verification.verify("raw-challenge", {
        method: "TOTP",
        code,
        rememberDevice: false,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.authSession.create).not.toHaveBeenCalled();
    expect(prisma.authToken.updateMany).toHaveBeenCalledWith(reserveAttempt);
  });

  it("rejects a TOTP code whose step is not newer than lastUsedStep", async () => {
    const future = BigInt(Math.floor(Date.now() / 30_000)) + BigInt(5);
    const { verification, prisma, code } = totpHarness(future);

    await expect(
      verification.verify("raw-challenge", {
        method: "TOTP",
        code,
        rememberDevice: false,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.userMfa.updateMany).not.toHaveBeenCalled();
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it("verify recovery code consumes exactly that code (consumedAt) and rejects reuse", async () => {
    const { verification, prisma } = totpHarness();
    prisma.mfaRecoveryCode.findFirst.mockResolvedValueOnce({
      id: "code-7",
      userId: user.id,
    });

    await verification.verify("raw-challenge", {
      method: "RECOVERY",
      code: "ABCD-EFGH",
      rememberDevice: false,
    });

    expect(prisma.mfaRecoveryCode.findFirst).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        codeHash: hashRecoveryCode("abcdefgh"),
        consumedAt: null,
      },
      select: { id: true },
    });
    expect(prisma.mfaRecoveryCode.updateMany).toHaveBeenCalledWith({
      where: { id: "code-7", consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "MFA_VERIFY",
        outcome: "SUCCESS",
        metadata: { method: "RECOVERY" },
      }),
    });
    expect(prisma.authSession.create).toHaveBeenCalledTimes(1);

    // Reuse: the code is consumed so the lookup finds nothing.
    await expect(
      verification.verify("raw-challenge", {
        method: "RECOVERY",
        code: "ABCD-EFGH",
        rememberDevice: false,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.authSession.create).toHaveBeenCalledTimes(1);
  });

  it("recovery code lost to a concurrent request (update count 0) → 401", async () => {
    const { verification, prisma } = totpHarness();
    prisma.mfaRecoveryCode.findFirst.mockResolvedValue({ id: "code-7" });
    prisma.mfaRecoveryCode.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      verification.verify("raw-challenge", {
        method: "RECOVERY",
        code: "abcd-efgh",
        rememberDevice: false,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it("wrong code increments attempts; 5th failure locks (challenge consumed, audit MFA_CHALLENGE_LOCKED, 401)", async () => {
    const { verification, prisma } = totpHarness();
    const errors: unknown[] = [];
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      prisma.authToken.findUnique.mockResolvedValueOnce({ attempts: attempt });
      errors.push(
        await verification
          .verify("raw-challenge", {
            method: "TOTP",
            code: "000000",
            rememberDevice: false,
          })
          .catch((caught: unknown) => caught),
      );
    }

    for (const error of errors) {
      expect(error).toBeInstanceOf(UnauthorizedException);
    }
    expect(
      errors.map(
        (error) =>
          ((error as UnauthorizedException).getResponse() as { error: string })
            .error,
      ),
    ).toEqual([
      "MFA_CODE_INVALID",
      "MFA_CODE_INVALID",
      "MFA_CODE_INVALID",
      "MFA_CODE_INVALID",
      "MFA_CHALLENGE_INVALID",
    ]);
    const calls = prisma.authToken.updateMany.mock.calls.map(([arg]) => arg);
    expect(calls.slice(0, 5)).toEqual(Array(5).fill(reserveAttempt));
    expect(calls).toHaveLength(6);
    expect(calls[5]).toEqual({
      where: { id: "challenge-1", consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
    const types = auditTypes(prisma);
    expect(types.filter((type) => type === "MFA_VERIFY")).toHaveLength(5);
    expect(
      types.filter((type) => type === "MFA_CHALLENGE_LOCKED"),
    ).toHaveLength(1);
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: "MFA_VERIFY",
        outcome: "FAILURE",
        userId: user.id,
        metadata: { method: "TOTP" },
      },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: "MFA_CHALLENGE_LOCKED",
        outcome: "FAILURE",
        userId: user.id,
      },
    });
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it("lock is conditional: an already consumed challenge is not audited twice", async () => {
    const { verification, prisma } = totpHarness();
    prisma.authToken.findUnique.mockResolvedValueOnce({ attempts: 5 });
    prisma.authToken.updateMany
      .mockResolvedValueOnce({ count: 1 }) // reservation
      .mockResolvedValueOnce({ count: 0 }); // lock lost to a concurrent request

    await expect(
      verification.verify("raw-challenge", {
        method: "TOTP",
        code: "000000",
        rememberDevice: false,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auditTypes(prisma)).not.toContain("MFA_CHALLENGE_LOCKED");
  });

  it("ENROLLMENT challenge on verify → 401", async () => {
    const { verification, prisma, code } = totpHarness();
    // The lookup is scoped to LOGIN, so an ENROLLMENT challenge never matches.
    prisma.authToken.findFirst.mockImplementation(
      async (arg: { where: { scope: string } }) =>
        arg.where.scope === "ENROLLMENT"
          ? { ...loginChallenge, scope: "ENROLLMENT" }
          : null,
    );

    await expect(
      verification.verify("raw-challenge", {
        method: "TOTP",
        code,
        rememberDevice: false,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.userMfa.updateMany).not.toHaveBeenCalled();
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it("missing challenge cookie → 401", async () => {
    const { verification, prisma } = totpHarness();

    await expect(
      verification.verify(undefined, {
        method: "TOTP",
        code: "123456",
        rememberDevice: false,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.authToken.findFirst).not.toHaveBeenCalled();
  });

  it("does not issue a session for a user who is no longer ACTIVE", async () => {
    const { verification, prisma, code } = totpHarness();
    prisma.user.findUnique.mockResolvedValue({ ...user, status: "DISABLED" });

    await expect(
      verification.verify("raw-challenge", {
        method: "TOTP",
        code,
        rememberDevice: false,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it("tampered secret → 503 without counting an attempt", async () => {
    const { verification, prisma, code, cipher } = totpHarness();
    const mfa = enabledMfa(cipher, generateTotpSecret());
    prisma.userMfa.findUnique.mockResolvedValue({
      ...mfa,
      totpSecretAuthTag: Buffer.alloc(16).toString("base64"),
    });

    await expect(
      verification.verify("raw-challenge", {
        method: "TOTP",
        code,
        rememberDevice: false,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.authToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it("reserves the attempt before the code is evaluated", async () => {
    const { verification, prisma, code } = totpHarness();

    await verification.verify("raw-challenge", {
      method: "TOTP",
      code,
      rememberDevice: false,
    });

    expect(prisma.authToken.updateMany.mock.calls[0][0]).toEqual(
      reserveAttempt,
    );
    expect(
      prisma.authToken.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(prisma.userMfa.updateMany.mock.invocationCallOrder[0]);
  });

  it.each([["TOTP"], ["RECOVERY"]] as const)(
    "no attempt left to reserve (count 0) → 401 without evaluating the %s code",
    async (method) => {
      const { verification, prisma, code } = totpHarness();
      prisma.authToken.updateMany.mockResolvedValueOnce({ count: 0 });

      const error = await verification
        .verify("raw-challenge", { method, code, rememberDevice: false })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        error: "MFA_CHALLENGE_INVALID",
      });
      expect(prisma.userMfa.updateMany).not.toHaveBeenCalled();
      expect(prisma.mfaRecoveryCode.findFirst).not.toHaveBeenCalled();
      expect(prisma.authToken.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.auditEvent.create).not.toHaveBeenCalled();
      expect(prisma.authSession.create).not.toHaveBeenCalled();
    },
  );
});

describe("per-account MFA failure throttle", () => {
  const failKey = `mfa-fail:user:${user.id}`;

  function totpHarness(store?: AuthRateLimitStore) {
    const harness = createHarness(store ? { store } : {});
    const secret = generateTotpSecret();
    harness.prisma.userMfa.findUnique.mockResolvedValue(
      enabledMfa(harness.cipher, secret),
    );
    harness.prisma.authToken.findFirst.mockResolvedValue(loginChallenge);
    const code = new TOTP({ secret: Secret.fromBase32(secret) }).generate();
    return { ...harness, code };
  }

  const wrong = {
    method: "TOTP" as const,
    code: "000000",
    rememberDevice: false,
  };

  function throttled(error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).getResponse()).toMatchObject({
      error: "MFA_ACCOUNT_THROTTLED",
    });
  }

  it("the 11th failed check throttles the account: next verify and next login → 429, audited once", async () => {
    const { verification, authService, prisma, store } = totpHarness();
    for (let i = 0; i < 11; i += 1) {
      await expect(
        verification.verify("raw-challenge", wrong),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(await store.peek(failKey)).toBe(11);
    prisma.authToken.updateMany.mockClear();
    prisma.authToken.create.mockClear();

    throttled(
      await verification
        .verify("raw-challenge", wrong)
        .catch((caught: unknown) => caught),
    );
    // Rejected before an attempt is reserved.
    expect(prisma.authToken.updateMany).not.toHaveBeenCalled();

    throttled(
      await authService
        .login(user.email, PASSWORD)
        .catch((caught: unknown) => caught),
    );
    expect(prisma.authToken.create).not.toHaveBeenCalled();
    expect(prisma.authSession.create).not.toHaveBeenCalled();

    const throttleAudits = prisma.auditEvent.create.mock.calls.filter(
      ([arg]: [{ data: { eventType: string } }]) =>
        arg.data.eventType === "MFA_ACCOUNT_THROTTLED",
    );
    expect(throttleAudits).toEqual([
      [
        {
          data: {
            eventType: "MFA_ACCOUNT_THROTTLED",
            outcome: "FAILURE",
            userId: user.id,
          },
        },
      ],
    ]);
  });

  it("ten failures do not throttle: a correct code still signs in", async () => {
    const { verification, store, code } = totpHarness();
    for (let i = 0; i < 10; i += 1) {
      await expect(
        verification.verify("raw-challenge", wrong),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }

    await expect(
      verification.verify("raw-challenge", {
        method: "TOTP",
        code,
        rememberDevice: false,
      }),
    ).resolves.toMatchObject({ userId: user.id });
    expect(await store.peek(failKey)).toBe(10);
  });

  it("a successful verify does not increment the counter", async () => {
    const { verification, store, code } = totpHarness();

    await verification.verify("raw-challenge", {
      method: "TOTP",
      code,
      rememberDevice: false,
    });

    expect(await store.peek(failKey)).toBe(0);
  });

  it("failed recovery and email checks count too", async () => {
    const { verification, store, prisma } = totpHarness();
    prisma.authToken.findFirst.mockImplementation(
      async (arg: { where: { purpose: string } }) =>
        arg.where.purpose === "MFA_CHALLENGE" ? loginChallenge : null,
    );

    await expect(
      verification.verify("raw-challenge", {
        method: "RECOVERY",
        code: "abcd-efgh",
        rememberDevice: false,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      verification.verify("raw-challenge", {
        method: "EMAIL",
        code: "123456",
        rememberDevice: false,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(await store.peek(failKey)).toBe(2);
  });

  it("a throttled user under the 2FA policy gets 429 instead of an ENROLLMENT challenge", async () => {
    const store = new InMemoryAuthRateLimitStore();
    for (let i = 0; i < 11; i += 1) await store.hit(failKey, 60_000);
    const { authService, prisma } = createHarness({ store });
    prisma.organizationSettings.findUnique.mockResolvedValue({
      mfaRequired: true,
    });

    throttled(
      await authService
        .login(user.email, PASSWORD)
        .catch((caught: unknown) => caught),
    );
    expect(prisma.authToken.create).not.toHaveBeenCalled();
  });

  it("a throttled user still gets 401 for a wrong password (password checked first)", async () => {
    const store = new InMemoryAuthRateLimitStore();
    for (let i = 0; i < 11; i += 1) await store.hit(failKey, 60_000);
    const { authService } = createHarness({ store });

    await expect(
      authService.login(user.email, "wrong-password"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("store failure → 503 on verify (no reservation) and on login (no challenge)", async () => {
    const down: AuthRateLimitStore = {
      hit: jest.fn().mockRejectedValue(new Error("redis down")),
      peek: jest.fn().mockRejectedValue(new Error("redis down")),
    };
    const { verification, authService, prisma } = totpHarness(down);

    await expect(
      verification.verify("raw-challenge", wrong),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.authToken.updateMany).not.toHaveBeenCalled();

    await expect(
      authService.login(user.email, PASSWORD),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.authToken.create).not.toHaveBeenCalled();
  });

  it("a failing counter increment after a wrong code → 503", async () => {
    const flaky: AuthRateLimitStore = {
      hit: jest.fn().mockRejectedValue(new Error("redis down")),
      peek: jest.fn().mockResolvedValue(0),
    };
    const { verification } = totpHarness(flaky);

    await expect(
      verification.verify("raw-challenge", wrong),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe("login and verify controllers", () => {
  const config = { production: true } as never;
  const session = {
    user: { id: user.id, email: user.email, status: "ACTIVE" as const },
    memberships: [],
  };
  const response = () => ({ cookie: jest.fn(), clearCookie: jest.fn() });
  const request = (cookie?: string) =>
    ({ headers: cookie ? { cookie } : {} }) as never;

  const challengeOptions = {
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    path: "/api/auth",
    maxAge: 5 * 60_000,
  };

  it("login sets law_session for AUTHENTICATED", async () => {
    const authService = {
      login: jest.fn().mockResolvedValue({
        result: { status: "AUTHENTICATED", session },
        sessionToken: "session-token",
      }),
    };
    const controller = new AuthController(authService as never, config);
    const res = response();

    const body = await controller.login(
      { email: user.email, password: PASSWORD },
      request("law_trusted_device=device-token"),
      res as never,
    );

    expect(body).toEqual({ status: "AUTHENTICATED", session });
    expect(authService.login).toHaveBeenCalledWith(
      user.email,
      PASSWORD,
      "device-token",
    );
    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(res.cookie).toHaveBeenCalledWith("law_session", "session-token", {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
  });

  it.each([
    [{ status: "MFA_REQUIRED", methods: ["TOTP", "RECOVERY", "EMAIL"] }],
    [{ status: "MFA_ENROLLMENT_REQUIRED" }],
  ])("login sets law_mfa_challenge for %p", async (result) => {
    const authService = {
      login: jest.fn().mockResolvedValue({
        result,
        challengeToken: "challenge-token",
      }),
    };
    const controller = new AuthController(authService as never, config);
    const res = response();

    const body = await controller.login(
      { email: user.email, password: PASSWORD },
      request(),
      res as never,
    );

    expect(body).toEqual(result);
    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(res.cookie).toHaveBeenCalledWith(
      "law_mfa_challenge",
      "challenge-token",
      challengeOptions,
    );
  });

  it("verify clears the challenge cookie and sets law_session", async () => {
    const verification = {
      verify: jest.fn().mockResolvedValue({
        token: "session-token",
        session,
        userId: user.id,
      }),
    };
    const controller = new MfaController(
      verification as never,
      config,
      {} as never,
      {} as never,
    );
    const res = response();
    const dto = {
      method: "TOTP" as const,
      code: "123456",
      rememberDevice: false,
    };

    const body = await controller.verify(
      dto,
      request("law_session=old; law_mfa_challenge=challenge-token"),
      res as never,
    );

    expect(body).toEqual(session);
    expect(verification.verify).toHaveBeenCalledWith("challenge-token", dto, {
      userAgent: undefined,
      ipAddress: undefined,
    });
    expect(res.clearCookie).toHaveBeenCalledWith("law_mfa_challenge", {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/api/auth",
    });
    expect(res.cookie).toHaveBeenCalledWith("law_session", "session-token", {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
  });

  it("invitation acceptance sets law_session for AUTHENTICATED", async () => {
    const authService = {
      acceptInvitation: jest.fn().mockResolvedValue({
        result: { status: "AUTHENTICATED", session },
        sessionToken: "session-token",
      }),
    };
    const controller = new AuthController(authService as never, config);
    const res = response();

    const body = await controller.acceptInvitation(
      { token: "raw-invitation", password: PASSWORD },
      res as never,
    );

    expect(body).toEqual({ status: "AUTHENTICATED", session });
    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(res.cookie).toHaveBeenCalledWith(
      "law_session",
      "session-token",
      expect.objectContaining({ sameSite: "lax", path: "/" }),
    );
  });

  it("invitation acceptance under policy sets only law_mfa_challenge", async () => {
    const authService = {
      acceptInvitation: jest.fn().mockResolvedValue({
        result: { status: "MFA_ENROLLMENT_REQUIRED" },
        challengeToken: "challenge-token",
      }),
    };
    const controller = new AuthController(authService as never, config);
    const res = response();

    const body = await controller.acceptInvitation(
      { token: "raw-invitation", password: PASSWORD },
      res as never,
    );

    expect(body).toEqual({ status: "MFA_ENROLLMENT_REQUIRED" });
    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(res.cookie).toHaveBeenCalledWith(
      "law_mfa_challenge",
      "challenge-token",
      challengeOptions,
    );
  });

  it("readCookie finds a named cookie among several", () => {
    expect(
      readCookie(
        request(`law_session=abc; ${MFA_CHALLENGE_COOKIE}=def`),
        MFA_CHALLENGE_COOKIE,
      ),
    ).toBe("def");
    expect(readCookie(request("x_law_session=abc"), "law_session")).toBe(
      undefined,
    );
    expect(readCookie(request(), "law_session")).toBeUndefined();
  });
});
