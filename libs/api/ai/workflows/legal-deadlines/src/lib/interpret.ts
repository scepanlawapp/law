import { foldForMatch, verifyQuote } from "@law/case-timeline";
import { isIsoDate } from "./calendar";
import type { DeadlineClassification } from "./classification";
import {
  computeDeadline,
  formatSerbianDate,
  type ComputedDeadline,
} from "./compute";
import {
  CIVIL_PROCEDURE_LABELS,
  findDeadlineRule,
  getActKind,
  type CivilProcedureKind,
  type DeadlineActKind,
  type DeadlineRule,
} from "./rules";

const MAX_MODEL_WARNINGS = 3;
const MAX_STATED_DAYS = 365;

export interface ClassifiedAct {
  kind: DeadlineActKind;
  /** "Prvostepena presuda u parnici" */
  kindLabel: string;
  /** Civil acts only. */
  procedure: CivilProcedureKind | null;
  procedureLabel: string | null;
  title: string;
  issuer: string | null;
  caseNumber: string | null;
  decisionDate: string | null;
}

export type DeadlineOutcome =
  | {
      status: "NO_DEADLINE";
      act: ClassifiedAct;
      reason: string;
      warnings: string[];
    }
  | {
      status: "NEEDS_SERVICE_DATE";
      act: ClassifiedAct;
      rule: DeadlineRule;
      warnings: string[];
    }
  | {
      status: "INVALID_SERVICE_DATE";
      act: ClassifiedAct;
      message: string;
    }
  | {
      status: "COMPUTED";
      act: ClassifiedAct;
      rule: DeadlineRule;
      serviceDate: string;
      serviceDateSource: "USER" | "DOCUMENT";
      /** Verified quote the document-stated service date comes from. */
      serviceDateQuote: string | null;
      /** By the rule. */
      computed: ComputedDeadline;
      /** By the remedy instruction, when it states a different period. */
      stated: ComputedDeadline | null;
      /** The earlier of the two. */
      dueDate: string;
      expired: boolean;
      warnings: string[];
    };

export interface InterpretDeadlineInput {
  classification: DeadlineClassification;
  /** Text the classification was made from, to verify quotes. */
  sourceText: string;
  /** Service date the user gave (YYYY-MM-DD), if any. */
  serviceDate?: string | null;
  /** YYYY-MM-DD (Europe/Belgrade). */
  today: string;
}

/**
 * Turns the model's classification into a deadline using only the rules
 * table and the calendar. Quotes are trusted only when they occur in the
 * source text; a date is never inferred.
 */
export function interpretDeadlineClassification(
  input: InterpretDeadlineInput,
): DeadlineOutcome {
  const { classification: c, today } = input;
  const folded = foldForMatch(input.sourceText);
  const kind = getActKind(c.actKind);
  const procedure = kind.civil ? c.civilProcedure : null;
  const decisionDate = isIsoDate(c.decisionDate) ? c.decisionDate : null;
  const act: ClassifiedAct = {
    kind: kind.id,
    kindLabel: kind.label,
    procedure,
    procedureLabel: procedure ? CIVIL_PROCEDURE_LABELS[procedure] : null,
    title: c.actTitle.trim() || kind.label,
    issuer: c.issuer,
    caseNumber: c.caseNumber,
    decisionDate,
  };
  const warnings = c.warnings
    .map((warning) => warning.trim())
    .filter(Boolean)
    .slice(0, MAX_MODEL_WARNINGS);

  const userDate = input.serviceDate?.trim() || null;
  if (userDate !== null) {
    if (!isIsoDate(userDate)) {
      return {
        status: "INVALID_SERVICE_DATE",
        act,
        message: `Datum dostavljanja „${userDate}“ nije ispravan (YYYY-MM-DD).`,
      };
    }
    if (userDate > today) {
      return {
        status: "INVALID_SERVICE_DATE",
        act,
        message: `Datum dostavljanja ${formatSerbianDate(userDate)} je u budućnosti.`,
      };
    }
  }

  const remedyQuote = verifyQuote(c.remedyQuote, input.sourceText, folded);
  if (c.remedyExcluded) {
    if (remedyQuote) {
      return {
        status: "NO_DEADLINE",
        act,
        reason: `Prema pouci u dokumentu pravni lek nije dozvoljen: „${remedyQuote}“.`,
        warnings,
      };
    }
    warnings.push(
      "Model je naveo da pravni lek nije dozvoljen, ali to nije potvrđeno citatom iz dokumenta; proverite pouku.",
    );
  }

  const lookup = findDeadlineRule(kind.id, procedure ?? "GENERAL");
  if (lookup.status === "NONE") {
    return { status: "NO_DEADLINE", act, reason: lookup.reason, warnings };
  }
  const rule = lookup.rule;
  warnings.push(...rule.notes);

  let serviceDate: string | null = userDate;
  let serviceDateSource: "USER" | "DOCUMENT" = "USER";
  let serviceDateQuote: string | null = null;
  if (!serviceDate && isIsoDate(c.serviceDate) && c.serviceDate <= today) {
    const quote = verifyQuote(c.serviceDateQuote, input.sourceText, folded);
    if (quote) {
      serviceDate = c.serviceDate;
      serviceDateSource = "DOCUMENT";
      serviceDateQuote = quote;
      warnings.push(
        `Datum dostavljanja je preuzet iz dokumenta („${quote}“); potvrdite ga pre odobravanja.`,
      );
    }
  }
  if (!serviceDate) {
    return { status: "NEEDS_SERVICE_DATE", act, rule, warnings };
  }
  if (decisionDate && serviceDate < decisionDate) {
    warnings.push(
      `Datum dostavljanja ${formatSerbianDate(serviceDate)} je pre datuma donošenja akta ${formatSerbianDate(decisionDate)}; proverite ga.`,
    );
  }

  const computed = computeDeadline(serviceDate, rule.days);
  let stated: ComputedDeadline | null = null;
  const statedDays = c.statedPeriodDays;
  if (
    remedyQuote &&
    statedDays !== null &&
    Number.isInteger(statedDays) &&
    statedDays > 0 &&
    statedDays <= MAX_STATED_DAYS &&
    statedDays !== rule.days
  ) {
    stated = computeDeadline(serviceDate, statedDays);
    warnings.unshift(
      `Pouka u dokumentu navodi rok od ${statedDays} dana, a pravilo (${rule.legalBasis}) ${rule.days} dana; predložen je raniji datum. Proverite vrstu postupka.`,
    );
  }
  const dueDate =
    stated && stated.dueDate < computed.dueDate
      ? stated.dueDate
      : computed.dueDate;
  return {
    status: "COMPUTED",
    act,
    rule,
    serviceDate,
    serviceDateSource,
    serviceDateQuote,
    computed,
    stated,
    dueDate,
    expired: dueDate < today,
    warnings,
  };
}

/** One line on how the date was reached, e.g. for the deadline description. */
export function describeComputation(computed: ComputedDeadline): string {
  const base = `${computed.days} dana od ${formatSerbianDate(computed.startDate)} (prvi dan roka ${formatSerbianDate(computed.firstDay)}), poslednji dan ${formatSerbianDate(computed.nominalEndDate)}`;
  if (!computed.shiftedOver.length) return `${base}.`;
  const skipped = computed.shiftedOver
    .map((day) => `${formatSerbianDate(day.date)} ${day.name}`)
    .join(", ");
  return `${base} je neradni dan (${skipped}), pa rok ističe ${formatSerbianDate(computed.dueDate)}.`;
}

const TITLE_MAX = 320;
const DESCRIPTION_MAX = 2000;

/** Deadline title for the proposal: "Žalba protiv presude – P 123/2026". */
export function deadlineProposalTitle(
  outcome: Extract<DeadlineOutcome, { status: "COMPUTED" }>,
): string {
  const subject = outcome.act.caseNumber ?? outcome.act.title;
  return `${outcome.rule.remedy} – ${subject}`.slice(0, TITLE_MAX);
}

/** Deadline description naming the document, the rule, and the counting. */
export function deadlineProposalDescription(
  outcome: Extract<DeadlineOutcome, { status: "COMPUTED" }>,
  documentTitle: string,
): string {
  const { act, rule } = outcome;
  const lines = [
    `Dokument: ${documentTitle} (${act.kindLabel}${act.procedureLabel ? `, ${act.procedureLabel}` : ""}).`,
    `Dostavljeno: ${formatSerbianDate(outcome.serviceDate)} (${outcome.serviceDateSource === "USER" ? "prema navodu korisnika" : "prema dokumentu"}).`,
    `Rok: ${rule.remedy}, ${rule.days} dana (${rule.legalBasis}); računanje po ${rule.countingBasis}: ${describeComputation(outcome.computed)}`,
  ];
  if (outcome.stated) {
    lines.push(
      `Po roku iz pouke (${outcome.stated.days} dana): ${describeComputation(outcome.stated)}`,
    );
  }
  lines.push(
    ...outcome.warnings.map((warning) => `Napomena: ${warning}`),
    "Rok je izračunat automatski; vanredni neradni dani nisu uzeti u obzir. Proverite ga pre podnošenja.",
  );
  const text = lines.join("\n");
  return text.length > DESCRIPTION_MAX
    ? `${text.slice(0, DESCRIPTION_MAX - 1)}…`
    : text;
}
