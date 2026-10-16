import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  AuthGuard,
  AuthRateLimitGuard,
  CsrfOriginGuard,
  MfaAdminController,
  MfaAdminService,
  TrustedDeviceService,
} from "@law/auth";

// Mirrors HARDCODED_WORKSPACE_ID (@law/core is lazy-loaded elsewhere in specs).
const HARDCODED_WORKSPACE_ID =
  process.env["AUTH_BOOTSTRAP_WORKSPACE_ID"] ??
  "11111111-1111-4111-a111-111111111111";

const ADMIN_ID = "admin-1";
const TARGET_ID = "member-2";

type Role = "OWNER" | "ADMIN" | "MEMBER";

function createHarness(
  options: {
    actorRole?: Role | null;
    actorStatus?: string;
    target?: { status: string } | null;
  } = {},
) {
  const actorRole = "actorRole" in options ? options.actorRole : "ADMIN";
  const target = "target" in options ? options.target : { status: "ACTIVE" };
  const prisma = {
    workspaceMember: {
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: { userId_workspaceId: { userId: string } };
        }) => {
          const userId = where.userId_workspaceId.userId;
          if (userId === ADMIN_ID) {
            return actorRole
              ? { role: actorRole, status: options.actorStatus ?? "ACTIVE" }
              : null;
          }
          return target;
        },
      ),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: TARGET_ID, email: "target@example.com" }),
    },
    organizationSettings: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ mfaRequired: true }),
    },
    userMfa: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    mfaRecoveryCode: { deleteMany: jest.fn().mockResolvedValue({ count: 10 }) },
    trustedDevice: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    authSession: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(),
  };
  // Mutations inside the transaction run against a distinct client so the
  // spec can prove they happened on `tx`, not on the root client.
  const tx = {
    userMfa: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    mfaRecoveryCode: { deleteMany: jest.fn().mockResolvedValue({ count: 10 }) },
    trustedDevice: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    authSession: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
  };
  prisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
    fn(tx),
  );
  const mail = { sendMfaResetByAdmin: jest.fn().mockResolvedValue(undefined) };
  const service = new MfaAdminService(
    prisma as never,
    mail as never,
    new TrustedDeviceService(prisma as never),
  );
  return { prisma, tx, mail, service };
}

describe("MfaAdminService authorization", () => {
  it.each([
    ["getPolicy", (s: MfaAdminService) => s.getPolicy(ADMIN_ID)],
    ["setPolicy", (s: MfaAdminService) => s.setPolicy(ADMIN_ID, true)],
    ["listMembers", (s: MfaAdminService) => s.listMembers(ADMIN_ID)],
    ["resetMember", (s: MfaAdminService) => s.resetMember(ADMIN_ID, TARGET_ID)],
  ] as const)("MEMBER gets 403 on %s", async (_name, call) => {
    const { service, prisma, tx, mail } = createHarness({
      actorRole: "MEMBER",
    });

    await expect(call(service)).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.organizationSettings.upsert).not.toHaveBeenCalled();
    expect(prisma.workspaceMember.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.userMfa.deleteMany).not.toHaveBeenCalled();
    expect(mail.sendMfaResetByAdmin).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it("a non-member or inactive admin gets 403 as well", async () => {
    const stranger = createHarness({ actorRole: null });
    await expect(stranger.service.getPolicy(ADMIN_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const suspended = createHarness({
      actorRole: "ADMIN",
      actorStatus: "SUSPENDED",
    });
    await expect(suspended.service.getPolicy(ADMIN_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("looks the actor up in the hardcoded workspace", async () => {
    const { service, prisma } = createHarness({ actorRole: "OWNER" });
    await service.getPolicy(ADMIN_ID);
    expect(prisma.workspaceMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_workspaceId: {
            userId: ADMIN_ID,
            workspaceId: HARDCODED_WORKSPACE_ID,
          },
        },
      }),
    );
  });
});

describe("MfaAdminService policy", () => {
  it("policy read defaults to false when no OrganizationSettings row", async () => {
    const { service, prisma } = createHarness();
    prisma.organizationSettings.findUnique.mockResolvedValue(null);

    await expect(service.getPolicy(ADMIN_ID)).resolves.toEqual({
      mfaRequired: false,
    });
    expect(prisma.organizationSettings.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: HARDCODED_WORKSPACE_ID },
      }),
    );
  });

  it("policy read reflects a stored value", async () => {
    const { service, prisma } = createHarness({ actorRole: "OWNER" });
    prisma.organizationSettings.findUnique.mockResolvedValue({
      mfaRequired: true,
    });
    await expect(service.getPolicy(ADMIN_ID)).resolves.toEqual({
      mfaRequired: true,
    });
  });

  it("policy write upserts and audits", async () => {
    const { service, prisma } = createHarness();

    await expect(service.setPolicy(ADMIN_ID, true)).resolves.toEqual({
      mfaRequired: true,
    });

    const call = prisma.organizationSettings.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ workspaceId: HARDCODED_WORKSPACE_ID });
    expect(call.update).toEqual({ mfaRequired: true });
    expect(call.create).toMatchObject({
      workspaceId: HARDCODED_WORKSPACE_ID,
      mfaRequired: true,
      availableVatRates: [0, 10, 20],
      allowedCurrencyCodes: ["RSD"],
      allowedSefAttachmentFileExtensions: [],
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: "MFA_POLICY_CHANGED",
        outcome: "SUCCESS",
        userId: ADMIN_ID,
        workspaceId: HARDCODED_WORKSPACE_ID,
        metadata: { mfaRequired: true },
      },
    });
  });

  it("policy write can switch the policy off", async () => {
    const { service, prisma } = createHarness({ actorRole: "OWNER" });
    prisma.organizationSettings.upsert.mockResolvedValue({
      mfaRequired: false,
    });
    await expect(service.setPolicy(ADMIN_ID, false)).resolves.toEqual({
      mfaRequired: false,
    });
    expect(prisma.organizationSettings.upsert.mock.calls[0][0].update).toEqual({
      mfaRequired: false,
    });
  });
});

describe("MfaAdminService members", () => {
  it("members list returns ACTIVE members of the hardcoded workspace with 2FA flags", async () => {
    const { service, prisma } = createHarness();
    const enabledAt = new Date("2026-10-01T10:00:00Z");
    prisma.workspaceMember.findMany.mockResolvedValue([
      {
        userId: "u1",
        role: "OWNER",
        user: {
          email: "ana@example.com",
          firstName: "Ana",
          lastName: "Anić",
          mfa: { enabledAt },
        },
      },
      {
        userId: "u2",
        role: "MEMBER",
        user: {
          email: "bojan@example.com",
          firstName: null,
          lastName: null,
          mfa: null,
        },
      },
      {
        userId: "u3",
        role: "ADMIN",
        user: {
          email: "cara@example.com",
          firstName: " Cara ",
          lastName: null,
          mfa: { enabledAt: null },
        },
      },
    ]);

    const result = await service.listMembers(ADMIN_ID);

    expect(prisma.workspaceMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: HARDCODED_WORKSPACE_ID, status: "ACTIVE" },
      }),
    );
    expect(result).toEqual([
      {
        userId: "u1",
        name: "Ana Anić",
        email: "ana@example.com",
        role: "OWNER",
        mfaEnabled: true,
        mfaEnabledAt: enabledAt.toISOString(),
      },
      {
        userId: "u2",
        name: null,
        email: "bojan@example.com",
        role: "MEMBER",
        mfaEnabled: false,
        mfaEnabledAt: null,
      },
      {
        userId: "u3",
        name: "Cara",
        email: "cara@example.com",
        role: "ADMIN",
        mfaEnabled: false,
        mfaEnabledAt: null,
      },
    ]);
  });

  it("never selects secret material", async () => {
    const { service, prisma } = createHarness();
    await service.listMembers(ADMIN_ID);
    const select = JSON.stringify(
      prisma.workspaceMember.findMany.mock.calls[0][0],
    );
    expect(select).not.toMatch(/totpSecret|passwordHash|codeHash/);
  });
});

describe("MfaAdminService.resetMember", () => {
  it("reset deletes UserMfa, codes, trusted devices, revokes sessions in one transaction, sends mfaResetByAdmin, audits with actor id", async () => {
    const { service, prisma, tx, mail } = createHarness();

    await service.resetMember(ADMIN_ID, TARGET_ID);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.userMfa.deleteMany).toHaveBeenCalledWith({
      where: { userId: TARGET_ID },
    });
    expect(tx.mfaRecoveryCode.deleteMany).toHaveBeenCalledWith({
      where: { userId: TARGET_ID },
    });
    expect(tx.trustedDevice.updateMany).toHaveBeenCalledWith({
      where: { userId: TARGET_ID, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: TARGET_ID, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    // Nothing leaks onto the root client outside the transaction.
    expect(prisma.userMfa.deleteMany).not.toHaveBeenCalled();
    expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
    expect(prisma.trustedDevice.updateMany).not.toHaveBeenCalled();

    expect(mail.sendMfaResetByAdmin).toHaveBeenCalledWith(
      { id: TARGET_ID, email: "target@example.com" },
      expect.any(Date),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: "MFA_RESET_BY_ADMIN",
        outcome: "SUCCESS",
        userId: TARGET_ID,
        workspaceId: HARDCODED_WORKSPACE_ID,
        metadata: { actorId: ADMIN_ID },
      },
    });
  });

  it("does not mail or audit when the transaction fails", async () => {
    const { service, prisma, mail } = createHarness();
    prisma.$transaction.mockRejectedValue(new Error("db down"));

    await expect(service.resetMember(ADMIN_ID, TARGET_ID)).rejects.toThrow(
      "db down",
    );

    expect(mail.sendMfaResetByAdmin).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it("reset of an invited member is allowed", async () => {
    const { service, prisma } = createHarness({
      target: { status: "INVITED" },
    });
    await service.resetMember(ADMIN_ID, TARGET_ID);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("reset of self → 403", async () => {
    const { service, prisma, mail } = createHarness({ actorRole: "OWNER" });

    await expect(
      service.resetMember(ADMIN_ID, ADMIN_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mail.sendMfaResetByAdmin).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it("reset of non-member → 404", async () => {
    const { service, prisma, mail } = createHarness({ target: null });

    await expect(
      service.resetMember(ADMIN_ID, TARGET_ID),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mail.sendMfaResetByAdmin).not.toHaveBeenCalled();
  });

  it("reset of a suspended member → 404", async () => {
    const { service, prisma } = createHarness({
      target: { status: "SUSPENDED" },
    });
    await expect(
      service.resetMember(ADMIN_ID, TARGET_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("MfaAdminController", () => {
  const authed = (id = ADMIN_ID) =>
    ({ auth: { user: { id }, memberships: [] } }) as never;

  function controllerWith(service: Record<string, jest.Mock>) {
    return new MfaAdminController(service as never);
  }

  it("delegates with the authenticated user id", async () => {
    const service = {
      getPolicy: jest.fn().mockResolvedValue({ mfaRequired: false }),
      setPolicy: jest.fn().mockResolvedValue({ mfaRequired: true }),
      listMembers: jest.fn().mockResolvedValue([]),
      resetMember: jest.fn().mockResolvedValue(undefined),
    };
    const controller = controllerWith(service);

    await controller.getPolicy(authed());
    await controller.setPolicy({ mfaRequired: true }, authed());
    await controller.listMembers(authed());
    await controller.resetMember(TARGET_ID, authed());

    expect(service.getPolicy).toHaveBeenCalledWith(ADMIN_ID);
    expect(service.setPolicy).toHaveBeenCalledWith(ADMIN_ID, true);
    expect(service.listMembers).toHaveBeenCalledWith(ADMIN_ID);
    expect(service.resetMember).toHaveBeenCalledWith(ADMIN_ID, TARGET_ID);
  });

  it("rejects a request without an authenticated session", async () => {
    const controller = controllerWith({ getPolicy: jest.fn() });
    expect(() => controller.getPolicy({} as never)).toThrow(
      UnauthorizedException,
    );
  });

  it("route and guard metadata", () => {
    expect(Reflect.getMetadata("path", MfaAdminController)).toBe("auth/admin");
    const classGuards = Reflect.getMetadata(
      "__guards__",
      MfaAdminController,
    ) as unknown[];
    expect(classGuards).toEqual(
      expect.arrayContaining([CsrfOriginGuard, AuthGuard]),
    );
    const guardsOf = (method: keyof MfaAdminController) =>
      Reflect.getMetadata(
        "__guards__",
        MfaAdminController.prototype[method] as object,
      ) as unknown[];
    expect(guardsOf("setPolicy")).toContain(AuthRateLimitGuard);
    expect(guardsOf("resetMember")).toContain(AuthRateLimitGuard);
  });
});
