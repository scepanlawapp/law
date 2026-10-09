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
  ConfirmWorkEntryRequest,
  CreateWorkEntryRequest,
  PaginatedResponse,
  PastWorkEvent,
  StartTimerRequest,
  TimeReviewResponse,
  UpdateWorkEntryRequest,
  UserReference,
  WorkEntry,
  WorkEntryCurrency,
  WorkEntryQuery,
  WorkEntryActions,
  WorkEntrySource,
  WorkEntrySourceType,
  WorkEntryStatus,
  WorkEntryTreatment,
  WorkspaceRole,
  SUPPORTED_WORK_ENTRY_CURRENCIES,
} from "@law/api-interfaces";
import {
  DEFAULT_PAGE,
  PaginationQueryDto,
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
const MAX_TITLE_LENGTH = 200;
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
  invoiceLine: { select: { invoiceId: true } },
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
          { userId: null, createdByUserId: this.userId },
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
      // Unassigned entries remain accessible to their creator without counting as their work.
      and.push({
        OR: [
          { userId: this.userId },
          { userId: null, createdByUserId: this.userId },
        ],
      });
    }

    if (query.clientIds?.length)
      and.push({ clientId: { in: query.clientIds } });
    if (query.caseId) and.push({ caseId: query.caseId });
    if (query.taskId) and.push({ taskId: query.taskId });
    if (query.eventId) and.push({ eventId: query.eventId });
    if (query.statuses?.length) and.push({ status: { in: query.statuses } });
    if (query.treatments?.length) {
      and.push({ treatment: { in: query.treatments } });
    }
    if (query.from)
      and.push({ workDate: { gte: this.toWorkDate(query.from) } });
    if (query.to) and.push({ workDate: { lte: this.toWorkDate(query.to) } });
    if (query.unbilledOnly) {
      and.push({
        invoiceLineId: null,
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
            eventId: { in: events.map((event) => event.id) },
          },
          select: { eventId: true },
        })
      : [];
    const loggedEventIds = new Set(sourced.map((row) => row.eventId));
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

  private eventScope(): Prisma.EventWhereInput {
    return {
      workspaceId: this.workspaceId,
      OR: [
        { organizerUserId: this.userId },
        { assignees: { some: { userId: this.userId } } },
      ],
    };
  }

  async pastEvents(
    query: PaginationQueryDto,
  ): Promise<PaginatedResponse<PastWorkEvent>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.EventWhereInput = {
      ...this.eventScope(),
      status: { not: "CANCELLED" },
      endsAt: { lte: new Date() },
      workEntries: { none: {} },
    };
    const [total, events] = await Promise.all([
      this.db.event.count({ where }),
      this.db.event.findMany({
        where,
        include: {
          clients: { include: { client: true } },
          case: true,
          assignees: true,
        },
        orderBy: [{ endsAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: events.map((event) => {
        return {
          id: event.id,
          type: event.type,
          title: event.title,
          description: event.description,
          startsAt: event.startsAt.toISOString(),
          endsAt: event.endsAt.toISOString(),
          isAllDay: event.isAllDay,
          clients: event.clients.map((link) =>
            this.clientReference(link.client),
          ),
          case: this.caseReference(event.case),
          userId: event.assignees[0]?.userId ?? event.organizerUserId,
          hasWorkEntry: false,
          writeOffReason: null,
          workEntry: null,
        };
      }),
      meta: paginationMeta(page, pageSize, total, [
        { field: "endsAt", direction: "desc" },
      ]),
    };
  }

  private async lockPastEvent(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${id} AND "workspaceId" = ${this.workspaceId} FOR UPDATE`;
    const event = await tx.event.findFirst({
      where: { ...this.eventScope(), id },
      include: { clients: true, case: true, assignees: true },
    });
    if (!event) throw new NotFoundException("Event not found");
    if (event.status === "CANCELLED" || event.endsAt > new Date())
      throw new ConflictException("Event has not ended or is cancelled");
    return event;
  }

  async writeOffEvent(id: string): Promise<WorkEntry> {
    const row = await this.db.$transaction(async (tx) => {
      const event = await this.lockPastEvent(tx, id);
      // The event lock serializes double clicks and concurrent captures.
      const existing = await tx.workEntry.findFirst({
        where: { workspaceId: this.workspaceId, eventId: id },
        include: entryInclude,
      });
      if (existing)
        throw new ConflictException("Event already has recorded work");
      const clientIds = [
        ...new Set(event.clients.map((link) => link.clientId)),
      ];
      const clientId =
        event.case?.clientId ??
        (clientIds.length === 1 ? clientIds[0] : null);
      if (clientId) {
        await this.assertClientAndCase(clientId, event.caseId ?? undefined, tx);
      }
      const duration = Math.round(
        (event.endsAt.getTime() - event.startsAt.getTime()) / 60000,
      );
      const workDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Belgrade",
      }).format(event.startsAt);
      const created = await tx.workEntry.create({
        data: {
          workspaceId: this.workspaceId,
          userId: null,
          clientId,
          caseId: event.caseId,
          eventId: id,
          workDate: this.toWorkDate(workDate),
          minutes:
            !event.isAllDay && duration >= 1 && duration <= 1440
              ? duration
              : null,
          title: this.titleText(event.title.slice(0, 200)),
          description: this.optionalText(event.description ?? undefined),
          currency: clientId
            ? await this.defaultWorkEntryCurrency(clientId, tx)
            : null,
          status: "CONFIRMED",
          treatment: "NON_BILLABLE",
          source: "EVENT",
          createdByUserId: this.userId,
          updatedByUserId: this.userId,
        },
        include: entryInclude,
      });
      await this.log(tx, "WORK_ENTRY_CREATED", created, {
        source: "EVENT",
        treatment: "NON_BILLABLE",
        status: "CONFIRMED",
      });
      return created;
    });
    return this.toEntry(row);
  }

  // --------------------------------------------------------------- writes

  /** Task update holds the task row lock, serializing repeated completions. */
  async saveTaskCapture(
    tx: Prisma.TransactionClient,
    task: { id: string; assigneeUserId: string },
    input: CreateWorkEntryRequest,
  ): Promise<void> {
    const minutes = input.minutes ?? null;
    this.assertMinutes(minutes);
    const title = this.titleText(input.title);
    const description = this.optionalText(input.description);
    const workDate = this.toWorkDate(input.workDate);
    await this.assertClientAndCase(input.clientId, input.caseId, tx);
    await this.assertServiceCategory(input.serviceCategoryId, tx);
    const treatment =
      input.treatment ??
      (await this.defaultTreatmentFor(
        input.clientId,
        workDate,
        input.serviceCategoryId ?? null,
        tx,
      ));
    const money = await this.newWorkEntryMoney(input, input.clientId, tx);
    const performerId =
      input.userId === undefined ? task.assigneeUserId : input.userId;
    await this.assertPerformer(performerId, tx);
    const data = {
      clientId: input.clientId,
      caseId: input.caseId ?? null,
      userId: performerId,
      workDate,
      minutes,
      title,
      description,
      value: money.value,
      currency: money.currency,
      treatment,
      serviceCategoryId: input.serviceCategoryId ?? null,
      status: "CONFIRMED" as const,
      aiParsed: input.aiParsed ?? false,
      updatedByUserId: this.userId,
    };
    const row = await tx.workEntry.create({
      data: {
        ...data,
        workspaceId: this.workspaceId,
        taskId: task.id,
        source: "TASK",
        createdByUserId: this.userId,
      },
      include: entryInclude,
    });
    await this.log(tx, "WORK_ENTRY_CREATED", row, {
      source: "TASK",
      minutes,
      treatment,
      status: "CONFIRMED",
    });
  }

  async create(input: CreateWorkEntryRequest): Promise<WorkEntry> {
    if (input.eventId && input.taskId)
      throw new BadRequestException("Choose either an event or a task");
    const minutes = input.minutes ?? null;
    this.assertMinutes(minutes);
    const title = this.titleText(input.title);
    const description = this.optionalText(input.description);
    const workDate = this.toWorkDate(input.workDate);
    const clientId = input.clientId ?? null;
    if (!clientId && !input.eventId) {
      throw new BadRequestException("A client is required for this work entry");
    }
    if (clientId) {
      await this.assertClientAndCase(clientId, input.caseId);
    } else if (input.caseId && !input.eventId) {
      throw new BadRequestException("A case requires a client");
    }
    await this.assertServiceCategory(input.serviceCategoryId);
    const treatment = clientId
      ? (input.treatment ??
        (await this.defaultTreatmentFor(
          clientId,
          workDate,
          input.serviceCategoryId ?? null,
        )))
      : (input.treatment ?? "NON_BILLABLE");
    if (!clientId && treatment !== "NON_BILLABLE") {
      throw new BadRequestException(
        "Clientless event work must be non-billable",
      );
    }
    if (!clientId && input.value != null) {
      throw new BadRequestException("Clientless event work cannot have a value");
    }

    const row = await this.db.$transaction(async (tx) => {
      let performerId = input.userId === undefined ? this.userId : input.userId;
      if (input.eventId) {
        const event = await this.lockPastEvent(tx, input.eventId);
        if (input.userId === undefined)
          performerId = event.assignees[0]?.userId ?? event.organizerUserId;
      }
      if (input.taskId) {
        const task = await tx.task.findFirst({
          where: { id: input.taskId, workspaceId: this.workspaceId },
          select: { id: true, assigneeUserId: true },
        });
        if (!task) throw new NotFoundException("Task not found");
        if (input.userId === undefined) performerId = task.assigneeUserId;
      }
      await this.assertPerformer(performerId, tx);
      const money = await this.newWorkEntryMoney(input, clientId, tx);
      const created = await tx.workEntry.create({
        data: {
          workspaceId: this.workspaceId,
          userId: performerId,
          clientId,
          caseId: input.caseId ?? null,
          workDate,
          minutes,
          title,
          description,
          serviceCategoryId: input.serviceCategoryId ?? null,
          treatment,
          value: money.value,
          currency: money.currency,
          status: "CONFIRMED",
          taskId: input.taskId ?? null,
          source: input.eventId
            ? "EVENT"
            : input.taskId
              ? "TASK"
              : (input.source ?? "MANUAL"),
          eventId: input.eventId ?? null,
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
    if (
      input.status !== undefined &&
      (input.status !== "CONFIRMED" || current.status !== "WRITTEN_OFF")
    ) {
      throw new ConflictException(
        "Only written-off work can be restored to confirmed",
      );
    }
    if (input.minutes !== undefined) this.assertMinutes(input.minutes);
    if (input.minutes === null && current.status === "RUNNING") {
      throw new BadRequestException("A running timer needs its minutes");
    }

    if (
      current.status === "RUNNING" &&
      input.userId !== undefined &&
      input.userId !== current.userId
    ) {
      throw new ConflictException("Confirm the timer before changing its user");
    }

    const clientId =
      input.clientId === undefined ? current.clientId : input.clientId;
    const clientChanged = clientId !== current.clientId;
    // A case belongs to exactly one client; moving the entry to another client
    // drops the old case unless a new one is given.
    const caseId =
      input.caseId !== undefined
        ? input.caseId
        : clientChanged
          ? null
          : current.caseId;
    const clientlessEvent =
      clientId === null &&
      current.eventId !== null &&
      current.source === "EVENT";
    if (!clientId && !clientlessEvent) {
      throw new BadRequestException("A client is required for this work entry");
    }
    if (clientId && (clientChanged || input.caseId !== undefined)) {
      await this.assertClientAndCase(clientId, caseId ?? undefined);
    } else if (caseId && !clientlessEvent) {
      throw new BadRequestException("A case requires a client");
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
    const treatment = clientId
      ? input.treatment ??
        (clientChanged || dateChanged || categoryChanged
          ? await this.defaultTreatmentFor(clientId, workDate, serviceCategoryId)
          : current.treatment)
      : (input.treatment ?? "NON_BILLABLE");
    if (!clientId && treatment !== "NON_BILLABLE") {
      throw new BadRequestException(
        "Clientless event work must be non-billable",
      );
    }

    const nextValue =
      input.value === undefined
        ? (current.value ?? null)
        : this.parseWorkEntryValue(input.value);
    let nextCurrency =
      input.currency === undefined
        ? this.normalizeWorkEntryCurrency(current.currency)
        : this.normalizeWorkEntryCurrency(input.currency);
    if (
      nextValue !== null &&
      nextCurrency === null &&
      input.value !== undefined &&
      input.currency === undefined
    ) {
      if (clientId) nextCurrency = await this.defaultWorkEntryCurrency(clientId);
    }
    if (!clientId && nextValue !== null) {
      throw new BadRequestException("Clientless event work cannot have a value");
    }
    if (nextValue !== null && nextCurrency === null) {
      throw new BadRequestException("A currency is required for a work value");
    }

    if (input.userId !== undefined && input.userId !== current.userId)
      await this.assertPerformer(input.userId);
    const data: Prisma.WorkEntryUncheckedUpdateManyInput = {
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      clientId,
      caseId,
      workDate,
      serviceCategoryId,
      treatment,
      updatedByUserId: this.userId,
      ...(input.value !== undefined ? { value: nextValue } : {}),
      ...(input.currency !== undefined ||
      (nextValue !== null && current.currency === null)
        ? { currency: nextCurrency }
        : {}),
    };
    if (input.minutes !== undefined) data.minutes = input.minutes;
    if (input.title !== undefined) data.title = this.titleText(input.title);
    if (input.description !== undefined) {
      data.description = this.optionalText(input.description);
    }
    if (input.status === "CONFIRMED") {
      data.status = "CONFIRMED";
      data.writeOffReason = null;
    }
    if (input.source !== undefined) data.source = input.source;
    if (input.aiParsed !== undefined) data.aiParsed = input.aiParsed;

    const row = await this.applyChange(
      current,
      data,
      input.status ? ["WRITTEN_OFF"] : MUTABLE_STATUSES.concat("WRITTEN_OFF"),
      (tx, updated) =>
        this.log(tx, "WORK_ENTRY_UPDATED", updated, {
          fields: Object.keys(input).sort(),
          ...(input.userId !== undefined
            ? { previousUserId: current.userId, userId: input.userId }
            : {}),
          ...(input.status
            ? {
                previousStatus: current.status,
                status: input.status,
                previousWriteOffReason: current.writeOffReason,
              }
            : {}),
          source: updated.aiParsed ? "AI_ASSISTED" : undefined,
        }),
    );
    return this.toEntry(row);
  }

  /**
   * Confirms a running or proposed entry. Minutes are optional: untimed work is
   * priced later on the invoice. Omitted minutes keep what the entry has.
   */
  async confirm(
    id: string,
    input: ConfirmWorkEntryRequest,
  ): Promise<WorkEntry> {
    const current = await this.loadForMutation(id);
    this.assertNotBilled(current);
    if (current.status !== "RUNNING" && current.status !== "PROPOSED") {
      throw new ConflictException("Work entry is already confirmed or closed");
    }
    const minutes =
      input.minutes === undefined ? current.minutes : input.minutes;
    this.assertMinutes(minutes);
    if (minutes === null && current.status === "RUNNING") {
      throw new BadRequestException("Stop the timer before confirming it");
    }
    const title = this.titleText(input.title ?? current.title);
    const description =
      input.description !== undefined
        ? this.optionalText(input.description)
        : current.description;
    const nextValue =
      input.value === undefined
        ? (current.value ?? null)
        : this.parseWorkEntryValue(input.value);
    let nextCurrency =
      input.currency === undefined
        ? this.normalizeWorkEntryCurrency(current.currency)
        : this.normalizeWorkEntryCurrency(input.currency);
    if (
      nextValue !== null &&
      nextCurrency === null &&
      input.value !== undefined &&
      input.currency === undefined &&
      current.clientId
    ) {
      nextCurrency = await this.defaultWorkEntryCurrency(current.clientId);
    }
    if (!current.clientId && nextValue !== null) {
      throw new BadRequestException("Clientless event work cannot have a value");
    }
    if (nextValue !== null && nextCurrency === null) {
      throw new BadRequestException("A currency is required for a work value");
    }

    if (input.userId !== undefined && input.userId !== current.userId)
      await this.assertPerformer(input.userId);
    const row = await this.applyChange(
      current,
      {
        ...(input.userId !== undefined ? { userId: input.userId } : {}),
        status: "CONFIRMED",
        minutes,
        title,
        description,
        ...(input.value !== undefined ? { value: nextValue } : {}),
        ...(input.currency !== undefined ||
        (nextValue !== null && current.currency === null)
          ? { currency: nextCurrency }
          : {}),
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

  async actions(id: string): Promise<WorkEntryActions> {
    const row = await this.db.workEntry.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: entryInclude,
    });
    if (!row || !(await this.canRead(row)))
      throw new NotFoundException("Work entry not found");
    const owns = this.ownsEntry(row);
    const canEdit = owns && row.status !== "BILLED";
    let reason: WorkEntryActions["deleteBlockedReason"] = null;
    if (!owns || (row.status === "WRITTEN_OFF" && !this.isManager()))
      reason = "NOT_ALLOWED";
    else if (row.status === "BILLED") reason = "BILLED";
    else if (
      row.taskId &&
      (await this.db.workEntry.count({
        where: { workspaceId: this.workspaceId, taskId: row.taskId },
      })) <= 1
    )
      reason = "LAST_TASK_ENTRY";
    return { canEdit, canDelete: reason === null, deleteBlockedReason: reason };
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
      if (current.taskId) {
        // All deletions for a task use the same lock, so two requests cannot
        // each see the other's entry and together remove the last two.
        await tx.$queryRaw`SELECT "id" FROM "Task" WHERE "id" = ${current.taskId} AND "workspaceId" = ${this.workspaceId} FOR UPDATE`;
        const remaining = await tx.workEntry.count({
          where: { workspaceId: this.workspaceId, taskId: current.taskId },
        });
        if (remaining <= 1) {
          throw new ConflictException({
            code: "LAST_TASK_WORK_ENTRY",
            message:
              "Add another work entry before deleting the task's only work entry",
          });
        }
      }
      const deleted = await tx.workEntry.deleteMany({
        where: {
          id,
          workspaceId: this.workspaceId,
          status: { in: removable },
          userId: current.userId,
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
            title: input.title ? toLatin(input.title.trim()).slice(0, 200) : "",
            description: this.optionalText(input.description),
            treatment,
            currency: await this.defaultWorkEntryCurrency(input.clientId, tx),
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
  private ownsEntry(row: {
    userId: string | null;
    createdByUserId: string;
  }): boolean {
    return (
      this.isManager() ||
      row.userId === this.userId ||
      (row.userId === null && row.createdByUserId === this.userId)
    );
  }

  private async loadForMutation(id: string): Promise<EntryRecord> {
    const row = await this.db.workEntry.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: entryInclude,
    });
    if (!row) throw new NotFoundException("Work entry not found");
    if (!this.ownsEntry(row)) {
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
    if (this.ownsEntry(row)) return true;
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
          userId: current.userId,
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
    entry: { id: string; clientId: string | null; caseId: string | null },
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

  /** Minutes are optional (null); a given value must be 1..1440 whole minutes. */
  private assertMinutes(minutes: number | null): void {
    if (minutes === null) return;
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

  private titleText(value: string | undefined): string {
    const title = this.requiredText(value, "Title");
    if (title.length > MAX_TITLE_LENGTH) {
      throw new BadRequestException(
        `Title must be at most ${MAX_TITLE_LENGTH} characters`,
      );
    }
    return title;
  }

  private optionalText(value: string | undefined): string {
    return toLatin((value ?? "").trim());
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

  private async assertPerformer(
    userId: string | null,
    db: Prisma.TransactionClient | PlatformPrismaService = this.db,
  ): Promise<void> {
    if (userId === null) return;
    const member = await db.workspaceMember.findFirst({
      where: { workspaceId: this.workspaceId, userId, status: "ACTIVE" },
      select: { userId: true },
    });
    if (!member)
      throw new BadRequestException("User is not an active workspace member");
  }

  private async assertClientAndCase(
    clientId: string,
    caseId: string | undefined,
    tx: Prisma.TransactionClient = this.db,
  ): Promise<void> {
    const client = await tx.client.findFirst({
      where: { id: clientId, workspaceId: this.workspaceId },
      select: { id: true },
    });
    if (!client) throw new BadRequestException("Client not found");
    if (!caseId) return;
    const caseRecord = await tx.case.findFirst({
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
    tx: Prisma.TransactionClient = this.db,
  ): Promise<void> {
    if (!serviceCategoryId) return;
    const category = await tx.serviceCategory.findFirst({
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

  async defaultWorkEntryCurrency(
    clientId: string,
    tx: Prisma.TransactionClient | PlatformPrismaService = this.db,
  ): Promise<WorkEntryCurrency> {
    const profile = await tx.clientBillingProfile.findFirst({
      where: { workspaceId: this.workspaceId, clientId },
      select: { currency: true },
    });
    const profileCurrency = this.supportedWorkEntryCurrency(profile?.currency);
    if (profileCurrency) return profileCurrency;

    const settings = await tx.organizationSettings.findUnique({
      where: { workspaceId: this.workspaceId },
      select: { defaultCurrencyCode: true },
    });
    return (
      this.supportedWorkEntryCurrency(settings?.defaultCurrencyCode) ?? "RSD"
    );
  }

  private normalizeWorkEntryCurrency(
    value: string | null | undefined,
  ): WorkEntryCurrency | null {
    if (value == null || value === "") return null;
    const currency = value.trim().toUpperCase();
    const supported = this.supportedWorkEntryCurrency(currency);
    if (!supported)
      throw new BadRequestException("Unsupported work entry currency");
    return supported;
  }

  private supportedWorkEntryCurrency(
    value: string | null | undefined,
  ): WorkEntryCurrency | null {
    if (value == null || value === "") return null;
    const currency = value.trim().toUpperCase();
    if (
      !SUPPORTED_WORK_ENTRY_CURRENCIES.includes(currency as WorkEntryCurrency)
    ) {
      return null;
    }
    return currency as WorkEntryCurrency;
  }

  private parseWorkEntryValue(
    value: string | null | undefined,
  ): Prisma.Decimal | null {
    if (value == null) return null;
    let amount: Prisma.Decimal;
    try {
      amount = new Prisma.Decimal(value);
    } catch {
      throw new BadRequestException(
        "Work entry value must be a decimal amount",
      );
    }
    if (
      !amount.isFinite() ||
      amount.isNegative() ||
      amount.decimalPlaces() > 2 ||
      amount.greaterThan("9999999999999999.99")
    ) {
      throw new BadRequestException(
        "Work entry value is outside the supported range",
      );
    }
    return amount;
  }

  private async newWorkEntryMoney(
    input: Pick<CreateWorkEntryRequest, "value" | "currency">,
    clientId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<{
    value: Prisma.Decimal | null;
    currency: WorkEntryCurrency | null;
  }> {
    const value = this.parseWorkEntryValue(input.value);
    const currency =
      input.currency === undefined
        ? clientId
          ? await this.defaultWorkEntryCurrency(clientId, tx)
          : null
        : this.normalizeWorkEntryCurrency(input.currency);
    if (value !== null && currency === null) {
      throw new BadRequestException("A currency is required for a work value");
    }
    return { value, currency };
  }

  // -------------------------------------------------------------- mapping

  private toEntry(row: EntryRecord): WorkEntry {
    return {
      id: row.id,
      user: row.user ? this.userReference(row.user) : null,
      client: row.client ? this.clientReference(row.client) : null,
      case: this.caseReference(row.case),
      workDate: row.workDate.toISOString().slice(0, 10),
      minutes: row.minutes,
      timerStartedAt: row.timerStartedAt?.toISOString() ?? null,
      title: row.title,
      description: row.description,
      serviceCategory: row.serviceCategory
        ? { id: row.serviceCategory.id, name: row.serviceCategory.name }
        : null,
      treatment: row.treatment,
      value: row.value?.toString() ?? null,
      currency: row.currency as WorkEntryCurrency | null,
      status: row.status,
      writeOffReason: row.writeOffReason,
      source: row.source as WorkEntrySource,
      sourceType: row.sourceType as WorkEntrySourceType | null,
      sourceId: row.sourceId,
      taskId: row.taskId ?? null,
      eventId: row.eventId ?? null,
      invoiceId: row.invoiceLine?.invoiceId ?? null,
      aiParsed: row.aiParsed,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private userReference(user: NonNullable<EntryRecord["user"]>): UserReference {
    return {
      id: user.id,
      displayName:
        [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      email: user.email,
    };
  }

  private clientReference(
    client: NonNullable<EntryRecord["client"]>,
  ): ClientReference {
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
