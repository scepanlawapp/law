import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  CaseReference,
  ClientReference,
  CreateWorkEntryRequest,
  PaginatedResponse,
  StartTimerRequest,
  TimeReviewResponse,
  UpdateWorkEntryRequest,
  UserReference,
  WorkEntry,
  WorkEntryQuery,
  WorkEntrySource,
  WorkEntrySourceType,
  WorkEntryStatus,
  WorkEntryTreatment,
  WorkspaceRole,
} from "@law/api-interfaces";
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  PlatformPrismaService,
  WorkspaceContextService,
  paginationMeta,
} from "@law/core";
import { toLatin } from "@law/transliteration";
import { BillingSetupService } from "./billing-setup.service";
import { activeAgreementOn, defaultTreatment } from "./treatment";

const MIN_MINUTES = 1;
const MAX_MINUTES = 1440;
const ENTRY_TIME_ZONE = "Europe/Belgrade";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Milliseconds the office time zone is ahead of UTC at `instant`. */
function zoneOffsetMs(instant: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ENTRY_TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((part) => [part.type, Number(part.value)]),
  );
  const local = Date.UTC(
    parts["year"],
    parts["month"] - 1,
    parts["day"],
    parts["hour"],
    parts["minute"],
    parts["second"],
  );
  return local - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant the calendar day `year-month-day` starts in the office time zone. */
function startOfZoneDay(year: number, month: number, day: number): Date {
  const utcMidnight = Date.UTC(year, month - 1, day);
  // Twice, so the offset is read on the right side of a DST change.
  const first = utcMidnight - zoneOffsetMs(new Date(utcMidnight));
  return new Date(utcMidnight - zoneOffsetMs(new Date(first)));
}

/** Statuses a user may still change, confirm, write off or remove. */
const MUTABLE_STATUSES: WorkEntryStatus[] = [
  "RUNNING",
  "PROPOSED",
  "CONFIRMED",
];

const entryInclude = {
  user: true,
  client: true,
  case: true,
  serviceCategory: true,
  statementLine: { select: { statementId: true } },
} satisfies Prisma.WorkEntryInclude;

type EntryRecord = Prisma.WorkEntryGetPayload<{
  include: typeof entryInclude;
}>;

@Injectable()
export class WorkEntriesService {
  private readonly logger = new Logger(WorkEntriesService.name);

  /**
   * Called once an entry is CONFIRMED (after create and after confirm), outside
   * the write transaction. A no-op until retainer alerts are wired in; failures
   * are logged, never surfaced, because the entry is already saved.
   */
  afterConfirmed: (entry: WorkEntry) => Promise<void> = async () => undefined;

  constructor(
    private readonly db: PlatformPrismaService,
    private readonly billingSetup: BillingSetupService,
  ) {}

  private get context() {
    return WorkspaceContextService.required;
  }

  private get workspaceId() {
    return this.context.workspaceId;
  }

  private get userId() {
    return this.context.userId;
  }

  private isManager(): boolean {
    return (
      this.context.role === WorkspaceRole.OWNER ||
      this.context.role === WorkspaceRole.ADMIN
    );
  }

  // ---------------------------------------------------------------- reads

  async list(query: WorkEntryQuery): Promise<PaginatedResponse<WorkEntry>> {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const and: Prisma.WorkEntryWhereInput[] = [];

    if (this.isManager()) {
      if (query.userIds?.length) and.push({ userId: { in: query.userIds } });
    } else if (this.context.role === WorkspaceRole.LAWYER) {
      and.push({
        OR: [
          { userId: this.userId },
          {
            case: {
              responsibilities: {
                some: { userId: this.userId, endedAt: null },
              },
            },
          },
        ],
      });
      if (query.userIds?.length) and.push({ userId: { in: query.userIds } });
    } else {
      // MEMBER: own entries only, whatever was asked for.
      and.push({ userId: this.userId });
    }

    if (query.clientIds?.length)
      and.push({ clientId: { in: query.clientIds } });
    if (query.caseId) and.push({ caseId: query.caseId });
    if (query.statuses?.length) and.push({ status: { in: query.statuses } });
    if (query.treatments?.length) {
      and.push({ treatment: { in: query.treatments } });
    }
    if (query.from)
      and.push({ workDate: { gte: this.toWorkDate(query.from) } });
    if (query.to) and.push({ workDate: { lte: this.toWorkDate(query.to) } });
    if (query.unbilledOnly) {
      and.push({
        statementLineId: null,
        status: { notIn: ["BILLED", "WRITTEN_OFF"] },
      });
    }

    const where: Prisma.WorkEntryWhereInput = {
      workspaceId: this.workspaceId,
      AND: and,
    };
    const [total, rows] = await Promise.all([
      this.db.workEntry.count({ where }),
      this.db.workEntry.findMany({
        where,
        include: entryInclude,
        orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => this.toEntry(row)),
      meta: paginationMeta(page, pageSize, total, [
        { field: "workDate", direction: "desc" },
      ]),
    };
  }

  async get(id: string): Promise<WorkEntry> {
    const row = await this.db.workEntry.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: entryInclude,
    });
    if (!row || !(await this.canRead(row))) {
      throw new NotFoundException("Work entry not found");
    }
    return this.toEntry(row);
  }

  async runningTimer(): Promise<WorkEntry | null> {
    const row = await this.db.workEntry.findFirst({
      where: {
        workspaceId: this.workspaceId,
        userId: this.userId,
        status: "RUNNING",
      },
      include: entryInclude,
    });
    return row ? this.toEntry(row) : null;
  }

  /**
   * End-of-day review for the current user (always their own data): the day's
   * entries, every open PROPOSED entry, and hints at work that may be missing.
   * `date` is a calendar date in the office time zone and defaults to today.
   */
  async review(date?: string): Promise<TimeReviewResponse> {
    const day =
      date ??
      new Intl.DateTimeFormat("en-CA", { timeZone: ENTRY_TIME_ZONE }).format(
        new Date(),
      );
    const match = ISO_DATE.exec(day);
    const parsed = match ? new Date(`${day}T00:00:00Z`) : null;
    if (
      !match ||
      !parsed ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== day
    ) {
      throw new BadRequestException("Date must be a valid YYYY-MM-DD date");
    }
    const [year, month, dayOfMonth] = [match[1], match[2], match[3]].map(
      Number,
    );
    const workDate = new Date(Date.UTC(year, month - 1, dayOfMonth));
    const range = {
      gte: startOfZoneDay(year, month, dayOfMonth),
      lt: startOfZoneDay(year, month, dayOfMonth + 1),
    };
    const workspaceId = this.workspaceId;
    const userId = this.userId;

    const [entries, proposed, events, activity, documents, chats] =
      await Promise.all([
        this.db.workEntry.findMany({
          where: { workspaceId, userId, workDate },
          include: entryInclude,
          orderBy: [{ createdAt: "asc" }],
        }),
        this.db.workEntry.findMany({
          where: { workspaceId, userId, status: "PROPOSED" },
          include: entryInclude,
          orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
        }),
        this.db.event.findMany({
          where: {
            workspaceId,
            status: { not: "CANCELLED" },
            startsAt: range,
            OR: [
              { organizerUserId: userId },
              { assignees: { some: { userId } } },
            ],
          },
          include: { clients: { include: { client: true } }, case: true },
          orderBy: [{ startsAt: "asc" }],
        }),
        // Entry activity is skipped: it only exists where an entry already does.
        this.db.activityLog.findMany({
          where: {
            workspaceId,
            actorUserId: userId,
            occurredAt: range,
            clientId: { not: null },
            entityType: { not: "WORK_ENTRY" },
          },
          select: { clientId: true },
        }),
        this.db.document.findMany({
          where: { workspaceId, createdByUserId: userId, createdAt: range },
          select: {
            clients: { select: { clientId: true } },
            cases: { select: { case: { select: { clientId: true } } } },
          },
        }),
        this.db.chatSession.findMany({
          where: {
            workspaceId,
            createdByUserId: userId,
            isDeleted: false,
            caseId: { not: null },
            updatedAt: range,
          },
          select: { case: { select: { clientId: true } } },
        }),
      ]);

    const sourced = events.length
      ? await this.db.workEntry.findMany({
          where: {
            workspaceId,
            sourceType: "EVENT",
            sourceId: { in: events.map((event) => event.id) },
          },
          select: { sourceId: true },
        })
      : [];
    const loggedEventIds = new Set(sourced.map((row) => row.sourceId));
    const missingEvents = events
      .filter((event) => !loggedEventIds.has(event.id))
      .map((event) => ({
        eventId: event.id,
        title: event.title,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        client: event.clients[0]
          ? this.clientReference(event.clients[0].client)
          : null,
        case: this.caseReference(event.case),
      }));

    const reasonsByClient = new Map<
      string,
      Set<"ACTIVITY" | "DOCUMENT" | "CHAT">
    >();
    const touch = (
      clientId: string | null | undefined,
      reason: "ACTIVITY" | "DOCUMENT" | "CHAT",
    ) => {
      if (!clientId) return;
      const reasons = reasonsByClient.get(clientId) ?? new Set();
      reasons.add(reason);
      reasonsByClient.set(clientId, reasons);
    };
    for (const row of activity) touch(row.clientId, "ACTIVITY");
    for (const doc of documents) {
      for (const link of doc.clients) touch(link.clientId, "DOCUMENT");
      for (const link of doc.cases) touch(link.case.clientId, "DOCUMENT");
    }
    for (const chat of chats) touch(chat.case?.clientId, "CHAT");
    for (const entry of entries) reasonsByClient.delete(entry.clientId);

    const clients = reasonsByClient.size
      ? await this.db.client.findMany({
          where: { workspaceId, id: { in: [...reasonsByClient.keys()] } },
          orderBy: [{ displayName: "asc" }],
        })
      : [];
    const order = ["ACTIVITY", "DOCUMENT", "CHAT"] as const;
    return {
      entries: entries.map((row) => this.toEntry(row)),
      proposed: proposed.map((row) => this.toEntry(row)),
      missingEvents,
      untouchedClients: clients.map((client) => ({
        client: this.clientReference(client),
        reasons: order.filter((reason) =>
          reasonsByClient.get(client.id)?.has(reason),
        ),
      })),
    };
  }

  /**
   * Entries dated within [from, to] that block a clean month-end: still
   * PROPOSED, or CONFIRMED without a treatment decision. Not role-filtered;
   * the month-end run enforces owner access.
   */
  async listOpenInRange(from: Date, to: Date): Promise<WorkEntry[]> {
    const rows = await this.db.workEntry.findMany({
      where: {
        workspaceId: this.workspaceId,
        workDate: { gte: from, lte: to },
        OR: [
          { status: "PROPOSED" },
          { status: "CONFIRMED", treatment: "UNDECIDED" },
        ],
      },
      include: entryInclude,
      orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((row) => this.toEntry(row));
  }

  // --------------------------------------------------------------- writes

  async create(input: CreateWorkEntryRequest): Promise<WorkEntry> {
    this.assertMinutes(input.minutes);
    const description = this.requiredText(input.description, "Description");
    const workDate = this.toWorkDate(input.workDate);
    await this.assertClientAndCase(input.clientId, input.caseId);
    await this.assertServiceCategory(input.serviceCategoryId);
    const treatment =
      input.treatment ??
      (await this.defaultTreatmentFor(
        input.clientId,
        workDate,
        input.serviceCategoryId ?? null,
      ));

    const row = await this.db.$transaction(async (tx) => {
      const created = await tx.workEntry.create({
        data: {
          workspaceId: this.workspaceId,
          userId: this.userId,
          clientId: input.clientId,
          caseId: input.caseId ?? null,
          workDate,
          minutes: input.minutes,
          description,
          serviceCategoryId: input.serviceCategoryId ?? null,
          treatment,
          status: "CONFIRMED",
          source: input.source ?? "MANUAL",
          aiParsed: input.aiParsed ?? false,
          createdByUserId: this.userId,
          updatedByUserId: this.userId,
        },
        include: entryInclude,
      });
      await this.log(tx, "WORK_ENTRY_CREATED", created, {
        minutes: created.minutes,
        treatment: created.treatment,
        source: created.aiParsed ? "AI_ASSISTED" : created.source,
      });
      return created;
    });
    const entry = this.toEntry(row);
    await this.notifyConfirmed(entry);
    return entry;
  }

  async update(id: string, input: UpdateWorkEntryRequest): Promise<WorkEntry> {
    const current = await this.loadForMutation(id);
    this.assertNotBilled(current);
    if (input.minutes !== undefined) this.assertMinutes(input.minutes);

    const clientId = input.clientId ?? current.clientId;
    const clientChanged = clientId !== current.clientId;
    // A case belongs to exactly one client; moving the entry to another client
    // drops the old case unless a new one is given.
    const caseId =
      input.caseId !== undefined
        ? input.caseId
        : clientChanged
          ? null
          : current.caseId;
    if (clientChanged || input.caseId !== undefined) {
      await this.assertClientAndCase(clientId, caseId ?? undefined);
    }
    if (input.serviceCategoryId !== undefined) {
      await this.assertServiceCategory(input.serviceCategoryId);
    }

    const workDate =
      input.workDate !== undefined
        ? this.toWorkDate(input.workDate)
        : current.workDate;
    const serviceCategoryId =
      input.serviceCategoryId !== undefined
        ? input.serviceCategoryId
        : current.serviceCategoryId;
    const dateChanged = workDate.getTime() !== current.workDate.getTime();
    const categoryChanged = serviceCategoryId !== current.serviceCategoryId;
    // The default only depends on client, date and category, so it is refreshed
    // exactly when one of those changed and the user did not pick a treatment.
    const treatment =
      input.treatment ??
      (clientChanged || dateChanged || categoryChanged
        ? await this.defaultTreatmentFor(clientId, workDate, serviceCategoryId)
        : current.treatment);

    const data: Prisma.WorkEntryUncheckedUpdateManyInput = {
      clientId,
      caseId,
      workDate,
      serviceCategoryId,
      treatment,
      updatedByUserId: this.userId,
    };
    if (input.minutes !== undefined) data.minutes = input.minutes;
    if (input.description !== undefined) {
      data.description = this.requiredText(input.description, "Description");
    }
    if (input.source !== undefined) data.source = input.source;
    if (input.aiParsed !== undefined) data.aiParsed = input.aiParsed;

    const row = await this.applyChange(
      current,
      data,
      MUTABLE_STATUSES.concat("WRITTEN_OFF"),
      (tx, updated) =>
        this.log(tx, "WORK_ENTRY_UPDATED", updated, {
          fields: Object.keys(input).sort(),
          source: updated.aiParsed ? "AI_ASSISTED" : undefined,
        }),
    );
    return this.toEntry(row);
  }

  async confirm(
    id: string,
    input: { minutes: number; description?: string },
  ): Promise<WorkEntry> {
    const current = await this.loadForMutation(id);
    this.assertNotBilled(current);
    if (current.status !== "RUNNING" && current.status !== "PROPOSED") {
      throw new ConflictException("Work entry is already confirmed or closed");
    }
    this.assertMinutes(input.minutes);
    const description = this.requiredText(
      input.description ?? current.description,
      "Description",
    );

    const row = await this.applyChange(
      current,
      {
        status: "CONFIRMED",
        minutes: input.minutes,
        description,
        timerStartedAt: null,
        updatedByUserId: this.userId,
      },
      ["RUNNING", "PROPOSED"],
      (tx, updated) =>
        this.log(tx, "WORK_ENTRY_CONFIRMED", updated, {
          minutes: updated.minutes,
          source: updated.aiParsed ? "AI_ASSISTED" : undefined,
        }),
    );
    const entry = this.toEntry(row);
    await this.notifyConfirmed(entry);
    return entry;
  }

  async writeOff(id: string, reason: string): Promise<WorkEntry> {
    const writeOffReason = this.requiredText(reason, "Write-off reason");
    const current = await this.loadForMutation(id);
    this.assertNotBilled(current);
    if (current.status === "WRITTEN_OFF") {
      throw new ConflictException("Work entry is already written off");
    }
    const row = await this.applyChange(
      current,
      {
        status: "WRITTEN_OFF",
        writeOffReason,
        timerStartedAt: null,
        updatedByUserId: this.userId,
      },
      MUTABLE_STATUSES,
      (tx, updated) =>
        this.log(tx, "WORK_ENTRY_WRITTEN_OFF", updated, {
          reason: writeOffReason,
          minutes: updated.minutes,
          source: updated.aiParsed ? "AI_ASSISTED" : undefined,
        }),
    );
    return this.toEntry(row);
  }

  async remove(id: string): Promise<void> {
    const current = await this.loadForMutation(id);
    this.assertNotBilled(current);
    // A write-off is a manager decision; only managers may erase it.
    const removable: WorkEntryStatus[] = this.isManager()
      ? [...MUTABLE_STATUSES, "WRITTEN_OFF"]
      : MUTABLE_STATUSES;
    if (!removable.includes(current.status)) {
      throw new ConflictException("Work entry can no longer be removed");
    }
    await this.db.$transaction(async (tx) => {
      const deleted = await tx.workEntry.deleteMany({
        where: {
          id,
          workspaceId: this.workspaceId,
          status: { in: removable },
        },
      });
      if (deleted.count === 0) {
        throw new ConflictException("Work entry can no longer be removed");
      }
      await this.log(tx, "WORK_ENTRY_DELETED", current, {
        minutes: current.minutes,
        status: current.status,
      });
    });
  }

  // ---------------------------------------------------------------- timer

  async startTimer(input: StartTimerRequest): Promise<WorkEntry> {
    const running = await this.db.workEntry.findFirst({
      where: {
        workspaceId: this.workspaceId,
        userId: this.userId,
        status: "RUNNING",
      },
      select: { id: true },
    });
    if (running) {
      throw new ConflictException("A timer is already running");
    }
    await this.assertClientAndCase(input.clientId, input.caseId);

    const now = new Date();
    const workDate = this.toWorkDate(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: ENTRY_TIME_ZONE,
      }).format(now),
    );
    const treatment = await this.defaultTreatmentFor(
      input.clientId,
      workDate,
      null,
    );
    let row: EntryRecord;
    try {
      row = await this.db.$transaction(async (tx) => {
        const created = await tx.workEntry.create({
          data: {
            workspaceId: this.workspaceId,
            userId: this.userId,
            clientId: input.clientId,
            caseId: input.caseId ?? null,
            workDate,
            minutes: null,
            timerStartedAt: now,
            description: input.description
              ? toLatin(input.description.trim())
              : "",
            treatment,
            status: "RUNNING",
            source: "TIMER",
            createdByUserId: this.userId,
            updatedByUserId: this.userId,
          },
          include: entryInclude,
        });
        await this.log(tx, "WORK_ENTRY_CREATED", created, {
          source: "TIMER",
          timerStartedAt: now.toISOString(),
        });
        return created;
      });
    } catch (error) {
      // Partial unique index WorkEntry_one_running_per_user: lost a start race.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("A timer is already running");
      }
      throw error;
    }
    return this.toEntry(row);
  }

  /**
   * Freezes the elapsed time on the entry (rounded up to the next minute) but
   * leaves it RUNNING until the user confirms it with the final values.
   */
  async stopTimer(): Promise<WorkEntry> {
    const current = await this.db.workEntry.findFirst({
      where: {
        workspaceId: this.workspaceId,
        userId: this.userId,
        status: "RUNNING",
        timerStartedAt: { not: null },
      },
      include: entryInclude,
    });
    if (!current?.timerStartedAt) {
      throw new NotFoundException("No timer is running");
    }
    const elapsedMinutes = Math.ceil(
      (Date.now() - current.timerStartedAt.getTime()) / 60_000,
    );
    const minutes = Math.min(
      MAX_MINUTES,
      Math.max(MIN_MINUTES, elapsedMinutes),
    );
    const row = await this.applyChange(
      current,
      { minutes, timerStartedAt: null, updatedByUserId: this.userId },
      ["RUNNING"],
      (tx, updated) =>
        this.log(tx, "WORK_ENTRY_UPDATED", updated, {
          fields: ["minutes"],
          timerStopped: true,
          minutes,
        }),
    );
    return this.toEntry(row);
  }

  // -------------------------------------------------------------- helpers

  /** Own entries are open to the performer; managers may touch anyone's. */
  private async loadForMutation(id: string): Promise<EntryRecord> {
    const row = await this.db.workEntry.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: entryInclude,
    });
    if (!row) throw new NotFoundException("Work entry not found");
    if (!this.isManager() && row.userId !== this.userId) {
      throw new ForbiddenException("You can only change your own work entries");
    }
    return row;
  }

  private assertNotBilled(row: { status: string }): void {
    if (row.status === "BILLED") {
      throw new ConflictException("Billed work entries cannot be changed");
    }
  }

  private async canRead(row: EntryRecord): Promise<boolean> {
    if (this.isManager() || row.userId === this.userId) return true;
    if (this.context.role !== WorkspaceRole.LAWYER || !row.caseId) return false;
    const responsibility = await this.db.caseResponsibility.findFirst({
      where: {
        workspaceId: this.workspaceId,
        caseId: row.caseId,
        userId: this.userId,
        endedAt: null,
      },
      select: { id: true },
    });
    return responsibility !== null;
  }

  /**
   * Updates the entry only while it still has one of `allowedStatuses`, so a
   * concurrent billing run or edit cannot be overwritten (409 instead).
   */
  private async applyChange(
    current: EntryRecord,
    data: Prisma.WorkEntryUncheckedUpdateManyInput,
    allowedStatuses: WorkEntryStatus[],
    log: (tx: Prisma.TransactionClient, updated: EntryRecord) => Promise<void>,
  ): Promise<EntryRecord> {
    return this.db.$transaction(async (tx) => {
      const result = await tx.workEntry.updateMany({
        where: {
          id: current.id,
          workspaceId: this.workspaceId,
          status: { in: allowedStatuses },
        },
        data,
      });
      if (result.count === 0) {
        throw new ConflictException("Work entry was changed concurrently");
      }
      const updated = await tx.workEntry.findUniqueOrThrow({
        where: { id: current.id },
        include: entryInclude,
      });
      await log(tx, updated);
      return updated;
    });
  }

  private async notifyConfirmed(entry: WorkEntry): Promise<void> {
    try {
      await this.afterConfirmed(entry);
    } catch (error) {
      this.logger.error(
        `afterConfirmed failed for work entry ${entry.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async log(
    tx: Prisma.TransactionClient,
    action: string,
    entry: { id: string; clientId: string; caseId: string | null },
    metadata: Record<string, Prisma.InputJsonValue | null | undefined>,
  ): Promise<void> {
    const cleaned = Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => value !== undefined),
    ) as Prisma.InputJsonObject;
    await tx.activityLog.create({
      data: {
        workspaceId: this.workspaceId,
        actorUserId: this.userId,
        action,
        entityType: "WORK_ENTRY",
        entityId: entry.id,
        clientId: entry.clientId,
        caseId: entry.caseId,
        metadata: cleaned,
      },
    });
  }

  private assertMinutes(minutes: number): void {
    if (
      !Number.isInteger(minutes) ||
      minutes < MIN_MINUTES ||
      minutes > MAX_MINUTES
    ) {
      throw new BadRequestException(
        `Minutes must be a whole number between ${MIN_MINUTES} and ${MAX_MINUTES}`,
      );
    }
  }

  private requiredText(value: string | undefined, label: string): string {
    const text = toLatin((value ?? "").trim());
    if (!text) throw new BadRequestException(`${label} is required`);
    return text;
  }

  /** Calendar date (UTC midnight) of an ISO date or date-time string. */
  private toWorkDate(value: string): Date {
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

  private async assertClientAndCase(
    clientId: string,
    caseId: string | undefined,
  ): Promise<void> {
    const client = await this.db.client.findFirst({
      where: { id: clientId, workspaceId: this.workspaceId },
      select: { id: true },
    });
    if (!client) throw new BadRequestException("Client not found");
    if (!caseId) return;
    const caseRecord = await this.db.case.findFirst({
      where: { id: caseId, workspaceId: this.workspaceId },
      select: { id: true, clientId: true },
    });
    if (!caseRecord) throw new BadRequestException("Case not found");
    if (caseRecord.clientId !== clientId) {
      throw new BadRequestException("Case does not belong to the client");
    }
  }

  private async assertServiceCategory(
    serviceCategoryId: string | undefined,
  ): Promise<void> {
    if (!serviceCategoryId) return;
    const category = await this.db.serviceCategory.findFirst({
      where: { id: serviceCategoryId, workspaceId: this.workspaceId },
      select: { id: true },
    });
    if (!category) throw new BadRequestException("Service category not found");
  }

  /**
   * Treatment a new entry gets when nobody picked one, from the client's active
   * retainer agreement on `workDate`. Pass `tx` to read inside a transaction.
   */
  async defaultTreatmentFor(
    clientId: string,
    workDate: Date,
    serviceCategoryId: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<WorkEntryTreatment> {
    const agreements = await this.billingSetup.agreementsForClient(
      clientId,
      tx,
    );
    return defaultTreatment(
      activeAgreementOn(agreements, workDate),
      serviceCategoryId,
    );
  }

  // -------------------------------------------------------------- mapping

  private toEntry(row: EntryRecord): WorkEntry {
    return {
      id: row.id,
      user: this.userReference(row.user),
      client: this.clientReference(row.client),
      case: this.caseReference(row.case),
      workDate: row.workDate.toISOString().slice(0, 10),
      minutes: row.minutes,
      timerStartedAt: row.timerStartedAt?.toISOString() ?? null,
      description: row.description,
      serviceCategory: row.serviceCategory
        ? { id: row.serviceCategory.id, name: row.serviceCategory.name }
        : null,
      treatment: row.treatment,
      status: row.status,
      writeOffReason: row.writeOffReason,
      source: row.source as WorkEntrySource,
      sourceType: row.sourceType as WorkEntrySourceType | null,
      sourceId: row.sourceId,
      statementId: row.statementLine?.statementId ?? null,
      aiParsed: row.aiParsed,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private userReference(user: EntryRecord["user"]): UserReference {
    return {
      id: user.id,
      displayName:
        [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      email: user.email,
    };
  }

  private clientReference(client: EntryRecord["client"]): ClientReference {
    return {
      id: client.id,
      clientNumber: client.clientNumber,
      type: client.type,
      displayName: client.displayName,
      status: client.status,
    };
  }

  private caseReference(caseRecord: EntryRecord["case"]): CaseReference | null {
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
}
