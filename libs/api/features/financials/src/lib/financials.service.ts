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
} from "@prisma/client";
import {
  BillingStatementLineSummary,
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
  BillingStatementLineListQueryDto,
  CandidateQueryDto,
  CreateBillingStatementLineDto,
  CreatePaymentDto,
  CreatePriceSourceDto,
  CreateStatementDto,
  ExternalInvoiceDto,
  RecordBillingStatementLinesDto,
  SendStatementDto,
  UpdateBillingStatementLineDto,
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
      amount: line.amount.toString(),
      currency: line.currency,
      status: line.status,
      sourceType: line.sourceType,
      sourceId: line.sourceId,
      billedAt: line.billedAt?.toISOString() ?? null,
      cancelledAt: line.cancelledAt?.toISOString() ?? null,
      cancellationReason: line.cancellationReason,
    };
  }

  private lineInclude = {
    client: true,
    caseLinks: { include: { case: true } },
    performedBy: true,
  } as const;

  private statementInclude = {
    client: true,
    lines: {
      include: this.lineInclude,
      orderBy: { lineOrder: "asc" as const },
    },
    payments: true,
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
      lines: statement.lines.map((line: any) => this.lineSummary(line)),
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

  async listLines(
    query: BillingStatementLineListQueryDto,
  ): Promise<PaginatedResponse<BillingStatementLineSummary>> {
    this.assertFinanceUser();
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.BillingStatementLineWhereInput = {
      workspaceId: this.workspaceId,
    };
    if (!this.isManager()) where.performedByUserId = this.context.userId;
    const clientIds = query.clientIds?.length
      ? query.clientIds
      : query.clientId
        ? [query.clientId]
        : [];
    const caseIds = query.caseIds?.length
      ? query.caseIds
      : query.caseId
        ? [query.caseId]
        : [];
    if (clientIds.length) where.clientId = { in: clientIds };
    if (caseIds.length) where.caseLinks = { some: { caseId: { in: caseIds } } };
    if (query.sourceTypes?.length) where.sourceType = { in: query.sourceTypes };
    if (query.performerId && this.isManager())
      where.performedByUserId = query.performerId;
    if (query.status) where.status = query.status;
    if (query.currency) where.currency = query.currency;
    if (query.from || query.to)
      where.serviceDate = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    const [items, totalItems] = await this.db.$transaction([
      this.db.billingStatementLine.findMany({
        where,
        include: this.lineInclude,
        orderBy: { serviceDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.billingStatementLine.count({ where }),
    ]);
    return {
      items: items.map((item) => this.lineSummary(item)),
      meta: paginationMeta(page, pageSize, totalItems, [
        { field: "serviceDate", direction: "desc" },
      ]),
    };
  }

  async createLine(
    input: CreateBillingStatementLineDto,
  ): Promise<BillingStatementLineSummary> {
    this.assertFinanceUser();
    await this.assertClient(input.clientId);
    const performerId = input.performedByUserId ?? this.context.userId;
    if (performerId !== this.context.userId) this.assertManager();
    await this.assertPerformer(performerId);
    if (input.amount <= 0)
      throw new ConflictException("Statement line amount must be positive");
    const line = await this.db.billingStatementLine.create({
      data: {
        workspaceId: this.workspaceId,
        clientId: input.clientId,
        performedByUserId: performerId,
        serviceDate: input.serviceDate
          ? new Date(input.serviceDate)
          : new Date(),
        description: input.description,
        amount: input.amount,
        currency: input.currency.toUpperCase(),
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        createdByUserId: this.context.userId,
        updatedByUserId: this.context.userId,
      },
      include: this.lineInclude,
    });
    return this.lineSummary(line);
  }

  async getLine(id: string): Promise<BillingStatementLineSummary> {
    this.assertFinanceUser();
    const line = await this.db.billingStatementLine.findFirst({
      where: {
        id,
        workspaceId: this.workspaceId,
        ...(this.isManager() ? {} : { performedByUserId: this.context.userId }),
      },
      include: this.lineInclude,
    });
    if (!line) throw new NotFoundException("Billing statement line not found");
    return this.lineSummary(line);
  }

  async updateLine(
    id: string,
    input: UpdateBillingStatementLineDto,
  ): Promise<BillingStatementLineSummary> {
    this.assertFinanceUser();
    const line = await this.db.billingStatementLine.findFirst({
      where: {
        id,
        workspaceId: this.workspaceId,
        ...(this.isManager() ? {} : { performedByUserId: this.context.userId }),
      },
    });
    if (!line) throw new NotFoundException("Billing statement line not found");
    if (
      line.status === BillingStatementLineStatus.BILLED ||
      line.status === BillingStatementLineStatus.CANCELLED
    )
      throw new ConflictException("Billed or cancelled lines are immutable");
    if (input.amount !== undefined && input.amount <= 0)
      throw new ConflictException("Statement line amount must be positive");
    const updated = await this.db.billingStatementLine.update({
      where: { id },
      data: {
        ...input,
        currency: input.currency?.toUpperCase(),
        updatedByUserId: this.context.userId,
      },
      include: this.lineInclude,
    });
    return this.lineSummary(updated);
  }

  async cancelLine(
    id: string,
    reason: string,
  ): Promise<BillingStatementLineSummary> {
    this.assertFinanceUser();
    const line = await this.db.billingStatementLine.findFirst({
      where: {
        id,
        workspaceId: this.workspaceId,
        ...(this.isManager() ? {} : { performedByUserId: this.context.userId }),
      },
    });
    if (!line) throw new NotFoundException("Billing statement line not found");
    if (line.status !== BillingStatementLineStatus.UNBILLED)
      throw new ConflictException("Only unbilled lines can be cancelled");
    const cancelled = await this.db.billingStatementLine.update({
      where: { id },
      data: {
        status: BillingStatementLineStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: reason,
        cancelledByUserId: this.context.userId,
        updatedByUserId: this.context.userId,
      },
      include: this.lineInclude,
    });
    return this.lineSummary(cancelled);
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
            billingStatementLineId: null,
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
            billingStatementLineId: null,
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
            billingStatementLineId: null,
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
    const clientIds = query.clientIds?.length
      ? query.clientIds
      : query.clientId
        ? [query.clientId]
        : [];
    const caseIds = query.caseIds?.length
      ? query.caseIds
      : query.caseId
        ? [query.caseId]
        : [];
    const sourceTypes = query.sourceTypes?.length
      ? query.sourceTypes
      : query.sourceType
        ? [query.sourceType]
        : [];
    const items = visibleRaw
      .filter(
        (item) =>
          !clientIds.length ||
          (item.client ? clientIds.includes(item.client.id) : false),
      )
      .filter(
        (item) =>
          !caseIds.length ||
          (item.case ? caseIds.includes(item.case.id) : false),
      )
      .filter(
        (item) => !sourceTypes.length || sourceTypes.includes(item.sourceType),
      )
      .filter((item) => {
        const resolution =
          reviewMap.get(item.candidateKey)?.resolution ?? "PENDING";
        return query.resolution
          ? resolution === query.resolution
          : query.includeResolved === "true" ||
              !["DISMISSED", "RECORDED"].includes(resolution);
      })
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
    const [review] = await this.reviewCandidates([candidateKey], resolution);
    return review;
  }

  async reviewCandidates(
    candidateKeys: string[],
    resolution: "DISMISSED" | "PENDING",
  ) {
    this.assertFinanceUser();
    const reviewedAt = new Date();
    return this.db.$transaction(
      candidateKeys.map((candidateKey) => {
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
            reviewedAt,
          },
          update: {
            resolution,
            reviewedByUserId: this.context.userId,
            reviewedAt,
          },
        });
      }),
    );
  }

  async recordCandidatesAsLines(
    input: RecordBillingStatementLinesDto,
  ): Promise<BillingStatementLineSummary[]> {
    this.assertFinanceUser();
    await this.assertClient(input.clientId);

    const candidateKeys = input.items.map((item) => item.candidateKey);
    if (new Set(candidateKeys).size !== candidateKeys.length) {
      throw new ConflictException("Billing candidates must be unique");
    }

    const itemSources = input.items.map((item) => {
      if (item.amount <= 0)
        throw new ConflictException("Statement line amount must be positive");
      const [sourceType, sourceId, proposedPerformerId, proposedClientId] =
        item.candidateKey.split(":");
      if (!sourceType || !sourceId || !proposedPerformerId) {
        throw new ConflictException("Invalid billing candidate key");
      }
      if (proposedPerformerId !== this.context.userId) this.assertManager();
      return {
        item,
        sourceType,
        sourceId,
        performedByUserId: proposedPerformerId,
        proposedClientId,
      };
    });

    await Promise.all(
      [...new Set(itemSources.map((item) => item.performedByUserId))].map(
        (performerId) => this.assertPerformer(performerId),
      ),
    );

    return this.db.$transaction(async (tx) => {
      const lines: BillingStatementLineSummary[] = [];
      for (const source of itemSources) {
        const existingReview = await tx.billingSuggestionReview.findUnique({
          where: {
            workspaceId_candidateKey: {
              workspaceId: this.workspaceId,
              candidateKey: source.item.candidateKey,
            },
          },
        });
        if (existingReview?.resolution === "RECORDED")
          throw new ConflictException("Billing candidate is already recorded");

        let serviceDate: Date;
        let caseId: string | null = null;
        switch (source.sourceType) {
          case "EVENT": {
            const event = await tx.event.findFirst({
              where: {
                id: source.sourceId,
                workspaceId: this.workspaceId,
                status: "COMPLETED",
                billingStatementLineId: null,
                clients: { some: { clientId: input.clientId } },
              },
            });
            if (!event || source.proposedClientId !== input.clientId)
              throw new ConflictException(
                "Event is unavailable for the selected client",
              );
            serviceDate = event.startsAt;
            caseId = event.caseId;
            break;
          }
          case "TASK": {
            const task = await tx.task.findFirst({
              where: {
                id: source.sourceId,
                workspaceId: this.workspaceId,
                status: "DONE",
                billingStatementLineId: null,
              },
              include: { case: true },
            });
            if (
              !task ||
              (task.clientId ?? task.case?.clientId) !== input.clientId
            )
              throw new ConflictException(
                "Task is unavailable for the selected client",
              );
            serviceDate = task.completedAt ?? task.updatedAt;
            caseId = task.caseId;
            break;
          }
          case "DEADLINE": {
            const deadline = await tx.deadline.findFirst({
              where: {
                id: source.sourceId,
                workspaceId: this.workspaceId,
                status: "SATISFIED",
                billingStatementLineId: null,
              },
              include: { case: true },
            });
            if (
              !deadline ||
              (deadline.clientId ?? deadline.case?.clientId) !== input.clientId
            )
              throw new ConflictException(
                "Deadline is unavailable for the selected client",
              );
            serviceDate = deadline.satisfiedAt ?? deadline.updatedAt;
            caseId = deadline.caseId;
            break;
          }
          case "CASE_ACTIVITY": {
            const activity = await tx.caseActivity.findFirst({
              where: { id: source.sourceId, workspaceId: this.workspaceId },
              include: { case: true },
            });
            if (!activity || activity.case.clientId !== input.clientId)
              throw new ConflictException(
                "Case activity is unavailable for the selected client",
              );
            serviceDate = activity.activityDate;
            caseId = activity.caseId;
            break;
          }
          case "CLIENT_ACTIVITY": {
            const activity = await tx.clientActivity.findFirst({
              where: {
                id: source.sourceId,
                workspaceId: this.workspaceId,
                clientId: input.clientId,
              },
            });
            if (!activity)
              throw new ConflictException(
                "Client activity is unavailable for the selected client",
              );
            serviceDate = activity.activityDate;
            caseId = activity.relatedCaseId;
            break;
          }
          default:
            throw new ConflictException("Unsupported billing candidate source");
        }

        const line = await tx.billingStatementLine.create({
          data: {
            workspaceId: this.workspaceId,
            clientId: input.clientId,
            performedByUserId: source.performedByUserId,
            serviceDate,
            description: source.item.description,
            amount: source.item.amount,
            currency: source.item.currency.toUpperCase(),
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            createdByUserId: this.context.userId,
            updatedByUserId: this.context.userId,
            caseLinks: caseId
              ? {
                  create: {
                    workspaceId: this.workspaceId,
                    caseId,
                  },
                }
              : undefined,
          },
          include: this.lineInclude,
        });

        if (source.sourceType === "EVENT")
          await tx.event.update({
            where: { id: source.sourceId },
            data: { billingStatementLineId: line.id },
          });
        if (source.sourceType === "TASK")
          await tx.task.update({
            where: { id: source.sourceId },
            data: { billingStatementLineId: line.id },
          });
        if (source.sourceType === "DEADLINE")
          await tx.deadline.update({
            where: { id: source.sourceId },
            data: { billingStatementLineId: line.id },
          });

        await tx.billingSuggestionReview.upsert({
          where: {
            workspaceId_candidateKey: {
              workspaceId: this.workspaceId,
              candidateKey: source.item.candidateKey,
            },
          },
          create: {
            workspaceId: this.workspaceId,
            candidateKey: source.item.candidateKey,
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            proposedPerformerId: source.performedByUserId,
            resolution: "RECORDED",
            reviewedByUserId: this.context.userId,
            reviewedAt: new Date(),
            billingStatementLineId: line.id,
          },
          update: {
            proposedPerformerId: source.performedByUserId,
            resolution: "RECORDED",
            reviewedByUserId: this.context.userId,
            reviewedAt: new Date(),
            billingStatementLineId: line.id,
          },
        });
        lines.push(this.lineSummary(line));
      }
      return lines;
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
      include: this.statementInclude,
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
    const lines = await this.db.billingStatementLine.findMany({
      where: {
        workspaceId: this.workspaceId,
        id: { in: input.lineIds ?? [] },
        clientId: input.clientId,
        currency: input.currency,
        status: BillingStatementLineStatus.UNBILLED,
      },
    });
    if (lines.length !== (input.lineIds ?? []).length)
      throw new ConflictException(
        "Some lines are unavailable or not statement eligible",
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
        },
      });
      for (const [index, line] of lines.entries()) {
        await tx.billingStatementLine.update({
          where: { id: line.id },
          data: {
            statementId: statement.id,
            lineOrder: index,
            status: BillingStatementLineStatus.RESERVED,
            updatedByUserId: this.context.userId,
          },
        });
      }
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
    if (input.lineIds) {
      await this.db.$transaction(async (tx) => {
        await tx.billingStatementLine.updateMany({
          where: {
            workspaceId: this.workspaceId,
            statementId: id,
            status: BillingStatementLineStatus.RESERVED,
          },
          data: {
            statementId: null,
            lineOrder: null,
            status: BillingStatementLineStatus.UNBILLED,
            updatedByUserId: this.context.userId,
          },
        });
        const lines = await tx.billingStatementLine.findMany({
          where: {
            workspaceId: this.workspaceId,
            id: { in: input.lineIds },
            clientId: statement.clientId,
            currency: statement.currency,
            status: BillingStatementLineStatus.UNBILLED,
          },
        });
        if (lines.length !== input.lineIds.length)
          throw new ConflictException("Some lines are unavailable");
        for (const [index, line] of lines.entries())
          await tx.billingStatementLine.update({
            where: { id: line.id },
            data: {
              statementId: id,
              lineOrder: index,
              status: BillingStatementLineStatus.RESERVED,
              updatedByUserId: this.context.userId,
            },
          });
      });
    }
    if (input.periodStart || input.periodEnd)
      await this.db.billingStatement.update({
        where: { id },
        data: {
          periodStart: input.periodStart
            ? new Date(input.periodStart)
            : undefined,
          periodEnd: input.periodEnd ? new Date(input.periodEnd) : undefined,
          updatedByUserId: this.context.userId,
        },
      });
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
      if (statement.status === BillingStatementStatus.DRAFT)
        await tx.billingStatementLine.updateMany({
          where: {
            workspaceId: this.workspaceId,
            statementId: id,
            status: BillingStatementLineStatus.RESERVED,
          },
          data: {
            statementId: null,
            lineOrder: null,
            status: BillingStatementLineStatus.UNBILLED,
            updatedByUserId: this.context.userId,
          },
        });
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
      this.db.billingStatementLine.groupBy({
        by: ["currency"],
        where: {
          workspaceId: this.workspaceId,
          status: BillingStatementLineStatus.UNBILLED,
        },
        _sum: { amount: true },
      }),
      this.db.billingStatementLine.groupBy({
        by: ["currency"],
        where: {
          workspaceId: this.workspaceId,
          status: BillingStatementLineStatus.RESERVED,
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
      readyUnbilledByCurrency: ready.map((item) => ({
        currency: item.currency,
        amount: (item._sum.amount ?? 0).toString(),
      })),
      reservedDraftByCurrency: reserved.map((item) => ({
        currency: item.currency,
        amount: (item._sum.amount ?? 0).toString(),
      })),
      sentStatementCount: sent.length,
      sentTotalsByCurrency: grouped(sentTotals),
      externallyUnpaidByCurrency: grouped(externallyUnpaid),
    };
  }

  async clientAccount(clientId: string) {
    this.assertManager();
    await this.assertClient(clientId);
    const [lines, statements] = await Promise.all([
      this.db.billingStatementLine.findMany({
        where: { workspaceId: this.workspaceId, clientId },
        include: this.lineInclude,
        orderBy: { serviceDate: "desc" },
        take: 50,
      }),
      this.db.billingStatement.findMany({
        where: { workspaceId: this.workspaceId, clientId },
        include: this.statementInclude,
        orderBy: { periodEnd: "desc" },
        take: 50,
      }),
    ]);
    const ready = new Map<string, Prisma.Decimal>();
    const reserved = new Map<string, Prisma.Decimal>();
    for (const line of lines) {
      const target =
        line.status === BillingStatementLineStatus.UNBILLED
          ? ready
          : line.status === BillingStatementLineStatus.RESERVED
            ? reserved
            : null;
      if (target)
        target.set(
          line.currency,
          (target.get(line.currency) ?? new Prisma.Decimal(0)).plus(
            line.amount,
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
      lines: lines.map((line) => this.lineSummary(line)),
      statements: summaries,
      readyUnbilledByCurrency: grouped(ready),
      reservedDraftByCurrency: grouped(reserved),
      sentByCurrency: grouped(sent),
      externallyUnpaidByCurrency: grouped(unpaid),
    };
  }
}
