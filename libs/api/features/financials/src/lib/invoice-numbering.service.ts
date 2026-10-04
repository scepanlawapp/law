import { BadRequestException, Injectable } from "@nestjs/common";
import { InvoiceNumberResetPolicy, Prisma } from "@prisma/client";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";

export interface NumberingConfiguration {
  pattern: string;
  startingSequence: number;
  incrementBy: number;
  resetPolicy: InvoiceNumberResetPolicy;
}

const TOKEN = /\{(YYYY|YY|MM|M|DD|D|SEQ(?::(\d+))?)\}/g;
const DEFAULTS: NumberingConfiguration = {
  pattern: "{YYYY}-{SEQ:6}",
  startingSequence: 1,
  incrementBy: 1,
  resetPolicy: InvoiceNumberResetPolicy.YEARLY,
};

@Injectable()
export class InvoiceNumberingService {
  constructor(private readonly db: PlatformPrismaService) {}

  validatePattern(pattern: string): void {
    if (!pattern || pattern.length > 120)
      throw new BadRequestException(
        "Invoice number pattern must contain 1 to 120 characters",
      );
    const matches = [...pattern.matchAll(TOKEN)];
    const reconstructed = pattern.replace(TOKEN, "");
    if (/[{}]/.test(reconstructed))
      throw new BadRequestException(
        "Invoice number pattern contains an unknown or malformed token",
      );
    const sequences = matches.filter((match) => match[1].startsWith("SEQ"));
    if (sequences.length !== 1)
      throw new BadRequestException(
        "Invoice number pattern must contain exactly one {SEQ} or {SEQ:n} token",
      );
    const padding = sequences[0][2];
    if (padding && (Number(padding) < 1 || Number(padding) > 12))
      throw new BadRequestException(
        "Invoice sequence padding must be between 1 and 12 digits",
      );
  }

  renderPattern(pattern: string, date: Date, sequence: number): string {
    this.validatePattern(pattern);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    return pattern.replace(TOKEN, (_token, name: string, padding?: string) => {
      if (name === "YYYY") return String(year).padStart(4, "0");
      if (name === "YY") return String(year % 100).padStart(2, "0");
      if (name === "MM") return String(month).padStart(2, "0");
      if (name === "M") return String(month);
      if (name === "DD") return String(day).padStart(2, "0");
      if (name === "D") return String(day);
      return padding
        ? String(sequence).padStart(Number(padding), "0")
        : String(sequence);
    });
  }

  parsePattern(pattern: string, value: string, date: Date): number | null {
    this.validatePattern(pattern);
    let source = "^";
    let cursor = 0;
    for (const match of pattern.matchAll(TOKEN)) {
      source += escapeRegex(pattern.slice(cursor, match.index));
      const name = match[1];
      if (name.startsWith("SEQ")) {
        const width = match[2] ? Number(match[2]) : null;
        source += width ? `(\\d{${width},})` : "(\\d+)";
      } else {
        source += escapeRegex(this.renderDateToken(name, date));
      }
      cursor = (match.index ?? 0) + match[0].length;
    }
    source += `${escapeRegex(pattern.slice(cursor))}$`;
    const result = new RegExp(source).exec(value);
    if (!result) return null;
    const sequence = Number(result[1]);
    return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : null;
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

  private renderDateToken(name: string, date: Date): string {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    return (
      {
        YYYY: String(year).padStart(4, "0"),
        YY: String(year % 100).padStart(2, "0"),
        MM: String(month).padStart(2, "0"),
        M: String(month),
        DD: String(day).padStart(2, "0"),
        D: String(day),
      } as Record<string, string>
    )[name];
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
