import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  InvoiceLineStatus,
  InvoiceStatus,
  Prisma,
  PriceSourceScope,
  WorkEntryStatus,
} from "@prisma/client";
import {
  InvoiceLineSummary,
  CaseReference,
  ClientReference,
  UserReference,
  WorkspaceRole,
} from "@law/api-interfaces";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";
import {
  AppendPriceSourceVersionDto,
  InvoiceLineInputDto,
  CreatePriceSourceDto,
  CreateInvoiceDto,
  ExternalInvoiceDto,
  SendInvoiceDto,
  UpdateInvoiceDto,
} from "./financials.dto";
import { InvoiceNumberingService } from "./invoice-numbering.service";
import {
  calculateInvoiceMoney,
  verifyInvoiceMoney,
} from "./invoice-monetary-calculator";
import { SefSubmissionService } from "./sef-submission.service";

const WORK_ENTRY_GROUP = "WORK_ENTRY_GROUP";

/** Marks the monthly retainer fee line; `sourceId` is the agreement id. */
export const RETAINER_FEE_SOURCE = "RETAINER_FEE";

/**
 * Line input for service-only callers (the month-end run). The source marker
 * is deliberately absent from the public DTO, so API clients cannot set it.
 */
export interface InternalInvoiceLineInput extends InvoiceLineInputDto {
  sourceType?: string;
  sourceId?: string;
}

@Injectable()
export class FinancialsService {
  constructor(
    private readonly db: PlatformPrismaService,
    private readonly invoiceNumbering: InvoiceNumberingService,
    @Optional() private readonly sefSubmissions?: SefSubmissionService,
  ) {}

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
      taxCategoryCode: line.taxCategoryCode,
      taxExemptionReasonCode: line.taxExemptionReasonCode,
      taxExemptionReasonText: line.taxExemptionReasonText,
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
          title: string;
          description: string;
          minutes: number | null;
          case: {
            id: string;
            caseNumber: string;
            name: string;
            status: CaseReference["status"];
            priority: CaseReference["priority"];
          } | null;
          treatment: string;
          value: Prisma.Decimal | null;
          currency: string | null;
        }) => ({
          id: entry.id,
          workDate: entry.workDate.toISOString().slice(0, 10),
          user: this.userReference(entry.user),
          title: entry.title,
          description: entry.description,
          minutes: entry.minutes,
          case: entry.case ? this.caseReference(entry.case) : null,
          treatment: entry.treatment,
          value: entry.value?.toString() ?? null,
          currency: entry.currency,
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
      include: { user: true, case: true },
      orderBy: [
        { workDate: "asc" as const },
        { createdAt: "asc" as const },
      ] as Prisma.WorkEntryOrderByWithRelationInput[],
    },
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
      vatLiabilityTimingCode: invoice.vatLiabilityTimingCode,
      lines: invoice.lines.map((line: any) => this.lineSummary(line)),
      total: invoice.grossAmount.toFixed(2),
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

  private async logWorkEntries(
    tx: Prisma.TransactionClient,
    action: "WORK_ENTRY_BILLED" | "WORK_ENTRY_UNBILLED",
    entries: { id: string; clientId: string; caseId: string | null }[],
    invoiceId: string,
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
        metadata: { invoiceId },
      })),
    });
  }

  /** Claims confirmed, unbilled entries of the invoice client for a line. */
  private async claimEntries(
    tx: Prisma.TransactionClient,
    invoice: { id: string; clientId: string },
    lineId: string,
    entryIds: string[],
  ): Promise<{ caseIds: string[] }> {
    const claimed = await tx.workEntry.updateMany({
      where: {
        id: { in: entryIds },
        workspaceId: this.workspaceId,
        clientId: invoice.clientId,
        status: WorkEntryStatus.CONFIRMED,
        treatment: { in: ["RETAINER", "HOURLY", "AT", "UNDECIDED"] },
        invoiceLineId: null,
      },
      data: {
        status: WorkEntryStatus.BILLED,
        invoiceLineId: lineId,
        updatedByUserId: this.context.userId,
      },
    });
    if (claimed.count !== entryIds.length)
      throw new ConflictException(
        "Work entry is unavailable for the invoice client",
      );
    const entries = await tx.workEntry.findMany({
      where: { id: { in: entryIds }, workspaceId: this.workspaceId },
      select: { id: true, clientId: true, caseId: true },
    });
    await this.logWorkEntries(tx, "WORK_ENTRY_BILLED", entries, invoice.id);
    return {
      caseIds: [
        ...new Set(
          entries.flatMap((entry) => (entry.caseId ? [entry.caseId] : [])),
        ),
      ],
    };
  }

  /** Returns the entries billed on a invoice to the unbilled pool. */
  private async releaseEntries(
    tx: Prisma.TransactionClient,
    invoiceId: string,
  ): Promise<void> {
    const entries = await tx.workEntry.findMany({
      where: {
        workspaceId: this.workspaceId,
        invoiceLine: { invoiceId },
      },
      select: { id: true, clientId: true, caseId: true },
    });
    if (!entries.length) return;
    // Only confirmed entries can be billed, so they all go back to CONFIRMED,
    // timed or not.
    await tx.workEntry.updateMany({
      where: {
        id: { in: entries.map((entry) => entry.id) },
        workspaceId: this.workspaceId,
      },
      data: {
        status: WorkEntryStatus.CONFIRMED,
        invoiceLineId: null,
        updatedByUserId: this.context.userId,
      },
    });
    await this.logWorkEntries(tx, "WORK_ENTRY_UNBILLED", entries, invoiceId);
  }

  private async replaceInvoiceLines(
    tx: Prisma.TransactionClient,
    invoice: { id: string; clientId: string; currency: string },
    lines: InternalInvoiceLineInput[],
  ): Promise<void> {
    const entryIds = lines.flatMap((line) => line.workEntryIds ?? []);
    if (entryIds.length !== new Set(entryIds).size)
      throw new ConflictException("Invoice work entries must be unique");
    if (
      lines.some(
        (line) =>
          line.currency.toUpperCase() !== invoice.currency.toUpperCase(),
      )
    )
      throw new ConflictException(
        "Invoice lines must have a matching currency",
      );

    // The composer replaces lines wholesale, so the retainer fee marker is
    // carried by line identity: only an input id that matches a marked line of
    // THIS invoice keeps the marker. Unknown ids are ignored, and a marked
    // line missing from the input was removed on purpose.
    const markedLines = await tx.invoiceLine.findMany({
      where: {
        workspaceId: this.workspaceId,
        invoiceId: invoice.id,
        sourceType: RETAINER_FEE_SOURCE,
      },
      select: { id: true, sourceId: true },
    });
    const markerByLineId = new Map(
      markedLines.flatMap((line) =>
        line.sourceId ? [[line.id, line.sourceId] as const] : [],
      ),
    );

    // Release before deleting: onDelete SetNull alone would not reset status.
    await this.releaseEntries(tx, invoice.id);
    await tx.invoiceLine.deleteMany({
      where: { workspaceId: this.workspaceId, invoiceId: invoice.id },
    });

    const taxDefaults = await tx.organizationSettings.findUnique({
      where: { workspaceId: this.workspaceId },
      select: {
        defaultTaxCategoryCode: true,
        defaultTaxExemptionReasonCode: true,
        defaultTaxExemptionReasonText: true,
      },
    });
    for (const [index, input] of lines.entries()) {
      const feeSourceId = input.id ? markerByLineId.get(input.id) : undefined;
      // A repeated id must not duplicate the fee marker.
      if (input.id) markerByLineId.delete(input.id);
      await this.createLine(
        tx,
        invoice,
        feeSourceId
          ? {
              ...input,
              sourceType: RETAINER_FEE_SOURCE,
              sourceId: feeSourceId,
            }
          : {
              ...input,
              taxCategoryCode:
                input.taxCategoryCode ?? taxDefaults?.defaultTaxCategoryCode,
              taxExemptionReasonCode:
                input.taxExemptionReasonCode ??
                taxDefaults?.defaultTaxExemptionReasonCode,
              taxExemptionReasonText:
                input.taxExemptionReasonText ??
                taxDefaults?.defaultTaxExemptionReasonText,
            },
        index,
      );
    }
  }

  /** Creates one RESERVED line and claims its work entries. */
  private async createLine(
    tx: Prisma.TransactionClient,
    invoice: { id: string; clientId: string; currency: string },
    input: InternalInvoiceLineInput,
    lineOrder: number,
  ): Promise<string> {
    const lineEntryIds = input.workEntryIds ?? [];
    const line = await tx.invoiceLine.create({
      data: {
        workspaceId: this.workspaceId,
        invoiceId: invoice.id,
        clientId: invoice.clientId,
        performedByUserId: this.context.userId,
        lineOrder,
        serviceDate: new Date(input.serviceDate),
        description: input.description.trim(),
        netAmount: input.netAmount,
        vatRate: input.vatRate,
        taxCategoryCode: input.taxCategoryCode?.trim() || null,
        taxExemptionReasonCode: input.taxExemptionReasonCode?.trim() || null,
        taxExemptionReasonText: input.taxExemptionReasonText?.trim() || null,
        vatAmount: input.vatAmount,
        grossAmount: input.grossAmount,
        currency: invoice.currency.toUpperCase(),
        status: InvoiceLineStatus.RESERVED,
        sourceType:
          input.sourceType ?? (lineEntryIds.length ? WORK_ENTRY_GROUP : null),
        sourceId: input.sourceId ?? null,
        pricingRequired: input.pricingRequired ?? false,
        minutes: input.minutes ?? null,
        createdByUserId: this.context.userId,
        updatedByUserId: this.context.userId,
      },
    });
    if (lineEntryIds.length)
      await this.claimForLine(tx, invoice, line.id, lineEntryIds);
    return line.id;
  }

  /** Claims entries for a line and links the line to their cases. */
  private async claimForLine(
    tx: Prisma.TransactionClient,
    invoice: { id: string; clientId: string },
    lineId: string,
    entryIds: string[],
  ): Promise<void> {
    const { caseIds } = await this.claimEntries(tx, invoice, lineId, entryIds);
    if (caseIds.length)
      await tx.invoiceLineCase.createMany({
        data: caseIds.map((caseId) => ({
          workspaceId: this.workspaceId,
          invoiceLineId: lineId,
          caseId,
        })),
        skipDuplicates: true,
      });
  }

  private async nextInvoiceNumber(
    tx: Prisma.TransactionClient,
    date = new Date(),
  ): Promise<string> {
    return this.invoiceNumbering.allocateInvoiceNumber(tx, date);
  }

  async suggestInvoiceNumber(
    date?: string,
  ): Promise<{ invoiceNumber: string }> {
    this.assertManager();
    const parsed = date ? new Date(`${date}T00:00:00.000Z`) : new Date();
    if (Number.isNaN(parsed.getTime()))
      throw new ConflictException("Invalid invoice date");
    return {
      invoiceNumber: await this.invoiceNumbering.suggestInvoiceNumber(parsed),
    };
  }

  async createInvoice(input: CreateInvoiceDto) {
    this.assertManager();
    await this.assertClient(input.clientId);
    verifyInvoiceMoney(input, input.lines);
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
      const invoiceDate = new Date(input.dateOfCreate);
      const settings = await tx.organizationSettings.findUnique({
        where: { workspaceId: this.workspaceId },
      });
      if (
        input.invoiceNumber &&
        settings &&
        !settings.invoiceNumberAllowManualOverride
      )
        throw new ConflictException("Manual invoice numbers are disabled");
      const number =
        input.invoiceNumber?.trim() ||
        (await this.nextInvoiceNumber(tx, invoiceDate));
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
          vatLiabilityTimingCode:
            input.vatLiabilityTimingCode ??
            (input.lines.some((line) =>
              ["S10", "S20"].includes(
                line.taxCategoryCode ?? settings?.defaultTaxCategoryCode ?? "",
              ),
            )
              ? settings?.cashAccountingEnabled
                ? "432"
                : "35"
              : null),
          printWorkSpecification: input.printWorkSpecification,
          createdByUserId: this.context.userId,
          updatedByUserId: this.context.userId,
        },
      });
      await this.replaceInvoiceLines(tx, invoice, input.lines);
      if (input.invoiceNumber)
        await this.invoiceNumbering.updateSequenceFromSavedInvoice(
          tx,
          number,
          invoiceDate,
        );
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

  /**
   * Service-only entry point for the billing run: creates a draft invoice
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
        CreateInvoiceDto,
        | "dateOfCreate"
        | "dateOfMaturity"
        | "dateOfTurnover"
        | "placeOfIssue"
        | "methodOfPayment"
        | "country"
        | "vatRate"
      >;
      lines: InternalInvoiceLineInput[];
    },
  ): Promise<string> {
    const sum = (pick: (line: InternalInvoiceLineInput) => number) =>
      input.lines.reduce(
        (total, line) => total.plus(new Prisma.Decimal(pick(line))),
        new Prisma.Decimal(0),
      );
    const settings = await tx.organizationSettings.findUnique({
      where: { workspaceId: this.workspaceId },
    });
    const number = await this.nextInvoiceNumber(
      tx,
      new Date(input.header.dateOfCreate),
    );
    const invoice = await tx.invoice.create({
      data: {
        workspaceId: this.workspaceId,
        clientId: input.clientId,
        invoiceNumber: number,
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
        vatLiabilityTimingCode: input.lines.some((line) =>
          ["S10", "S20"].includes(
            line.taxCategoryCode ?? settings?.defaultTaxCategoryCode ?? "",
          ),
        )
          ? settings?.cashAccountingEnabled
            ? "432"
            : "35"
          : null,
        billingMonth: input.billingMonth,
        createdByUserId: this.context.userId,
        updatedByUserId: this.context.userId,
      },
    });
    await this.replaceInvoiceLines(tx, invoice, input.lines);
    return invoice.id;
  }

  /**
   * Service-only: appends prepared lines to an existing DRAFT invoice inside
   * the caller's transaction and adds their amounts to the invoice totals.
   * Existing lines and their entries are left untouched. Not exposed through
   * the controller; the caller enforces access.
   */
  async appendLinesToDraft(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    lines: InternalInvoiceLineInput[],
  ): Promise<void> {
    await this.sefSubmissions?.lockInvoice(tx, invoiceId);
    await this.sefSubmissions?.assertMutable(tx, invoiceId, "edit");
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, workspaceId: this.workspaceId },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.status !== InvoiceStatus.DRAFT)
      throw new ConflictException("Only draft statements can be changed");
    if (!lines.length) return;
    const entryIds = lines.flatMap((line) => line.workEntryIds ?? []);
    if (entryIds.length !== new Set(entryIds).size)
      throw new ConflictException("Invoice work entries must be unique");
    if (
      lines.some(
        (line) =>
          line.currency.toUpperCase() !== invoice.currency.toUpperCase(),
      )
    )
      throw new ConflictException(
        "Invoice lines must have a matching currency",
      );

    const last = await tx.invoiceLine.aggregate({
      where: { workspaceId: this.workspaceId, invoiceId },
      _max: { lineOrder: true },
    });
    const firstOrder = (last._max.lineOrder ?? -1) + 1;
    for (const [index, input] of lines.entries()) {
      await this.createLine(tx, invoice, input, firstOrder + index);
    }

    const sum = (pick: (line: InternalInvoiceLineInput) => number) =>
      lines.reduce(
        (total, line) => total.plus(new Prisma.Decimal(pick(line))),
        new Prisma.Decimal(0),
      );
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        netAmount: { increment: sum((line) => line.netAmount) },
        vatAmount: { increment: sum((line) => line.vatAmount) },
        grossAmount: { increment: sum((line) => line.grossAmount) },
        updatedByUserId: this.context.userId,
      },
    });
  }

  /**
   * Service-only: claims more work entries onto an existing line of a DRAFT
   * invoice (the month-end run uses it for covered work logged after the
   * fee line was created) and refreshes the line's minutes. Amounts are not
   * changed. Not exposed through the controller; the caller enforces access.
   */
  async attachEntriesToLine(
    tx: Prisma.TransactionClient,
    lineId: string,
    entryIds: string[],
  ): Promise<void> {
    const line = await tx.invoiceLine.findFirst({
      where: { id: lineId, workspaceId: this.workspaceId },
      include: { invoice: true },
    });
    if (!line) throw new NotFoundException("Invoice line not found");
    await this.sefSubmissions?.lockInvoice(tx, line.invoiceId);
    await this.sefSubmissions?.assertMutable(tx, line.invoiceId, "edit");
    if (line.invoice.status !== InvoiceStatus.DRAFT)
      throw new ConflictException("Only draft statements can be changed");
    if (!entryIds.length) return;
    await this.claimForLine(tx, line.invoice, lineId, entryIds);
    const total = await tx.workEntry.aggregate({
      where: { workspaceId: this.workspaceId, invoiceLineId: lineId },
      _sum: { minutes: true },
    });
    await tx.invoiceLine.update({
      where: { id: lineId },
      data: {
        minutes: total._sum.minutes ?? null,
        // The fee marker survives so re-runs still recognise the fee line.
        sourceType: line.sourceType ?? WORK_ENTRY_GROUP,
        updatedByUserId: this.context.userId,
      },
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
    if (
      input.invoiceNumber &&
      input.invoiceNumber.trim() !== invoice.invoiceNumber
    ) {
      const settings = await this.db.organizationSettings.findUnique({
        where: { workspaceId: this.workspaceId },
      });
      if (settings && !settings.invoiceNumberAllowManualOverride)
        throw new ConflictException("Manual invoice numbers are disabled");
    }
    await this.db.$transaction(async (tx) => {
      await this.sefSubmissions?.lockInvoice(tx, id);
      await this.sefSubmissions?.assertMutable(tx, id, "edit");
      const calculatedTotals = input.lines
        ? calculateInvoiceMoney(input.lines)
        : null;
      if (input.lines) {
        verifyInvoiceMoney(
          {
            netAmount: input.netAmount ?? calculatedTotals!.netAmount,
            vatAmount: input.vatAmount ?? calculatedTotals!.vatAmount,
            grossAmount: input.grossAmount ?? calculatedTotals!.grossAmount,
          },
          input.lines,
        );
      }
      await tx.invoice.update({
        where: { id },
        data: {
          invoiceNumber: input.invoiceNumber?.trim(),
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
          netAmount: input.netAmount ?? calculatedTotals?.netAmount,
          vatRate: input.vatRate,
          vatAmount: input.vatAmount ?? calculatedTotals?.vatAmount,
          grossAmount: input.grossAmount ?? calculatedTotals?.grossAmount,
          numberOfCashBill: input.numberOfCashBill?.trim(),
          country: input.country?.trim(),
          vatLiabilityTimingCode: input.vatLiabilityTimingCode,
          printWorkSpecification: input.printWorkSpecification,
          updatedByUserId: this.context.userId,
        },
      });
      if (input.invoiceNumber)
        await this.invoiceNumbering.updateSequenceFromSavedInvoice(
          tx,
          input.invoiceNumber.trim(),
          input.dateOfCreate
            ? new Date(input.dateOfCreate)
            : new Date(invoice.dateOfCreate),
        );
      if (input.lines) await this.replaceInvoiceLines(tx, invoice, input.lines);
    });
    return this.getInvoice(id);
  }

  async deleteInvoice(id: string): Promise<void> {
    this.assertManager();
    await this.db.$transaction(async (tx) => {
      await this.sefSubmissions?.lockInvoice(tx, id);
      await this.sefSubmissions?.assertMutable(tx, id, "delete");
      const invoice = await tx.invoice.findFirst({
        where: { id, workspaceId: this.workspaceId },
        select: { id: true, status: true },
      });
      if (!invoice) throw new NotFoundException("Invoice not found");
      if (invoice.status !== InvoiceStatus.DRAFT)
        throw new ConflictException("Only draft invoices can be deleted");
      await tx.financeMutationRequest.deleteMany({
        where: {
          workspaceId: this.workspaceId,
          operation: "CREATE_INVOICE",
          resultEntityId: id,
        },
      });
      await this.releaseEntries(tx, id);
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
      throw new ConflictException("Only draft statements can be sent");
    if (
      invoice.lines.some(
        (line: { pricingRequired: boolean }) => line.pricingRequired,
      )
    )
      throw new ConflictException("Price every line before sending");
    return this.db.$transaction(async (tx) => {
      await this.sefSubmissions?.lockInvoice(tx, id);
      await this.sefSubmissions?.assertMutable(tx, id, "send");
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
      await this.sefSubmissions?.lockInvoice(tx, id);
      await this.sefSubmissions?.assertMutable(tx, id, "void");
      await tx.invoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.VOIDED,
          voidedAt: new Date(),
          voidedByUserId: this.context.userId,
          updatedByUserId: this.context.userId,
        },
      });
      await this.releaseEntries(tx, id);
      if (invoice.status === InvoiceStatus.DRAFT) {
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
    const updated = await this.db.$transaction(async (tx) => {
      await this.sefSubmissions?.lockInvoice(tx, id);
      await this.sefSubmissions?.assertMutable(tx, id, "edit");
      return tx.invoice.update({
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
    });
    return this.invoiceResponse(updated);
  }
}
