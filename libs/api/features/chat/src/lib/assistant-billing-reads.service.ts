import { ForbiddenException, Injectable, Optional } from "@nestjs/common";
import type {
  InvoiceCollection,
  WorkEntry,
  WorkEntryTreatment,
} from "@law/api-interfaces";
import { foldedMatchIds, normalize, PlatformPrismaService } from "@law/core";
import { PaymentsService } from "@law/financials";
import type {
  AssistantClientBillingResult,
  AssistantDayWorkResult,
  AssistantMoneyTotal,
  AssistantReceivablesResult,
  AssistantTurnScope,
} from "@law/mastra";
import { RetainerUsageService, WorkEntriesService } from "@law/work-entries";
import { Prisma } from "@prisma/client";
import { runAsMember } from "./assistant-actor";

const OFFICE_TIME_ZONE = "Europe/Belgrade";
const BELGRADE_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: OFFICE_TIME_ZONE,
});
const BELGRADE_TIME = new Intl.DateTimeFormat("sr-Latn-RS", {
  timeZone: OFFICE_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const INVOICE_LINES = 10;
const RECEIVABLE_CLIENTS = 10;
const CLIENT_CANDIDATES = 5;
const ENTRY_PAGE_SIZE = 100;
const ENTRY_PAGES = 10;
/** Treatments billed by time; retainer work is covered by the monthly fee. */
const BILLABLE_TREATMENTS: WorkEntryTreatment[] = ["HOURLY", "AT", "UNDECIDED"];
const REVIEW_REASONS = {
  ACTIVITY: "aktivnost",
  DOCUMENT: "dokument",
  CHAT: "razgovor",
} as const;
const UNAVAILABLE = {
  status: "UNAVAILABLE" as const,
  message: "Podaci o vremenu i finansijama trenutno nisu dostupni.",
};
const NOT_ALLOWED = {
  status: "NOT_ALLOWED" as const,
  message: "Korisnik nema pristup ovim finansijskim podacima.",
};

/**
 * Time and money reads for the assistant's tools. Every read runs as the
 * conversation owner, so the services apply that user's own permissions: a
 * part the user may not see is reported as NOT_ALLOWED, never leaked through
 * the job's system rights.
 */
@Injectable()
export class AssistantBillingReadsService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    @Optional() private readonly workEntries?: WorkEntriesService,
    @Optional() private readonly payments?: PaymentsService,
    @Optional() private readonly retainers?: RetainerUsageService,
  ) {}

  async getDayWork(
    scope: AssistantTurnScope,
    args: { date?: string },
  ): Promise<AssistantDayWorkResult> {
    if (!scope.userId || !this.workEntries) return UNAVAILABLE;
    const today = BELGRADE_DATE.format(new Date());
    const date = args.date ?? today;
    if (!isIsoDate(date)) {
      return { status: "INVALID", message: `Datum „${date}“ nije ispravan.` };
    }
    if (date > today) {
      return { status: "INVALID", message: "Taj dan još nije prošao." };
    }
    const workEntries = this.workEntries;
    const review = await this.asOwner(scope, () => workEntries.review(date));
    const now = Date.now();
    return {
      status: "OK",
      date,
      loggedMinutes: review.entries.reduce(
        (sum, entry) => sum + (entry.minutes ?? 0),
        0,
      ),
      loggedEntries: review.entries.length,
      openProposed: review.proposed.length,
      // Only finished meetings can be logged.
      unloggedMeetings: review.missingEvents
        .filter((event) => Date.parse(event.endsAt) <= now)
        .map((event) => ({
          ref: `event:${event.eventId}`,
          title: event.title,
          time: `${BELGRADE_TIME.format(new Date(event.startsAt))}–${BELGRADE_TIME.format(new Date(event.endsAt))}`,
          minutes: Math.round(
            (Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60_000,
          ),
          client: event.client?.displayName ?? null,
          case: event.case
            ? `${event.case.caseNumber} – ${event.case.name}`
            : null,
        })),
      untrackedClients: review.untouchedClients.map((item) => ({
        client: item.client.displayName,
        reasons: item.reasons.map((reason) => REVIEW_REASONS[reason]),
      })),
    };
  }

  async getClientBilling(
    scope: AssistantTurnScope,
    args: { client: string; month?: string },
  ): Promise<AssistantClientBillingResult> {
    if (!scope.userId || !this.workEntries || !this.payments || !this.retainers) {
      return UNAVAILABLE;
    }
    const client = await this.findClient(scope.workspaceId, args.client);
    if ("status" in client) return client;
    const month = args.month ?? BELGRADE_DATE.format(new Date()).slice(0, 7);
    const { payments, workEntries, retainers } = this;

    const receivables = await this.section(scope, async () => {
      const open = openInvoices(await payments.collections(client.id));
      return {
        openInvoices: open.slice(0, INVOICE_LINES).map((invoice) => ({
          invoiceNumber: invoice.invoiceNumber,
          dueDate: invoice.dateOfMaturity,
          currency: invoice.currency,
          remaining: invoice.remainingAmount,
          daysOverdue: invoice.daysOverdue,
        })),
        open: totals(open),
        overdue: totals(open.filter((invoice) => invoice.overdue)),
        truncated: open.length > INVOICE_LINES,
      };
    });
    const unbilledWork = await this.section(scope, async () => {
      const { entries, truncated } = await unbilledEntries(
        workEntries,
        client.id,
      );
      const priced = entries.filter((entry) => entry.value && entry.currency);
      return {
        minutes: entries.reduce((sum, entry) => sum + (entry.minutes ?? 0), 0),
        entries: entries.length,
        value: sumByCurrency(
          priced.map((entry) => ({
            currency: String(entry.currency),
            amount: String(entry.value),
          })),
        ),
        unpricedEntries: entries.length - priced.length,
        truncated,
      };
    });
    const retainer = await this.section(scope, async () => {
      const usage = await retainers.usageForViewer(client.id, month);
      return {
        agreement: usage
          ? {
              currency: usage.currency,
              fee: usage.fee,
              includedMinutes: usage.includedMinutes,
              coveredMinutes: usage.coveredMinutes,
              outOfScopeMinutes: usage.outOfScopeMinutes,
            }
          : null,
      };
    });
    return {
      status: "OK",
      client: client.displayName,
      month,
      receivables,
      unbilledWork,
      retainer,
    };
  }

  async listReceivables(
    scope: AssistantTurnScope,
    args: { overdueOnly?: boolean },
  ): Promise<AssistantReceivablesResult> {
    if (!scope.userId || !this.payments) return UNAVAILABLE;
    const payments = this.payments;
    let invoices: InvoiceCollection[];
    try {
      invoices = openInvoices(
        await this.asOwner(scope, () => payments.collections()),
      );
    } catch (error) {
      if (error instanceof ForbiddenException) return NOT_ALLOWED;
      throw error;
    }
    if (args.overdueOnly) invoices = invoices.filter((item) => item.overdue);
    const byClient = new Map<string, InvoiceCollection[]>();
    for (const invoice of invoices) {
      byClient.set(invoice.clientId, [
        ...(byClient.get(invoice.clientId) ?? []),
        invoice,
      ]);
    }
    const clients = [...byClient.values()]
      .map((items) => ({
        client: items[0].clientName,
        invoices: items.length,
        open: totals(items),
        overdue: totals(items.filter((item) => item.overdue)),
        maxDaysOverdue: Math.max(...items.map((item) => item.daysOverdue)),
      }))
      // Most overdue first: the order collection work starts from.
      .sort(
        (a, b) =>
          b.maxDaysOverdue - a.maxDaysOverdue ||
          b.invoices - a.invoices ||
          a.client.localeCompare(b.client, "sr"),
      );
    return {
      status: "OK",
      overdueOnly: Boolean(args.overdueOnly),
      clients: clients.slice(0, RECEIVABLE_CLIENTS),
      total: totals(invoices),
      truncated: clients.length > RECEIVABLE_CLIENTS,
    };
  }

  private asOwner<T>(scope: AssistantTurnScope, run: () => Promise<T>): Promise<T> {
    return runAsMember(this.prisma, scope.workspaceId, String(scope.userId), run);
  }

  /** One part of a billing answer; a permission refusal is reported, not thrown. */
  private async section<T extends object>(
    scope: AssistantTurnScope,
    read: () => Promise<T>,
  ): Promise<({ status: "OK" } & T) | typeof NOT_ALLOWED> {
    try {
      return { status: "OK", ...(await this.asOwner(scope, read)) };
    } catch (error) {
      if (error instanceof ForbiddenException) return NOT_ALLOWED;
      throw error;
    }
  }

  private async findClient(
    workspaceId: string,
    reference: string,
  ): Promise<
    | { id: string; displayName: string }
    | {
        status: "NOT_FOUND" | "AMBIGUOUS";
        message: string;
        candidates?: string[];
        choices?: Array<{ label: string; reply: string }>;
      }
  > {
    const ref = reference.trim();
    const tokens = ref.split(/\s+/).filter((token) => token.length > 1);
    // Diacritics are folded too: "Ilic" finds "Ilić".
    const foldedIds = await foldedMatchIds(this.prisma, {
      table: "Client",
      columns: ["displayName"],
      search: ref,
      workspaceId,
    });
    const matches = await this.prisma.client.findMany({
      where: {
        workspaceId,
        OR: [
          { clientNumber: { equals: ref, mode: "insensitive" } },
          ...(foldedIds.length ? [{ id: { in: foldedIds } }] : []),
          ...(tokens.length
            ? [
                {
                  AND: tokens.map((token) => ({
                    displayName: { contains: token, mode: "insensitive" as const },
                  })),
                },
              ]
            : []),
        ],
      },
      select: { id: true, displayName: true, clientNumber: true },
      orderBy: { displayName: "asc" },
      take: CLIENT_CANDIDATES + 1,
    });
    const exact = matches.filter(
      (item) =>
        normalize(item.displayName) === normalize(ref) ||
        item.clientNumber.toLowerCase() === ref.toLowerCase(),
    );
    if (matches.length === 1) return matches[0];
    if (exact.length === 1) return exact[0];
    if (!matches.length) {
      return { status: "NOT_FOUND", message: `Nema klijenta za „${ref}“.` };
    }
    const candidates = matches
      .slice(0, CLIENT_CANDIDATES)
      .map((item) => `${item.displayName} (${item.clientNumber})`);
    return {
      status: "AMBIGUOUS",
      message: `Više klijenata odgovara „${ref}“. Pitajte korisnika na kog misli.`,
      candidates,
      choices: candidates.map((candidate) => ({ label: candidate, reply: candidate })),
    };
  }
}

/** Issued invoices with something left to pay, oldest due date first. */
function openInvoices(invoices: InvoiceCollection[]): InvoiceCollection[] {
  return invoices
    .filter(
      (invoice) =>
        invoice.status === "SENT" && new Prisma.Decimal(invoice.remainingAmount).gt(0),
    )
    .sort((a, b) => a.dateOfMaturity.localeCompare(b.dateOfMaturity));
}

function totals(invoices: InvoiceCollection[]): AssistantMoneyTotal[] {
  return sumByCurrency(
    invoices.map((invoice) => ({
      currency: invoice.currency,
      amount: invoice.remainingAmount,
    })),
  );
}

/** Decimal sums per currency; amounts are never converted between currencies. */
function sumByCurrency(items: AssistantMoneyTotal[]): AssistantMoneyTotal[] {
  const sums = new Map<string, Prisma.Decimal>();
  for (const item of items) {
    sums.set(
      item.currency,
      (sums.get(item.currency) ?? new Prisma.Decimal(0)).plus(item.amount),
    );
  }
  return [...sums.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount: amount.toFixed(2) }));
}

/** Confirmed, billable, not yet invoiced work the user may list, page by page. */
async function unbilledEntries(
  workEntries: WorkEntriesService,
  clientId: string,
): Promise<{ entries: WorkEntry[]; truncated: boolean }> {
  const entries: WorkEntry[] = [];
  for (let page = 1; page <= ENTRY_PAGES; page++) {
    const { items, meta } = await workEntries.list({
      clientIds: [clientId],
      statuses: ["CONFIRMED"],
      treatments: BILLABLE_TREATMENTS,
      unbilledOnly: true,
      page,
      pageSize: ENTRY_PAGE_SIZE,
    });
    entries.push(...items);
    if (entries.length >= meta.totalItems || !items.length) {
      return { entries, truncated: false };
    }
  }
  return { entries, truncated: true };
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
