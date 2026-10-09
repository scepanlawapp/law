export type BriefDocumentStatus = "COMPLETED" | "FAILED" | "UNSUPPORTED";

export interface BriefDocumentInput {
  id: string;
  name: string;
  mimeType: string;
  status: BriefDocumentStatus;
  text?: string;
  /** Why there is no text, when the user should hear it (for example AI access off). */
  note?: string;
}

/** One extracted document fact offered to the brief (value only, never the quote). */
export interface BriefDocumentFact {
  ref: string;
  title: string;
  subjectType: string;
  subjectRole: string | null;
  field: string;
  value: string;
}

export interface BriefContextInput {
  userText: string;
  documents: BriefDocumentInput[];
  documentFacts?: BriefDocumentFact[];
}

/** Facts beyond this many are left out of the prompt. */
export const BRIEF_FACTS_MAX = 200;

export interface BriefContextBudget {
  perDocMaxChars: number;
  totalMaxChars: number;
}

export interface BriefContextResult {
  prompt: string;
  promptChars: number;
  truncated: boolean;
}

function statusOnlyLine(doc: BriefDocumentInput): string {
  return `- ${doc.name} (${doc.mimeType}): status ${doc.status}, tekst nije dostupan.`;
}

function textLine(doc: BriefDocumentInput, text: string): string {
  return `- ${doc.name} (${doc.mimeType}):\n${text}`;
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function factLine(fact: BriefDocumentFact): string {
  const subject = fact.subjectRole
    ? `${fact.subjectType}, ${singleLine(fact.subjectRole)}`
    : fact.subjectType;
  return `- [${fact.ref}] ${singleLine(fact.title)} | ${subject} | ${singleLine(fact.field)}: ${singleLine(fact.value)}`;
}

function factsBlock(facts: BriefDocumentFact[]): string {
  return [
    "Činjenice iz dokumenata (izvučene iz dokumenata predmeta; svaka stavka ima oznaku dokumenta u zagradi):",
    "Pravila: Podatak iz poruke klijenta ima prednost nad činjenicom iz dokumenta. Polje za koje postoji činjenica nije nedostajući podatak i ne ide u missingFields.",
    ...facts.map(factLine),
  ].join("\n");
}

export function buildBriefUserPrompt(
  input: BriefContextInput,
  budget: BriefContextBudget,
): BriefContextResult {
  let truncated = false;

  const allFacts = (input.documentFacts ?? []).filter((fact) =>
    fact.value.trim(),
  );
  const facts = allFacts.slice(0, BRIEF_FACTS_MAX);
  if (facts.length < allFacts.length) truncated = true;
  const factsSection = facts.length ? `\n\n${factsBlock(facts)}` : "";

  const docTexts = input.documents.map((doc) => {
    if (doc.status !== "COMPLETED" || !doc.text) {
      return { doc, text: null as string | null, dropped: false };
    }
    if (doc.text.length > budget.perDocMaxChars) {
      truncated = true;
      return {
        doc,
        text: `${doc.text.slice(0, budget.perDocMaxChars)}…`,
        dropped: false,
      };
    }
    return { doc, text: doc.text, dropped: false };
  });

  const renderPrompt = (): string => {
    const documentLines = docTexts
      .filter((entry) => !entry.dropped)
      .map(({ doc, text }) =>
        text === null ? statusOnlyLine(doc) : textLine(doc, text),
      );
    const documentsBlock =
      documentLines.length === 0
        ? "Nema priloženih dokumenata."
        : documentLines.join("\n\n");
    return `Poruka klijenta:\n${input.userText.trim() || "(prazno)"}\n\nDokumenti:\n${documentsBlock}${factsSection}`;
  };

  let prompt = renderPrompt();

  // Total budget exceeded: drop or shrink the lowest-priority (last) documents first.
  for (
    let i = docTexts.length - 1;
    i >= 0 && prompt.length > budget.totalMaxChars;
    i -= 1
  ) {
    const entry = docTexts[i];
    if (entry.text === null) continue;
    truncated = true;
    const overBy = prompt.length - budget.totalMaxChars;
    const keep = Math.max(0, entry.text.length - overBy);
    if (keep > 0) {
      entry.text = `${entry.text.slice(0, keep)}…`;
    } else {
      entry.dropped = true;
    }
    prompt = renderPrompt();
  }

  return { prompt, promptChars: prompt.length, truncated };
}
