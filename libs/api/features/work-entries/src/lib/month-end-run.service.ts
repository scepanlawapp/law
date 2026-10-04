import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  ClientReference,
  MonthEndPrecheck,
  MonthEndRunResult,
  WorkspaceRole,
} from "@law/api-interfaces";
import {
  FinancialsService,
  InternalInvoiceLineInput,
  RETAINER_FEE_SOURCE,
} from "@law/financials";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";
import { BillingSetupService } from "./billing-setup.service";
import { allocate, prorate, priceMinutes } from "./retainer-allocation";
import { activeAgreementOn, AgreementTerms } from "./treatment";
import { WorkEntriesService } from "./work-entries.service";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const FEE_PREFIX = "Paušal za";
const DAY_MS = 24 * 60 * 60 * 1000;
const CLIENT_TRANSACTION_TIMEOUT_MS = 30_000;

const MONTH_NAMES = [
  "januar",
  "februar",
  "mart",
  "april",
  "maj",
  "jun",
  "jul",
  "avgust",
  "septembar",
  "oktobar",
  "novembar",
  "decembar",
];

type StatementLineInput = InternalInvoiceLineInput;

interface BillableEntry {
  id: string;
  workDate: Date;
  createdAt: Date;
  minutes: number;
  serviceCategoryId: string | null;
  caseId: string | null;
  treatment: "RETAINER" | "HOURLY" | "AT";
  case: { caseNumber: string; name: string } | null;
  serviceCategory: { name: string } | null;
}

interface FeePlan {
  agreementId: string;
  description: string;
  fee: Prisma.Decimal;
  entryIds: string[];
  minutes: number;
}

/** Everything one currency of one client contributes to the month. */
interface CurrencyBucket {
  currency: string;
  fees: FeePlan[];
  lines: StatementLineInput[];
}

interface RunContext {
  month: string;
  monthStart: Date;
  monthEnd: Date;
  vatRate: Prisma.Decimal;
  internalCurrency: string;
  paymentTermDays: number;
}

type RunRow = MonthEndRunResult["statements"][number];
type StatementHeader = Parameters<
  FinancialsService["createDraftFromLines"]
>[1]["header"];

function monthBounds(month: string): { start: Date; end: Date } {
  if (!MONTH_PATTERN.test(month)) {
    throw new BadRequestException("month must be in YYYY-MM format");
  }
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 0)),
  };
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function sumMinutes(entries: { minutes: number }[]): number {
  return entries.reduce((total, entry) => total + entry.minutes, 0);
}

function groupDescription(entry: BillableEntry): string {
  if (entry.case) return `${entry.case.caseNumber} ${entry.case.name}`;
  return entry.serviceCategory?.name ?? "Ostali rad";
}

/** Entries of one case, or of one category when they have no case. */
function groupByCase(entries: BillableEntry[]): {
  description: string;
  entryIds: string[];
  minutes: number;
}[] {
  const groups = new Map<string, BillableEntry[]>();
  for (const entry of entries) {
    const key = entry.caseId ?? `cat:${entry.serviceCategoryId ?? "none"}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.values()].map((group) => ({
    description: groupDescription(group[0]),
    entryIds: group.map((entry) => entry.id),
    minutes: sumMinutes(group),
  }));
}

/**
 * Owner-run month end: lists work that still needs a decision and turns the
 * confirmed unbilled work of each client into draft billing statements, one
 * per client and currency. Re-running only adds what is new.
 */
@Injectable()
export class MonthEndRunService {
  private readonly logger = new Logger(MonthEndRunService.name);

  constructor(
    private readonly db: PlatformPrismaService,
    private readonly billingSetup: BillingSetupService,
    private readonly workEntries: WorkEntriesService,
    private readonly financials: FinancialsService,
  ) {}

  private get context() {
    return WorkspaceContextService.required;
  }

  private get workspaceId() {
    return this.context.workspaceId;
  }

  private assertOwner(): void {
    if (this.context.role !== WorkspaceRole.OWNER) {
      throw new ForbiddenException("Only the owner can run the month end");
    }
  }

  // ------------------------------------------------------------ pre-check

  async precheck(month: string): Promise<MonthEndPrecheck> {
    this.assertOwner();
    const { start, end } = monthBounds(month);
    const open = await this.workEntries.listOpenInRange(start, end);
    const byClient = new Map<
      string,
      {
        client: ClientReference;
        open: MonthEndPrecheck["clients"][number]["open"];
      }
    >();
    for (const entry of open) {
      const group = byClient.get(entry.client.id) ?? {
        client: entry.client,
        open: [],
      };
      group.open.push(entry);
      byClient.set(entry.client.id, group);
    }
    return {
      month,
      clients: [...byClient.values()].sort((a, b) =>
        a.client.displayName.localeCompare(b.client.displayName, "sr-Latn"),
      ),
    };
  }

  // ------------------------------------------------------------------ run

  async run(month: string): Promise<MonthEndRunResult> {
    this.assertOwner();
    const { start, end } = monthBounds(month);
    const config = await this.billingSetup.getWorkspaceConfig();
    const run: RunContext = {
      month,
      monthStart: start,
      monthEnd: end,
      vatRate: new Prisma.Decimal(config.defaultVatRate),
      internalCurrency: config.internalCurrency,
      paymentTermDays: config.paymentTermDays,
    };

    const clients = await this.clientsToBill(start, end);
    const statements: RunRow[] = [];
    for (const client of clients) {
      statements.push(...(await this.runForClient(run, client)));
    }
    return { month, statements };
  }

  /** Workspace clients with billable work in the month or an active retainer. */
  private async clientsToBill(
    start: Date,
    end: Date,
  ): Promise<ClientReference[]> {
    const [withWork, withRetainer] = await Promise.all([
      this.db.workEntry.findMany({
        where: {
          workspaceId: this.workspaceId,
          status: "CONFIRMED",
          invoiceLineId: null,
          treatment: { in: ["RETAINER", "HOURLY", "AT"] },
          minutes: { not: null },
          workDate: { gte: start, lte: end },
        },
        select: { clientId: true },
        distinct: ["clientId"],
      }),
      this.db.retainerAgreement.findMany({
        where: {
          workspaceId: this.workspaceId,
          active: true,
          validFrom: { lte: end },
          OR: [{ validTo: null }, { validTo: { gte: start } }],
        },
        select: { clientId: true },
        distinct: ["clientId"],
      }),
    ]);
    const ids = [
      ...new Set([...withWork, ...withRetainer].map((row) => row.clientId)),
    ];
    if (!ids.length) return [];
    const rows = await this.db.client.findMany({
      where: { id: { in: ids }, workspaceId: this.workspaceId },
    });
    return rows
      .map((client) => ({
        id: client.id,
        clientNumber: client.clientNumber,
        type: client.type,
        displayName: client.displayName,
        status: client.status,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "sr-Latn"));
  }

  private async runForClient(
    run: RunContext,
    client: ClientReference,
  ): Promise<RunRow[]> {
    // Where the transaction got to, so a conflict can still be reported.
    const progress = { currency: run.internalCurrency, invoiceId: "" };
    try {
      return await this.db.$transaction(
        (tx) => this.billClient(tx, run, client, progress),
        { timeout: CLIENT_TRANSACTION_TIMEOUT_MS },
      );
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
      // Someone else claimed these entries or changed the draft; only this
      // client rolls back, and the owner is told it was not billed.
      this.logger.warn(
        `Month end ${run.month} not billed for client ${client.id}: ${error.message}`,
      );
      return [
        {
          invoiceId: progress.invoiceId,
          client,
          currency: progress.currency,
          created: false,
          addedLines: 0,
          attachedEntries: 0,
          pricingRequiredLines: 0,
          conflict: error.message,
        },
      ];
    }
  }

  private async billClient(
    tx: Prisma.TransactionClient,
    run: RunContext,
    client: ClientReference,
    progress: { currency: string; invoiceId: string },
  ): Promise<RunRow[]> {
    // Serialises concurrent runs for this client and month so a second run
    // waits, then sees the first run's draft instead of creating another fee.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`month-end:${this.workspaceId}:${client.id}:${run.month}`}))`;

    const entries = await this.loadEntries(tx, client.id, run);
    const agreements = await this.billingSetup.agreementsForClient(
      client.id,
      tx,
    );
    const profile = await tx.clientBillingProfile.findFirst({
      where: { workspaceId: this.workspaceId, clientId: client.id },
    });
    const covered = await tx.workEntry.findMany({
      where: {
        workspaceId: this.workspaceId,
        clientId: client.id,
        status: "BILLED",
        treatment: "RETAINER",
        invoiceLine: {
          invoice: {
            workspaceId: this.workspaceId,
            clientId: client.id,
            billingMonth: run.month,
            status: { not: "VOIDED" },
          },
        },
      },
      select: { workDate: true, minutes: true },
    });

    const buckets = this.buildBuckets(run, {
      entries,
      agreements,
      profile,
      covered: covered.map((row) => ({
        workDate: row.workDate,
        minutes: row.minutes ?? 0,
      })),
    });

    const rows: RunRow[] = [];
    let header: StatementHeader | null = null;
    for (const bucket of buckets) {
      progress.currency = bucket.currency;
      progress.invoiceId = "";
      const draft = await tx.invoice.findFirst({
        where: {
          workspaceId: this.workspaceId,
          clientId: client.id,
          billingMonth: run.month,
          currency: bucket.currency,
          status: "DRAFT",
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      progress.invoiceId = draft?.id ?? "";

      const feeLines = await tx.invoiceLine.findMany({
        where: {
          workspaceId: this.workspaceId,
          clientId: client.id,
          currency: bucket.currency,
          // Structural marker, never the wording: the draft is editable.
          sourceType: RETAINER_FEE_SOURCE,
          invoice: {
            billingMonth: run.month,
            status: { not: "VOIDED" },
          },
        },
        select: { id: true, invoiceId: true, sourceId: true },
        orderBy: [{ createdAt: "asc" }, { lineOrder: "asc" }, { id: "asc" }],
      });

      const lines: StatementLineInput[] = [];
      const attachToFee: { lineId: string; entryIds: string[] }[] = [];
      for (const plan of bucket.fees) {
        const planFeeLines = feeLines.filter(
          (line) => line.sourceId === plan.agreementId,
        );
        const draftFeeLine = planFeeLines.find(
          (line) => line.invoiceId === draft?.id,
        );
        if (!planFeeLines.length) {
          lines.push(
            this.line(run, bucket.currency, {
              description: plan.description,
              net: plan.fee,
              entryIds: plan.entryIds,
              minutes: plan.minutes,
              sourceId: plan.agreementId,
              feeLine: true,
            }),
          );
        } else if (plan.entryIds.length && draftFeeLine) {
          // Fee already on the draft: covered work logged since joins that line.
          attachToFee.push({
            lineId: draftFeeLine.id,
            entryIds: plan.entryIds,
          });
        } else if (plan.entryIds.length) {
          // Fee already invoiced on a sent invoice: keep the work visible on
          // the new draft without charging the fee twice.
          lines.push(
            this.line(run, bucket.currency, {
              description: `${plan.description} (dodatni rad u okviru paušala)`,
              net: new Prisma.Decimal(0),
              entryIds: plan.entryIds,
              minutes: plan.minutes,
              sourceId: plan.agreementId,
              feeLine: true,
            }),
          );
        }
      }
      lines.push(...bucket.lines);
      if (!lines.length && !attachToFee.length) continue;

      let invoiceId: string;
      let created = false;
      if (draft) {
        invoiceId = draft.id;
        for (const attach of attachToFee) {
          await this.financials.attachEntriesToLine(
            tx,
            attach.lineId,
            attach.entryIds,
          );
        }
        if (lines.length) {
          await this.financials.appendLinesToDraft(tx, draft.id, lines);
        }
      } else {
        header ??= await this.statementHeader(tx, client.id, run);
        invoiceId = await this.financials.createDraftFromLines(tx, {
          clientId: client.id,
          currency: bucket.currency,
          billingMonth: run.month,
          header,
          lines,
        });
        created = true;
      }
      progress.invoiceId = invoiceId;
      rows.push({
        invoiceId,
        client,
        currency: bucket.currency,
        created,
        addedLines: lines.length,
        attachedEntries: attachToFee.reduce(
          (total, attach) => total + attach.entryIds.length,
          0,
        ),
        pricingRequiredLines: lines.filter((line) => line.pricingRequired)
          .length,
      });
    }
    return rows;
  }

  // -------------------------------------------------------------- loading

  private async loadEntries(
    tx: Prisma.TransactionClient,
    clientId: string,
    run: RunContext,
  ): Promise<BillableEntry[]> {
    const rows = await tx.workEntry.findMany({
      where: {
        workspaceId: this.workspaceId,
        clientId,
        status: "CONFIRMED",
        invoiceLineId: null,
        treatment: { in: ["RETAINER", "HOURLY", "AT"] },
        minutes: { not: null },
        workDate: { gte: run.monthStart, lte: run.monthEnd },
      },
      include: {
        case: { select: { caseNumber: true, name: true } },
        serviceCategory: { select: { name: true } },
      },
      orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      workDate: row.workDate,
      createdAt: row.createdAt,
      minutes: row.minutes ?? 0,
      serviceCategoryId: row.serviceCategoryId,
      caseId: row.caseId,
      treatment: row.treatment as BillableEntry["treatment"],
      case: row.case,
      serviceCategory: row.serviceCategory,
    }));
  }

  /** Header copied from the client's latest live invoice, else defaults. */
  private async statementHeader(
    tx: Prisma.TransactionClient,
    clientId: string,
    run: RunContext,
  ): Promise<StatementHeader> {
    const latest = await tx.invoice.findFirst({
      where: {
        workspaceId: this.workspaceId,
        clientId,
        status: { not: "VOIDED" },
      },
      orderBy: { createdAt: "desc" },
      select: { placeOfIssue: true, methodOfPayment: true, country: true },
    });
    const today = new Date();
    const todayUtc = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    return {
      dateOfCreate: isoDate(todayUtc),
      dateOfTurnover: isoDate(run.monthEnd),
      dateOfMaturity: isoDate(
        new Date(todayUtc.getTime() + run.paymentTermDays * DAY_MS),
      ),
      placeOfIssue: latest?.placeOfIssue ?? "",
      methodOfPayment: latest?.methodOfPayment ?? "Prenos na račun",
      country: latest?.country ?? "Srbija",
      vatRate: run.vatRate.toNumber(),
    };
  }

  // ------------------------------------------------------------- building

  /**
   * Sorts the month's entries into one bucket per currency and prepares the
   * lines: overage, out-of-scope, hourly, then entries awaiting a price. Fee
   * lines are only planned here; whether they are added depends on the draft.
   */
  private buildBuckets(
    run: RunContext,
    input: {
      entries: BillableEntry[];
      agreements: AgreementTerms[];
      profile: {
        hourlyRate: Prisma.Decimal | null;
        currency: string | null;
      } | null;
      covered: { workDate: Date; minutes: number }[];
    },
  ): CurrencyBucket[] {
    const { entries, agreements, profile } = input;
    const buckets = new Map<string, CurrencyBucket>();
    const bucketFor = (currency: string): CurrencyBucket => {
      const existing = buckets.get(currency);
      if (existing) return existing;
      const created = { currency, fees: [], lines: [] };
      buckets.set(currency, created);
      return created;
    };

    const monthAgreements = agreements
      .flatMap((agreement) => {
        const proration = prorate(agreement, run.month);
        return proration ? [{ agreement, proration }] : [];
      })
      .sort(
        (a, b) =>
          a.agreement.validFrom.getTime() - b.agreement.validFrom.getTime(),
      );
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const [year, monthNumber] = run.month.split("-").map(Number);
    const monthLabel = `${MONTH_NAMES[monthNumber - 1]} ${year}`;
    const profileCurrency = profile?.currency ?? run.internalCurrency;
    const fallbackCurrency =
      monthAgreements[0]?.agreement.currency ?? profileCurrency;

    // Section by section so lines come out as fee, overage, out-of-scope,
    // hourly, awaiting-price within each invoice.
    const overage = new Map<string, StatementLineInput[]>();
    const outOfScope = new Map<string, StatementLineInput[]>();
    const hourly: StatementLineInput[] = [];
    const awaitingPrice: StatementLineInput[] = [];
    const push = (
      target: Map<string, StatementLineInput[]>,
      currency: string,
      line: StatementLineInput,
    ) => target.set(currency, [...(target.get(currency) ?? []), line]);

    for (const { agreement, proration } of monthAgreements) {
      const bucket = bucketFor(agreement.currency);
      const mine = entries.filter(
        (entry) =>
          activeAgreementOn(agreements, entry.workDate)?.id === agreement.id,
      );
      const alreadyCovered = sumMinutes(
        input.covered.filter(
          (row) =>
            activeAgreementOn(agreements, row.workDate)?.id === agreement.id,
        ),
      );
      const retainerEntries = mine.filter(
        (entry) => entry.treatment === "RETAINER",
      );
      const allocation = allocate(
        agreement,
        proration,
        alreadyCovered,
        retainerEntries,
      );
      const minutesOf = (ids: string[]) =>
        sumMinutes(ids.map((id) => byId.get(id) as BillableEntry));

      const prorated = proration.activeDays < proration.daysInMonth;
      bucket.fees.push({
        agreementId: agreement.id,
        description:
          `${FEE_PREFIX} ${monthLabel}` +
          (prorated
            ? ` (srazmerno, ${proration.activeDays}/${proration.daysInMonth} dana)`
            : ""),
        fee: proration.fee,
        entryIds: allocation.feeEntryIds,
        minutes: minutesOf(allocation.feeEntryIds),
      });

      if (allocation.overage) {
        const rate =
          agreement.overageRule === "HOURLY"
            ? agreement.overageHourlyRate
            : null;
        push(
          overage,
          agreement.currency,
          this.line(run, agreement.currency, {
            description: `Prekoračenje paušala: ${formatDuration(allocation.overage.minutes)}`,
            net: rate
              ? priceMinutes(allocation.overage.minutes, rate)
              : new Prisma.Decimal(0),
            pricingRequired: !rate,
            entryIds: allocation.overage.entryIds,
            minutes: allocation.overage.minutes,
          }),
        );
      }

      const outOfScopeRate =
        agreement.outOfScopeRule === "HOURLY"
          ? agreement.outOfScopeHourlyRate
          : null;
      for (const group of groupByCase(
        mine.filter((entry) => entry.treatment === "HOURLY"),
      )) {
        push(
          outOfScope,
          agreement.currency,
          this.line(run, agreement.currency, {
            description: group.description,
            net: outOfScopeRate
              ? priceMinutes(group.minutes, outOfScopeRate)
              : new Prisma.Decimal(0),
            pricingRequired: !outOfScopeRate,
            entryIds: group.entryIds,
            minutes: group.minutes,
          }),
        );
      }
      for (const group of groupByCase(
        mine.filter((entry) => entry.treatment === "AT"),
      )) {
        awaitingPrice.push(
          this.pricingRequiredLine(run, agreement.currency, group),
        );
      }
    }

    // Work no agreement covers on its date.
    const uncovered = entries.filter(
      (entry) => !activeAgreementOn(agreements, entry.workDate),
    );
    const hourlyRate = profile?.hourlyRate ?? null;
    for (const group of groupByCase(
      uncovered.filter((entry) => entry.treatment === "HOURLY"),
    )) {
      hourly.push(
        this.line(run, profileCurrency, {
          description: group.description,
          net: hourlyRate
            ? priceMinutes(group.minutes, hourlyRate)
            : new Prisma.Decimal(0),
          pricingRequired: !hourlyRate,
          entryIds: group.entryIds,
          minutes: group.minutes,
        }),
      );
    }
    // AT follows the retainer currency, else the profile; a RETAINER entry
    // whose agreement no longer covers its date also needs a lawyer's price.
    for (const group of groupByCase(
      uncovered.filter((entry) => entry.treatment !== "HOURLY"),
    )) {
      awaitingPrice.push(
        this.pricingRequiredLine(run, fallbackCurrency, group),
      );
    }

    for (const [currency, lines] of overage)
      bucketFor(currency).lines.push(...lines);
    for (const [currency, lines] of outOfScope)
      bucketFor(currency).lines.push(...lines);
    for (const line of hourly) bucketFor(line.currency).lines.push(line);
    for (const line of awaitingPrice) bucketFor(line.currency).lines.push(line);
    return [...buckets.values()];
  }

  private pricingRequiredLine(
    run: RunContext,
    currency: string,
    group: { description: string; entryIds: string[]; minutes: number },
  ): StatementLineInput {
    return this.line(run, currency, {
      description: group.description,
      net: new Prisma.Decimal(0),
      pricingRequired: true,
      entryIds: group.entryIds,
      minutes: group.minutes,
    });
  }

  /** One invoice line; VAT = net x rate, gross = net + VAT, half-up 2dp. */
  private line(
    run: RunContext,
    currency: string,
    input: {
      description: string;
      net: Prisma.Decimal;
      pricingRequired?: boolean;
      entryIds: string[];
      minutes: number;
      /** Marks the line as the retainer fee line of this agreement. */
      sourceId?: string;
      feeLine?: boolean;
    },
  ): StatementLineInput {
    const net = input.net.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const vat = net
      .mul(run.vatRate)
      .div(100)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    return {
      serviceDate: isoDate(run.monthEnd),
      description: input.description,
      netAmount: net.toNumber(),
      vatRate: run.vatRate.toNumber(),
      vatAmount: vat.toNumber(),
      grossAmount: net.plus(vat).toNumber(),
      currency,
      workEntryIds: input.entryIds.length ? input.entryIds : undefined,
      pricingRequired: input.pricingRequired ?? false,
      minutes: input.minutes > 0 ? input.minutes : undefined,
      ...(input.feeLine
        ? { sourceType: RETAINER_FEE_SOURCE, sourceId: input.sourceId }
        : {}),
    };
  }
}
