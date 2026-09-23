import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  BillingDisposition,
  BillingEntryLifecycle,
  BillingStatementStatus,
  Prisma,
  PriceSourceScope,
} from "@prisma/client";
import {
  BillingEntrySummary,
  BillingSuggestion,
  CaseReference,
  ClientReference,
  PaginatedResponse,
  UserReference,
  WorkspaceRole,
} from "@law/api-interfaces";
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, paginationMeta } from "@law/core";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";
import {
  AppendPriceSourceVersionDto,
  BillingEntryListQueryDto,
  CandidateQueryDto,
  CreateBillingEntryDto,
  CreatePaymentDto,
  CreatePriceSourceDto,
  CreateStatementDto,
  ExternalInvoiceDto,
  SendStatementDto,
  UpdateBillingEntryDto,
  UpdateStatementDto,
} from "./financials.dto";

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

  private async assertPerformer(userId: string) {
    const member = await this.db.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: this.workspaceId } },
      include: { user: true },
    });
    if (!member || member.status !== "ACTIVE")
      throw new NotFoundException("Performer not found");
    return member.user;
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

  private entrySummary(entry: any): BillingEntrySummary {
    return {
      id: entry.id,
      client: this.clientReference(entry.client),
      case: this.caseReference(entry.case),
      performedBy: this.userReference(entry.performedBy),
      workDate: entry.workDate.toISOString().slice(0, 10),
      kind: entry.kind,
      disposition: entry.disposition,
      lifecycle: entry.lifecycle,
      description: entry.description,
      clientDescription: entry.clientDescription,
      durationMinutes: entry.durationMinutes,
      amount: entry.amount.toString(),
      expenseCostAmount: entry.expenseCostAmount?.toString() ?? null,
      currency: entry.currency,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
    };
  }

  private entryInclude = {
    client: true,
    case: true,
    performedBy: true,
  } as const;

  private statementResponse(statement: any) {
    const total = statement.lines.reduce(
      (sum: Prisma.Decimal, line: { amount: Prisma.Decimal }) =>
        sum.plus(line.amount),
      new Prisma.Decimal(0),
    );
    const paid = statement.payments
      .filter((payment: { reversedAt: Date | null }) => !payment.reversedAt)
      .reduce(
        (sum: Prisma.Decimal, payment: { amount: Prisma.Decimal }) =>
          sum.plus(payment.amount),
        new Prisma.Decimal(0),
      );
    const outstanding = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      total.minus(paid),
    );
    return {
      ...statement,
      total: total.toFixed(2),
      paid: paid.toFixed(2),
      outstanding: outstanding.toFixed(2),
      paymentStatus: paid.isZero()
        ? "UNPAID"
        : paid.gte(total)
          ? "PAID"
          : "PARTIAL",
    };
  }

  async listEntries(
    query: BillingEntryListQueryDto,
  ): Promise<PaginatedResponse<BillingEntrySummary>> {
    this.assertFinanceUser();
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.BillingEntryWhereInput = {
      workspaceId: this.workspaceId,
    };
    if (!this.isManager()) where.performedByUserId = this.context.userId;
    if (query.clientId) where.clientId = query.clientId;
    if (query.caseId) where.caseId = query.caseId;
    if (query.performerId && this.isManager())
      where.performedByUserId = query.performerId;
    if (query.kind) where.kind = query.kind;
    if (query.disposition) where.disposition = query.disposition;
    if (query.lifecycle) where.lifecycle = query.lifecycle;
    if (query.currency) where.currency = query.currency;
    if (query.from || query.to)
      where.workDate = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    const [items, totalItems] = await this.db.$transaction([
      this.db.billingEntry.findMany({
        where,
        include: this.entryInclude,
        orderBy: { workDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.billingEntry.count({ where }),
    ]);
    return {
      items: items.map((item) => this.entrySummary(item)),
      meta: paginationMeta(page, pageSize, totalItems, [
        { field: "workDate", direction: "desc" },
      ]),
    };
  }

  async createEntry(
    input: CreateBillingEntryDto,
  ): Promise<BillingEntrySummary> {
    this.assertFinanceUser();
    await this.assertClient(input.clientId);
    await this.assertCase(input.caseId, input.clientId);
    const performerId = input.performedByUserId ?? this.context.userId;
    if (performerId !== this.context.userId) this.assertManager();
    await this.assertPerformer(performerId);
    this.validateDisposition(
      input.disposition ?? BillingDisposition.BILLABLE,
      input.amount,
      input.noChargeReason,
    );
    const entry = await this.db.billingEntry.create({
      data: {
        workspaceId: this.workspaceId,
        clientId: input.clientId,
        caseId: input.caseId,
        performedByUserId: performerId,
        workDate: new Date(input.workDate),
        kind: input.kind,
        disposition: input.disposition ?? BillingDisposition.BILLABLE,
        lifecycle: BillingEntryLifecycle.DRAFT,
        description: input.description,
        clientDescription: input.clientDescription,
        durationMinutes: input.durationMinutes,
        billedDurationMinutes: input.billedDurationMinutes,
        quantity: input.quantity,
        unit: input.unit,
        amount: input.amount,
        expenseCostAmount: input.expenseCostAmount,
        currency: input.currency ?? "RSD",
        noChargeReason: input.noChargeReason,
        priceSourceVersionId: input.priceSourceVersionId,
        priceSourceExcerpt: input.priceSourceExcerpt,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        createdByUserId: this.context.userId,
        updatedByUserId: this.context.userId,
      },
      include: this.entryInclude,
    });
    return this.entrySummary(entry);
  }

  async getEntry(id: string): Promise<BillingEntrySummary> {
    this.assertFinanceUser();
    const entry = await this.db.billingEntry.findFirst({
      where: {
        id,
        workspaceId: this.workspaceId,
        ...(this.isManager() ? {} : { performedByUserId: this.context.userId }),
      },
      include: this.entryInclude,
    });
    if (!entry) throw new NotFoundException("Billing entry not found");
    return this.entrySummary(entry);
  }

  async updateEntry(
    id: string,
    input: UpdateBillingEntryDto,
  ): Promise<BillingEntrySummary> {
    this.assertFinanceUser();
    const entry = await this.db.billingEntry.findFirst({
      where: {
        id,
        workspaceId: this.workspaceId,
        ...(this.isManager() ? {} : { performedByUserId: this.context.userId }),
      },
    });
    if (!entry) throw new NotFoundException("Billing entry not found");
    if (entry.lifecycle === BillingEntryLifecycle.STATEMENT_SENT)
      throw new ConflictException("Sent entry is immutable");
    const disposition = input.disposition ?? entry.disposition;
    const amount = input.amount ?? Number(entry.amount);
    this.validateDisposition(
      disposition,
      amount,
      input.noChargeReason ?? entry.noChargeReason ?? undefined,
    );
    const updated = await this.db.billingEntry.update({
      where: { id },
      data: { ...input, amount, updatedByUserId: this.context.userId },
      include: this.entryInclude,
    });
    return this.entrySummary(updated);
  }

  private validateDisposition(
    disposition: BillingDisposition,
    amount: number,
    reason?: string,
  ) {
    if (disposition === BillingDisposition.BILLABLE && amount <= 0)
      throw new ConflictException("Billable entries require a positive amount");
    if (
      (disposition === BillingDisposition.INCLUDED ||
        disposition === BillingDisposition.NO_CHARGE) &&
      (amount !== 0 || !reason?.trim())
    )
      throw new ConflictException("Zero-charge entries require a reason");
  }

  async listCandidates(
    query: CandidateQueryDto,
  ): Promise<PaginatedResponse<BillingSuggestion>> {
    this.assertFinanceUser();
    const from = query.from
      ? new Date(query.from)
      : new Date(Date.now() - 90 * 86400000);
    const to = query.to ? new Date(query.to) : new Date();
    const [events, tasks, deadlines, caseActivities, clientActivities] =
      await Promise.all([
        this.db.event.findMany({
          where: {
            workspaceId: this.workspaceId,
            status: "COMPLETED",
            startsAt: { gte: from, lte: to },
          },
          include: {
            case: true,
            clients: { include: { client: true } },
            organizer: true,
            assignees: { include: { user: true } },
          },
          orderBy: { startsAt: "desc" },
        }),
        this.db.task.findMany({
          where: {
            workspaceId: this.workspaceId,
            status: "DONE",
            completedAt: { gte: from, lte: to },
          },
          include: {
            case: { include: { client: true } },
            client: true,
            assignee: true,
          },
          orderBy: { completedAt: "desc" },
        }),
        this.db.deadline.findMany({
          where: {
            workspaceId: this.workspaceId,
            status: "SATISFIED",
            satisfiedAt: { gte: from, lte: to },
          },
          include: {
            case: { include: { client: true } },
            client: true,
            responsibleUser: true,
          },
          orderBy: { satisfiedAt: "desc" },
        }),
        this.db.caseActivity.findMany({
          where: {
            workspaceId: this.workspaceId,
            activityDate: { gte: from, lte: to },
          },
          include: { case: { include: { client: true } } },
          orderBy: { activityDate: "desc" },
        }),
        this.db.clientActivity.findMany({
          where: {
            workspaceId: this.workspaceId,
            activityDate: { gte: from, lte: to },
          },
          include: { client: true, relatedCase: true },
          orderBy: { activityDate: "desc" },
        }),
      ]);
    const raw: Array<any> = [];
    for (const event of events)
      for (const performer of event.assignees.length
        ? event.assignees
        : [{ user: event.organizer }])
        for (const relation of event.clients)
          raw.push({
            candidateKey: `EVENT:${event.id}:${performer.user.id}:${relation.client.id}`,
            sourceType: "EVENT",
            sourceId: event.id,
            title: event.title,
            date: event.startsAt,
            client: relation.client,
            case: event.case,
            performer: performer.user,
            reason: "Completed event",
            warnings:
              event.clients.length > 1
                ? ["Event has multiple clients; confirm the billing client."]
                : [],
          });
    for (const task of tasks)
      raw.push({
        candidateKey: `TASK:${task.id}:${task.assignee.id}`,
        sourceType: "TASK",
        sourceId: task.id,
        title: task.title,
        date: task.completedAt ?? task.updatedAt,
        client: task.client ?? task.case?.client,
        case: task.case,
        performer: task.assignee,
        reason: "Completed task",
        warnings: [],
      });
    for (const deadline of deadlines)
      raw.push({
        candidateKey: `DEADLINE:${deadline.id}:${deadline.responsibleUser.id}`,
        sourceType: "DEADLINE",
        sourceId: deadline.id,
        title: deadline.title,
        date: deadline.satisfiedAt ?? deadline.updatedAt,
        client: deadline.client ?? deadline.case?.client,
        case: deadline.case,
        performer: deadline.responsibleUser,
        reason: "Satisfied deadline; confirm actual service",
        warnings: ["A satisfied deadline is not itself billable."],
      });
    for (const activity of caseActivities)
      raw.push({
        candidateKey: `CASE_ACTIVITY:${activity.id}:${activity.createdByUserId}`,
        sourceType: "CASE_ACTIVITY",
        sourceId: activity.id,
        title: activity.title,
        date: activity.activityDate,
        client: activity.case.client,
        case: activity.case,
        performer: null,
        reason: "Recorded case activity",
        warnings: ["Actual duration and performer are required."],
      });
    for (const activity of clientActivities)
      raw.push({
        candidateKey: `CLIENT_ACTIVITY:${activity.id}:${activity.createdByUserId}`,
        sourceType: "CLIENT_ACTIVITY",
        sourceId: activity.id,
        title: activity.title,
        date: activity.activityDate,
        client: activity.client,
        case: activity.relatedCase,
        performer: null,
        reason: "Recorded client activity",
        warnings: ["Actual duration and charge decision are required."],
      });
    const reviews = await this.db.billingSuggestionReview.findMany({
      where: {
        workspaceId: this.workspaceId,
        candidateKey: { in: raw.map((item) => item.candidateKey) },
      },
    });
    const reviewMap = new Map(
      reviews.map((review) => [review.candidateKey, review]),
    );
    const visibleRaw = this.isManager()
      ? raw
      : raw.filter((item) => item.performer?.id === this.context.userId);
    const items = visibleRaw
      .filter((item) =>
        query.sourceType ? item.sourceType === query.sourceType : true,
      )
      .filter(
        (item) =>
          query.includeResolved === "true" ||
          !["DISMISSED", "RECORDED"].includes(
            reviewMap.get(item.candidateKey)?.resolution ?? "PENDING",
          ),
      )
      .map((item) => ({
        ...item,
        resolution: reviewMap.get(item.candidateKey)?.resolution ?? "PENDING",
      }));
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return {
      items: items
        .slice((page - 1) * pageSize, page * pageSize)
        .map((item) => ({
          candidateKey: item.candidateKey,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          title: item.title,
          date: item.date.toISOString(),
          client: item.client ? this.clientReference(item.client) : null,
          case: this.caseReference(item.case),
          proposedPerformer: item.performer
            ? this.userReference(item.performer)
            : null,
          resolution: item.resolution,
          reason: item.reason,
          warnings: item.warnings,
        })),
      meta: paginationMeta(page, pageSize, items.length, [
        { field: "date", direction: "desc" },
      ]),
    };
  }

  async reviewCandidate(
    candidateKey: string,
    resolution: "DISMISSED" | "PENDING",
  ) {
    this.assertFinanceUser();
    const source = candidateKey.split(":");
    return this.db.billingSuggestionReview.upsert({
      where: {
        workspaceId_candidateKey: {
          workspaceId: this.workspaceId,
          candidateKey,
        },
      },
      create: {
        workspaceId: this.workspaceId,
        candidateKey,
        sourceType: source[0],
        sourceId: source[1],
        resolution,
        reviewedByUserId: this.context.userId,
        reviewedAt: new Date(),
      },
      update: {
        resolution,
        reviewedByUserId: this.context.userId,
        reviewedAt: new Date(),
      },
    });
  }

  async recordCandidate(candidateKey: string, billingEntryId: string) {
    this.assertFinanceUser();
    const entry = await this.db.billingEntry.findFirst({
      where: { id: billingEntryId, workspaceId: this.workspaceId },
    });
    if (!entry) throw new NotFoundException("Billing entry not found");
    const source = candidateKey.split(":");
    return this.db.billingSuggestionReview.upsert({
      where: {
        workspaceId_candidateKey: {
          workspaceId: this.workspaceId,
          candidateKey,
        },
      },
      create: {
        workspaceId: this.workspaceId,
        candidateKey,
        sourceType: source[0],
        sourceId: source[1],
        resolution: "RECORDED",
        reviewedByUserId: this.context.userId,
        reviewedAt: new Date(),
        billingEntryId,
      },
      update: {
        resolution: "RECORDED",
        reviewedByUserId: this.context.userId,
        reviewedAt: new Date(),
        billingEntryId,
      },
    });
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
      include: { client: true, lines: true, payments: true },
      orderBy: { createdAt: "desc" },
    });
    return statements.map((statement) => this.statementResponse(statement));
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
    const entries = await this.db.billingEntry.findMany({
      where: {
        workspaceId: this.workspaceId,
        id: { in: input.entryIds ?? [] },
        clientId: input.clientId,
        currency: input.currency,
        lifecycle: {
          in: [BillingEntryLifecycle.DRAFT, BillingEntryLifecycle.READY],
        },
        disposition: {
          in: [
            BillingDisposition.BILLABLE,
            BillingDisposition.INCLUDED,
            BillingDisposition.NO_CHARGE,
          ],
        },
      },
      include: { case: true },
    });
    if (entries.length !== (input.entryIds ?? []).length)
      throw new ConflictException(
        "Some entries are unavailable or not statement eligible",
      );
    return this.db.$transaction(async (tx) => {
      const number = await this.nextStatementNumber(tx);
      const statement = await tx.billingStatement.create({
        data: {
          workspaceId: this.workspaceId,
          clientId: input.clientId,
          statementNumber: number,
          periodStart: new Date(input.periodStart),
          periodEnd: new Date(input.periodEnd),
          currency: input.currency,
          createdByUserId: this.context.userId,
          updatedByUserId: this.context.userId,
          lines: {
            create: entries.map((entry, index) => ({
              billingEntryId: entry.id,
              lineOrder: index,
              description: entry.clientDescription,
              serviceDate: entry.workDate,
              caseReference: entry.case?.caseNumber,
              quantity: entry.quantity,
              durationMinutes:
                entry.billedDurationMinutes ?? entry.durationMinutes,
              amount: entry.amount,
              currency: entry.currency,
              chargeLabel: entry.disposition,
            })),
          },
        },
        include: { client: true, lines: true, payments: true },
      });
      if (entries.length)
        await tx.billingEntry.updateMany({
          where: {
            id: { in: entries.map((entry) => entry.id) },
            lifecycle: {
              in: [BillingEntryLifecycle.DRAFT, BillingEntryLifecycle.READY],
            },
          },
          data: {
            lifecycle: BillingEntryLifecycle.RESERVED,
            updatedByUserId: this.context.userId,
          },
        });
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
      return this.statementResponse(statement);
    });
  }

  async getStatement(id: string) {
    this.assertManager();
    const statement = await this.db.billingStatement.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: { client: true, lines: true, payments: true },
    });
    if (!statement) throw new NotFoundException("Statement not found");
    return this.statementResponse(statement);
  }

  async updateStatement(id: string, input: UpdateStatementDto) {
    this.assertManager();
    const statement = await this.getStatement(id);
    if (statement.status !== BillingStatementStatus.DRAFT)
      throw new ConflictException("Only draft statements can be edited");
    if (input.entryIds) {
      await this.db.$transaction(async (tx) => {
        await tx.billingEntry.updateMany({
          where: {
            workspaceId: this.workspaceId,
            lifecycle: BillingEntryLifecycle.RESERVED,
            statementLines: { some: { statementId: id } },
          },
          data: {
            lifecycle: BillingEntryLifecycle.READY,
            updatedByUserId: this.context.userId,
          },
        });
        await tx.billingStatementLine.deleteMany({
          where: { statementId: id },
        });
        const entries = await tx.billingEntry.findMany({
          where: {
            workspaceId: this.workspaceId,
            id: { in: input.entryIds },
            clientId: statement.clientId,
            currency: statement.currency,
            lifecycle: {
              in: [BillingEntryLifecycle.DRAFT, BillingEntryLifecycle.READY],
            },
            disposition: {
              in: [
                BillingDisposition.BILLABLE,
                BillingDisposition.INCLUDED,
                BillingDisposition.NO_CHARGE,
              ],
            },
          },
        });
        if (entries.length !== input.entryIds.length)
          throw new ConflictException("Some entries are unavailable");
        await tx.billingStatementLine.createMany({
          data: entries.map((entry, index) => ({
            statementId: id,
            billingEntryId: entry.id,
            lineOrder: index,
            description: entry.clientDescription,
            serviceDate: entry.workDate,
            amount: entry.amount,
            currency: entry.currency,
            chargeLabel: entry.disposition,
          })),
        });
        await tx.billingEntry.updateMany({
          where: { id: { in: input.entryIds } },
          data: {
            lifecycle: BillingEntryLifecycle.RESERVED,
            updatedByUserId: this.context.userId,
          },
        });
      });
    }
    return this.getStatement(id);
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
        include: { client: true, lines: true, payments: true },
      });
      await tx.billingEntry.updateMany({
        where: {
          workspaceId: this.workspaceId,
          statementLines: { some: { statementId: id } },
        },
        data: {
          lifecycle: BillingEntryLifecycle.STATEMENT_SENT,
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
      return this.statementResponse(sent);
    });
  }

  async voidStatement(id: string) {
    this.assertManager();
    const statement = await this.getStatement(id);
    if (statement.status === BillingStatementStatus.VOIDED) return statement;
    return this.db.$transaction(async (tx) => {
      const result = await tx.billingStatement.update({
        where: { id },
        data: {
          status: BillingStatementStatus.VOIDED,
          voidedAt: new Date(),
          voidedByUserId: this.context.userId,
          updatedByUserId: this.context.userId,
        },
      });
      if (statement.status === BillingStatementStatus.DRAFT)
        await tx.billingEntry.updateMany({
          where: {
            workspaceId: this.workspaceId,
            statementLines: { some: { statementId: id } },
          },
          data: {
            lifecycle: BillingEntryLifecycle.READY,
            updatedByUserId: this.context.userId,
          },
        });
      const full = await tx.billingStatement.findUniqueOrThrow({
        where: { id },
        include: { client: true, lines: true, payments: true },
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
      include: { client: true, lines: true, payments: true },
    });
    return this.statementResponse(updated);
  }

  async addPayment(id: string, input: CreatePaymentDto) {
    this.assertManager();
    if (input.idempotencyKey) {
      const existing = await this.db.financeMutationRequest.findUnique({
        where: {
          workspaceId_operation_idempotencyKey: {
            workspaceId: this.workspaceId,
            operation: "CREATE_PAYMENT",
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing)
        return this.db.externalPaymentRecord.findFirst({
          where: { id: existing.resultEntityId, workspaceId: this.workspaceId },
        });
    }
    const statement = await this.getStatement(id);
    if (statement.status !== BillingStatementStatus.SENT)
      throw new ConflictException("Payments require a sent statement");
    if (input.currency !== statement.currency)
      throw new ConflictException("Payment currency mismatch");
    const paid = statement.payments
      .filter((payment) => !payment.reversedAt)
      .reduce(
        (sum, payment) => sum.plus(payment.amount),
        new Prisma.Decimal(0),
      );
    const total = statement.lines.reduce(
      (sum, line) => sum.plus(line.amount),
      new Prisma.Decimal(0),
    );
    if (paid.plus(new Prisma.Decimal(input.amount)).gt(total))
      throw new ConflictException("Payment would exceed statement total");
    return this.db.$transaction(async (tx) => {
      const payment = await tx.externalPaymentRecord.create({
        data: {
          workspaceId: this.workspaceId,
          statementId: id,
          amount: input.amount,
          currency: input.currency,
          paidDate: new Date(input.paidDate),
          externalReference: input.externalReference,
          recordedByUserId: this.context.userId,
        },
      });
      if (input.idempotencyKey)
        await tx.financeMutationRequest.create({
          data: {
            workspaceId: this.workspaceId,
            operation: "CREATE_PAYMENT",
            idempotencyKey: input.idempotencyKey,
            resultEntityId: payment.id,
            result: { paymentId: payment.id },
          },
        });
      return payment;
    });
  }

  async overview() {
    this.assertManager();
    const [pending, ready, reserved, sent] = await Promise.all([
      this.db.billingSuggestionReview.count({
        where: { workspaceId: this.workspaceId, resolution: "PENDING" },
      }),
      this.db.billingEntry.aggregate({
        where: {
          workspaceId: this.workspaceId,
          lifecycle: BillingEntryLifecycle.READY,
          disposition: BillingDisposition.BILLABLE,
        },
        _sum: { amount: true },
      }),
      this.db.billingEntry.aggregate({
        where: {
          workspaceId: this.workspaceId,
          lifecycle: BillingEntryLifecycle.RESERVED,
        },
        _sum: { amount: true },
      }),
      this.db.billingStatement.findMany({
        where: {
          workspaceId: this.workspaceId,
          status: BillingStatementStatus.SENT,
        },
        include: { lines: true, payments: true },
      }),
    ]);
    const sentTotals = new Map<string, Prisma.Decimal>();
    const externallyUnpaid = new Map<string, Prisma.Decimal>();
    for (const statement of sent) {
      const summary = this.statementResponse(statement);
      const total = new Prisma.Decimal(summary.total);
      sentTotals.set(
        statement.currency,
        (sentTotals.get(statement.currency) ?? new Prisma.Decimal(0)).plus(
          total,
        ),
      );
      if (statement.externalInvoiceNumber)
        externallyUnpaid.set(
          statement.currency,
          (
            externallyUnpaid.get(statement.currency) ?? new Prisma.Decimal(0)
          ).plus(new Prisma.Decimal(summary.outstanding)),
        );
    }
    const grouped = (values: Map<string, Prisma.Decimal>) =>
      [...values].map(([currency, amount]) => ({
        currency,
        amount: amount.toFixed(2),
      }));
    return {
      unresolvedCandidateCount: pending,
      readyUnbilledByCurrency: [
        { currency: "RSD", amount: (ready._sum.amount ?? 0).toString() },
      ],
      reservedDraftByCurrency: [
        { currency: "RSD", amount: (reserved._sum.amount ?? 0).toString() },
      ],
      sentStatementCount: sent.length,
      sentTotalsByCurrency: grouped(sentTotals),
      externallyUnpaidByCurrency: grouped(externallyUnpaid),
    };
  }

  async clientAccount(clientId: string) {
    this.assertManager();
    await this.assertClient(clientId);
    const [entries, statements] = await Promise.all([
      this.db.billingEntry.findMany({
        where: { workspaceId: this.workspaceId, clientId },
        include: this.entryInclude,
        orderBy: { workDate: "desc" },
        take: 50,
      }),
      this.db.billingStatement.findMany({
        where: { workspaceId: this.workspaceId, clientId },
        include: { client: true, lines: true, payments: true },
        orderBy: { periodEnd: "desc" },
        take: 50,
      }),
    ]);
    const ready = new Map<string, Prisma.Decimal>();
    const reserved = new Map<string, Prisma.Decimal>();
    for (const entry of entries) {
      if (entry.disposition !== BillingDisposition.BILLABLE) continue;
      const target =
        entry.lifecycle === BillingEntryLifecycle.READY
          ? ready
          : entry.lifecycle === BillingEntryLifecycle.RESERVED
            ? reserved
            : null;
      if (target)
        target.set(
          entry.currency,
          (target.get(entry.currency) ?? new Prisma.Decimal(0)).plus(
            entry.amount,
          ),
        );
    }
    const sent = new Map<string, Prisma.Decimal>();
    const unpaid = new Map<string, Prisma.Decimal>();
    const summaries = statements.map((statement) =>
      this.statementResponse(statement),
    );
    for (const statement of summaries) {
      if (statement.status !== BillingStatementStatus.SENT) continue;
      sent.set(
        statement.currency,
        (sent.get(statement.currency) ?? new Prisma.Decimal(0)).plus(
          new Prisma.Decimal(statement.total),
        ),
      );
      if (statement.externalInvoiceNumber)
        unpaid.set(
          statement.currency,
          (unpaid.get(statement.currency) ?? new Prisma.Decimal(0)).plus(
            new Prisma.Decimal(statement.outstanding),
          ),
        );
    }
    const grouped = (values: Map<string, Prisma.Decimal>) =>
      [...values].map(([currency, amount]) => ({
        currency,
        amount: amount.toFixed(2),
      }));
    return {
      entries: entries.map((entry) => this.entrySummary(entry)),
      statements: summaries,
      readyUnbilledByCurrency: grouped(ready),
      reservedDraftByCurrency: grouped(reserved),
      sentByCurrency: grouped(sent),
      externallyUnpaidByCurrency: grouped(unpaid),
    };
  }
}
