import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  InvoiceLineStatus,
  InvoiceStatus,
  Prisma,
  PriceSourceScope,
} from "@prisma/client";
import {
  BillableWorkItem,
  InvoiceLineSummary,
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
  BillableWorkQueryDto,
  CreatePriceSourceDto,
  CreateInvoiceDto,
  ExternalInvoiceDto,
  SendInvoiceDto,
  UpdateInvoiceDto,
} from "./financials.dto";

const isPresent = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

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

  private lineSummary(line: any): InvoiceLineSummary {
    return {
      id: line.id,
      invoiceId: line.invoiceId,
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

  private invoiceInclude = {
    client: true,
    lines: {
      include: this.lineInclude,
      orderBy: { lineOrder: "asc" as const },
    },
  } as const;

  private invoiceResponse(invoice: any) {
    return {
      ...invoice,
      dateOfCreate: invoice.dateOfCreate.toISOString().slice(0, 10),
      dateOfMaturity: invoice.dateOfMaturity.toISOString().slice(0, 10),
      dateOfTurnover: invoice.dateOfTurnover.toISOString().slice(0, 10),
      netAmount: invoice.netAmount.toString(),
      vatRate: invoice.vatRate.toString(),
      vatAmount: invoice.vatAmount.toString(),
      grossAmount: invoice.grossAmount.toString(),
      lines: invoice.lines.map((line: any) => this.lineSummary(line)),
      total: invoice.grossAmount.toFixed(2),
    };
  }

  async listBillableWork(
    query: BillableWorkQueryDto,
  ): Promise<PaginatedResponse<BillableWorkItem>> {
    this.assertFinanceUser();
    const manager = this.isManager();
    const [events, tasks, deadlines] = await Promise.all([
      this.db.event.findMany({
        where: {
          workspaceId: this.workspaceId,
          status: "COMPLETED",
          invoiceId: null,
          ...(manager
            ? {}
            : {
                OR: [
                  { assignees: { some: { userId: this.context.userId } } },
                  {
                    assignees: { none: {} },
                    organizerUserId: this.context.userId,
                  },
                ],
              }),
        },
        include: {
          case: { include: { client: true } },
          clients: { include: { client: true } },
          organizer: true,
          assignees: { include: { user: true } },
        },
      }),
      this.db.task.findMany({
        where: {
          workspaceId: this.workspaceId,
          status: "DONE",
          invoiceId: null,
          ...(manager ? {} : { assigneeUserId: this.context.userId }),
        },
        include: {
          case: { include: { client: true } },
          client: true,
          assignee: true,
        },
      }),
      this.db.deadline.findMany({
        where: {
          workspaceId: this.workspaceId,
          status: "SATISFIED",
          invoiceId: null,
          ...(manager ? {} : { responsibleUserId: this.context.userId }),
        },
        include: {
          case: { include: { client: true } },
          client: true,
          responsibleUser: true,
        },
      }),
    ]);

    const raw: Array<
      BillableWorkItem & {
        sortDate: Date;
        clientId: string;
        caseId: string | null;
      }
    > = [];

    for (const event of events) {
      const relatedClients = [
        ...event.clients.map((relation) => relation.client),
        ...(event.case?.client ? [event.case.client] : []),
      ];
      const clientsById = new Map(
        relatedClients.map((client) => [client.id, client]),
      );
      const client =
        clientsById.size === 1 ? [...clientsById.values()][0] : null;
      if (!client) continue;
      const responsibleUser =
        (!manager
          ? event.assignees.find(
              (assignment) => assignment.userId === this.context.userId,
            )?.user
          : null) ?? event.organizer;
      raw.push({
        sourceKey: `EVENT:${event.id}`,
        sourceType: "EVENT",
        sourceId: event.id,
        title: event.title,
        date: event.startsAt.toISOString(),
        client: this.clientReference(client),
        case: this.caseReference(event.case),
        responsibleUser: this.userReference(responsibleUser),
        sortDate: event.startsAt,
        clientId: client.id,
        caseId: event.caseId,
      });
    }

    for (const task of tasks) {
      const clientsById = new Map(
        [task.client, task.case?.client]
          .filter(isPresent)
          .map((client) => [client.id, client]),
      );
      const client =
        clientsById.size === 1 ? [...clientsById.values()][0] : null;
      if (!client) continue;
      const date = task.completedAt ?? task.updatedAt;
      raw.push({
        sourceKey: `TASK:${task.id}`,
        sourceType: "TASK",
        sourceId: task.id,
        title: task.title,
        date: date.toISOString(),
        client: this.clientReference(client),
        case: this.caseReference(task.case),
        responsibleUser: this.userReference(task.assignee),
        sortDate: date,
        clientId: client.id,
        caseId: task.caseId,
      });
    }

    for (const deadline of deadlines) {
      const clientsById = new Map(
        [deadline.client, deadline.case?.client]
          .filter(isPresent)
          .map((client) => [client.id, client]),
      );
      const client =
        clientsById.size === 1 ? [...clientsById.values()][0] : null;
      if (!client) continue;
      const date = deadline.satisfiedAt ?? deadline.updatedAt;
      raw.push({
        sourceKey: `DEADLINE:${deadline.id}`,
        sourceType: "DEADLINE",
        sourceId: deadline.id,
        title: deadline.title,
        date: date.toISOString(),
        client: this.clientReference(client),
        case: this.caseReference(deadline.case),
        responsibleUser: this.userReference(deadline.responsibleUser),
        sortDate: date,
        clientId: client.id,
        caseId: deadline.caseId,
      });
    }

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
    const sourceTypes = new Set(query.sourceTypes ?? []);
    const sourceKeys = new Set(query.sourceKeys ?? []);
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    const filtered = raw
      .filter((item) => !clientIds.length || clientIds.includes(item.clientId))
      .filter(
        (item) =>
          !caseIds.length ||
          (item.caseId ? caseIds.includes(item.caseId) : false),
      )
      .filter((item) => !sourceTypes.size || sourceTypes.has(item.sourceType))
      .filter((item) => !sourceKeys.size || sourceKeys.has(item.sourceKey))
      .filter((item) => !from || item.sortDate >= from)
      .filter((item) => !to || item.sortDate <= to)
      .sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());

    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    return {
      items: filtered
        .slice((page - 1) * pageSize, page * pageSize)
        .map((item) => ({
          sourceKey: item.sourceKey,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          title: item.title,
          date: item.date,
          client: item.client,
          case: item.case,
          responsibleUser: item.responsibleUser,
        })),
      meta: paginationMeta(page, pageSize, filtered.length, [
        { field: "date", direction: "desc" },
      ]),
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

  async listInvoices() {
    this.assertManager();
    const invoices = await this.db.invoice.findMany({
      where: { workspaceId: this.workspaceId },
      include: this.invoiceInclude,
      orderBy: { createdAt: "desc" },
    });
    return invoices.map((invoice) => this.invoiceResponse(invoice));
  }

  private async replaceInvoiceLines(
    tx: Prisma.TransactionClient,
    invoice: { id: string; clientId: string; currency: string },
    lines: CreateInvoiceDto["lines"],
  ): Promise<void> {
    const sourceKeys = lines.flatMap((line) =>
      line.sourceType && line.sourceId
        ? [`${line.sourceType}:${line.sourceId}`]
        : [],
    );
    if (sourceKeys.length !== new Set(sourceKeys).size)
      throw new ConflictException("Invoice work sources must be unique");
    if (
      lines.some(
        (line) =>
          Boolean(line.sourceType) !== Boolean(line.sourceId) ||
          line.currency.toUpperCase() !== invoice.currency.toUpperCase(),
      )
    )
      throw new ConflictException(
        "Invoice lines must have a complete source and matching currency",
      );

    await Promise.all([
      tx.event.updateMany({
        where: { workspaceId: this.workspaceId, invoiceId: invoice.id },
        data: { invoiceId: null },
      }),
      tx.task.updateMany({
        where: { workspaceId: this.workspaceId, invoiceId: invoice.id },
        data: { invoiceId: null },
      }),
      tx.deadline.updateMany({
        where: { workspaceId: this.workspaceId, invoiceId: invoice.id },
        data: { invoiceId: null },
      }),
    ]);
    await tx.invoiceLine.deleteMany({
      where: { workspaceId: this.workspaceId, invoiceId: invoice.id },
    });

    for (const [index, input] of lines.entries()) {
      let caseId: string | null = null;
      if (input.sourceType && input.sourceId) {
        switch (input.sourceType) {
          case "EVENT": {
            const event = await tx.event.findFirst({
              where: {
                id: input.sourceId,
                workspaceId: this.workspaceId,
                status: "COMPLETED",
                invoiceId: null,
              },
              include: {
                case: true,
                clients: true,
              },
            });
            const clientIds = new Set([
              ...(event?.clients.map((item) => item.clientId) ?? []),
              ...(event?.case?.clientId ? [event.case.clientId] : []),
            ]);
            const clientId = clientIds.size === 1 ? [...clientIds][0] : null;
            if (!event || clientId !== invoice.clientId)
              throw new ConflictException(
                "Event is unavailable for the invoice client",
              );
            caseId = event.caseId;
            break;
          }
          case "TASK": {
            const task = await tx.task.findFirst({
              where: {
                id: input.sourceId,
                workspaceId: this.workspaceId,
                status: "DONE",
                invoiceId: null,
              },
              include: { case: true },
            });
            const clientIds = new Set(
              [task?.clientId, task?.case?.clientId].filter(
                (clientId): clientId is string => Boolean(clientId),
              ),
            );
            if (
              !task ||
              clientIds.size !== 1 ||
              !clientIds.has(invoice.clientId)
            )
              throw new ConflictException(
                "Task is unavailable for the invoice client",
              );
            caseId = task.caseId;
            break;
          }
          case "DEADLINE": {
            const deadline = await tx.deadline.findFirst({
              where: {
                id: input.sourceId,
                workspaceId: this.workspaceId,
                status: "SATISFIED",
                invoiceId: null,
              },
              include: { case: true },
            });
            const clientIds = new Set(
              [deadline?.clientId, deadline?.case?.clientId].filter(
                (clientId): clientId is string => Boolean(clientId),
              ),
            );
            if (
              !deadline ||
              clientIds.size !== 1 ||
              !clientIds.has(invoice.clientId)
            )
              throw new ConflictException(
                "Deadline is unavailable for the invoice client",
              );
            caseId = deadline.caseId;
            break;
          }
        }
      }

      await tx.invoiceLine.create({
        data: {
          workspaceId: this.workspaceId,
          invoiceId: invoice.id,
          clientId: invoice.clientId,
          performedByUserId: this.context.userId,
          lineOrder: index,
          serviceDate: new Date(input.serviceDate),
          description: input.description.trim(),
          netAmount: input.netAmount,
          vatRate: input.vatRate,
          vatAmount: input.vatAmount,
          grossAmount: input.grossAmount,
          currency: invoice.currency.toUpperCase(),
          status: InvoiceLineStatus.RESERVED,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
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
      });

      if (input.sourceType === "EVENT" && input.sourceId)
        await tx.event.update({
          where: { id: input.sourceId },
          data: { invoiceId: invoice.id },
        });
      if (input.sourceType === "TASK" && input.sourceId)
        await tx.task.update({
          where: { id: input.sourceId },
          data: { invoiceId: invoice.id },
        });
      if (input.sourceType === "DEADLINE" && input.sourceId)
        await tx.deadline.update({
          where: { id: input.sourceId },
          data: { invoiceId: invoice.id },
        });
    }
  }

  private async nextInvoiceNumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const counter = await tx.domainCounter.upsert({
      where: {
        workspaceId_name: {
          workspaceId: this.workspaceId,
          name: "BILLING_INVOICE",
        },
      },
      create: {
        workspaceId: this.workspaceId,
        name: "BILLING_INVOICE",
        value: 1,
      },
      update: { value: { increment: 1 } },
    });
    return `INV-${String(counter.value).padStart(6, "0")}`;
  }

  async createInvoice(input: CreateInvoiceDto) {
    this.assertManager();
    await this.assertClient(input.clientId);
    if (input.idempotencyKey) {
      const existing = await this.db.financeMutationRequest.findUnique({
        where: {
          workspaceId_operation_idempotencyKey: {
            workspaceId: this.workspaceId,
            operation: "CREATE_INVOICE",
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) return this.getInvoice(existing.resultEntityId);
    }
    return this.db.$transaction(async (tx) => {
      const number = await this.nextInvoiceNumber(tx);
      const invoice = await tx.invoice.create({
        data: {
          workspaceId: this.workspaceId,
          clientId: input.clientId,
          invoiceNumber: number,
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
          createdByUserId: this.context.userId,
          updatedByUserId: this.context.userId,
        },
      });
      await this.replaceInvoiceLines(tx, invoice, input.lines);
      if (input.idempotencyKey)
        await tx.financeMutationRequest.create({
          data: {
            workspaceId: this.workspaceId,
            operation: "CREATE_INVOICE",
            idempotencyKey: input.idempotencyKey,
            resultEntityId: invoice.id,
            result: { invoiceId: invoice.id },
          },
        });
      const complete = await tx.invoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: this.invoiceInclude,
      });
      return this.invoiceResponse(complete);
    });
  }

  async getInvoice(id: string) {
    this.assertManager();
    const invoice = await this.db.invoice.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: this.invoiceInclude,
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    return this.invoiceResponse(invoice);
  }

  async updateInvoice(id: string, input: UpdateInvoiceDto) {
    this.assertManager();
    const invoice = await this.getInvoice(id);
    if (invoice.status !== InvoiceStatus.DRAFT)
      throw new ConflictException("Only draft invoices can be edited");
    await this.db.$transaction(async (tx) => {
      await tx.invoice.update({
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
          updatedByUserId: this.context.userId,
        },
      });
      if (input.lines) await this.replaceInvoiceLines(tx, invoice, input.lines);
    });
    return this.getInvoice(id);
  }

  async deleteInvoice(id: string): Promise<void> {
    this.assertManager();
    const invoice = await this.db.invoice.findFirst({
      where: { id, workspaceId: this.workspaceId },
      select: { id: true, status: true },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.status !== InvoiceStatus.DRAFT)
      throw new ConflictException("Only draft invoices can be deleted");

    await this.db.$transaction(async (tx) => {
      await tx.financeMutationRequest.deleteMany({
        where: {
          workspaceId: this.workspaceId,
          operation: "CREATE_INVOICE",
          resultEntityId: id,
        },
      });
      await tx.invoice.delete({ where: { id } });
    });
  }

  async sendInvoice(id: string, input: SendInvoiceDto) {
    this.assertManager();
    if (input.idempotencyKey) {
      const existing = await this.db.financeMutationRequest.findUnique({
        where: {
          workspaceId_operation_idempotencyKey: {
            workspaceId: this.workspaceId,
            operation: "SEND_INVOICE",
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) return this.getInvoice(existing.resultEntityId);
    }
    const invoice = await this.getInvoice(id);
    if (invoice.status !== InvoiceStatus.DRAFT)
      throw new ConflictException("Only draft invoices can be sent");
    return this.db.$transaction(async (tx) => {
      const sent = await tx.invoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.SENT,
          sharedAt: new Date(),
          sharedMethod: input.sharedMethod ?? "EXTERNAL",
          sharedByUserId: this.context.userId,
          updatedByUserId: this.context.userId,
        },
      });
      await tx.invoiceLine.updateMany({
        where: {
          workspaceId: this.workspaceId,
          invoiceId: id,
        },
        data: {
          status: InvoiceLineStatus.BILLED,
          billedAt: new Date(),
          updatedByUserId: this.context.userId,
        },
      });
      if (input.idempotencyKey)
        await tx.financeMutationRequest.create({
          data: {
            workspaceId: this.workspaceId,
            operation: "SEND_INVOICE",
            idempotencyKey: input.idempotencyKey,
            resultEntityId: sent.id,
            result: { invoiceId: sent.id },
          },
        });
      const complete = await tx.invoice.findUniqueOrThrow({
        where: { id: sent.id },
        include: this.invoiceInclude,
      });
      return this.invoiceResponse(complete);
    });
  }

  async voidInvoice(id: string) {
    this.assertManager();
    const invoice = await this.getInvoice(id);
    if (invoice.status === InvoiceStatus.VOIDED) return invoice;
    return this.db.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.VOIDED,
          voidedAt: new Date(),
          voidedByUserId: this.context.userId,
          updatedByUserId: this.context.userId,
        },
      });
      if (invoice.status === InvoiceStatus.DRAFT) {
        await Promise.all([
          tx.event.updateMany({
            where: { workspaceId: this.workspaceId, invoiceId: id },
            data: { invoiceId: null },
          }),
          tx.task.updateMany({
            where: { workspaceId: this.workspaceId, invoiceId: id },
            data: { invoiceId: null },
          }),
          tx.deadline.updateMany({
            where: { workspaceId: this.workspaceId, invoiceId: id },
            data: { invoiceId: null },
          }),
        ]);
        await tx.invoiceLine.deleteMany({
          where: { workspaceId: this.workspaceId, invoiceId: id },
        });
      }
      const full = await tx.invoice.findUniqueOrThrow({
        where: { id },
        include: this.invoiceInclude,
      });
      return this.invoiceResponse(full);
    });
  }

  async linkExternalInvoice(id: string, input: ExternalInvoiceDto) {
    this.assertManager();
    await this.getInvoice(id);
    const updated = await this.db.invoice.update({
      where: { id },
      data: {
        externalInvoiceNumber: input.invoiceNumber,
        externalInvoiceDate: input.invoiceDate
          ? new Date(input.invoiceDate)
          : undefined,
        externalReference: input.reference,
        updatedByUserId: this.context.userId,
      },
      include: this.invoiceInclude,
    });
    return this.invoiceResponse(updated);
  }
}
