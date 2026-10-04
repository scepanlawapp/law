import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  BillingStatementLineStatus,
  BillingStatementStatus,
  Prisma,
  PriceSourceScope,
  WorkEntryStatus,
} from "@prisma/client";
import {
  BillingStatementLineSummary,
  CaseReference,
  ClientReference,
  UserReference,
  WorkspaceRole,
} from "@law/api-interfaces";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";
import {
  AppendPriceSourceVersionDto,
  BillingStatementLineInputDto,
  CreatePriceSourceDto,
  CreateStatementDto,
  ExternalInvoiceDto,
  SendStatementDto,
  UpdateStatementDto,
} from "./financials.dto";

const WORK_ENTRY_GROUP = "WORK_ENTRY_GROUP";

@Injectable()
export class FinancialsService {
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
    if (!this.isManager())
      throw new ForbiddenException("Finance manager access required");
  }

  private assertFinanceUser(): void {
    if (!this.isManager() && this.context.role !== WorkspaceRole.LAWYER) {
      throw new ForbiddenException("Finance access required");
    }
  }

  private async assertClient(clientId: string) {
    const client = await this.db.client.findFirst({
      where: { id: clientId, workspaceId: this.workspaceId },
    });
    if (!client) throw new NotFoundException("Client not found");
    return client;
  }

  private async assertCase(caseId: string | undefined, clientId: string) {
    if (!caseId) return null;
    const caseRecord = await this.db.case.findFirst({
      where: { id: caseId, workspaceId: this.workspaceId },
    });
    if (!caseRecord) throw new NotFoundException("Case not found");
    if (caseRecord.clientId !== clientId)
      throw new ConflictException("Case does not belong to client");
    return caseRecord;
  }

  private clientReference(client: {
    id: string;
    clientNumber: string;
    type: any;
    displayName: string;
    status: any;
  }): ClientReference {
    return {
      id: client.id,
      clientNumber: client.clientNumber,
      type: client.type,
      displayName: client.displayName,
      status: client.status,
    };
  }

  private caseReference(
    caseRecord: {
      id: string;
      caseNumber: string;
      name: string;
      status: any;
      priority: any;
    } | null,
  ): CaseReference | null {
    return caseRecord
      ? {
          id: caseRecord.id,
          caseNumber: caseRecord.caseNumber,
          name: caseRecord.name,
          status: caseRecord.status,
          priority: caseRecord.priority,
        }
      : null;
  }

  private userReference(user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  }): UserReference {
    return {
      id: user.id,
      displayName:
        [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      email: user.email,
    };
  }

  private lineSummary(line: any): BillingStatementLineSummary {
    return {
      id: line.id,
      statementId: line.statementId,
      client: this.clientReference(line.client),
      cases: line.caseLinks
        .map(
          (link: {
            case: {
              id: string;
              caseNumber: string;
              name: string;
              status: CaseReference["status"];
              priority: CaseReference["priority"];
            };
          }) => this.caseReference(link.case),
        )
        .filter(
          (caseRecord: CaseReference | null): caseRecord is CaseReference =>
            caseRecord !== null,
        ),
      performedBy: this.userReference(line.performedBy),
      lineOrder: line.lineOrder,
      description: line.description,
      serviceDate: line.serviceDate.toISOString().slice(0, 10),
      netAmount: line.netAmount.toString(),
      vatRate: line.vatRate.toString(),
      vatAmount: line.vatAmount.toString(),
      grossAmount: line.grossAmount.toString(),
      currency: line.currency,
      status: line.status,
      sourceType: line.sourceType,
      sourceId: line.sourceId,
      pricingRequired: line.pricingRequired,
      minutes: line.minutes,
      workEntries: (line.workEntries ?? []).map(
        (entry: {
          id: string;
          workDate: Date;
          user: {
            id: string;
            firstName: string | null;
            lastName: string | null;
            email: string;
          };
          description: string;
          minutes: number | null;
        }) => ({
          id: entry.id,
          workDate: entry.workDate.toISOString().slice(0, 10),
          user: this.userReference(entry.user),
          description: entry.description,
          minutes: entry.minutes,
        }),
      ),
      billedAt: line.billedAt?.toISOString() ?? null,
      cancelledAt: line.cancelledAt?.toISOString() ?? null,
      cancellationReason: line.cancellationReason,
    };
  }

  private lineInclude = {
    client: true,
    caseLinks: { include: { case: true } },
    performedBy: true,
    workEntries: {
      include: { user: true },
      orderBy: [
        { workDate: "asc" as const },
        { createdAt: "asc" as const },
      ] as Prisma.WorkEntryOrderByWithRelationInput[],
    },
  } as const;

  private statementInclude = {
    client: true,
    lines: {
      include: this.lineInclude,
      orderBy: { lineOrder: "asc" as const },
    },
  } as const;

  private statementResponse(statement: any) {
    return {
      ...statement,
      dateOfCreate: statement.dateOfCreate.toISOString().slice(0, 10),
      dateOfMaturity: statement.dateOfMaturity.toISOString().slice(0, 10),
      dateOfTurnover: statement.dateOfTurnover.toISOString().slice(0, 10),
      netAmount: statement.netAmount.toString(),
      vatRate: statement.vatRate.toString(),
      vatAmount: statement.vatAmount.toString(),
      grossAmount: statement.grossAmount.toString(),
      lines: statement.lines.map((line: any) => this.lineSummary(line)),
      total: statement.grossAmount.toFixed(2),
    };
  }

  async listPriceSources() {
    this.assertManager();
    return this.db.priceSource.findMany({
      where: { workspaceId: this.workspaceId },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async createPriceSource(input: CreatePriceSourceDto) {
    this.assertManager();
    if (input.scope === PriceSourceScope.CLIENT_AGREEMENT && !input.clientId)
      throw new ConflictException("Client agreement requires a client");
    if (input.scope === PriceSourceScope.CASE_OVERRIDE && !input.caseId)
      throw new ConflictException("Case override requires a case");
    if (
      (input.scope === PriceSourceScope.WORKSPACE_PUBLIC_REFERENCE ||
        input.scope === PriceSourceScope.COMPANY_CATALOG) &&
      (input.clientId || input.caseId)
    )
      throw new ConflictException(
        "Workspace price sources cannot belong to a client or case",
      );
    if (input.clientId) await this.assertClient(input.clientId);
    await this.assertCase(input.caseId, input.clientId ?? "");
    return this.db.$transaction(async (tx) => {
      const source = await tx.priceSource.create({
        data: {
          workspaceId: this.workspaceId,
          scope: input.scope,
          clientId: input.clientId,
          caseId: input.caseId,
          title: input.title,
          sourceUrl: input.sourceUrl,
          documentId: input.documentId,
          createdByUserId: this.context.userId,
        },
      });
      return tx.priceSourceVersion.create({
        data: {
          workspaceId: this.workspaceId,
          priceSourceId: source.id,
          version: 1,
          rawText: input.rawText,
          effectiveFrom: input.effectiveFrom
            ? new Date(input.effectiveFrom)
            : undefined,
          effectiveTo: input.effectiveTo
            ? new Date(input.effectiveTo)
            : undefined,
          publishedAt: input.publishedAt
            ? new Date(input.publishedAt)
            : undefined,
          createdByUserId: this.context.userId,
        },
        include: { priceSource: true },
      });
    });
  }

  async appendPriceSourceVersion(
    sourceId: string,
    input: AppendPriceSourceVersionDto,
  ) {
    this.assertManager();
    const source = await this.db.priceSource.findFirst({
      where: { id: sourceId, workspaceId: this.workspaceId },
    });
    if (!source) throw new NotFoundException("Price source not found");
    const latest = await this.db.priceSourceVersion.findFirst({
      where: { priceSourceId: sourceId },
      orderBy: { version: "desc" },
    });
    return this.db.priceSourceVersion.create({
      data: {
        workspaceId: this.workspaceId,
        priceSourceId: sourceId,
        version: (latest?.version ?? 0) + 1,
        rawText: input.rawText,
        effectiveFrom: input.effectiveFrom
          ? new Date(input.effectiveFrom)
          : undefined,
        effectiveTo: input.effectiveTo
          ? new Date(input.effectiveTo)
          : undefined,
        publishedAt: input.publishedAt
          ? new Date(input.publishedAt)
          : undefined,
        createdByUserId: this.context.userId,
      },
    });
  }

  async priceSourceVersion(sourceId: string, versionId: string) {
    this.assertManager();
    const version = await this.db.priceSourceVersion.findFirst({
      where: {
        id: versionId,
        priceSourceId: sourceId,
        workspaceId: this.workspaceId,
      },
      include: { priceSource: true },
    });
    if (!version) throw new NotFoundException("Price source version not found");
    return version;
  }

  async listPriceSourceVersions(sourceId: string) {
    this.assertManager();
    const source = await this.db.priceSource.findFirst({
      where: { id: sourceId, workspaceId: this.workspaceId },
    });
    if (!source) throw new NotFoundException("Price source not found");
    return this.db.priceSourceVersion.findMany({
      where: { workspaceId: this.workspaceId, priceSourceId: sourceId },
      orderBy: { version: "desc" },
    });
  }

  async listStatements() {
    this.assertManager();
    const statements = await this.db.billingStatement.findMany({
      where: { workspaceId: this.workspaceId },
      include: this.statementInclude,
      orderBy: { createdAt: "desc" },
    });
    return statements.map((statement) => this.statementResponse(statement));
  }

  private async logWorkEntries(
    tx: Prisma.TransactionClient,
    action: "WORK_ENTRY_BILLED" | "WORK_ENTRY_UNBILLED",
    entries: { id: string; clientId: string; caseId: string | null }[],
    statementId: string,
  ): Promise<void> {
    if (!entries.length) return;
    await tx.activityLog.createMany({
      data: entries.map((entry) => ({
        workspaceId: this.workspaceId,
        actorUserId: this.context.userId,
        action,
        entityType: "WORK_ENTRY",
        entityId: entry.id,
        clientId: entry.clientId,
        caseId: entry.caseId,
        metadata: { statementId },
      })),
    });
  }

  /** Claims confirmed, unbilled entries of the statement client for a line. */
  private async claimEntries(
    tx: Prisma.TransactionClient,
    statement: { id: string; clientId: string },
    lineId: string,
    entryIds: string[],
  ): Promise<{ caseIds: string[] }> {
    const claimed = await tx.workEntry.updateMany({
      where: {
        id: { in: entryIds },
        workspaceId: this.workspaceId,
        clientId: statement.clientId,
        status: WorkEntryStatus.CONFIRMED,
        statementLineId: null,
      },
      data: {
        status: WorkEntryStatus.BILLED,
        statementLineId: lineId,
        updatedByUserId: this.context.userId,
      },
    });
    if (claimed.count !== entryIds.length)
      throw new ConflictException(
        "Work entry is unavailable for the statement client",
      );
    const entries = await tx.workEntry.findMany({
      where: { id: { in: entryIds }, workspaceId: this.workspaceId },
      select: { id: true, clientId: true, caseId: true },
    });
    await this.logWorkEntries(tx, "WORK_ENTRY_BILLED", entries, statement.id);
    return {
      caseIds: [
        ...new Set(
          entries.flatMap((entry) => (entry.caseId ? [entry.caseId] : [])),
        ),
      ],
    };
  }

  /** Returns the entries billed on a statement to the unbilled pool. */
  private async releaseEntries(
    tx: Prisma.TransactionClient,
    statementId: string,
  ): Promise<void> {
    const entries = await tx.workEntry.findMany({
      where: {
        workspaceId: this.workspaceId,
        statementLine: { statementId },
      },
      select: { id: true, clientId: true, caseId: true, minutes: true },
    });
    if (!entries.length) return;
    const where = (ids: string[]) => ({
      id: { in: ids },
      workspaceId: this.workspaceId,
    });
    const timed = entries.filter((entry) => entry.minutes !== null);
    const untimed = entries.filter((entry) => entry.minutes === null);
    if (timed.length)
      await tx.workEntry.updateMany({
        where: where(timed.map((entry) => entry.id)),
        data: {
          status: WorkEntryStatus.CONFIRMED,
          statementLineId: null,
          updatedByUserId: this.context.userId,
        },
      });
    if (untimed.length)
      await tx.workEntry.updateMany({
        where: where(untimed.map((entry) => entry.id)),
        data: {
          status: WorkEntryStatus.PROPOSED,
          statementLineId: null,
          updatedByUserId: this.context.userId,
        },
      });
    await this.logWorkEntries(tx, "WORK_ENTRY_UNBILLED", entries, statementId);
  }

  private async replaceStatementLines(
    tx: Prisma.TransactionClient,
    statement: { id: string; clientId: string; currency: string },
    lines: BillingStatementLineInputDto[],
  ): Promise<void> {
    const entryIds = lines.flatMap((line) => line.workEntryIds ?? []);
    if (entryIds.length !== new Set(entryIds).size)
      throw new ConflictException("Statement work entries must be unique");
    if (
      lines.some(
        (line) =>
          line.currency.toUpperCase() !== statement.currency.toUpperCase(),
      )
    )
      throw new ConflictException(
        "Statement lines must have a matching currency",
      );

    // Release before deleting: onDelete SetNull alone would not reset status.
    await this.releaseEntries(tx, statement.id);
    await tx.billingStatementLine.deleteMany({
      where: { workspaceId: this.workspaceId, statementId: statement.id },
    });

    for (const [index, input] of lines.entries()) {
      const lineEntryIds = input.workEntryIds ?? [];
      const line = await tx.billingStatementLine.create({
        data: {
          workspaceId: this.workspaceId,
          statementId: statement.id,
          clientId: statement.clientId,
          performedByUserId: this.context.userId,
          lineOrder: index,
          serviceDate: new Date(input.serviceDate),
          description: input.description.trim(),
          netAmount: input.netAmount,
          vatRate: input.vatRate,
          vatAmount: input.vatAmount,
          grossAmount: input.grossAmount,
          currency: statement.currency.toUpperCase(),
          status: BillingStatementLineStatus.RESERVED,
          sourceType: lineEntryIds.length ? WORK_ENTRY_GROUP : null,
          sourceId: null,
          pricingRequired: input.pricingRequired ?? false,
          minutes: input.minutes ?? null,
          createdByUserId: this.context.userId,
          updatedByUserId: this.context.userId,
        },
      });
      if (!lineEntryIds.length) continue;
      const { caseIds } = await this.claimEntries(
        tx,
        statement,
        line.id,
        lineEntryIds,
      );
      if (caseIds.length)
        await tx.billingStatementLineCase.createMany({
          data: caseIds.map((caseId) => ({
            workspaceId: this.workspaceId,
            billingStatementLineId: line.id,
            caseId,
          })),
          skipDuplicates: true,
        });
    }
  }

  private async nextStatementNumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const counter = await tx.domainCounter.upsert({
      where: {
        workspaceId_name: {
          workspaceId: this.workspaceId,
          name: "BILLING_STATEMENT",
        },
      },
      create: {
        workspaceId: this.workspaceId,
        name: "BILLING_STATEMENT",
        value: 1,
      },
      update: { value: { increment: 1 } },
    });
    return `ST-${String(counter.value).padStart(6, "0")}`;
  }

  async createStatement(input: CreateStatementDto) {
    this.assertManager();
    await this.assertClient(input.clientId);
    if (input.idempotencyKey) {
      const existing = await this.db.financeMutationRequest.findUnique({
        where: {
          workspaceId_operation_idempotencyKey: {
            workspaceId: this.workspaceId,
            operation: "CREATE_STATEMENT",
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) return this.getStatement(existing.resultEntityId);
    }
    return this.db.$transaction(async (tx) => {
      const number = await this.nextStatementNumber(tx);
      const statement = await tx.billingStatement.create({
        data: {
          workspaceId: this.workspaceId,
          clientId: input.clientId,
          statementNumber: number,
          dateOfCreate: new Date(input.dateOfCreate),
          dateOfMaturity: new Date(input.dateOfMaturity),
          dateOfTurnover: new Date(input.dateOfTurnover),
          placeOfIssue: input.placeOfIssue.trim(),
          methodOfPayment: input.methodOfPayment.trim(),
          comment: input.comment.trim(),
          netAmount: input.netAmount,
          vatRate: input.vatRate,
          vatAmount: input.vatAmount,
          grossAmount: input.grossAmount,
          numberOfCashBill: input.numberOfCashBill.trim(),
          country: input.country.trim(),
          currency: input.currency.toUpperCase(),
          printWorkSpecification: input.printWorkSpecification,
          createdByUserId: this.context.userId,
          updatedByUserId: this.context.userId,
        },
      });
      await this.replaceStatementLines(tx, statement, input.lines);
      if (input.idempotencyKey)
        await tx.financeMutationRequest.create({
          data: {
            workspaceId: this.workspaceId,
            operation: "CREATE_STATEMENT",
            idempotencyKey: input.idempotencyKey,
            resultEntityId: statement.id,
            result: { statementId: statement.id },
          },
        });
      const complete = await tx.billingStatement.findUniqueOrThrow({
        where: { id: statement.id },
        include: this.statementInclude,
      });
      return this.statementResponse(complete);
    });
  }

  /**
   * Service-only entry point for the billing run: creates a draft statement
   * for a client month from prepared lines inside the caller's transaction.
   * Not exposed through the controller; the caller enforces access.
   */
  async createDraftFromLines(
    tx: Prisma.TransactionClient,
    input: {
      clientId: string;
      currency: string;
      billingMonth: string;
      header: Pick<
        CreateStatementDto,
        | "dateOfCreate"
        | "dateOfMaturity"
        | "dateOfTurnover"
        | "placeOfIssue"
        | "methodOfPayment"
        | "country"
        | "vatRate"
      >;
      lines: BillingStatementLineInputDto[];
    },
  ): Promise<string> {
    const sum = (pick: (line: BillingStatementLineInputDto) => number) =>
      Math.round(
        input.lines.reduce((total, line) => total + pick(line) * 100, 0),
      ) / 100;
    const number = await this.nextStatementNumber(tx);
    const statement = await tx.billingStatement.create({
      data: {
        workspaceId: this.workspaceId,
        clientId: input.clientId,
        statementNumber: number,
        dateOfCreate: new Date(input.header.dateOfCreate),
        dateOfMaturity: new Date(input.header.dateOfMaturity),
        dateOfTurnover: new Date(input.header.dateOfTurnover),
        placeOfIssue: input.header.placeOfIssue.trim(),
        methodOfPayment: input.header.methodOfPayment.trim(),
        comment: "",
        netAmount: sum((line) => line.netAmount),
        vatRate: input.header.vatRate,
        vatAmount: sum((line) => line.vatAmount),
        grossAmount: sum((line) => line.grossAmount),
        numberOfCashBill: "",
        country: input.header.country.trim(),
        currency: input.currency.toUpperCase(),
        billingMonth: input.billingMonth,
        createdByUserId: this.context.userId,
        updatedByUserId: this.context.userId,
      },
    });
    await this.replaceStatementLines(tx, statement, input.lines);
    return statement.id;
  }

  async getStatement(id: string) {
    this.assertManager();
    const statement = await this.db.billingStatement.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: this.statementInclude,
    });
    if (!statement) throw new NotFoundException("Statement not found");
    return this.statementResponse(statement);
  }

  async updateStatement(id: string, input: UpdateStatementDto) {
    this.assertManager();
    const statement = await this.getStatement(id);
    if (statement.status !== BillingStatementStatus.DRAFT)
      throw new ConflictException("Only draft statements can be edited");
    await this.db.$transaction(async (tx) => {
      await tx.billingStatement.update({
        where: { id },
        data: {
          dateOfCreate: input.dateOfCreate
            ? new Date(input.dateOfCreate)
            : undefined,
          dateOfMaturity: input.dateOfMaturity
            ? new Date(input.dateOfMaturity)
            : undefined,
          dateOfTurnover: input.dateOfTurnover
            ? new Date(input.dateOfTurnover)
            : undefined,
          placeOfIssue: input.placeOfIssue?.trim(),
          methodOfPayment: input.methodOfPayment?.trim(),
          comment: input.comment?.trim(),
          netAmount: input.netAmount,
          vatRate: input.vatRate,
          vatAmount: input.vatAmount,
          grossAmount: input.grossAmount,
          numberOfCashBill: input.numberOfCashBill?.trim(),
          country: input.country?.trim(),
          printWorkSpecification: input.printWorkSpecification,
          updatedByUserId: this.context.userId,
        },
      });
      if (input.lines)
        await this.replaceStatementLines(tx, statement, input.lines);
    });
    return this.getStatement(id);
  }

  async deleteStatement(id: string): Promise<void> {
    this.assertManager();
    const statement = await this.db.billingStatement.findFirst({
      where: { id, workspaceId: this.workspaceId },
      select: { id: true, status: true },
    });
    if (!statement) throw new NotFoundException("Statement not found");
    if (statement.status !== BillingStatementStatus.DRAFT)
      throw new ConflictException("Only draft statements can be deleted");

    await this.db.$transaction(async (tx) => {
      await tx.financeMutationRequest.deleteMany({
        where: {
          workspaceId: this.workspaceId,
          operation: "CREATE_STATEMENT",
          resultEntityId: id,
        },
      });
      await this.releaseEntries(tx, id);
      await tx.billingStatement.delete({ where: { id } });
    });
  }

  async sendStatement(id: string, input: SendStatementDto) {
    this.assertManager();
    if (input.idempotencyKey) {
      const existing = await this.db.financeMutationRequest.findUnique({
        where: {
          workspaceId_operation_idempotencyKey: {
            workspaceId: this.workspaceId,
            operation: "SEND_STATEMENT",
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) return this.getStatement(existing.resultEntityId);
    }
    const statement = await this.getStatement(id);
    if (statement.status !== BillingStatementStatus.DRAFT)
      throw new ConflictException("Only draft statements can be sent");
    if (
      statement.lines.some(
        (line: { pricingRequired: boolean }) => line.pricingRequired,
      )
    )
      throw new ConflictException("Price every line before sending");
    return this.db.$transaction(async (tx) => {
      const sent = await tx.billingStatement.update({
        where: { id },
        data: {
          status: BillingStatementStatus.SENT,
          sharedAt: new Date(),
          sharedMethod: input.sharedMethod ?? "EXTERNAL",
          sharedByUserId: this.context.userId,
          updatedByUserId: this.context.userId,
        },
      });
      await tx.billingStatementLine.updateMany({
        where: {
          workspaceId: this.workspaceId,
          statementId: id,
        },
        data: {
          status: BillingStatementLineStatus.BILLED,
          billedAt: new Date(),
          updatedByUserId: this.context.userId,
        },
      });
      if (input.idempotencyKey)
        await tx.financeMutationRequest.create({
          data: {
            workspaceId: this.workspaceId,
            operation: "SEND_STATEMENT",
            idempotencyKey: input.idempotencyKey,
            resultEntityId: sent.id,
            result: { statementId: sent.id },
          },
        });
      const complete = await tx.billingStatement.findUniqueOrThrow({
        where: { id: sent.id },
        include: this.statementInclude,
      });
      return this.statementResponse(complete);
    });
  }

  async voidStatement(id: string) {
    this.assertManager();
    const statement = await this.getStatement(id);
    if (statement.status === BillingStatementStatus.VOIDED) return statement;
    return this.db.$transaction(async (tx) => {
      await tx.billingStatement.update({
        where: { id },
        data: {
          status: BillingStatementStatus.VOIDED,
          voidedAt: new Date(),
          voidedByUserId: this.context.userId,
          updatedByUserId: this.context.userId,
        },
      });
      await this.releaseEntries(tx, id);
      if (statement.status === BillingStatementStatus.DRAFT) {
        await tx.billingStatementLine.deleteMany({
          where: { workspaceId: this.workspaceId, statementId: id },
        });
      }
      const full = await tx.billingStatement.findUniqueOrThrow({
        where: { id },
        include: this.statementInclude,
      });
      return this.statementResponse(full);
    });
  }

  async linkExternalInvoice(id: string, input: ExternalInvoiceDto) {
    this.assertManager();
    await this.getStatement(id);
    const updated = await this.db.billingStatement.update({
      where: { id },
      data: {
        externalInvoiceNumber: input.invoiceNumber,
        externalInvoiceDate: input.invoiceDate
          ? new Date(input.invoiceDate)
          : undefined,
        externalReference: input.reference,
        updatedByUserId: this.context.userId,
      },
      include: this.statementInclude,
    });
    return this.statementResponse(updated);
  }
}
