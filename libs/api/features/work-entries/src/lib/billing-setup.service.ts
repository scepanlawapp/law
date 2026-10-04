import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  ClientBillingProfile,
  RetainerAgreement,
  ServiceCategory,
  UserRate,
  WorkspaceBillingConfig,
  WorkspaceRole,
} from "@law/api-interfaces";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";
import { AgreementTerms } from "./treatment";
import {
  CreateServiceCategoryDto,
  CreateUserRateDto,
  MONEY_PATTERN,
  RetainerAgreementDto,
  UpdateServiceCategoryDto,
  UpdateWorkspaceBillingConfigDto,
  UpsertClientBillingProfileDto,
} from "./billing-setup.dto";

const DEFAULT_INTERNAL_CURRENCY = "RSD";
const DEFAULT_VAT_RATE = new Prisma.Decimal(20);
const DEFAULT_PAYMENT_TERM_DAYS = 15;

const agreementInclude = {
  categories: true,
} satisfies Prisma.RetainerAgreementInclude;

type AgreementRecord = Prisma.RetainerAgreementGetPayload<{
  include: typeof agreementInclude;
}>;

/**
 * Billing configuration: service categories, retainer agreements, per-client
 * rate profiles, internal user rates and workspace billing settings.
 */
@Injectable()
export class BillingSetupService {
  constructor(private readonly db: PlatformPrismaService) {}

  private get context() {
    return WorkspaceContextService.required;
  }

  private get workspaceId() {
    return this.context.workspaceId;
  }

  private isManager(): boolean {
    return (
      this.context.role === WorkspaceRole.OWNER ||
      this.context.role === WorkspaceRole.ADMIN
    );
  }

  private assertManager(): void {
    if (!this.isManager()) {
      throw new ForbiddenException("Only owners and admins can do this");
    }
  }

  /** Retainers and client profiles are readable by managers and lawyers. */
  private assertCanReadClientBilling(): void {
    if (!this.isManager() && this.context.role !== WorkspaceRole.LAWYER) {
      throw new ForbiddenException("Not allowed to read billing setup");
    }
  }

  // ----------------------------------------------------------- categories

  async listCategories(): Promise<ServiceCategory[]> {
    const rows = await this.db.serviceCategory.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    });
    return rows.map((row) => this.toCategory(row));
  }

  async createCategory(
    input: CreateServiceCategoryDto,
  ): Promise<ServiceCategory> {
    this.assertManager();
    try {
      const row = await this.db.serviceCategory.create({
        data: {
          workspaceId: this.workspaceId,
          name: input.name.trim(),
          order: input.order ?? 0,
        },
      });
      return this.toCategory(row);
    } catch (error) {
      throw this.categoryNameConflict(error);
    }
  }

  async updateCategory(
    id: string,
    input: UpdateServiceCategoryDto,
  ): Promise<ServiceCategory> {
    this.assertManager();
    const data: Prisma.ServiceCategoryUpdateManyMutationInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.active !== undefined) data.active = input.active;
    if (input.order !== undefined) data.order = input.order;
    try {
      const result = await this.db.serviceCategory.updateMany({
        where: { id, workspaceId: this.workspaceId },
        data,
      });
      if (result.count === 0) {
        throw new NotFoundException("Service category not found");
      }
    } catch (error) {
      throw this.categoryNameConflict(error);
    }
    const row = await this.db.serviceCategory.findFirst({
      where: { id, workspaceId: this.workspaceId },
    });
    if (!row) throw new NotFoundException("Service category not found");
    return this.toCategory(row);
  }

  private categoryNameConflict(error: unknown): unknown {
    return this.isUniqueViolation(error)
      ? new ConflictException("A service category with this name exists")
      : error;
  }

  private toCategory(row: {
    id: string;
    name: string;
    active: boolean;
    order: number;
  }): ServiceCategory {
    return {
      id: row.id,
      name: row.name,
      active: row.active,
      order: row.order,
    };
  }

  // ------------------------------------------------------------ retainers

  async listRetainers(clientId: string): Promise<RetainerAgreement[]> {
    this.assertCanReadClientBilling();
    const rows = await this.db.retainerAgreement.findMany({
      where: { workspaceId: this.workspaceId, clientId },
      include: agreementInclude,
      orderBy: [{ validFrom: "desc" }],
    });
    return rows.map((row) => this.toAgreement(row));
  }

  async createRetainer(
    clientId: string,
    input: RetainerAgreementDto,
  ): Promise<RetainerAgreement> {
    this.assertManager();
    await this.assertClient(clientId);
    const terms = await this.validateRetainer(input);

    const row = await this.db.$transaction(async (tx) => {
      await this.assertNoOverlap(tx, clientId, terms, null);
      return tx.retainerAgreement.create({
        data: {
          workspaceId: this.workspaceId,
          clientId,
          ...terms.data,
          categories: {
            create: terms.categoryIds.map((serviceCategoryId) => ({
              workspaceId: this.workspaceId,
              serviceCategoryId,
            })),
          },
        },
        include: agreementInclude,
      });
    });
    return this.toAgreement(row);
  }

  /** Replaces every field of the agreement; the client never changes. */
  async updateRetainer(
    id: string,
    input: RetainerAgreementDto,
  ): Promise<RetainerAgreement> {
    this.assertManager();
    const current = await this.db.retainerAgreement.findFirst({
      where: { id, workspaceId: this.workspaceId },
    });
    if (!current) throw new NotFoundException("Retainer agreement not found");
    const terms = await this.validateRetainer(input);

    const row = await this.db.$transaction(async (tx) => {
      // An inactive agreement is not in play, so it cannot collide.
      if (current.active) {
        await this.assertNoOverlap(tx, current.clientId, terms, id);
      }
      return tx.retainerAgreement.update({
        where: { id },
        data: {
          ...terms.data,
          categories: {
            deleteMany: {},
            create: terms.categoryIds.map((serviceCategoryId) => ({
              workspaceId: this.workspaceId,
              serviceCategoryId,
            })),
          },
        },
        include: agreementInclude,
      });
    });
    return this.toAgreement(row);
  }

  async deactivateRetainer(id: string): Promise<RetainerAgreement> {
    this.assertManager();
    const result = await this.db.retainerAgreement.updateMany({
      where: { id, workspaceId: this.workspaceId },
      data: { active: false },
    });
    if (result.count === 0) {
      throw new NotFoundException("Retainer agreement not found");
    }
    const row = await this.db.retainerAgreement.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: agreementInclude,
    });
    if (!row) throw new NotFoundException("Retainer agreement not found");
    return this.toAgreement(row);
  }

  /**
   * Active agreements of the client as pure terms for treatment and
   * allocation. Pass `tx` to read inside a transaction.
   */
  async agreementsForClient(
    clientId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AgreementTerms[]> {
    const rows = await (tx ?? this.db).retainerAgreement.findMany({
      where: { workspaceId: this.workspaceId, clientId, active: true },
      include: agreementInclude,
    });
    return rows.map((row) => this.toTerms(row));
  }

  private async validateRetainer(input: RetainerAgreementDto) {
    this.assertCurrency(input.currency);
    const monthlyFee = this.parseMoney(input.monthlyFee, "monthlyFee");
    const overageHourlyRate = this.ruleRate(
      input.overageRule,
      input.overageHourlyRate,
      "overageHourlyRate",
    );
    const outOfScopeHourlyRate = this.ruleRate(
      input.outOfScopeRule,
      input.outOfScopeHourlyRate,
      "outOfScopeHourlyRate",
    );
    const validFrom = this.toDate(input.validFrom);
    const validTo = input.validTo ? this.toDate(input.validTo) : null;
    if (validTo && validTo.getTime() < validFrom.getTime()) {
      throw new BadRequestException("validTo must not be before validFrom");
    }
    const categoryIds = [...new Set(input.coveredCategoryIds)];
    await this.assertCategories(categoryIds);

    return {
      validFrom,
      validTo,
      categoryIds,
      data: {
        title: input.title.trim(),
        monthlyFee,
        currency: input.currency,
        validFrom,
        validTo,
        includedMinutes: input.includedMinutes ?? null,
        overageRule: input.overageRule,
        overageHourlyRate,
        outOfScopeRule: input.outOfScopeRule,
        outOfScopeHourlyRate,
      },
    };
  }

  /** The rate is required for HOURLY and ignored (stored as null) otherwise. */
  private ruleRate(
    rule: string,
    value: string | null | undefined,
    field: string,
  ): Prisma.Decimal | null {
    if (rule !== "HOURLY") return null;
    if (value === null || value === undefined) {
      throw new BadRequestException(`${field} is required for HOURLY`);
    }
    const rate = this.parseMoney(value, field);
    if (!rate.gt(0)) {
      throw new BadRequestException(`${field} must be greater than zero`);
    }
    return rate;
  }

  private async assertCategories(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const found = await this.db.serviceCategory.findMany({
      where: { workspaceId: this.workspaceId, id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException("Service category not found");
    }
  }

  /** Date ranges are inclusive and an open end is infinity. */
  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    clientId: string,
    range: { validFrom: Date; validTo: Date | null },
    excludeId: string | null,
  ): Promise<void> {
    const others = await tx.retainerAgreement.findMany({
      where: {
        workspaceId: this.workspaceId,
        clientId,
        active: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      include: agreementInclude,
    });
    const overlaps = others.some(
      (other) =>
        (other.validTo === null ||
          other.validTo.getTime() >= range.validFrom.getTime()) &&
        (range.validTo === null ||
          range.validTo.getTime() >= other.validFrom.getTime()),
    );
    if (overlaps) {
      throw new ConflictException(
        "Retainer agreement overlaps another active agreement of this client",
      );
    }
  }

  private toTerms(row: AgreementRecord): AgreementTerms {
    return {
      id: row.id,
      validFrom: row.validFrom,
      validTo: row.validTo,
      monthlyFee: row.monthlyFee,
      currency: row.currency,
      includedMinutes: row.includedMinutes,
      coveredCategoryIds: row.categories.map(
        (category) => category.serviceCategoryId,
      ),
      overageRule: row.overageRule,
      overageHourlyRate: row.overageHourlyRate,
      outOfScopeRule: row.outOfScopeRule,
      outOfScopeHourlyRate: row.outOfScopeHourlyRate,
    };
  }

  private toAgreement(row: AgreementRecord): RetainerAgreement {
    return {
      id: row.id,
      clientId: row.clientId,
      title: row.title,
      monthlyFee: this.money(row.monthlyFee),
      currency: row.currency,
      validFrom: this.dateString(row.validFrom),
      validTo: row.validTo ? this.dateString(row.validTo) : null,
      includedMinutes: row.includedMinutes,
      coveredCategoryIds: row.categories.map(
        (category) => category.serviceCategoryId,
      ),
      overageRule: row.overageRule,
      overageHourlyRate: row.overageHourlyRate
        ? this.money(row.overageHourlyRate)
        : null,
      outOfScopeRule: row.outOfScopeRule,
      outOfScopeHourlyRate: row.outOfScopeHourlyRate
        ? this.money(row.outOfScopeHourlyRate)
        : null,
      active: row.active,
    };
  }

  // ------------------------------------------------------------- profiles

  async getProfile(clientId: string): Promise<ClientBillingProfile> {
    this.assertCanReadClientBilling();
    await this.assertClient(clientId);
    const row = await this.db.clientBillingProfile.findFirst({
      where: { workspaceId: this.workspaceId, clientId },
    });
    if (!row) {
      const config = await this.loadConfig();
      return {
        clientId,
        hourlyRate: null,
        currency: config.internalCurrency,
      };
    }
    return this.toProfile(row, (await this.loadConfig()).internalCurrency);
  }

  async upsertProfile(
    clientId: string,
    input: UpsertClientBillingProfileDto,
  ): Promise<ClientBillingProfile> {
    this.assertManager();
    this.assertCurrency(input.currency);
    const hourlyRate =
      input.hourlyRate === null || input.hourlyRate === undefined
        ? null
        : this.parseMoney(input.hourlyRate, "hourlyRate");
    if (hourlyRate && !hourlyRate.gt(0)) {
      throw new BadRequestException("hourlyRate must be greater than zero");
    }
    await this.assertClient(clientId);
    const row = await this.db.clientBillingProfile.upsert({
      where: { clientId },
      create: {
        workspaceId: this.workspaceId,
        clientId,
        hourlyRate,
        currency: input.currency,
      },
      update: { hourlyRate, currency: input.currency },
    });
    return this.toProfile(row, input.currency);
  }

  private toProfile(
    row: {
      clientId: string;
      hourlyRate: Prisma.Decimal | null;
      currency: string | null;
    },
    fallbackCurrency: string,
  ): ClientBillingProfile {
    return {
      clientId: row.clientId,
      hourlyRate: row.hourlyRate ? this.money(row.hourlyRate) : null,
      currency: row.currency ?? fallbackCurrency,
    };
  }

  // ---------------------------------------------------------------- rates

  async listRates(userId?: string): Promise<UserRate[]> {
    this.assertManager();
    const rows = await this.db.userRate.findMany({
      where: { workspaceId: this.workspaceId, ...(userId ? { userId } : {}) },
      orderBy: [{ userId: "asc" }, { effectiveFrom: "desc" }],
    });
    return rows.map((row) => this.toRate(row));
  }

  /** Rates are append-only: a new row per (user, effectiveFrom). */
  async createRate(input: CreateUserRateDto): Promise<UserRate> {
    this.assertManager();
    this.assertCurrency(input.currency);
    const hourlyValue = this.parseMoney(input.hourlyValue, "hourlyValue");
    if (!hourlyValue.gt(0)) {
      throw new BadRequestException("hourlyValue must be greater than zero");
    }
    const config = await this.loadConfig();
    if (input.currency !== config.internalCurrency) {
      throw new BadRequestException(
        `Rate currency must be ${config.internalCurrency}`,
      );
    }
    const member = await this.db.workspaceMember.findFirst({
      where: {
        workspaceId: this.workspaceId,
        userId: input.userId,
        status: "ACTIVE",
      },
      select: { userId: true },
    });
    if (!member) throw new BadRequestException("User not found");

    try {
      const row = await this.db.userRate.create({
        data: {
          workspaceId: this.workspaceId,
          userId: input.userId,
          hourlyValue,
          currency: input.currency,
          effectiveFrom: this.toDate(input.effectiveFrom),
        },
      });
      return this.toRate(row);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          "A rate for this user and date already exists",
        );
      }
      throw error;
    }
  }

  private toRate(row: {
    id: string;
    userId: string;
    hourlyValue: Prisma.Decimal;
    currency: string;
    effectiveFrom: Date;
  }): UserRate {
    return {
      id: row.id,
      userId: row.userId,
      hourlyValue: this.money(row.hourlyValue),
      currency: row.currency,
      effectiveFrom: this.dateString(row.effectiveFrom),
    };
  }

  // ------------------------------------------------------ workspace config

  async getWorkspaceConfig(): Promise<WorkspaceBillingConfig> {
    this.assertManager();
    return this.toConfig(await this.loadConfig());
  }

  async updateWorkspaceConfig(
    input: UpdateWorkspaceBillingConfigDto,
  ): Promise<WorkspaceBillingConfig> {
    this.assertManager();
    this.assertCurrency(input.internalCurrency);
    const targetHourlyRate =
      input.targetHourlyRate === null || input.targetHourlyRate === undefined
        ? null
        : this.parseMoney(input.targetHourlyRate, "targetHourlyRate");
    const defaultVatRate = new Prisma.Decimal(input.defaultVatRate);
    if (defaultVatRate.gt(100)) {
      throw new BadRequestException("defaultVatRate must not exceed 100");
    }
    const data = {
      targetHourlyRate,
      internalCurrency: input.internalCurrency,
      defaultVatRate,
      paymentTermDays: input.paymentTermDays,
    };
    const row = await this.db.workspaceConfig.upsert({
      where: { workspaceId: this.workspaceId },
      create: { workspaceId: this.workspaceId, ...data },
      update: data,
    });
    return this.toConfig(row);
  }

  private async loadConfig() {
    const row = await this.db.workspaceConfig.findUnique({
      where: { workspaceId: this.workspaceId },
    });
    return {
      targetHourlyRate: row?.targetHourlyRate ?? null,
      internalCurrency: row?.internalCurrency ?? DEFAULT_INTERNAL_CURRENCY,
      defaultVatRate: row?.defaultVatRate ?? DEFAULT_VAT_RATE,
      paymentTermDays: row?.paymentTermDays ?? DEFAULT_PAYMENT_TERM_DAYS,
    };
  }

  private toConfig(row: {
    targetHourlyRate: Prisma.Decimal | null;
    internalCurrency: string;
    defaultVatRate: Prisma.Decimal;
    paymentTermDays: number;
  }): WorkspaceBillingConfig {
    return {
      targetHourlyRate: row.targetHourlyRate
        ? this.money(row.targetHourlyRate)
        : null,
      internalCurrency: row.internalCurrency,
      defaultVatRate: this.money(row.defaultVatRate),
      paymentTermDays: row.paymentTermDays,
    };
  }

  // -------------------------------------------------------------- helpers

  private async assertClient(clientId: string): Promise<void> {
    const client = await this.db.client.findFirst({
      where: { id: clientId, workspaceId: this.workspaceId },
      select: { id: true },
    });
    if (!client) throw new NotFoundException("Client not found");
  }

  private assertCurrency(currency: string): void {
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException(
        "currency must be a 3-letter uppercase ISO code",
      );
    }
  }

  private parseMoney(value: string, field: string): Prisma.Decimal {
    if (!MONEY_PATTERN.test(value)) {
      throw new BadRequestException(
        `${field} must be a non-negative decimal with up to 2 decimals`,
      );
    }
    return new Prisma.Decimal(value);
  }

  private money(value: Prisma.Decimal): string {
    return value.toFixed(2);
  }

  private dateString(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private toDate(value: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException("Invalid date");
    }
    return new Date(
      Date.UTC(
        parsed.getUTCFullYear(),
        parsed.getUTCMonth(),
        parsed.getUTCDate(),
      ),
    );
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }
}
