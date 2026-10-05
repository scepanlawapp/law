import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  ConfirmSourceEntryRequest,
  WorkEntry,
  WorkEntrySource,
  WorkEntrySourceType,
} from "@law/api-interfaces";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";
import { toLatin } from "@law/transliteration";
import { RetainerUsageService } from "./retainer-usage.service";
import { WorkEntriesService } from "./work-entries.service";

const MIN_MINUTES = 1;
const MAX_MINUTES = 1440;
const ENTRY_TIME_ZONE = "Europe/Belgrade";

const SOURCE_BY_TYPE: Record<WorkEntrySourceType, WorkEntrySource> = {
  TASK: "TASK",
  EVENT: "EVENT",
  DEADLINE: "DEADLINE",
  CLIENT_ACTIVITY: "ACTIVITY",
  CASE_ACTIVITY: "ACTIVITY",
};

export interface EnsureSourceEntryInput {
  workspaceId: string;
  actorUserId: string;
  sourceType: WorkEntrySourceType;
  sourceId: string;
  performerUserId: string;
  clientIds: string[];
  caseId: string | null;
  workDate: Date;
  /** Title of the source record; becomes the entry title. */
  title: string;
  description?: string;
  minutes: number | null;
  confirm: boolean;
}

/**
 * Calendar date (UTC midnight, as stored in `WorkEntry.workDate`) that `instant`
 * falls on in the office's time zone.
 */
export function workDateFor(instant: Date = new Date()): Date {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: ENTRY_TIME_ZONE,
  })
    .format(instant)
    .split("-")
    .map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Turns completed work (tasks, events, deadlines) and logged activities into
 * billing-ledger entries, so finishing work never silently drops billable time.
 */
@Injectable()
export class WorkEntrySourcesService {
  private readonly logger = new Logger(WorkEntrySourcesService.name);

  constructor(
    private readonly db: PlatformPrismaService,
    private readonly workEntries: WorkEntriesService,
    private readonly retainerUsage: RetainerUsageService,
  ) {}

  /**
   * Retainer usage alerts for an entry that `ensureForSource` created
   * CONFIRMED. Call it after the caller's transaction has committed; a failure
   * is logged, never thrown, because the user's record is already saved.
   */
  async checkRetainerUsage(clientId: string, workDate: Date): Promise<void> {
    try {
      await this.retainerUsage.checkThresholds({ clientId, workDate });
    } catch (error) {
      this.logger.error(
        `Retainer usage check failed for client ${clientId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Creates the entry for a source record inside the caller's transaction.
   * Returns its id, or null when the work cannot be attributed to exactly one
   * client. Idempotent per source: an existing entry is returned untouched.
   */
  async ensureForSource(
    tx: Prisma.TransactionClient,
    input: EnsureSourceEntryInput,
  ): Promise<string | null> {
    const clientIds = [...new Set(input.clientIds)];
    if (clientIds.length !== 1) return null;
    const [clientId] = clientIds;

    const existing = await tx.workEntry.findFirst({
      where: {
        workspaceId: input.workspaceId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
      select: { id: true },
    });
    if (existing) return existing.id;

    const minutes =
      input.minutes !== null &&
      Number.isInteger(input.minutes) &&
      input.minutes >= MIN_MINUTES &&
      input.minutes <= MAX_MINUTES
        ? input.minutes
        : null;
    const treatment = await this.workEntries.defaultTreatmentFor(
      clientId,
      input.workDate,
      null,
      tx,
    );
    const status = input.confirm && minutes !== null ? "CONFIRMED" : "PROPOSED";
    // A concurrent completion of the same source can win the unique index. A
    // failed INSERT would poison the surrounding Postgres transaction, so the
    // duplicate is skipped in SQL rather than caught afterwards.
    const { count } = await tx.workEntry.createMany({
      data: [
        {
          workspaceId: input.workspaceId,
          userId: input.performerUserId,
          clientId,
          caseId: input.caseId,
          workDate: input.workDate,
          minutes,
          title: toLatin(input.title.trim()).slice(0, 200) || "Rad",
          description: toLatin((input.description ?? "").trim()),
          treatment,
          status,
          source: SOURCE_BY_TYPE[input.sourceType],
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
        },
      ],
      skipDuplicates: true,
    });
    const entry = await tx.workEntry.findFirst({
      where: {
        workspaceId: input.workspaceId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
      select: { id: true },
    });
    if (!entry) throw new Error("Work entry vanished after creation");
    // Only the winner of the race logs the creation.
    if (count === 0) return entry.id;
    await tx.activityLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        action: "WORK_ENTRY_CREATED",
        entityType: "WORK_ENTRY",
        entityId: entry.id,
        clientId,
        caseId: input.caseId,
        metadata: {
          source: input.sourceType,
          status,
          minutes,
          treatment,
        },
      },
    });
    return entry.id;
  }

  /**
   * Confirms the entry a source produced. Without minutes it is confirmed as
   * untimed work, priced later on the invoice.
   */
  async confirmFromSource(
    input: ConfirmSourceEntryRequest,
  ): Promise<WorkEntry> {
    const entry = await this.db.workEntry.findFirst({
      where: {
        workspaceId: WorkspaceContextService.required.workspaceId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
      select: { id: true },
    });
    if (!entry) throw new NotFoundException("Work entry not found");
    return this.workEntries.confirm(entry.id, {
      minutes: input.minutes,
      title: input.title,
      description: input.description,
    });
  }
}
