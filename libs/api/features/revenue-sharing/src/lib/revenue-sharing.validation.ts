import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import {
  REVENUE_AGREEMENT_TYPES,
  REVENUE_BASES,
  REVENUE_CATEGORIES,
  REVENUE_COMBINATIONS,
  REVENUE_DEPARTURE_POLICIES,
  REVENUE_MODES,
  REVENUE_ORIGINS,
  REVENUE_RATE_STATES,
  REVENUE_SCOPES,
  RevenueConfiguration,
} from "@law/api-interfaces";

export function revenueError(code: string): never {
  throw new BadRequestException({ code: `revenue.${code}` });
}
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const date = new Date(`${s}T00:00:00Z`);
    return (
      Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === s
    );
  });
export const percentageSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d?|100)(?:\.\d{1,2})?$/)
  .refine((s) => Number(s) <= 100);
const rate = z
  .object({
    state: z.enum(REVENUE_RATE_STATES),
    percentage: percentageSchema.nullable(),
  })
  .strict()
  .refine((r) => (r.state === "PERCENTAGE") === (r.percentage !== null));
const rates = z
  .object(
    Object.fromEntries(
      REVENUE_ORIGINS.map((origin) => [origin, rate]),
    ) as Record<(typeof REVENUE_ORIGINS)[number], typeof rate>,
  )
  .strict();
const id = z.string().uuid();
const period = {
  effectiveFrom: dateSchema,
  effectiveTo: dateSchema.nullable(),
};
const agreement = z
  .object({
    id,
    memberId: id,
    agreementType: z.enum(REVENUE_AGREEMENT_TYPES),
    ...period,
    rates,
    originationRate: rate,
    selfOrigination: z.boolean().nullable(),
    departurePolicy: z.enum(REVENUE_DEPARTURE_POLICIES),
    departureCutoffDate: dateSchema.nullable(),
    description: z.string().max(2000),
  })
  .strict();
const rule = z
  .object({
    id,
    memberId: id,
    scopeType: z.enum(REVENUE_SCOPES),
    scopeId: id.nullable(),
    earningType: z.enum(REVENUE_CATEGORIES),
    clientOrigin: z.enum(REVENUE_ORIGINS).nullable(),
    percentage: percentageSchema,
    revenueBasis: z.enum(REVENUE_BASES),
    combinationMode: z.enum(REVENUE_COMBINATIONS),
    poolId: z.string().min(1).max(100).nullable(),
    ...period,
    active: z.boolean(),
    description: z.string().max(2000),
  })
  .strict();
export const configurationSchema = z
  .object({
    enabled: z.boolean(),
    configurationMode: z.enum(REVENUE_MODES),
    primaryRevenueBasis: z.enum(REVENUE_BASES),
    vatBasis: z.enum(["EXCLUDING_VAT", "INCLUDING_VAT"]),
    expenseTreatment: z.enum(["EXCLUDE", "INCLUDE"]),
    partialPaymentPolicy: z.enum(["PROPORTIONAL", "MANUAL"]),
    entitlementDatePolicy: z.enum([
      "WORK_EXECUTION_DATE",
      "INVOICE_DATE",
      "COLLECTION_DATE",
    ]),
    missingRulePolicy: z.literal("REQUIRES_CONFIGURATION"),
    rates,
    originationEnabled: z.boolean(),
    originationRate: rate,
    originationOnOthersWork: z.boolean(),
    selfOrigination: z.boolean(),
    allowPersonalOriginationOverride: z.boolean(),
    agreements: z.array(agreement).max(2000),
    specialRules: z.array(rule).max(2000),
  })
  .strict();
export const publishSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    effectiveFrom: dateSchema,
    reason: z.string().max(2000),
    configuration: configurationSchema,
  })
  .strict();
export const scenarioSchema = z
  .object({
    amount: z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/),
    revenueBasis: z.enum(REVENUE_BASES),
    memberId: id,
    clientOrigin: z.enum(REVENUE_ORIGINS),
    originatorId: id.nullable(),
    referenceDate: dateSchema,
    collectionDate: dateSchema.nullable(),
    clientId: id.nullable(),
    caseId: id.nullable(),
    eventId: id.nullable(),
    agreementId: id.nullable(),
    specialRuleId: id.nullable(),
  })
  .strict();
export const previewSchema = z
  .object({
    configuration: configurationSchema.optional(),
    scenario: scenarioSchema,
  })
  .strict();
export function parseRevenue<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) revenueError("INVALID_INPUT");
  return result.data;
}
export function overlapping(
  a: { effectiveFrom: string; effectiveTo: string | null },
  b: { effectiveFrom: string; effectiveTo: string | null },
): boolean {
  return (
    a.effectiveFrom <= (b.effectiveTo ?? "9999-12-31") &&
    b.effectiveFrom <= (a.effectiveTo ?? "9999-12-31")
  );
}
/** Validate all stored rules even when a preset currently makes them inactive. */
export function validateConfiguration(c: RevenueConfiguration): void {
  parseRevenue(configurationSchema, c);
  const all = [...c.agreements, ...c.specialRules];
  if (new Set(all.map((x) => x.id)).size !== all.length)
    revenueError("DUPLICATE_ID");
  for (const row of all)
    if (row.effectiveTo && row.effectiveTo < row.effectiveFrom)
      revenueError("DATE_RANGE");
  for (const r of Object.values(c.rates).concat(c.originationRate))
    if (r.state === "INHERIT") revenueError("INVALID_INHERITANCE");
  for (const a of c.agreements) {
    if (
      a.departurePolicy === "CUSTOM_DEPARTURE_AGREEMENT" &&
      (!a.departureCutoffDate || !a.description.trim())
    )
      revenueError("DEPARTURE_TERMS");
    if (a.departureCutoffDate && a.departureCutoffDate < a.effectiveFrom)
      revenueError("DATE_RANGE");
    if (
      c.agreements.some(
        (b) => b.id !== a.id && a.memberId === b.memberId && overlapping(a, b),
      )
    )
      revenueError("AGREEMENT_OVERLAP");
  }
  for (const r of c.specialRules) {
    if ((r.scopeType === "FIRM") !== (r.scopeId === null))
      revenueError("SCOPE_REQUIRED");
    if (r.scopeType === "MEMBER" && r.scopeId !== r.memberId)
      revenueError("SCOPE_REQUIRED");
    if ((r.combinationMode === "EXCLUSIVE_SPLIT") !== (r.poolId !== null))
      revenueError("POOL_REQUIRED");
    if (r.earningType === "WORK_SHARE" && r.clientOrigin === null)
      revenueError("ORIGIN_REQUIRED");
  }
  const active = c.specialRules.filter((r) => r.active);
  for (let i = 0; i < active.length; i++)
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i],
        b = active[j];
      if (
        a.scopeType !== b.scopeType ||
        a.scopeId !== b.scopeId ||
        a.revenueBasis !== b.revenueBasis ||
        !overlapping(a, b)
      )
        continue;
      const originOverlaps =
        a.clientOrigin === null ||
        b.clientOrigin === null ||
        a.clientOrigin === b.clientOrigin;
      if (
        originOverlaps &&
        a.memberId === b.memberId &&
        a.earningType === b.earningType
      )
        revenueError("RULE_CONFLICT");
    }
  // Check at every start boundary, across scopes/categories, for each explicitly shared pool.
  for (const r of active.filter((r) => r.poolId)) {
    const contemporaries = active.filter(
      (b) =>
        b.poolId === r.poolId &&
        b.revenueBasis === r.revenueBasis &&
        b.effectiveFrom <= r.effectiveFrom &&
        (!b.effectiveTo || b.effectiveTo >= r.effectiveFrom),
    );
    for (const origin of REVENUE_ORIGINS) {
      const sum = contemporaries
        .filter((b) => b.clientOrigin === null || b.clientOrigin === origin)
        .reduce((n, b) => n + percentUnits(b.percentage), 0);
      if (sum > 10000) revenueError("POOL_OVERALLOCATION");
    }
  }
}
export function percentUnits(value: string): number {
  const [whole, decimal = ""] = value.split(".");
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
}
