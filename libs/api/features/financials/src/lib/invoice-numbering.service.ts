import { Injectable } from "@nestjs/common";
import { InvoiceNumberResetPolicy, Prisma } from "@prisma/client";
import {
  PlatformPrismaService,
  WorkspaceContextService,
  NumberPatternFormatter,
} from "@law/core";

export interface NumberingConfiguration {
  pattern: string;
  startingSequence: number;
  incrementBy: number;
  resetPolicy: InvoiceNumberResetPolicy;
}

const DEFAULTS: NumberingConfiguration = {
  pattern: "{YYYY}-{SEQ:6}",
  startingSequence: 1,
  incrementBy: 1,
  resetPolicy: InvoiceNumberResetPolicy.YEARLY,
};

@Injectable()
export class InvoiceNumberingService extends NumberPatternFormatter {
  constructor(private readonly db: PlatformPrismaService) {
    super();
  }

  getPeriodKey(policy: InvoiceNumberResetPolicy, date: Date): string {
    const year = date.getUTCFullYear();
    if (policy === InvoiceNumberResetPolicy.NEVER) return "global";
    if (policy === InvoiceNumberResetPolicy.YEARLY) return String(year);
    return `${year}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  async suggestInvoiceNumber(date = new Date()): Promise<string> {
    const workspaceId = WorkspaceContextService.required.workspaceId;
    const settings = await this.configuration(this.db, workspaceId);
    const periodKey = this.getPeriodKey(settings.resetPolicy, date);
    const state = await this.db.invoiceNumberSequenceState.findUnique({
      where: { workspaceId_periodKey: { workspaceId, periodKey } },
    });
    const sequence = state
      ? state.lastSequenceValue + settings.incrementBy
      : settings.startingSequence;
    return this.renderPattern(settings.pattern, date, sequence);
  }

  async allocateInvoiceNumber(
    tx: Prisma.TransactionClient,
    date: Date,
  ): Promise<string> {
    const workspaceId = WorkspaceContextService.required.workspaceId;
    const settings = await this.configuration(tx, workspaceId);
    const periodKey = this.getPeriodKey(settings.resetPolicy, date);
    const state = await tx.invoiceNumberSequenceState.upsert({
      where: { workspaceId_periodKey: { workspaceId, periodKey } },
      create: {
        workspaceId,
        periodKey,
        lastSequenceValue: settings.startingSequence,
      },
      update: { lastSequenceValue: { increment: settings.incrementBy } },
    });
    return this.renderPattern(settings.pattern, date, state.lastSequenceValue);
  }

  async updateSequenceFromSavedInvoice(
    tx: Prisma.TransactionClient,
    invoiceNumber: string,
    date: Date,
  ): Promise<void> {
    const workspaceId = WorkspaceContextService.required.workspaceId;
    const settings = await this.configuration(tx, workspaceId);
    const sequence = this.parsePattern(settings.pattern, invoiceNumber, date);
    if (sequence === null) return;
    const periodKey = this.getPeriodKey(settings.resetPolicy, date);
    await tx.$executeRaw`
      INSERT INTO "InvoiceNumberSequenceState" ("id", "workspaceId", "periodKey", "lastSequenceValue", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${workspaceId}, ${periodKey}, ${sequence}, NOW(), NOW())
      ON CONFLICT ("workspaceId", "periodKey") DO UPDATE
      SET "lastSequenceValue" = GREATEST("InvoiceNumberSequenceState"."lastSequenceValue", ${sequence}),
          "updatedAt" = NOW()
    `;
  }

  private async configuration(
    client: Pick<Prisma.TransactionClient, "organizationSettings">,
    workspaceId: string,
  ): Promise<NumberingConfiguration> {
    const value = await client.organizationSettings.findUnique({
      where: { workspaceId },
    });
    return value
      ? {
          pattern: value.invoiceNumberPattern,
          startingSequence: value.invoiceNumberStartingSequence,
          incrementBy: value.invoiceNumberIncrementBy,
          resetPolicy: value.invoiceNumberResetPolicy,
        }
      : DEFAULTS;
  }
}
