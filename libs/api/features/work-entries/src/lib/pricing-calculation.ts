import { Prisma } from "@prisma/client";
import type { PricingSuggestionAlternative } from "@law/api-interfaces";
import type { PricingCandidate, PricingContext } from "./pricing-interpreter";

function containsDate(text: string, date: string): boolean {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    return false;
  if (text.includes(date)) return true;
  const [year, month, day] = date.split("-").map(Number);
  const pattern = new RegExp(`\\b0?${day}\\.\\s*0?${month}\\.\\s*${year}\\b`);
  return pattern.test(text);
}

function containsNumber(text: string, wanted: Prisma.Decimal): boolean {
  const matches: string[] = Array.from(
    text.match(/\d+(?:[.,]\d+)*(?:\s\d{3})*/g) ?? [],
  );
  return matches.some((token) => {
    const compact = token.replace(/\s/g, "");
    const variants = [
      compact,
      compact.replace(/\./g, "").replace(",", "."),
      compact.replace(/,/g, ""),
    ];
    return variants.some((value) => {
      try {
        return new Prisma.Decimal(value).eq(wanted);
      } catch {
        return false;
      }
    });
  });
}

export function calculatePricingCandidate(
  candidate: PricingCandidate,
  context: PricingContext,
): PricingSuggestionAlternative {
  if (candidate.formula === "UNSUPPORTED")
    throw new Error("UNSUPPORTED_FORMULA");
  const sources = candidate.evidence.map((citation) => {
    const source = context.sources.find((item) => item.id === citation.id);
    if (!source || !source.text.includes(citation.excerpt))
      throw new Error("UNVERIFIED_EVIDENCE_OR_DATE");
    let effectiveFrom = source.effectiveFrom;
    let effectiveTo = source.effectiveTo;
    let dateText = "";
    if (!source.reliableDate) {
      const date = citation.dateEvidence;
      const clause =
        date && context.sources.find((item) => item.id === date.sourceId);
      if (
        !date ||
        !clause ||
        !source.versionId ||
        clause.versionId !== source.versionId ||
        clause.sourceId !== source.sourceId ||
        !clause.text.includes(date.excerpt) ||
        !/primen|primjen|stupa|va.i|effective|valid from|applies|in force/i.test(
          date.excerpt,
        ) ||
        !containsDate(date.excerpt, date.effectiveFrom) ||
        (date.effectiveTo && !containsDate(date.excerpt, date.effectiveTo))
      )
        throw new Error("UNVERIFIED_EVIDENCE_OR_DATE");
      effectiveFrom = date.effectiveFrom;
      effectiveTo = date.effectiveTo;
      dateText = date.excerpt;
    }
    if (
      !effectiveFrom ||
      effectiveFrom > context.work.workDate ||
      (effectiveTo &&
        (effectiveTo < context.work.workDate || effectiveTo < effectiveFrom))
    )
      throw new Error("SOURCE_NOT_APPLICABLE_ON_WORK_DATE");
    if (source.kind === "RETAINER")
      throw new Error("RETAINER_IS_NOT_WORK_VALUE");
    return {
      id: source.id,
      sourceId: source.sourceId,
      versionId: source.versionId,
      version: source.version,
      kind: source.kind,
      title: source.title,
      reference: source.reference,
      sourceUrl: source.sourceUrl,
      effectiveFrom,
      effectiveTo,
      excerpt: citation.excerpt,
      dateExcerpt: dateText || null,
    };
  });
  const currencyPatterns: Record<string, RegExp> = {
    RSD: /\b(?:RSD|dinara|dinar|din)\b/i,
    EUR: /\b(?:EUR|evra|evro|euro)\b/i,
  };
  const currencyPattern =
    currencyPatterns[candidate.currency] ??
    new RegExp(`\\b${candidate.currency}\\b`);
  if (!sources.some((source) => currencyPattern.test(source.excerpt)))
    throw new Error("CURRENCY_NOT_EVIDENCED");
  const operands: Record<string, string> = {};
  const resolve = (name: string, required = false): Prisma.Decimal | null => {
    const operand =
      candidate[
        name as
          | "base"
          | "unitValue"
          | "quantity"
          | "adjustmentPercent"
          | "minimum"
          | "maximum"
      ];
    if (!operand) {
      if (required) throw new Error(`MISSING_${name.toUpperCase()}`);
      return null;
    }
    const value = new Prisma.Decimal(operand.value);
    if (operand.source === "EVIDENCE") {
      const source = sources.find((item) => item.id === operand.key);
      if (
        !source ||
        !source.excerpt.includes(operand.excerpt) ||
        !containsNumber(operand.excerpt, value)
      )
        throw new Error("OPERAND_NOT_EVIDENCED");
    } else if (operand.source === "FACT") {
      const allowed = [
        "claimValue",
        "representedParties",
        "quantity",
        "hearingMinutes",
        "minutes",
      ];
      const raw =
        operand.key === "minutes"
          ? context.work.minutes
          : context.facts[operand.key as keyof typeof context.facts];
      if (
        !allowed.includes(operand.key) ||
        raw == null ||
        !new Prisma.Decimal(raw).eq(value)
      )
        throw new Error("FACT_MISMATCH");
    } else {
      const raw =
        operand.key === "title"
          ? context.work.title
          : operand.key === "description"
            ? context.work.description
            : null;
      if (
        !raw ||
        !raw.includes(operand.excerpt) ||
        !containsNumber(operand.excerpt, value)
      )
        throw new Error("INPUT_MISMATCH");
    }
    operands[name] = value.toString();
    return value;
  };
  const base = resolve("base", true) as Prisma.Decimal;
  const unit = resolve(
    "unitValue",
    ["POINTS", "CLAIM_PERCENT"].includes(candidate.formula),
  );
  if (["FIXED", "HOURLY"].includes(candidate.formula) && unit)
    throw new Error("UNSUPPORTED_FORMULA_OPERANDS");
  const quantity = resolve("quantity", candidate.formula === "HOURLY");
  if (
    candidate.base?.source !== "EVIDENCE" &&
    candidate.formula !== "CLAIM_PERCENT"
  )
    throw new Error("RATE_MUST_HAVE_SOURCE");
  if (unit && candidate.unitValue?.source !== "EVIDENCE")
    throw new Error("UNIT_MUST_HAVE_SOURCE");
  if (
    candidate.formula === "CLAIM_PERCENT" &&
    context.facts.claimCurrency !== candidate.currency
  )
    throw new Error("CLAIM_CURRENCY_MISMATCH");
  if (quantity && (!quantity.gt(0) || !quantity.isInteger()))
    throw new Error("INVALID_QUANTITY");
  let amount = base;
  let formula = "base";
  if (candidate.formula === "HOURLY") {
    amount = base.mul(quantity as Prisma.Decimal).div(60);
    formula = "base * minutes / 60";
  }
  if (candidate.formula === "POINTS") {
    amount = base.mul(unit as Prisma.Decimal);
    formula = "points * pointValue";
  }
  if (candidate.formula === "CLAIM_PERCENT") {
    amount = base.mul(unit as Prisma.Decimal).div(100);
    formula = "claimValue * percentage / 100";
  }
  if (quantity && candidate.formula !== "HOURLY") {
    amount = amount.mul(quantity);
    formula += " * quantity";
  }
  const adjustment = resolve("adjustmentPercent");
  const minimum = resolve("minimum");
  const maximum = resolve("maximum");
  for (const name of ["adjustmentPercent", "minimum", "maximum"] as const) {
    if (candidate[name] && candidate[name]?.source !== "EVIDENCE")
      throw new Error("ADJUSTMENT_MUST_HAVE_SOURCE");
  }
  if (adjustment) {
    amount = amount.mul(adjustment.div(100).add(1));
    formula += " * (1 + adjustmentPercent / 100)";
  }
  if (minimum && maximum && minimum.gt(maximum))
    throw new Error("CONFLICTING_LIMITS");
  if (minimum) {
    amount = Prisma.Decimal.max(amount, minimum);
    formula += "; max(minimum)";
  }
  if (maximum) {
    amount = Prisma.Decimal.min(amount, maximum);
    formula += "; min(maximum)";
  }
  if (!amount.isFinite() || amount.lt(0) || amount.gte("10000000000000000"))
    throw new Error("AMOUNT_OUT_OF_RANGE");
  if (
    candidate.currency !== "RSD" &&
    !["EUR", "USD", "CHF", "GBP", "CAD", "AUD"].includes(candidate.currency)
  )
    throw new Error("UNSUPPORTED_CURRENCY_PRECISION");
  return {
    suggestedPrice: amount
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      .toFixed(2),
    currency: candidate.currency,
    explanation: candidate.explanation,
    calculation: {
      formula,
      operands,
      rounding: "ROUND_HALF_UP, 2 decimal places; final amount only",
    },
    sources,
  };
}
