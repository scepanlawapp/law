import { toLatin } from "@law/transliteration";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  paginationMeta,
  PlatformPrismaService,
  WorkspaceContextService,
} from "@law/core";
import {
  CollectionTotals,
  InvoiceCollection,
  PaymentDetail,
  PaymentOptions,
  PaymentPage,
  PaymentSummary,
  WorkspaceRole,
} from "@law/api-interfaces";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import {
  PaymentQueryDto,
  SavePaymentDto,
  VoidPaymentDto,
} from "./payments.dto";

const D = Prisma.Decimal;
const userSelect = { firstName: true, lastName: true, email: true } as const;
const actorName = (u: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}) => [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));
export function collectionBalance(
  total: Prisma.Decimal,
  paid: Prisma.Decimal,
  status: string,
  due: string,
  today: string,
) {
  const remaining = D.max(0, total.minus(paid));
  const overdue = status === "SENT" && remaining.gt(0) && due < today;
  return {
    paidAmount: paid.toFixed(2),
    remainingAmount: remaining.toFixed(2),
    collectionStatus: (paid.eq(0) && !total.eq(0)
      ? "UNPAID"
      : paid.lt(total)
        ? "PARTIALLY_PAID"
        : "PAID") as InvoiceCollection["collectionStatus"],
    overdue,
    daysOverdue: overdue
      ? Math.round((Date.parse(today) - Date.parse(due)) / 86400000)
      : 0,
  };
}
@Injectable()
export class PaymentsService {
  constructor(private readonly db: PlatformPrismaService) {}
  private get context() {
    return WorkspaceContextService.required;
  }
  private get workspaceId() {
    return this.context.workspaceId;
  }
  private authorize() {
    if (![WorkspaceRole.OWNER, WorkspaceRole.ADMIN].includes(this.context.role))
      throw new ForbiddenException("Pristup finansijama nije dozvoljen.");
  }
  private date(value: string) {
    const date = new Date(value);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      throw new BadRequestException("Datum nije ispravan.");
    return date;
  }
  private money(value: string) {
    if (!/^\d{1,16}(\.\d{1,2})?$/.test(value) || !new D(value).gt(0))
      throw new BadRequestException(
        "Iznos mora biti pozitivan, sa najviše dve decimale.",
      );
    return new D(value);
  }
  async options(): Promise<PaymentOptions> {
    this.authorize();
    const [settings, config, bankAccounts] = await Promise.all([
      this.db.organizationSettings.findUnique({
        where: { workspaceId: this.workspaceId },
      }),
      this.db.workspaceConfig.findUnique({
        where: { workspaceId: this.workspaceId },
      }),
      this.db.bankAccount.findMany({
        where: { workspaceId: this.workspaceId, active: true },
        select: { id: true, name: true, currencyCode: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      currencies: Array.isArray(settings?.allowedCurrencyCodes)
        ? (settings.allowedCurrencyCodes as string[])
        : ["RSD"],
      defaultCurrency: settings?.defaultCurrencyCode ?? "RSD",
      today: new Intl.DateTimeFormat("en-CA", {
        timeZone: config?.timeZone || "Europe/Belgrade",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
      bankAccounts,
    };
  }
  // The CTE calculates effective allocations once, before filtering and pagination.
  private paymentCte() {
    return Prisma.sql`WITH balances AS (
      SELECT p.*, c."displayName" AS "clientName",
        COALESCE(SUM(a.amount) FILTER (WHERE a."removedAt" IS NULL AND p.status = 'ACTIVE'),0) AS "allocatedAmount"
      FROM "Payment" p LEFT JOIN "Client" c ON c.id=p."clientId" AND c."workspaceId"=p."workspaceId"
      LEFT JOIN "PaymentAllocation" a ON a."paymentId"=p.id AND a."workspaceId"=p."workspaceId"
      WHERE p."workspaceId"=${this.workspaceId} GROUP BY p.id,c."displayName"
    ), receipts AS (SELECT *, CASE WHEN status='VOIDED' THEN 0 ELSE amount-"allocatedAmount" END AS "unallocatedAmount",
      CASE WHEN "allocatedAmount"=0 THEN 'UNALLOCATED' WHEN "allocatedAmount"<amount THEN 'PARTIAL' ELSE 'FULL' END AS "allocationState" FROM balances)`;
  }
  private filters(q: PaymentQueryDto) {
    const terms: Prisma.Sql[] = [Prisma.sql`TRUE`];
    for (const key of [
      "clientId",
      "currency",
      "paymentMethod",
      "purpose",
      "status",
      "bankAccountId",
      "allocationState",
    ] as const) {
      if (q[key])
        terms.push(
          Prisma.sql`${Prisma.raw('"' + key + '"')}::text = ${q[key]}`,
        );
    }
    if (q.from) {
      this.date(q.from);
      terms.push(Prisma.sql`"receivedAt">=${q.from}::date`);
    }
    if (q.to) {
      this.date(q.to);
      terms.push(Prisma.sql`"receivedAt"<=${q.to}::date`);
    }
    if (q.from && q.to && q.from > q.to)
      throw new BadRequestException(
        "Početni datum mora biti pre krajnjeg datuma.",
      );
    if (q.search?.trim()) {
      const text = "%" + q.search.trim().replace(/[\\%_]/g, "\\$&") + "%";
      terms.push(
        Prisma.sql`("clientName" ILIKE ${text} OR "payerName" ILIKE ${text} OR reference ILIKE ${text} OR note ILIKE ${text})`,
      );
    }
    return Prisma.join(terms, " AND ");
  }
  async list(q: PaymentQueryDto): Promise<PaymentPage> {
    this.authorize();
    const filters = this.filters(q),
      page = q.page ?? 1,
      pageSize = q.pageSize ?? 25;
    const sort = [
      "receivedAt",
      "amount",
      "clientName",
      "unallocatedAmount",
    ].includes(q.sort ?? "")
      ? (q.sort ?? "receivedAt")
      : "receivedAt";
    const direction = q.direction === "asc" ? "ASC" : "DESC";
    return this.db.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          Array<PaymentSummary & { receivedAt: Date }>
        >(
          Prisma.sql`${this.paymentCte()} SELECT * FROM receipts WHERE ${filters} ORDER BY ${Prisma.raw('"' + sort + '" ' + direction)} NULLS LAST,id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
        );
        const count = await tx.$queryRaw<Array<{ total: bigint }>>(
          Prisma.sql`${this.paymentCte()} SELECT COUNT(*) AS total FROM receipts WHERE ${filters}`,
        );
        return {
          items: rows.map((r) => ({
            ...r,
            receivedAt: r.receivedAt.toISOString().slice(0, 10),
            amount: String(r.amount),
            allocatedAmount: String(r.allocatedAmount),
            unallocatedAmount: String(r.unallocatedAmount),
          })),
          meta: paginationMeta(page, pageSize, Number(count[0].total), [
            { field: sort, direction: q.direction === "asc" ? "asc" : "desc" },
          ]),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async collections(
    clientId?: string,
    ids?: string[],
    tx: Prisma.TransactionClient = this.db,
  ): Promise<InvoiceCollection[]> {
    this.authorize();
    const config = await tx.workspaceConfig.findUnique({
      where: { workspaceId: this.workspaceId },
    });
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: config?.timeZone || "Europe/Belgrade",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const invoices = await tx.invoice.findMany({
      where: {
        workspaceId: this.workspaceId,
        ...(clientId ? { clientId } : {}),
        ...(ids ? { id: { in: ids } } : {}),
      },
      include: {
        client: { select: { displayName: true } },
        paymentAllocations: {
          where: {
            workspaceId: this.workspaceId,
            removedAt: null,
            payment: { status: "ACTIVE", workspaceId: this.workspaceId },
          },
          select: { amount: true },
        },
      },
      orderBy: [{ dateOfMaturity: "asc" }, { id: "asc" }],
    });
    return invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      clientId: i.clientId,
      clientName: i.client.displayName,
      currency: i.currency,
      status: i.status,
      dateOfCreate: i.dateOfCreate.toISOString().slice(0, 10),
      dateOfMaturity: i.dateOfMaturity.toISOString().slice(0, 10),
      grossAmount: i.grossAmount.toFixed(2),
      ...collectionBalance(
        i.grossAmount,
        i.paymentAllocations.reduce((sum, a) => sum.plus(a.amount), new D(0)),
        i.status,
        i.dateOfMaturity.toISOString().slice(0, 10),
        today,
      ),
    }));
  }
  async eligible(clientId: string, currency: string, paymentId?: string) {
    this.authorize();
    const rows = await this.collections(clientId);
    const current = paymentId
      ? await this.db.paymentAllocation.findMany({
          where: {
            workspaceId: this.workspaceId,
            paymentId,
            removedAt: null,
            payment: { status: "ACTIVE", workspaceId: this.workspaceId },
          },
          select: { invoiceId: true, amount: true },
        })
      : [];
    return rows
      .filter(
        (i) =>
          i.status === "SENT" &&
          i.currency === currency &&
          (new D(i.remainingAmount).gt(0) ||
            current.some((a) => a.invoiceId === i.id)),
      )
      .map((i) => ({
        ...i,
        remainingAmount: new D(i.remainingAmount)
          .plus(
            current
              .filter((a) => a.invoiceId === i.id)
              .reduce((s, a) => s.plus(a.amount), new D(0)),
          )
          .toFixed(2),
      }));
  }
  async summary(q: PaymentQueryDto): Promise<CollectionTotals[]> {
    this.authorize();
    // Receipts/allocated use received-date range. Available funds and receivables are current all-date balances.
    return this.db.$transaction(
      async (tx) => {
        const scoped = new PaymentQueryDto();
        scoped.clientId = q.clientId;
        scoped.currency = q.currency;
        scoped.status = "ACTIVE";
        const scope = this.filters(scoped);
        const period = new PaymentQueryDto();
        period.from = q.from;
        period.to = q.to;
        const rows = await tx.$queryRaw<
          Array<{
            currency: string;
            received: Prisma.Decimal;
            allocated: Prisma.Decimal;
            unallocated: Prisma.Decimal;
            advances: Prisma.Decimal;
          }>
        >(Prisma.sql`${this.paymentCte()}
        SELECT currency,COALESCE(SUM(amount) FILTER(WHERE ${this.filters(period)}),0) AS received,
        COALESCE(SUM("allocatedAmount") FILTER(WHERE ${this.filters(period)}),0) AS allocated,
        SUM("unallocatedAmount") AS unallocated,COALESCE(SUM("unallocatedAmount") FILTER(WHERE purpose='ADVANCE'),0) AS advances
        FROM receipts WHERE ${scope} GROUP BY currency`);
        const totals = new Map<string, CollectionTotals>();
        const empty = (currency: string): CollectionTotals => ({
          currency,
          received: "0.00",
          allocated: "0.00",
          unallocated: "0.00",
          advances: "0.00",
          outstanding: "0.00",
          overdue: "0.00",
          unpaidInvoices: 0,
        });
        for (const r of rows)
          totals.set(r.currency, {
            ...empty(r.currency),
            received: r.received.toFixed(2),
            allocated: r.allocated.toFixed(2),
            unallocated: r.unallocated.toFixed(2),
            advances: r.advances.toFixed(2),
          });
        for (const i of await this.collections(q.clientId, undefined, tx)) {
          if (i.status !== "SENT" || (q.currency && i.currency !== q.currency))
            continue;
          const t = totals.get(i.currency) ?? empty(i.currency);
          t.outstanding = new D(t.outstanding)
            .plus(i.remainingAmount)
            .toFixed(2);
          if (i.overdue)
            t.overdue = new D(t.overdue).plus(i.remainingAmount).toFixed(2);
          if (new D(i.remainingAmount).gt(0)) t.unpaidInvoices++;
          totals.set(i.currency, t);
        }
        return [...totals.values()].sort((a, b) =>
          a.currency.localeCompare(b.currency),
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async detail(id: string): Promise<PaymentDetail> {
    this.authorize();
    return this.db.$transaction((tx) => this.readDetail(tx, id), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }
  private async readDetail(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<PaymentDetail> {
    const p = await tx.payment.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: {
        client: true,
        bankAccount: true,
        createdBy: { select: userSelect },
        updatedBy: { select: userSelect },
        allocations: true,
        auditEvents: {
          include: { performedBy: { select: userSelect } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!p) throw new NotFoundException("Uplata nije pronađena.");
    const invoices = await this.collections(
      undefined,
      p.allocations.map((a) => a.invoiceId),
      tx,
    );
    const allocated =
      p.status === "ACTIVE"
        ? p.allocations
            .filter((a) => !a.removedAt)
            .reduce((s, a) => s.plus(a.amount), new D(0))
        : new D(0);
    return {
      ...p,
      amount: p.amount.toFixed(2),
      receivedAt: p.receivedAt.toISOString().slice(0, 10),
      clientName: p.client?.displayName ?? null,
      allocatedAmount: allocated.toFixed(2),
      unallocatedAmount:
        p.status === "ACTIVE" ? p.amount.minus(allocated).toFixed(2) : "0.00",
      allocationState: allocated.eq(0)
        ? "UNALLOCATED"
        : allocated.lt(p.amount)
          ? "PARTIAL"
          : "FULL",
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      voidedAt: p.voidedAt?.toISOString() ?? null,
      createdBy: actorName(p.createdBy),
      updatedBy: actorName(p.updatedBy),
      bankAccountName: p.bankAccount?.name ?? null,
      allocations: p.allocations.map((a) => {
        const invoice = invoices.find((i) => i.id === a.invoiceId);
        if (!invoice)
          throw new ConflictException("Povezani račun nije dostupan.");
        return {
          ...invoice,
          allocationId: a.id,
          amount: a.amount.toFixed(2),
          removedAt: a.removedAt?.toISOString() ?? null,
        };
      }),
      auditEvents: p.auditEvents.map((a) => ({
        ...a,
        actor: actorName(a.performedBy),
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }
  async collection(id: string) {
    const rows = await this.collections(undefined, [id]);
    if (!rows.length) throw new NotFoundException("Račun nije pronađen.");
    return rows[0];
  }
  async invoiceHistory(id: string) {
    this.authorize();
    if (
      !(await this.db.invoice.findFirst({
        where: { id, workspaceId: this.workspaceId },
      }))
    )
      throw new NotFoundException("Račun nije pronađen.");
    const allocations = await this.db.paymentAllocation.findMany({
      where: { invoiceId: id, workspaceId: this.workspaceId },
      include: { payment: true },
      orderBy: { createdAt: "desc" },
    });
    return allocations.map((a) => ({
      paymentId: a.paymentId,
      amount: a.amount.toFixed(2),
      paymentAmount: a.payment.amount.toFixed(2),
      receivedAt: a.payment.receivedAt.toISOString().slice(0, 10),
      paymentMethod: a.payment.paymentMethod,
      reference: a.payment.reference,
      status: a.payment.status,
      removedAt: a.removedAt?.toISOString() ?? null,
    }));
  }
  async save(id: string | null, input: SavePaymentDto, key: string) {
    return this.mutate(
      id,
      input,
      key,
      id ? "UPDATE_PAYMENT" : "CREATE_PAYMENT",
    );
  }
  async void(id: string, input: VoidPaymentDto, key: string) {
    if (!input.reason?.trim())
      throw new BadRequestException("Unesite razlog poništavanja.");
    return this.mutate(id, input, key, "VOID_PAYMENT");
  }
  private async mutate(
    id: string | null,
    input: SavePaymentDto | VoidPaymentDto,
    key: string,
    operation: "CREATE_PAYMENT" | "UPDATE_PAYMENT" | "VOID_PAYMENT",
  ): Promise<PaymentDetail> {
    this.authorize();
    if (!key || key.length > 200)
      throw new BadRequestException("Nedostaje ključ zahteva.");
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ id, input, userId: this.context.userId }))
      .digest("hex");
    return this.db.$transaction(
      async (tx) => {
        // Serialize payment writers; invoice row locks coordinate with existing invoice/SEF mutations.
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${this.workspaceId}),hashtext('payment-mutations'))`;
        const existing = await tx.financeMutationRequest.findUnique({
          where: {
            workspaceId_operation_idempotencyKey: {
              workspaceId: this.workspaceId,
              operation,
              idempotencyKey: key,
            },
          },
        });
        if (existing) {
          const stored = existing.result as {
            fingerprint?: string;
            response?: unknown;
          };
          if (stored.fingerprint !== fingerprint)
            throw new ConflictException(
              "Ključ zahteva već je iskorišćen za drugi zahtev.",
            );
          return stored.response as PaymentDetail;
        }
        const before = id ? await this.readDetail(tx, id) : null;
        if (before && before.version !== input.version)
          throw new ConflictException(
            "Uplata je u međuvremenu izmenjena. Osvežite podatke.",
          );
        if (before?.status === "VOIDED")
          throw new ConflictException("Poništena uplata ne može da se menja.");
        const body = input as SavePaymentDto;
        const invoiceIds = [
          ...new Set([
            ...(before?.allocations
              .filter((a) => !a.removedAt)
              .map((a) => a.id) ?? []),
            ...(operation === "VOID_PAYMENT"
              ? []
              : body.allocations.map((a) => a.invoiceId)),
          ]),
        ].sort();
        if (invoiceIds.length)
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM "Invoice" WHERE "workspaceId"=${this.workspaceId} AND id IN (${Prisma.join(invoiceIds)}) ORDER BY id FOR UPDATE`,
          );
        let paymentId = id;
        if (operation === "VOID_PAYMENT") {
          if (!id) throw new NotFoundException("Uplata nije pronađena.");
          await tx.payment.update({
            where: { id, workspaceId: this.workspaceId },
            data: {
              status: "VOIDED",
              voidedAt: new Date(),
              voidReason: toLatin((input as VoidPaymentDto).reason.trim()),
              voidedByUserId: this.context.userId,
              updatedByUserId: this.context.userId,
              version: { increment: 1 },
            },
          });
        } else {
          const amount = this.money(body.amount);
          const receivedAt = this.date(body.receivedAt);
          if (
            new Set(body.allocations.map((a) => a.invoiceId)).size !==
            body.allocations.length
          )
            throw new BadRequestException(
              "Račun može biti naveden samo jednom.",
            );
          if (body.allocations.length && !body.clientId)
            throw new BadRequestException("Izaberite klijenta pre raspodele.");
          if (
            body.clientId &&
            !(await tx.client.findFirst({
              where: { id: body.clientId, workspaceId: this.workspaceId },
            }))
          )
            throw new BadRequestException("Klijent nije dostupan.");
          const settings = await tx.organizationSettings.findUnique({
            where: { workspaceId: this.workspaceId },
          });
          const currencies = Array.isArray(settings?.allowedCurrencyCodes)
            ? settings.allowedCurrencyCodes
            : ["RSD"];
          if (!currencies.includes(body.currency))
            throw new BadRequestException(
              "Valuta nije omogućena u podešavanjima kancelarije.",
            );
          if (
            body.bankAccountId &&
            !(await tx.bankAccount.findFirst({
              where: {
                id: body.bankAccountId,
                workspaceId: this.workspaceId,
                currencyCode: body.currency,
                active: true,
              },
            }))
          )
            throw new BadRequestException(
              "Bankovni račun nije dostupan za ovu valutu.",
            );
          let sum = new D(0);
          for (const a of body.allocations) {
            const value = this.money(a.amount);
            sum = sum.plus(value);
            const invoice = await tx.invoice.findFirst({
              where: { id: a.invoiceId, workspaceId: this.workspaceId },
            });
            if (
              !invoice ||
              invoice.status !== "SENT" ||
              invoice.clientId !== body.clientId ||
              invoice.currency !== body.currency
            )
              throw new BadRequestException(
                "Raspodela zahteva poslat račun istog klijenta i valute.",
              );
            const paid = await tx.paymentAllocation.aggregate({
              where: {
                workspaceId: this.workspaceId,
                invoiceId: a.invoiceId,
                removedAt: null,
                payment: { status: "ACTIVE", workspaceId: this.workspaceId },
                ...(id ? { paymentId: { not: id } } : {}),
              },
              _sum: { amount: true },
            });
            if (value.plus(paid._sum.amount ?? 0).gt(invoice.grossAmount))
              throw new ConflictException(
                "Raspodela premašuje preostali dug računa.",
              );
          }
          if (sum.gt(amount))
            throw new BadRequestException(
              "Raspoređeni iznos premašuje iznos uplate. Smanjite raspodelu ili povećajte uplatu.",
            );
          const data = {
            clientId: body.clientId || null,
            amount,
            currency: body.currency,
            receivedAt,
            paymentMethod: body.paymentMethod,
            purpose: body.purpose,
            reference: body.reference ? toLatin(body.reference.trim()) : null,
            payerName: body.payerName ? toLatin(body.payerName.trim()) : null,
            note: body.note ? toLatin(body.note.trim()) : null,
            bankAccountId: body.bankAccountId || null,
            updatedByUserId: this.context.userId,
          };
          const payment = id
            ? await tx.payment.update({
                where: { id, workspaceId: this.workspaceId },
                data: { ...data, version: { increment: 1 } },
              })
            : await tx.payment.create({
                data: {
                  ...data,
                  workspaceId: this.workspaceId,
                  createdByUserId: this.context.userId,
                },
              });
          paymentId = payment.id;
          // Retain superseded rows so removed/reassigned allocations remain traceable.
          await tx.paymentAllocation.updateMany({
            where: {
              workspaceId: this.workspaceId,
              paymentId,
              removedAt: null,
            },
            data: { removedAt: new Date() },
          });
          if (body.allocations.length)
            await tx.paymentAllocation.createMany({
              data: body.allocations.map((a) => ({
                workspaceId: this.workspaceId,
                paymentId: payment.id,
                invoiceId: a.invoiceId,
                amount: new D(a.amount),
                createdByUserId: this.context.userId,
              })),
            });
        }
        if (!paymentId) throw new NotFoundException("Uplata nije pronađena.");
        const after = await this.readDetail(tx, paymentId);
        const snapshot = (p: PaymentDetail) => {
          const { auditEvents, ...rest } = p;
          void auditEvents;
          return json(rest);
        };
        await tx.paymentAuditEvent.create({
          data: {
            workspaceId: this.workspaceId,
            paymentId,
            performedByUserId: this.context.userId,
            action:
              operation === "CREATE_PAYMENT"
                ? "PAYMENT_CREATED"
                : operation === "VOID_PAYMENT"
                  ? "PAYMENT_VOIDED"
                  : "PAYMENT_UPDATED",
            previousData: before ? snapshot(before) : Prisma.JsonNull,
            newData: snapshot(after),
            reason:
              operation === "VOID_PAYMENT"
                ? toLatin((input as VoidPaymentDto).reason.trim())
                : null,
          },
        });
        const result = await this.readDetail(tx, paymentId);
        await tx.financeMutationRequest.create({
          data: {
            workspaceId: this.workspaceId,
            operation,
            idempotencyKey: key,
            resultEntityId: paymentId,
            result: json({ fingerprint, response: result }),
          },
        });
        return result;
      },
      { timeout: 20000 },
    );
  }
}
