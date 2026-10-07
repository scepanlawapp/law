import type {
  ContractIssueRisk,
  ContractReviewResult,
  LegalCitationResponse,
} from "@law/api-interfaces";

const RISK_LABEL: Record<ContractIssueRisk, string> = {
  HIGH: "Visok rizik",
  MEDIUM: "Srednji rizik",
  LOW: "Nizak rizik",
};

export interface ContractReviewMemoInput {
  documentTitle: string;
  contractLabel: string;
  clientSide: string | null;
  /** YYYY-MM-DD */
  date: string;
  result: ContractReviewResult;
  citations: LegalCitationResponse[];
  truncated: boolean;
}

/**
 * The review as Markdown for the DOCX renderer (headings, bullets, numbered
 * lists). Latin script; the renderer converts on Cyrillic export.
 */
export function renderContractReviewMemo(
  input: ContractReviewMemoInput,
): string {
  const { result } = input;
  const lines: string[] = [
    "# Analiza ugovora",
    "",
    `Dokument: ${input.documentTitle}`,
    `Vrsta ugovora: ${input.contractLabel}`,
    `Klijent kancelarije: ${input.clientSide ?? "nije naveden"}`,
    `Datum analize: ${input.date}`,
    "",
    "Radna analiza za internu upotrebu; advokat proverava nalaze pre davanja saveta.",
    "",
    "## Sažetak",
    "",
    result.summary,
  ];
  if (result.keyTerms.length) {
    lines.push("", "## Ključni uslovi", "");
    for (const term of result.keyTerms) {
      const clause = term.clause ? ` (${term.clause})` : "";
      lines.push(`- ${term.label}${clause}: ${term.value}`);
    }
  }
  lines.push("", "## Nalazi", "");
  if (!result.issues.length) {
    lines.push("Nisu pronađene sporne odredbe.");
  }
  result.issues.forEach((issue, index) => {
    const clause = issue.clause ? ` — ${issue.clause}` : "";
    const kind = issue.category === "COMPLIANCE" ? "usklađenost" : "rizik";
    const markers = issue.citations.map((marker) => `[${marker}]`).join("");
    lines.push(
      `### ${index + 1}. ${issue.title}${clause}`,
      "",
      `${RISK_LABEL[issue.risk]} (${kind})${markers ? ` ${markers}` : ""}`,
    );
    if (issue.quote) lines.push("", `Odredba: „${issue.quote}”`);
    lines.push("", issue.explanation);
    if (issue.suggestion) lines.push("", `Predlog: ${issue.suggestion}`);
    lines.push("");
  });
  if (result.missingClauses.length) {
    lines.push("## Odredbe koje nedostaju", "");
    for (const clause of result.missingClauses) {
      const suggestion = clause.suggestion
        ? ` Predlog: ${clause.suggestion}`
        : "";
      lines.push(`- ${clause.title}: ${clause.explanation}${suggestion}`);
    }
    lines.push("");
  }
  const notes = [...result.warnings];
  if (input.truncated) {
    notes.push("Ugovor je bio predug i analiziran je samo njegov početni deo.");
  }
  if (notes.length) {
    lines.push("## Napomene", "");
    for (const note of notes) lines.push(`- ${note}`);
    lines.push("");
  }
  if (input.citations.length) {
    lines.push("## Izvori", "");
    for (const citation of input.citations) {
      const article = citation.articleNumber
        ? /^[0-9]/.test(citation.articleNumber)
          ? `Član ${citation.articleNumber}, `
          : `${citation.articleNumber}, `
        : "";
      lines.push(`- [${citation.marker}] ${article}${citation.sourceTitle}`);
    }
  }
  return lines.join("\n").trimEnd();
}
