import {
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { Secret, TOTP } from "otpauth";
import {
  AuthGuard,
  AuthRateLimitGuard,
  AuthSessionIssuer,
  MFA_CHALLENGE_COOKIE,
  MfaChallengeService,
  MfaController,
  MfaEnrollmentService,
  MfaSecretCipher,
  TrustedDeviceService,
  generateTotpSecret,
  hashRecoveryCode,
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

function currentCode(secret: string): string {
  return new TOTP({
    secret: Secret.fromBase32(secret),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  }).generate();
}

function wrongCode(secret: string): string {
  const good = currentCode(secret);
  // Differs from the current code and from the +-1 step codes with
  // overwhelming probability; loop until it genuinely does not verify.
  for (let i = 0; i < 1000; i += 1) {
    const candidate = String(100000 + i);
    if (candidate !== good) {
      const totp = new TOTP({
        secret: Secret.fromBase32(secret),
        algorithm: "SHA1",
        digits: 6,
        period: 30,
      });
      if (totp.validate({ token: candidate, window: 1 }) === null) {
        return candidate;
      }
    }
  }
  throw new Error("no wrong code found");
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

function createHarness(options: { key?: string | undefined } = {}) {
  const key = "key" in options ? options.key : TEST_KEY;
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    userMfa: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    mfaRecoveryCode: {
      createMany: jest.fn().mockResolvedValue({ count: 10 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
    },
    organizationSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    authToken: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue({ attempts: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    trustedDevice: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    authSession: { create: jest.fn().mockResolvedValue({}) },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const cipher = cipherWithKey(key);
  const challenges = new MfaChallengeService(prisma as never);
  const sessions = new AuthSessionIssuer(prisma as never);
  const mail = { sendMfaDisabled: jest.fn().mockResolvedValue(undefined) };
  const service = new MfaEnrollmentService(
    prisma as never,
    challenges,
    cipher,
    sessions,
    mail as never,
    new TrustedDeviceService(prisma as never),
  );
  return { prisma, cipher, service, mail };
}

function pendingMfa(cipher: MfaSecretCipher, secret: string) {
  const encrypted = cipher.encrypt(secret);
  return {
    userId: user.id,
    totpSecretCiphertext: encrypted.ciphertext,
    totpSecretIv: encrypted.iv,
    totpSecretAuthTag: encrypted.authTag,
    enabledAt: null,
    lastUsedStep: null,
  };
}

const enabledAt = new Date("2026-10-01T00:00:00Z");

const session = { kind: "session" as const, userId: user.id };
const challengeActor = { kind: "challenge" as const, token: "raw-challenge" };

const enrollmentChallengeRow = {
  id: "challenge-1",
  userId: user.id,
  scope: "ENROLLMENT",
  attempts: 0,
  createdAt: new Date(),
};

const auditTypes = (prisma: { auditEvent: { create: jest.Mock } }) =>
  prisma.auditEvent.create.mock.calls.map(
    ([arg]: [{ data: { eventType: string } }]) => arg.data.eventType,
  );

const errorCode = (error: unknown) =>
  (error as UnauthorizedException).getResponse() as {
    message: string;
    error: string;
  };

describe("MfaEnrollmentService.start", () => {
  it("via session with the wrong or missing password → 401, nothing stored", async () => {
    const { service, prisma } = createHarness();

    await expect(
      service.start(session, "wrong-password"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.start(session, undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.userMfa.create).not.toHaveBeenCalled();
    expect(prisma.userMfa.updateMany).not.toHaveBeenCalled();
  });

  it("via session with the right password creates a pending secret stored only encrypted", async () => {
    const { service, prisma, cipher } = createHarness();
    prisma.organizationSettings.findUnique.mockResolvedValue({
      displayName: "Advokatska kancelarija Petrović",
      legalName: "Petrović d.o.o.",
    });

    const result = await service.start(session, PASSWORD);

    expect(result.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(result.otpauthUrl).toContain("ana%40example.com");
    expect(result.otpauthUrl).toContain(
      encodeURIComponent("Advokatska kancelarija Petrović"),
    );
    expect(result.otpauthUrl).toContain(`secret=${result.secret}`);
    expect(result.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

    const [{ data }] = prisma.userMfa.create.mock.calls[0];
    expect(data).toMatchObject({ userId: user.id });
    expect(data.enabledAt).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain(result.secret);
    expect(
      cipher.decrypt({
        ciphertext: data.totpSecretCiphertext,
        iv: data.totpSecretIv,
        authTag: data.totpSecretAuthTag,
      }),
    ).toBe(result.secret);
    expect(JSON.stringify(prisma.auditEvent.create.mock.calls)).not.toContain(
      result.secret,
    );
  });

  it("issuer falls back to legalName, then to Law", async () => {
    const { service, prisma } = createHarness();
    prisma.organizationSettings.findUnique.mockResolvedValue({
      displayName: null,
      legalName: "Petrović d.o.o.",
    });
    const withLegal = await service.start(session, PASSWORD);
    expect(withLegal.otpauthUrl).toContain(
      encodeURIComponent("Petrović d.o.o."),
    );

    prisma.organizationSettings.findUnique.mockResolvedValue(null);
    const fallback = await service.start(session, PASSWORD);
    expect(fallback.otpauthUrl).toMatch(/otpauth:\/\/totp\/Law:/);
    expect(fallback.otpauthUrl).toContain("issuer=Law");
  });

  it("via ENROLLMENT challenge needs no password and does not use an attempt", async () => {
    const { service, prisma } = createHarness();
    prisma.authToken.findFirst.mockResolvedValue(enrollmentChallengeRow);

    const result = await service.start(challengeActor, undefined);

    expect(result.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(prisma.authToken.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        purpose: "MFA_CHALLENGE",
        scope: "ENROLLMENT",
        tokenHash: sha256("raw-challenge"),
      }),
    });
    expect(prisma.userMfa.create).toHaveBeenCalledTimes(1);
    expect(prisma.authToken.updateMany).not.toHaveBeenCalled();
  });

  it("without a valid challenge → 401 MFA_CHALLENGE_INVALID", async () => {
    const { service, prisma } = createHarness();

    const failure = await service
      .start({ kind: "challenge", token: undefined }, undefined)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnauthorizedException);
    expect(errorCode(failure).error).toBe("MFA_CHALLENGE_INVALID");
    expect(prisma.userMfa.create).not.toHaveBeenCalled();
  });

  it("when 2FA is already enabled → 409 and the secret is untouched", async () => {
    const { service, prisma, cipher } = createHarness();
    prisma.userMfa.findUnique.mockResolvedValue({
      ...pendingMfa(cipher, generateTotpSecret()),
      enabledAt,
    });

    await expect(service.start(session, PASSWORD)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.userMfa.create).not.toHaveBeenCalled();
    expect(prisma.userMfa.updateMany).not.toHaveBeenCalled();
  });

  it("a concurrent enable (unique violation on create) → 409", async () => {
    const { service, prisma } = createHarness();
    prisma.userMfa.create.mockRejectedValue({ code: "P2002" });

    await expect(service.start(session, PASSWORD)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("replaces a pending secret, only while still pending", async () => {
    const { service, prisma, cipher } = createHarness();
    const old = generateTotpSecret();
    prisma.userMfa.findUnique.mockResolvedValue(pendingMfa(cipher, old));

    const result = await service.start(session, PASSWORD);

    expect(result.secret).not.toBe(old);
    expect(prisma.userMfa.create).not.toHaveBeenCalled();
    const [{ where, data }] = prisma.userMfa.updateMany.mock.calls[0];
    expect(where).toEqual({ userId: user.id, enabledAt: null });
    expect(data.lastUsedStep).toBeNull();
    expect(JSON.stringify(data)).not.toContain(result.secret);
    expect(
      cipher.decrypt({
        ciphertext: data.totpSecretCiphertext,
        iv: data.totpSecretIv,
        authTag: data.totpSecretAuthTag,
      }),
    ).toBe(result.secret);
  });

  it("a pending secret that became enabled meanwhile → 409", async () => {
    const { service, prisma, cipher } = createHarness();
    prisma.userMfa.findUnique.mockResolvedValue(
      pendingMfa(cipher, generateTotpSecret()),
    );
    prisma.userMfa.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.start(session, PASSWORD)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("without the cipher key → 503", async () => {
    const { service, prisma } = createHarness({ key: undefined });

    await expect(service.start(session, PASSWORD)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.userMfa.create).not.toHaveBeenCalled();
  });
});

describe("MfaEnrollmentService.confirm", () => {
  it("valid code via session enables 2FA, stores 10 hashed recovery codes, returns plaintext once and audits", async () => {
    const { service, prisma, cipher } = createHarness();
    const secret = generateTotpSecret();
    const pending = pendingMfa(cipher, secret);
    prisma.userMfa.findUnique.mockResolvedValue(pending);

    const result = await service.confirm(session, currentCode(secret));

    expect(result.recoveryCodes).toHaveLength(10);
    expect(result.session).toBeUndefined();
    expect(result.sessionToken).toBeUndefined();
    const [{ where, data }] = prisma.userMfa.updateMany.mock.calls[0];
    expect(where).toEqual({
      userId: user.id,
      enabledAt: null,
      totpSecretCiphertext: pending.totpSecretCiphertext,
    });
    expect(data.enabledAt).toBeInstanceOf(Date);
    // The enrollment code itself can not be replayed at the next login.
    expect(typeof data.lastUsedStep).toBe("bigint");
    expect(prisma.mfaRecoveryCode.deleteMany).toHaveBeenCalledWith({
      where: { userId: user.id },
    });
    const [{ data: stored }] = prisma.mfaRecoveryCode.createMany.mock.calls[0];
    expect(stored).toHaveLength(10);
    expect(
      stored.map((row: { codeHash: string }) => row.codeHash).sort(),
    ).toEqual(result.recoveryCodes.map(hashRecoveryCode).sort());
    expect(JSON.stringify(stored)).not.toContain(result.recoveryCodes[0]);
    expect(auditTypes(prisma)).toEqual(["MFA_ENROLLED"]);
    const [{ data: audit }] = prisma.auditEvent.create.mock.calls[0];
    expect(audit).toMatchObject({ outcome: "SUCCESS", userId: user.id });
    const serialised = JSON.stringify(audit);
    expect(serialised).not.toContain(secret);
    expect(serialised).not.toContain(result.recoveryCodes[0]);
    expect(serialised).not.toContain(user.email);
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it("via ENROLLMENT challenge also issues a session and consumes the challenge", async () => {
    const { service, prisma, cipher } = createHarness();
    const secret = generateTotpSecret();
    prisma.userMfa.findUnique.mockResolvedValue(pendingMfa(cipher, secret));
    prisma.authToken.findFirst.mockResolvedValue(enrollmentChallengeRow);

    const result = await service.confirm(challengeActor, currentCode(secret));

    expect(result.recoveryCodes).toHaveLength(10);
    expect(result.session?.user.id).toBe(user.id);
    expect(result.sessionToken).toEqual(expect.any(String));
    expect(prisma.authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: user.id,
        refreshTokenHash: sha256(result.sessionToken as string),
      }),
    });
    // One reserved attempt, then the single-use consume.
    const updates = prisma.authToken.updateMany.mock.calls.map(
      ([arg]: [{ data: unknown }]) => arg.data,
    );
    expect(updates).toContainEqual({ attempts: { increment: 1 } });
    expect(updates).toContainEqual({ consumedAt: expect.any(Date) });
    expect(auditTypes(prisma)).toEqual(["MFA_ENROLLED", "LOGIN"]);
  });

  it("wrong code via session → 401 MFA_CODE_INVALID and stays pending", async () => {
    const { service, prisma, cipher } = createHarness();
    const secret = generateTotpSecret();
    prisma.userMfa.findUnique.mockResolvedValue(pendingMfa(cipher, secret));

    const failure = await service
      .confirm(session, wrongCode(secret))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnauthorizedException);
    expect(errorCode(failure).error).toBe("MFA_CODE_INVALID");
    expect(prisma.userMfa.updateMany).not.toHaveBeenCalled();
    expect(prisma.mfaRecoveryCode.createMany).not.toHaveBeenCalled();
    expect(auditTypes(prisma)).not.toContain("MFA_ENROLLED");
  });

  it("wrong code via challenge reserves an attempt and creates no session", async () => {
    const { service, prisma, cipher } = createHarness();
    const secret = generateTotpSecret();
    prisma.userMfa.findUnique.mockResolvedValue(pendingMfa(cipher, secret));
    prisma.authToken.findFirst.mockResolvedValue(enrollmentChallengeRow);
    prisma.authToken.findUnique.mockResolvedValue({ attempts: 2 });

    const failure = await service
      .confirm(challengeActor, wrongCode(secret))
      .catch((error: unknown) => error);

    expect(errorCode(failure).error).toBe("MFA_CODE_INVALID");
    expect(prisma.authToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } }),
    );
    expect(prisma.userMfa.updateMany).not.toHaveBeenCalled();
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it("the attempt that uses up the limit expires the challenge", async () => {
    const { service, prisma, cipher } = createHarness();
    const secret = generateTotpSecret();
    prisma.userMfa.findUnique.mockResolvedValue(pendingMfa(cipher, secret));
    prisma.authToken.findFirst.mockResolvedValue(enrollmentChallengeRow);
    prisma.authToken.findUnique.mockResolvedValue({ attempts: 5 });

    const failure = await service
      .confirm(challengeActor, wrongCode(secret))
      .catch((error: unknown) => error);

    expect(errorCode(failure).error).toBe("MFA_CHALLENGE_INVALID");
    expect(auditTypes(prisma)).toContain("MFA_CHALLENGE_LOCKED");
  });

  it("an exhausted challenge is rejected before any code is evaluated", async () => {
    const { service, prisma, cipher } = createHarness();
    const secret = generateTotpSecret();
    prisma.userMfa.findUnique.mockResolvedValue(pendingMfa(cipher, secret));
    prisma.authToken.findFirst.mockResolvedValue(enrollmentChallengeRow);
    prisma.authToken.updateMany.mockResolvedValue({ count: 0 });

    const failure = await service
      .confirm(challengeActor, currentCode(secret))
      .catch((error: unknown) => error);

    expect(errorCode(failure).error).toBe("MFA_CHALLENGE_INVALID");
    expect(prisma.userMfa.updateMany).not.toHaveBeenCalled();
  });

  it("without a pending enrollment → 400; already enabled → 409", async () => {
    const { service, prisma, cipher } = createHarness();

    await expect(service.confirm(session, "123456")).rejects.toMatchObject({
      status: 400,
    });

    prisma.userMfa.findUnique.mockResolvedValue({
      ...pendingMfa(cipher, generateTotpSecret()),
      enabledAt,
    });
    await expect(service.confirm(session, "123456")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("losing the enable race (secret replaced meanwhile) → 409 with no codes stored", async () => {
    const { service, prisma, cipher } = createHarness();
    const secret = generateTotpSecret();
    prisma.userMfa.findUnique.mockResolvedValue(pendingMfa(cipher, secret));
    prisma.userMfa.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.confirm(session, currentCode(secret)),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.mfaRecoveryCode.createMany).not.toHaveBeenCalled();
    expect(auditTypes(prisma)).not.toContain("MFA_ENROLLED");
  });
});

describe("MfaEnrollmentService.disable", () => {
  it("requires the password", async () => {
    const { service, prisma, cipher } = createHarness();
    prisma.userMfa.findUnique.mockResolvedValue({
      ...pendingMfa(cipher, generateTotpSecret()),
      enabledAt,
    });

    await expect(service.disable(user.id, "wrong")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.userMfa.deleteMany).not.toHaveBeenCalled();
    expect(prisma.mfaRecoveryCode.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes the factor and recovery codes, sends the notice and audits", async () => {
    const { service, prisma, cipher, mail } = createHarness();
    prisma.userMfa.findUnique.mockResolvedValue({
      ...pendingMfa(cipher, generateTotpSecret()),
      enabledAt,
    });

    await service.disable(user.id, PASSWORD);

    expect(prisma.userMfa.deleteMany).toHaveBeenCalledWith({
      where: { userId: user.id },
    });
    expect(prisma.mfaRecoveryCode.deleteMany).toHaveBeenCalledWith({
      where: { userId: user.id },
    });
    expect(mail.sendMfaDisabled).toHaveBeenCalledWith(
      { id: user.id, email: user.email },
      expect.any(Date),
    );
    expect(auditTypes(prisma)).toEqual(["MFA_DISABLED"]);
    const [{ data }] = prisma.auditEvent.create.mock.calls[0];
    expect(data).toMatchObject({ outcome: "SUCCESS", userId: user.id });
    expect(JSON.stringify(data)).not.toContain(user.email);
  });

  it("is 409 while the office policy requires 2FA", async () => {
    const { service, prisma, cipher, mail } = createHarness();
    prisma.userMfa.findUnique.mockResolvedValue({
      ...pendingMfa(cipher, generateTotpSecret()),
      enabledAt,
    });
    prisma.organizationSettings.findUnique.mockResolvedValue({
      mfaRequired: true,
    });

    await expect(service.disable(user.id, PASSWORD)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.organizationSettings.findUnique).toHaveBeenCalledWith({
      where: { workspaceId: HARDCODED_WORKSPACE_ID },
      select: { mfaRequired: true },
    });
    expect(prisma.userMfa.deleteMany).not.toHaveBeenCalled();
    expect(mail.sendMfaDisabled).not.toHaveBeenCalled();
  });

  it("is 409 when 2FA is not enabled", async () => {
    const { service, prisma, cipher } = createHarness();
    prisma.userMfa.findUnique.mockResolvedValue(
      pendingMfa(cipher, generateTotpSecret()),
    );

    await expect(service.disable(user.id, PASSWORD)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.userMfa.deleteMany).not.toHaveBeenCalled();
  });
});

describe("MfaEnrollmentService.regenerateRecoveryCodes", () => {
  it("requires the password and an enabled factor", async () => {
    const { service, prisma, cipher } = createHarness();
    prisma.userMfa.findUnique.mockResolvedValue({
      ...pendingMfa(cipher, generateTotpSecret()),
      enabledAt,
    });

    await expect(
      service.regenerateRecoveryCodes(user.id, "wrong"),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    prisma.userMfa.findUnique.mockResolvedValue(null);
    await expect(
      service.regenerateRecoveryCodes(user.id, PASSWORD),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.mfaRecoveryCode.createMany).not.toHaveBeenCalled();
  });

  it("replaces the set and audits", async () => {
    const { service, prisma, cipher } = createHarness();
    prisma.userMfa.findUnique.mockResolvedValue({
      ...pendingMfa(cipher, generateTotpSecret()),
      enabledAt,
    });

    const result = await service.regenerateRecoveryCodes(user.id, PASSWORD);

    expect(result.recoveryCodes).toHaveLength(10);
    expect(prisma.mfaRecoveryCode.deleteMany).toHaveBeenCalledWith({
      where: { userId: user.id },
    });
    const [{ data: stored }] = prisma.mfaRecoveryCode.createMany.mock.calls[0];
    expect(
      stored.map((row: { codeHash: string }) => row.codeHash).sort(),
    ).toEqual(result.recoveryCodes.map(hashRecoveryCode).sort());
    expect(auditTypes(prisma)).toEqual(["MFA_RECOVERY_CODES_REGENERATED"]);
    expect(JSON.stringify(prisma.auditEvent.create.mock.calls)).not.toContain(
      result.recoveryCodes[0],
    );
  });
});

describe("MfaEnrollmentService.status", () => {
  it("counts unconsumed recovery codes and reports the policy", async () => {
    const { service, prisma, cipher } = createHarness();
    prisma.userMfa.findUnique.mockResolvedValue({
      ...pendingMfa(cipher, generateTotpSecret()),
      enabledAt,
    });
    prisma.mfaRecoveryCode.count.mockResolvedValue(7);
    prisma.organizationSettings.findUnique.mockResolvedValue({
      mfaRequired: true,
    });

    const status = await service.status(user.id);

    expect(prisma.mfaRecoveryCode.count).toHaveBeenCalledWith({
      where: { userId: user.id, consumedAt: null },
    });
    expect(status).toEqual({
      enabled: true,
      enabledAt: enabledAt.toISOString(),
      recoveryCodesRemaining: 7,
      policyRequired: true,
      trustedDevices: [],
    });
    expect(JSON.stringify(status)).not.toContain("totpSecret");
  });

  it("a pending or missing factor is not enabled", async () => {
    const { service, prisma, cipher } = createHarness();

    expect(await service.status(user.id)).toEqual({
      enabled: false,
      enabledAt: null,
      recoveryCodesRemaining: 0,
      policyRequired: false,
      trustedDevices: [],
    });

    prisma.userMfa.findUnique.mockResolvedValue(
      pendingMfa(cipher, generateTotpSecret()),
    );
    prisma.mfaRecoveryCode.count.mockResolvedValue(3);
    const pending = await service.status(user.id);
    expect(pending.enabled).toBe(false);
    expect(pending.recoveryCodesRemaining).toBe(0);
  });
});

describe("MfaController enrollment routes", () => {
  const config = { production: true } as never;
  const sessionBody = {
    user: { id: user.id, email: user.email, status: "ACTIVE" },
    memberships: [],
  };

  const request = (cookie?: string) =>
    ({ headers: cookie ? { cookie } : {} }) as never;
  const response = () => ({ cookie: jest.fn(), clearCookie: jest.fn() });

  function controllerWith(
    enrollment: Record<string, jest.Mock>,
    currentUser: jest.Mock = jest.fn(),
  ) {
    return new MfaController(
      {} as never,
      config,
      enrollment as never,
      { currentUser } as never,
    );
  }

  it("start: session cookie wins over the challenge cookie", async () => {
    const enrollment = {
      start: jest.fn().mockResolvedValue({ secret: "S" }),
    };
    const currentUser = jest.fn().mockResolvedValue(sessionBody);
    const controller = controllerWith(enrollment, currentUser);

    await controller.start(
      { currentPassword: PASSWORD },
      request(`law_session=tok; ${MFA_CHALLENGE_COOKIE}=chal`),
    );

    expect(currentUser).toHaveBeenCalledWith("tok");
    expect(enrollment.start).toHaveBeenCalledWith(
      { kind: "session", userId: user.id },
      PASSWORD,
    );
  });

  it("start: falls back to the challenge cookie when there is no session", async () => {
    const enrollment = {
      start: jest.fn().mockResolvedValue({ secret: "S" }),
    };
    const controller = controllerWith(enrollment);

    await controller.start({}, request(`${MFA_CHALLENGE_COOKIE}=chal`));

    expect(enrollment.start).toHaveBeenCalledWith(
      { kind: "challenge", token: "chal" },
      undefined,
    );
  });

  it("start: a stale session cookie falls back to the challenge cookie", async () => {
    const enrollment = {
      start: jest.fn().mockResolvedValue({ secret: "S" }),
    };
    const currentUser = jest
      .fn()
      .mockRejectedValue(new UnauthorizedException("Authentication required"));
    const controller = controllerWith(enrollment, currentUser);

    await controller.start(
      {},
      request(`law_session=stale; ${MFA_CHALLENGE_COOKIE}=chal`),
    );

    expect(enrollment.start).toHaveBeenCalledWith(
      { kind: "challenge", token: "chal" },
      undefined,
    );
  });

  it("start: no session and no challenge → 401", async () => {
    const controller = controllerWith({ start: jest.fn() });

    await expect(controller.start({}, request())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("confirm via challenge sets law_session, clears the challenge cookie, returns the session", async () => {
    const enrollment = {
      confirm: jest.fn().mockResolvedValue({
        recoveryCodes: ["aaaa-bbbb"],
        session: sessionBody,
        sessionToken: "session-token",
      }),
    };
    const controller = controllerWith(enrollment);
    const res = response();

    const body = await controller.confirm(
      { code: "123456" },
      request(`${MFA_CHALLENGE_COOKIE}=chal`),
      res as never,
    );

    expect(body).toEqual({
      recoveryCodes: ["aaaa-bbbb"],
      session: sessionBody,
    });
    expect(JSON.stringify(body)).not.toContain("session-token");
    expect(res.clearCookie).toHaveBeenCalledWith(MFA_CHALLENGE_COOKIE, {
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

  it("confirm via session sets no cookies", async () => {
    const enrollment = {
      confirm: jest.fn().mockResolvedValue({ recoveryCodes: ["aaaa-bbbb"] }),
    };
    const currentUser = jest.fn().mockResolvedValue(sessionBody);
    const controller = controllerWith(enrollment, currentUser);
    const res = response();

    const body = await controller.confirm(
      { code: "123456" },
      request("law_session=tok"),
      res as never,
    );

    expect(body).toEqual({ recoveryCodes: ["aaaa-bbbb"] });
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});

describe("MfaController guard metadata", () => {
  const guardsOf = (method: keyof MfaController) =>
    Reflect.getMetadata(
      "__guards__",
      MfaController.prototype[method] as object,
    ) as unknown[];

  it.each(["start", "confirm", "disable", "regenerateRecoveryCodes"] as const)(
    "%s is rate limited",
    (method) => {
      expect(guardsOf(method)).toContain(AuthRateLimitGuard);
    },
  );

  it.each(["disable", "regenerateRecoveryCodes", "status"] as const)(
    "%s requires a session",
    (method) => {
      expect(guardsOf(method)).toContain(AuthGuard);
    },
  );
});
