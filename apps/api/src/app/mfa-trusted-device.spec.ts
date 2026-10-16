import {
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { Secret, TOTP } from "otpauth";
import {
  AuthController,
  AuthRateLimitGuard,
  AuthGuard,
  AuthService,
  AuthSessionIssuer,
  MfaChallengeService,
  MfaController,
  MfaEnrollmentService,
  MfaSecretCipher,
  MfaVerificationService,
  TrustedDeviceService,
  generateTotpSecret,
} from "@law/auth";

const PASSWORD = "CorrectHorse123!";
const TEST_KEY = "test-mfa-encryption-key-0123456789abcdef";
const DAY_MS = 24 * 60 * 60 * 1000;

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

const user = {
  id: "user-1",
  email: "ana@example.com",
  status: "ACTIVE",
  passwordHash: passwordHash(PASSWORD),
  memberships: [],
};

type Row = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
};

type Where = Record<string, unknown>;

function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = (row as Record<string, unknown>)[key];
    if (key === "expiresAt") {
      return actual instanceof Date && actual > (expected as { gt: Date }).gt;
    }
    return actual === expected;
  });
}

/** In-memory `trustedDevice` table that really evaluates the where clause. */
function fakeDeviceTable() {
  const rows: Row[] = [];
  const table = {
    rows,
    create: jest.fn(async ({ data }: { data: Partial<Row> }) => {
      const row: Row = {
        id: `device-${rows.length + 1}`,
        revokedAt: null,
        lastUsedAt: null,
        userAgent: null,
        ipAddress: null,
        createdAt: new Date(Date.now() + rows.length),
        ...data,
      } as Row;
      rows.push(row);
      return row;
    }),
    updateMany: jest.fn(
      async ({ where, data }: { where: Where; data: Partial<Row> }) => {
        const hit = rows.filter((row) => matches(row, where));
        hit.forEach((row) => Object.assign(row, data));
        return { count: hit.length };
      },
    ),
    findMany: jest.fn(async ({ where }: { where: Where }) =>
      rows.filter((row) => matches(row, where)).reverse(),
    ),
    findFirst: jest.fn(
      async ({ where }: { where: Where }) =>
        rows.find((row) => matches(row, where)) ?? null,
    ),
  };
  return table;
}

function addDevice(
  table: ReturnType<typeof fakeDeviceTable>,
  raw: string,
  overrides: Partial<Row> = {},
): Row {
  const row: Row = {
    id: `device-${table.rows.length + 1}`,
    userId: user.id,
    tokenHash: sha256(raw),
    expiresAt: new Date(Date.now() + DAY_MS),
    revokedAt: null,
    lastUsedAt: null,
    userAgent: "Firefox",
    ipAddress: "10.0.0.1",
    createdAt: new Date(),
    ...overrides,
  };
  table.rows.push(row);
  return row;
}

describe("TrustedDeviceService", () => {
  function setup() {
    const table = fakeDeviceTable();
    const service = new TrustedDeviceService({ trustedDevice: table } as never);
    return { table, service };
  }

  it("create stores only the token hash, expires in 30 days, truncates the user agent", async () => {
    const { table, service } = setup();
    const before = Date.now();

    const token = await service.create(user.id, {
      userAgent: "x".repeat(600),
      ipAddress: "203.0.113.9",
    });

    expect(token.length).toBeGreaterThanOrEqual(43);
    const [row] = table.rows;
    expect(row.tokenHash).toBe(sha256(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.userId).toBe(user.id);
    expect(row.userAgent).toHaveLength(512);
    expect(row.ipAddress).toBe("203.0.113.9");
    const ttl = row.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(30 * DAY_MS - 1000);
    expect(ttl).toBeLessThanOrEqual(30 * DAY_MS + 5000);
    expect(await service.create(user.id, {})).not.toBe(token);
  });

  it("validFor accepts the user's live device and updates lastUsedAt", async () => {
    const { table, service } = setup();
    const row = addDevice(table, "raw-1");

    await expect(service.validFor(user.id, "raw-1")).resolves.toBe(true);
    expect(row.lastUsedAt).toBeInstanceOf(Date);
  });

  it("validFor compares the user in the query: another user's device is ignored", async () => {
    const { table, service } = setup();
    const row = addDevice(table, "raw-1", { userId: "user-2" });

    await expect(service.validFor(user.id, "raw-1")).resolves.toBe(false);
    expect(row.lastUsedAt).toBeNull();
    expect(table.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: user.id,
          tokenHash: sha256("raw-1"),
        }),
      }),
    );
  });

  it.each([
    ["expired", { expiresAt: new Date(Date.now() - 1000) }],
    ["revoked", { revokedAt: new Date() }],
  ])("validFor rejects an %s device", async (_label, overrides) => {
    const { table, service } = setup();
    addDevice(table, "raw-1", overrides);

    await expect(service.validFor(user.id, "raw-1")).resolves.toBe(false);
  });

  it("validFor rejects a missing, empty or unknown token without a query for missing", async () => {
    const { table, service } = setup();
    addDevice(table, "raw-1");

    await expect(service.validFor(user.id, undefined)).resolves.toBe(false);
    await expect(service.validFor(user.id, "")).resolves.toBe(false);
    expect(table.updateMany).not.toHaveBeenCalled();
    await expect(service.validFor(user.id, "other")).resolves.toBe(false);
  });

  it("revokeAll revokes only the user's live devices, through the supplied client", async () => {
    const { table, service } = setup();
    const mine = addDevice(table, "raw-1");
    const theirs = addDevice(table, "raw-2", { userId: "user-2" });
    const other = fakeDeviceTable();
    const tx = { trustedDevice: other };
    addDevice(other, "raw-3");

    await service.revokeAll(user.id, tx as never);

    expect(table.updateMany).not.toHaveBeenCalled();
    expect(other.rows[0].revokedAt).toBeInstanceOf(Date);
    await service.revokeAll(user.id);
    expect(mine.revokedAt).toBeInstanceOf(Date);
    expect(theirs.revokedAt).toBeNull();
  });

  it("revoke removes one device of the user and 404s for anyone else's", async () => {
    const { table, service } = setup();
    const mine = addDevice(table, "raw-1");
    const theirs = addDevice(table, "raw-2", { userId: "user-2" });

    await expect(service.revoke(user.id, theirs.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(theirs.revokedAt).toBeNull();
    await expect(service.revoke(user.id, "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );

    await service.revoke(user.id, mine.id);
    expect(mine.revokedAt).toBeInstanceOf(Date);
    await expect(service.revoke(user.id, mine.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("list returns live devices with the current flag and no token material", async () => {
    const { table, service } = setup();
    const first = addDevice(table, "raw-1", { userAgent: "Firefox" });
    const second = addDevice(table, "raw-2", { userAgent: "Chrome" });
    addDevice(table, "raw-3", { revokedAt: new Date() });
    addDevice(table, "raw-4", { expiresAt: new Date(Date.now() - 1000) });
    addDevice(table, "raw-5", { userId: "user-2" });

    const devices = await service.list(user.id, "raw-1");

    expect(devices.map((d) => [d.id, d.current])).toEqual([
      [second.id, false],
      [first.id, true],
    ]);
    expect(devices[0]).toEqual({
      id: second.id,
      userAgent: "Chrome",
      createdAt: second.createdAt.toISOString(),
      lastUsedAt: null,
      expiresAt: second.expiresAt.toISOString(),
      current: false,
    });
    expect(JSON.stringify(devices)).not.toContain(sha256("raw-1"));
    const none = await service.list(user.id, undefined);
    expect(none.every((d) => !d.current)).toBe(true);
  });
});

describe("login with a trusted device", () => {
  function setup(options: { key?: string | undefined; policy?: boolean } = {}) {
    const key = "key" in options ? options.key : TEST_KEY;
    const table = fakeDeviceTable();
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      userMfa: {
        findUnique: jest.fn().mockResolvedValue({ enabledAt: new Date() }),
      },
      organizationSettings: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ mfaRequired: options.policy ?? false }),
      },
      authToken: { create: jest.fn().mockResolvedValue({}) },
      authSession: { create: jest.fn().mockResolvedValue({}) },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
      trustedDevice: table,
    };
    const trusted = new TrustedDeviceService(prisma as never);
    const service = new AuthService(
      prisma as never,
      {} as never,
      { hit: jest.fn().mockResolvedValue(1) } as never,
      new AuthSessionIssuer(prisma as never),
      new MfaChallengeService(prisma as never),
      cipherWithKey(key),
      trusted,
    );
    return { prisma, table, service };
  }

  it("a valid device of the same user skips the challenge", async () => {
    const { service, table, prisma } = setup();
    addDevice(table, "raw-1");

    const step = await service.login(user.email, PASSWORD, "raw-1");

    expect(step.result.status).toBe("AUTHENTICATED");
    expect(step.sessionToken).toEqual(expect.any(String));
    expect(step.challengeToken).toBeUndefined();
    expect(prisma.authToken.create).not.toHaveBeenCalled();
    expect(prisma.authSession.create).toHaveBeenCalledTimes(1);
  });

  it("another user's device token still gets MFA_REQUIRED", async () => {
    const { service, table, prisma } = setup();
    addDevice(table, "raw-1", { userId: "user-2" });

    const step = await service.login(user.email, PASSWORD, "raw-1");

    expect(step.result.status).toBe("MFA_REQUIRED");
    expect(step.sessionToken).toBeUndefined();
    expect(step.challengeToken).toEqual(expect.any(String));
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it.each([
    ["expired", { expiresAt: new Date(Date.now() - 1000) }],
    ["revoked", { revokedAt: new Date() }],
  ])("an %s device gets the challenge", async (_label, overrides) => {
    const { service, table } = setup();
    addDevice(table, "raw-1", overrides);

    const step = await service.login(user.email, PASSWORD, "raw-1");

    expect(step.result.status).toBe("MFA_REQUIRED");
  });

  it("no cookie, unknown token: challenge", async () => {
    const { service, table } = setup();
    addDevice(table, "raw-1");

    expect((await service.login(user.email, PASSWORD)).result.status).toBe(
      "MFA_REQUIRED",
    );
    expect(
      (await service.login(user.email, PASSWORD, "nope")).result.status,
    ).toBe("MFA_REQUIRED");
  });

  it("a wrong password never reaches the device check", async () => {
    const { service, table } = setup();
    addDevice(table, "raw-1");

    await expect(
      service.login(user.email, "wrong", "raw-1"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(table.updateMany).not.toHaveBeenCalled();
  });

  it("a device never bypasses enrollment for a user without 2FA under policy", async () => {
    const { service, table, prisma } = setup({ policy: true });
    prisma.userMfa.findUnique.mockResolvedValue(null);
    addDevice(table, "raw-1");

    const step = await service.login(user.email, PASSWORD, "raw-1");

    expect(step.result.status).toBe("MFA_ENROLLMENT_REQUIRED");
    expect(step.sessionToken).toBeUndefined();
  });

  it("still fails closed when the cipher is unavailable", async () => {
    const { service, table } = setup({ key: undefined });
    addDevice(table, "raw-1");

    await expect(
      service.login(user.email, PASSWORD, "raw-1"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe("verify with rememberDevice", () => {
  const secret = generateTotpSecret();

  function setup() {
    const cipher = cipherWithKey(TEST_KEY);
    const encrypted = cipher.encrypt(secret);
    const table = fakeDeviceTable();
    const prisma = {
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
      mfaRecoveryCode: {},
      authToken: {
        findFirst: jest.fn().mockResolvedValue({
          id: "challenge-1",
          userId: user.id,
          scope: "LOGIN",
          attempts: 0,
          createdAt: new Date(),
        }),
        findUnique: jest.fn().mockResolvedValue({ attempts: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      authSession: { create: jest.fn().mockResolvedValue({}) },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
      trustedDevice: table,
    };
    const service = new MfaVerificationService(
      prisma as never,
      new MfaChallengeService(prisma as never),
      cipher,
      new AuthSessionIssuer(prisma as never),
      new TrustedDeviceService(prisma as never),
      { sendMfaEmailCode: jest.fn() } as never,
      { hit: jest.fn().mockResolvedValue(1) } as never,
    );
    return { prisma, table, service };
  }

  it("creates a device after a successful challenge and returns its token", async () => {
    const { service, table, prisma } = setup();

    const result = await service.verify(
      "challenge-token",
      { method: "TOTP", code: currentCode(secret), rememberDevice: true },
      { userAgent: "Firefox/130", ipAddress: "203.0.113.9" },
    );

    expect(result.trustedDeviceToken).toEqual(expect.any(String));
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]).toMatchObject({
      userId: user.id,
      tokenHash: sha256(result.trustedDeviceToken as string),
      userAgent: "Firefox/130",
      ipAddress: "203.0.113.9",
    });
    expect(JSON.stringify(prisma.auditEvent.create.mock.calls)).not.toContain(
      result.trustedDeviceToken,
    );
  });

  it("creates nothing when rememberDevice is false", async () => {
    const { service, table } = setup();

    const result = await service.verify("challenge-token", {
      method: "TOTP",
      code: currentCode(secret),
      rememberDevice: false,
    });

    expect(result.trustedDeviceToken).toBeUndefined();
    expect(table.rows).toHaveLength(0);
  });

  it("creates nothing when the code is wrong", async () => {
    const { service, table } = setup();

    await expect(
      service.verify("challenge-token", {
        method: "TOTP",
        code: "000000",
        rememberDevice: true,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(table.rows).toHaveLength(0);
  });

  it("a failure to store the device does not undo the login", async () => {
    const { service, table } = setup();
    table.create.mockRejectedValueOnce(new Error("db hiccup"));

    const result = await service.verify("challenge-token", {
      method: "TOTP",
      code: currentCode(secret),
      rememberDevice: true,
    });

    expect(result.token).toEqual(expect.any(String));
    expect(result.trustedDeviceToken).toBeUndefined();
  });
});

describe("revocation rules", () => {
  /** Transaction client is distinct from the base client to prove placement. */
  function setupAuth() {
    const trusted = { revokeAll: jest.fn().mockResolvedValue(undefined) };
    const tx = {
      authToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
      authSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      authToken: { findFirst: jest.fn() },
      authSession: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (arg: unknown) => {
        expect(typeof arg).toBe("function");
        return (arg as (client: unknown) => unknown)(tx);
      }),
    };
    const mail = {
      sendPasswordChanged: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AuthService(
      prisma as never,
      mail as never,
      { hit: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      trusted as never,
    );
    return { service, prisma, tx, trusted, mail };
  }

  it("password reset revokes all trusted devices inside its transaction", async () => {
    const { service, prisma, tx, trusted } = setupAuth();
    prisma.authToken.findFirst.mockResolvedValue({
      id: "token-1",
      userId: user.id,
      user: { id: user.id, email: user.email },
    });

    await service.resetPassword("raw-reset", "NewPassword123!");

    expect(trusted.revokeAll).toHaveBeenCalledWith(user.id, tx);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("a failed reset claim revokes nothing", async () => {
    const { service, prisma, tx, trusted } = setupAuth();
    prisma.authToken.findFirst.mockResolvedValue({
      id: "token-1",
      userId: user.id,
      user: { id: user.id, email: user.email },
    });
    tx.authToken.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.resetPassword("raw-reset", "NewPassword123!"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(trusted.revokeAll).not.toHaveBeenCalled();
  });

  it("password change revokes all trusted devices inside its transaction", async () => {
    const { service, prisma, tx, trusted } = setupAuth();
    prisma.authSession.findFirst.mockResolvedValue({
      id: "session-current",
      user: { ...user, memberships: [] },
    });

    await service.changePassword("session-token", PASSWORD, "NewPassword123!");

    expect(trusted.revokeAll).toHaveBeenCalledWith(user.id, tx);
    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(tx.authSession.updateMany).toHaveBeenCalledTimes(1);
  });

  it("a wrong current password revokes nothing", async () => {
    const { service, prisma, trusted } = setupAuth();
    prisma.authSession.findFirst.mockResolvedValue({
      id: "session-current",
      user: { ...user, memberships: [] },
    });

    await expect(
      service.changePassword("session-token", "wrong", "NewPassword123!"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(trusted.revokeAll).not.toHaveBeenCalled();
  });
});

describe("MfaEnrollmentService trusted devices", () => {
  function setup() {
    const table = fakeDeviceTable();
    const tx = {
      mfaRecoveryCode: { deleteMany: jest.fn().mockResolvedValue({}) },
      userMfa: { deleteMany: jest.fn().mockResolvedValue({}) },
      trustedDevice: table,
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      userMfa: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ enabledAt: new Date("2026-10-01T00:00:00Z") }),
      },
      mfaRecoveryCode: { count: jest.fn().mockResolvedValue(4) },
      organizationSettings: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
      trustedDevice: table,
    };
    const mail = { sendMfaDisabled: jest.fn().mockResolvedValue(undefined) };
    const trusted = new TrustedDeviceService(prisma as never);
    const revokeAll = jest.spyOn(trusted, "revokeAll");
    const service = new MfaEnrollmentService(
      prisma as never,
      new MfaChallengeService(prisma as never),
      cipherWithKey(TEST_KEY),
      new AuthSessionIssuer(prisma as never),
      mail as never,
      trusted,
    );
    return { prisma, table, tx, service, revokeAll };
  }

  it("disable revokes all trusted devices inside its transaction", async () => {
    const { service, table, tx, revokeAll } = setup();
    const mine = addDevice(table, "raw-1");

    await service.disable(user.id, PASSWORD);

    expect(revokeAll).toHaveBeenCalledWith(user.id, tx);
    expect(mine.revokedAt).toBeInstanceOf(Date);
  });

  it("disable with a wrong password revokes nothing", async () => {
    const { service, table, revokeAll } = setup();
    addDevice(table, "raw-1");

    await expect(service.disable(user.id, "wrong")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(revokeAll).not.toHaveBeenCalled();
  });

  it("status lists live devices with the current flag", async () => {
    const { service, table } = setup();
    const first = addDevice(table, "raw-1");
    addDevice(table, "raw-2", { revokedAt: new Date() });

    const status = await service.status(user.id, "raw-1");

    expect(status.trustedDevices).toEqual([
      expect.objectContaining({ id: first.id, current: true }),
    ]);
    expect((await service.status(user.id)).trustedDevices[0].current).toBe(
      false,
    );
  });

  it("revoking one requires the current password", async () => {
    const { service, table } = setup();
    const mine = addDevice(table, "raw-1");

    await expect(
      service.revokeTrustedDevice(user.id, "wrong", mine.id, undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mine.revokedAt).toBeNull();
  });

  it("revoking one only touches the user's device and audits without secrets", async () => {
    const { service, table, prisma } = setup();
    const mine = addDevice(table, "raw-1");
    const theirs = addDevice(table, "raw-2", { userId: "user-2" });

    await expect(
      service.revokeTrustedDevice(user.id, PASSWORD, theirs.id, undefined),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(theirs.revokedAt).toBeNull();

    const result = await service.revokeTrustedDevice(
      user.id,
      PASSWORD,
      mine.id,
      "raw-other",
    );

    expect(result).toEqual({ revokedCurrent: false });
    expect(mine.revokedAt).toBeInstanceOf(Date);
    const audits = prisma.auditEvent.create.mock.calls.map(([a]) => a.data);
    expect(audits).toEqual([
      expect.objectContaining({
        eventType: "TRUSTED_DEVICE_REVOKED",
        outcome: "SUCCESS",
        userId: user.id,
      }),
    ]);
    expect(JSON.stringify(audits)).not.toContain("raw-1");
    expect(JSON.stringify(audits)).not.toContain(user.email);
  });

  it("revoking the current device reports it", async () => {
    const { service, table } = setup();
    const mine = addDevice(table, "raw-1");

    await expect(
      service.revokeTrustedDevice(user.id, PASSWORD, mine.id, "raw-1"),
    ).resolves.toEqual({ revokedCurrent: true });
  });

  it("revoking all requires the password and audits", async () => {
    const { service, table, prisma } = setup();
    const one = addDevice(table, "raw-1");
    const two = addDevice(table, "raw-2");

    await expect(
      service.revokeAllTrustedDevices(user.id, "wrong"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(one.revokedAt).toBeNull();

    await service.revokeAllTrustedDevices(user.id, PASSWORD);

    expect(one.revokedAt).toBeInstanceOf(Date);
    expect(two.revokedAt).toBeInstanceOf(Date);
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "TRUSTED_DEVICE_REVOKED",
        userId: user.id,
      }),
    });
  });
});

describe("controllers and trusted-device cookie", () => {
  const config = { production: true } as never;
  const session = { user: { id: user.id, email: user.email }, memberships: [] };
  const response = () => ({ cookie: jest.fn(), clearCookie: jest.fn() });
  const request = (cookie?: string, extra: object = {}) =>
    ({ headers: cookie ? { cookie } : {}, ...extra }) as never;
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/api/auth",
  };

  it("verify sets the trusted-device cookie (Lax, /api/auth, 30 d) and passes request meta", async () => {
    const verification = {
      verify: jest.fn().mockResolvedValue({
        token: "session-token",
        session,
        userId: user.id,
        trustedDeviceToken: "device-token",
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
      rememberDevice: true,
    };

    await controller.verify(
      dto,
      request("law_mfa_challenge=chal", {
        headers: { cookie: "law_mfa_challenge=chal", "user-agent": "Firefox" },
        ip: "203.0.113.9",
      }),
      res as never,
    );

    expect(verification.verify).toHaveBeenCalledWith("chal", dto, {
      userAgent: "Firefox",
      ipAddress: "203.0.113.9",
    });
    expect(res.cookie).toHaveBeenCalledWith(
      "law_trusted_device",
      "device-token",
      {
        ...cookieOptions,
        maxAge: 30 * DAY_MS,
      },
    );
  });

  it("verify sets no trusted-device cookie when none was created", async () => {
    const verification = {
      verify: jest
        .fn()
        .mockResolvedValue({ token: "t", session, userId: user.id }),
    };
    const controller = new MfaController(
      verification as never,
      config,
      {} as never,
      {} as never,
    );
    const res = response();

    await controller.verify(
      { method: "TOTP", code: "123456", rememberDevice: false },
      request("law_mfa_challenge=chal"),
      res as never,
    );

    expect(res.cookie).not.toHaveBeenCalledWith(
      "law_trusted_device",
      expect.anything(),
      expect.anything(),
    );
  });

  it("status passes the trusted-device cookie so the current device is flagged", async () => {
    const enrollment = { status: jest.fn().mockResolvedValue({}) };
    const controller = new MfaController(
      {} as never,
      config,
      enrollment as never,
      {} as never,
    );

    await controller.status(
      { auth: { user: { id: user.id } } } as never,
      request("law_trusted_device=device-token"),
    );

    expect(enrollment.status).toHaveBeenCalledWith(user.id, "device-token");
  });

  it("DELETE one clears the cookie only when the current device was revoked", async () => {
    const enrollment = {
      revokeTrustedDevice: jest
        .fn()
        .mockResolvedValueOnce({ revokedCurrent: true })
        .mockResolvedValueOnce({ revokedCurrent: false }),
    };
    const controller = new MfaController(
      {} as never,
      config,
      enrollment as never,
      {} as never,
    );
    const auth = { auth: { user: { id: user.id } } } as never;
    const cookie = request("law_trusted_device=device-token");

    const current = response();
    await expect(
      controller.revokeTrustedDevice(
        "device-1",
        { currentPassword: PASSWORD },
        auth,
        cookie,
        current as never,
      ),
    ).resolves.toEqual({ success: true });
    expect(enrollment.revokeTrustedDevice).toHaveBeenCalledWith(
      user.id,
      PASSWORD,
      "device-1",
      "device-token",
    );
    expect(current.clearCookie).toHaveBeenCalledWith(
      "law_trusted_device",
      cookieOptions,
    );

    const other = response();
    await controller.revokeTrustedDevice(
      "device-2",
      { currentPassword: PASSWORD },
      auth,
      cookie,
      other as never,
    );
    expect(other.clearCookie).not.toHaveBeenCalled();
  });

  it("DELETE all revokes everything and clears the cookie", async () => {
    const enrollment = {
      revokeAllTrustedDevices: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new MfaController(
      {} as never,
      config,
      enrollment as never,
      {} as never,
    );
    const res = response();

    await expect(
      controller.revokeAllTrustedDevices(
        { currentPassword: PASSWORD },
        { auth: { user: { id: user.id } } } as never,
        res as never,
      ),
    ).resolves.toEqual({ success: true });

    expect(enrollment.revokeAllTrustedDevices).toHaveBeenCalledWith(
      user.id,
      PASSWORD,
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      "law_trusted_device",
      cookieOptions,
    );
  });

  it("both DELETE routes require a session and are rate limited", () => {
    for (const method of [
      "revokeTrustedDevice",
      "revokeAllTrustedDevices",
    ] as const) {
      const guards = Reflect.getMetadata(
        "__guards__",
        MfaController.prototype[method] as object,
      ) as unknown[];
      expect(guards).toContain(AuthGuard);
      expect(guards).toContain(AuthRateLimitGuard);
    }
  });

  it("login passes the cookie token and never sets one", async () => {
    const authService = {
      login: jest.fn().mockResolvedValue({
        result: { status: "AUTHENTICATED", session },
        sessionToken: "session-token",
      }),
    };
    const controller = new AuthController(authService as never, config);
    const res = response();

    await controller.login(
      { email: user.email, password: PASSWORD },
      request("law_trusted_device=device-token"),
      res as never,
    );

    expect(authService.login).toHaveBeenCalledWith(
      user.email,
      PASSWORD,
      "device-token",
    );
    expect(res.cookie).not.toHaveBeenCalledWith(
      "law_trusted_device",
      expect.anything(),
      expect.anything(),
    );
  });
});

describe("AuthRateLimitGuard on parameterised routes", () => {
  it("shares one bucket across ids by keying on the route pattern", async () => {
    const hit = jest.fn().mockResolvedValue(1);
    const guard = new AuthRateLimitGuard({ hit });
    const contextFor = (path: string) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({
            method: "DELETE",
            path,
            ip: "10.0.0.1",
            route: { path: "/api/auth/mfa/trusted-devices/:id" },
            headers: {},
          }),
        }),
      }) as never;

    await guard.canActivate(contextFor("/api/auth/mfa/trusted-devices/aaa"));
    await guard.canActivate(contextFor("/api/auth/mfa/trusted-devices/bbb"));

    expect(hit).toHaveBeenNthCalledWith(
      1,
      "ip:10.0.0.1:/api/auth/mfa/trusted-devices/:id",
      60_000,
    );
    expect(hit).toHaveBeenNthCalledWith(
      2,
      "ip:10.0.0.1:/api/auth/mfa/trusted-devices/:id",
      60_000,
    );
  });
});
