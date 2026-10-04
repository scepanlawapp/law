import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { WorkspaceRole } from "@law/api-interfaces";
import { WorkspaceContextService } from "@law/core";
import { BillingSetupService } from "@law/work-entries";
import { Prisma } from "@prisma/client";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const userId = "22222222-2222-4222-a222-222222222222";
const clientId = "33333333-3333-4333-a333-333333333333";
const categoryId = "55555555-5555-4555-a555-555555555555";
const agreementId = "77777777-7777-4777-a777-777777777777";

function agreementRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: agreementId,
    workspaceId,
    clientId,
    title: "Mesecni paket",
    monthlyFee: new Prisma.Decimal(1000),
    currency: "EUR",
    validFrom: new Date("2026-01-01"),
    validTo: null,
    includedMinutes: 600,
    overageRule: "HOURLY",
    overageHourlyRate: new Prisma.Decimal(80),
    outOfScopeRule: "ABSORBED",
    outOfScopeHourlyRate: null,
    active: true,
    categories: [{ serviceCategoryId: categoryId }],
    ...overrides,
  };
}

const validRetainer = {
  title: "Mesecni paket",
  monthlyFee: "1000.00",
  currency: "EUR",
  validFrom: "2026-06-01",
  validTo: null,
  includedMinutes: 600,
  coveredCategoryIds: [categoryId],
  overageRule: "HOURLY" as const,
  overageHourlyRate: "80.00",
  outOfScopeRule: "ABSORBED" as const,
  outOfScopeHourlyRate: null,
};

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint", {
    code: "P2002",
    clientVersion: "test",
  });
}

describe("BillingSetupService", () => {
  const db = {
    client: { findFirst: jest.fn() },
    serviceCategory: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    retainerAgreement: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    clientBillingProfile: { findFirst: jest.fn(), upsert: jest.fn() },
    userRate: { findMany: jest.fn(), create: jest.fn() },
    workspaceMember: { findFirst: jest.fn() },
    workspaceConfig: { findUnique: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new BillingSetupService(db as never);

  const as = <R>(role: WorkspaceRole, fn: () => Promise<R>) =>
    WorkspaceContextService.run({ userId, workspaceId, role }, fn);

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn(db),
    );
    db.client.findFirst.mockResolvedValue({ id: clientId });
    db.serviceCategory.findMany.mockResolvedValue([{ id: categoryId }]);
    db.retainerAgreement.findMany.mockResolvedValue([]);
    db.retainerAgreement.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        agreementRecord({
          ...data,
          monthlyFee: new Prisma.Decimal(data["monthlyFee"] as string),
          overageHourlyRate: data["overageHourlyRate"]
            ? new Prisma.Decimal(data["overageHourlyRate"] as string)
            : null,
          categories: [{ serviceCategoryId: categoryId }],
        }),
    );
    db.workspaceConfig.findUnique.mockResolvedValue({
      workspaceId,
      targetHourlyRate: null,
      internalCurrency: "RSD",
      defaultVatRate: new Prisma.Decimal(20),
      paymentTermDays: 15,
    });
    db.workspaceMember.findFirst.mockResolvedValue({ userId });
  });

  describe("categories", () => {
    it("lets any member list them", async () => {
      db.serviceCategory.findMany.mockResolvedValue([
        { id: categoryId, name: "Ugovori", active: true, order: 1 },
      ]);
      await expect(
        as(WorkspaceRole.MEMBER, () => service.listCategories()),
      ).resolves.toEqual([
        { id: categoryId, name: "Ugovori", active: true, order: 1 },
      ]);
    });

    it("rejects a duplicate name with 409", async () => {
      db.serviceCategory.create.mockRejectedValue(uniqueViolation());
      await expect(
        as(WorkspaceRole.OWNER, () =>
          service.createCategory({ name: "Ugovori" }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects a rename onto an existing name with 409", async () => {
      db.serviceCategory.updateMany.mockRejectedValue(uniqueViolation());
      await expect(
        as(WorkspaceRole.ADMIN, () =>
          service.updateCategory(categoryId, { name: "Ugovori" }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("forbids a lawyer from creating a category", async () => {
      await expect(
        as(WorkspaceRole.LAWYER, () =>
          service.createCategory({ name: "Ugovori" }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("retainers", () => {
    it("rejects an agreement overlapping an open-ended one with 409", async () => {
      db.retainerAgreement.findMany.mockResolvedValue([
        agreementRecord({
          validFrom: new Date("2026-01-01"),
          validTo: null,
        }),
      ]);
      await expect(
        as(WorkspaceRole.OWNER, () =>
          service.createRetainer(clientId, {
            ...validRetainer,
            validFrom: "2026-06-01",
            validTo: "2026-12-31",
          }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(db.retainerAgreement.create).not.toHaveBeenCalled();
    });

    it("allows an adjacent agreement", async () => {
      db.retainerAgreement.findMany.mockResolvedValue([
        agreementRecord({
          validFrom: new Date("2026-01-01"),
          validTo: new Date("2026-05-31"),
        }),
      ]);
      const created = await as(WorkspaceRole.OWNER, () =>
        service.createRetainer(clientId, validRetainer),
      );
      expect(created.validFrom).toBe("2026-06-01");
      expect(created.validTo).toBeNull();
      expect(created.monthlyFee).toBe("1000.00");
      expect(created.coveredCategoryIds).toEqual([categoryId]);
    });

    it("only compares against active agreements of the same client", async () => {
      await as(WorkspaceRole.OWNER, () =>
        service.createRetainer(clientId, validRetainer),
      );
      expect(db.retainerAgreement.findMany).toHaveBeenCalledWith({
        where: { workspaceId, clientId, active: true },
        include: { categories: true },
      });
    });

    it("ignores the agreement being edited when checking overlap", async () => {
      db.retainerAgreement.findFirst.mockResolvedValue(agreementRecord());
      // The query excludes the agreement itself, so nothing else comes back.
      db.retainerAgreement.findMany.mockResolvedValue([]);
      db.retainerAgreement.update.mockResolvedValue(
        agreementRecord({ title: "Novi naziv" }),
      );
      const updated = await as(WorkspaceRole.OWNER, () =>
        service.updateRetainer(agreementId, {
          ...validRetainer,
          title: "Novi naziv",
          validFrom: "2026-01-01",
        }),
      );
      expect(updated.title).toBe("Novi naziv");
      expect(db.retainerAgreement.findMany).toHaveBeenCalledWith({
        where: {
          workspaceId,
          clientId,
          active: true,
          id: { not: agreementId },
        },
        include: { categories: true },
      });
    });

    it("requires an overage rate when the overage rule is HOURLY", async () => {
      await expect(
        as(WorkspaceRole.OWNER, () =>
          service.createRetainer(clientId, {
            ...validRetainer,
            overageHourlyRate: null,
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("requires an out-of-scope rate when that rule is HOURLY", async () => {
      await expect(
        as(WorkspaceRole.OWNER, () =>
          service.createRetainer(clientId, {
            ...validRetainer,
            outOfScopeRule: "HOURLY",
            outOfScopeHourlyRate: null,
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects an end date before the start date", async () => {
      await expect(
        as(WorkspaceRole.OWNER, () =>
          service.createRetainer(clientId, {
            ...validRetainer,
            validFrom: "2026-06-01",
            validTo: "2026-05-31",
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects a category from another workspace", async () => {
      db.serviceCategory.findMany.mockResolvedValue([]);
      await expect(
        as(WorkspaceRole.OWNER, () =>
          service.createRetainer(clientId, validRetainer),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("forbids a lawyer from creating a retainer", async () => {
      await expect(
        as(WorkspaceRole.LAWYER, () =>
          service.createRetainer(clientId, validRetainer),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("lets a lawyer read retainers but not a member", async () => {
      db.retainerAgreement.findMany.mockResolvedValue([agreementRecord()]);
      await expect(
        as(WorkspaceRole.LAWYER, () => service.listRetainers(clientId)),
      ).resolves.toHaveLength(1);
      await expect(
        as(WorkspaceRole.MEMBER, () => service.listRetainers(clientId)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("deactivates instead of deleting", async () => {
      db.retainerAgreement.updateMany.mockResolvedValue({ count: 1 });
      db.retainerAgreement.findFirst.mockResolvedValue(
        agreementRecord({ active: false }),
      );
      const result = await as(WorkspaceRole.ADMIN, () =>
        service.deactivateRetainer(agreementId),
      );
      expect(result.active).toBe(false);
      expect(db.retainerAgreement.updateMany).toHaveBeenCalledWith({
        where: { id: agreementId, workspaceId },
        data: { active: false },
      });
    });

    it("returns 404 when deactivating an unknown agreement", async () => {
      db.retainerAgreement.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        as(WorkspaceRole.OWNER, () => service.deactivateRetainer(agreementId)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects a currency that is not a 3-letter uppercase code", async () => {
      await expect(
        as(WorkspaceRole.OWNER, () =>
          service.createRetainer(clientId, {
            ...validRetainer,
            currency: "eur",
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("agreementsForClient", () => {
    it("maps active agreements to terms, inside a transaction when given one", async () => {
      db.retainerAgreement.findMany.mockResolvedValue([agreementRecord()]);
      const terms = await as(WorkspaceRole.MEMBER, () =>
        service.agreementsForClient(clientId, db as never),
      );
      expect(terms).toEqual([
        expect.objectContaining({
          id: agreementId,
          coveredCategoryIds: [categoryId],
          overageRule: "HOURLY",
        }),
      ]);
      expect(db.retainerAgreement.findMany).toHaveBeenCalledWith({
        where: { workspaceId, clientId, active: true },
        include: { categories: true },
      });
    });
  });

  describe("client billing profile", () => {
    it("upserts the profile", async () => {
      db.clientBillingProfile.upsert.mockResolvedValue({
        clientId,
        hourlyRate: new Prisma.Decimal(90),
        currency: "EUR",
      });
      const profile = await as(WorkspaceRole.OWNER, () =>
        service.upsertProfile(clientId, { hourlyRate: "90", currency: "EUR" }),
      );
      expect(profile).toEqual({
        clientId,
        hourlyRate: "90.00",
        currency: "EUR",
      });
    });

    it("lets a lawyer read but not write the profile", async () => {
      db.clientBillingProfile.findFirst.mockResolvedValue(null);
      await expect(
        as(WorkspaceRole.LAWYER, () => service.getProfile(clientId)),
      ).resolves.toEqual({ clientId, hourlyRate: null, currency: "RSD" });
      await expect(
        as(WorkspaceRole.LAWYER, () =>
          service.upsertProfile(clientId, {
            hourlyRate: null,
            currency: "RSD",
          }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("rates", () => {
    const rate = {
      userId,
      hourlyValue: "60.00",
      currency: "RSD",
      effectiveFrom: "2026-10-01",
    };

    it("rejects a rate whose currency differs from the internal currency", async () => {
      await expect(
        as(WorkspaceRole.OWNER, () =>
          service.createRate({ ...rate, currency: "EUR" }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.userRate.create).not.toHaveBeenCalled();
    });

    it("appends a rate in the internal currency", async () => {
      db.userRate.create.mockResolvedValue({
        id: "rate-1",
        userId,
        hourlyValue: new Prisma.Decimal(60),
        currency: "RSD",
        effectiveFrom: new Date("2026-10-01"),
      });
      await expect(
        as(WorkspaceRole.ADMIN, () => service.createRate(rate)),
      ).resolves.toEqual({
        id: "rate-1",
        userId,
        hourlyValue: "60.00",
        currency: "RSD",
        effectiveFrom: "2026-10-01",
      });
    });

    it("rejects a second rate for the same user and date with 409", async () => {
      db.userRate.create.mockRejectedValue(uniqueViolation());
      await expect(
        as(WorkspaceRole.OWNER, () => service.createRate(rate)),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects a rate for someone who is not an active member", async () => {
      db.workspaceMember.findFirst.mockResolvedValue(null);
      await expect(
        as(WorkspaceRole.OWNER, () => service.createRate(rate)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("keeps rates away from lawyers", async () => {
      await expect(
        as(WorkspaceRole.LAWYER, () => service.listRates()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        as(WorkspaceRole.LAWYER, () => service.createRate(rate)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("workspace config", () => {
    it("returns defaults when no config row exists", async () => {
      db.workspaceConfig.findUnique.mockResolvedValue(null);
      await expect(
        as(WorkspaceRole.OWNER, () => service.getWorkspaceConfig()),
      ).resolves.toEqual({
        targetHourlyRate: null,
        internalCurrency: "RSD",
        defaultVatRate: "20.00",
        paymentTermDays: 15,
      });
    });

    it("upserts the billing settings", async () => {
      db.workspaceConfig.upsert.mockResolvedValue({
        targetHourlyRate: new Prisma.Decimal(100),
        internalCurrency: "RSD",
        defaultVatRate: new Prisma.Decimal(20),
        paymentTermDays: 30,
      });
      await expect(
        as(WorkspaceRole.OWNER, () =>
          service.updateWorkspaceConfig({
            targetHourlyRate: "100",
            internalCurrency: "RSD",
            defaultVatRate: "20",
            paymentTermDays: 30,
          }),
        ),
      ).resolves.toEqual({
        targetHourlyRate: "100.00",
        internalCurrency: "RSD",
        defaultVatRate: "20.00",
        paymentTermDays: 30,
      });
    });

    it("rejects a VAT rate above 100", async () => {
      await expect(
        as(WorkspaceRole.OWNER, () =>
          service.updateWorkspaceConfig({
            targetHourlyRate: null,
            internalCurrency: "RSD",
            defaultVatRate: "120",
            paymentTermDays: 15,
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("forbids non-managers", async () => {
      await expect(
        as(WorkspaceRole.LAWYER, () => service.getWorkspaceConfig()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
