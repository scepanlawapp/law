export type BriefDocumentStatus = "COMPLETED" | "FAILED" | "UNSUPPORTED";

export interface BriefDocumentInput {
  id: string;
  name: string;
  mimeType: string;
  status: BriefDocumentStatus;
  text?: string;
}

export interface BriefContextInput {
  userText: string;
  documents: BriefDocumentInput[];
}

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

export function buildBriefUserPrompt(
  input: BriefContextInput,
  budget: BriefContextBudget,
): BriefContextResult {
  let truncated = false;

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
    return `Poruka klijenta:\n${input.userText.trim() || "(prazno)"}\n\nDokumenti:\n${documentsBlock}`;
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
