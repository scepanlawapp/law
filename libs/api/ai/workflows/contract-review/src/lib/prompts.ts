import type { ContractChecklist } from "./checklists";

export interface ContractReviewPromptInput {
  checklist: ContractChecklist;
  /** The party the office represents, as the lawyer named it. */
  clientSide: string | null;
  /** Optional emphasis requested by the lawyer. */
  focus: string | null;
}

export function buildContractReviewSystemPrompt(
  input: ContractReviewPromptInput,
): string {
  const { checklist } = input;
  const example = JSON.stringify({
    summary: "string",
    keyTerms: [{ label: "Naknada", value: "string", clause: "Član 4" }],
    issues: [
      {
        title: "string",
        category: "RISK|COMPLIANCE",
        risk: "HIGH|MEDIUM|LOW",
        clause: "Član 7",
        quote: "string|null",
        explanation: "string",
        suggestion: "string|null",
        citations: [1],
      },
    ],
    missingClauses: [
      { title: "string", explanation: "string", suggestion: "string|null" },
    ],
    warnings: ["string"],
    usedCitations: [1],
  });
  const lines = [
    `Ti si pravni asistent advokatske kancelarije koji pregleda ugovor („${checklist.label}”) po srpskom pravu (${checklist.legalFrame}).`,
    input.clientSide?.trim()
      ? `Kancelarija zastupa: ${input.clientSide.trim()}. Rizike ocenjuj iz ugla te strane.`
      : "Nije navedeno koju stranu kancelarija zastupa: rizike ocenjuj za obe strane i to navedi u warnings.",
    "Pregledaj isključivo dati tekst ugovora. Ne izmišljaj odredbe, iznose, rokove ni članove kojih nema u tekstu; ako tekst nije čitljiv ili je nepotpun, navedi to u warnings.",
    "summary: 3 do 5 rečenica o vrsti ugovora, stranama, predmetu i ukupnoj oceni rizika.",
    "keyTerms: strane, predmet, cena ili naknada, trajanje, otkaz i raskid, otkazni i drugi rokovi, merodavno pravo i rešavanje sporova; samo ono što ugovor zaista sadrži, sa oznakom člana u clause kada postoji.",
    "issues: svaka sporna odredba posebno. category RISK znači da je odredba nepovoljna za klijenta; COMPLIANCE znači da je u suprotnosti sa prinudnim propisom. risk HIGH: može izazvati značajnu štetu ili ništavost; MEDIUM: nepovoljno, treba pregovarati; LOW: nejasno ili stilsko.",
    "U quote navedi doslovno kratak deo teksta odredbe (najviše 300 znakova); u suggestion predloži konkretnu izmenjenu ili dodatnu formulaciju na srpskom latinici.",
    `Proveri tipične rizike: ${checklist.riskPoints.join("; ")}.`,
    `Proveri usklađenost sa propisima: ${checklist.compliancePoints.join("; ")}.`,
    `missingClauses: od očekivanih odredbi navedi samo one koje u tekstu zaista nedostaju: ${checklist.expectedClauses.join("; ")}.`,
    "Ako je uz ugovor dat spisak 'Dostupni izvori iz pravne baze znanja', za COMPLIANCE nalaze u citations navedi brojeve izvora iz tog spiska koji direktno podržavaju nalaz; ne navodi brojeve van spiska i ne izmišljaj članove zakona. Ako izvor ne postoji, ostavi citations prazno i u explanation napiši da nalaz treba proveriti u propisu.",
    "U usedCitations navedi sve brojeve izvora koje si upotrebio; ako nijedan, praznu listu.",
    "U warnings navedi ograničenja pregleda (nečitljiv ili skraćen tekst, nepoznata strana klijenta, prilozi na koje se ugovor poziva a nisu dati).",
  ];
  if (input.focus?.trim()) {
    lines.push(
      `Advokat traži da posebno obratiš pažnju na: ${input.focus.trim()}.`,
    );
  }
  lines.push(
    "Odgovori isključivo JSON objektom, bez dodatnog teksta, tačno u sledećem obliku (ključevi su na engleskom, vrednosti na srpskom latinici):",
    example,
  );
  return lines.join(" ");
}

export interface ContractReviewUserPrompt {
  prompt: string;
  promptChars: number;
  /** The contract text was cut to fit the budget. */
  truncated: boolean;
  /** Characters of contract text included. */
  reviewedChars: number;
}

export function buildContractReviewUserPrompt(input: {
  documentTitle: string;
  text: string;
  groundingContextBlock?: string | null;
  maxChars: number;
}): ContractReviewUserPrompt {
  const grounding = input.groundingContextBlock?.trim()
    ? `\n\n${input.groundingContextBlock.trim()}`
    : "";
  const header = `Ugovor: ${input.documentTitle}\n\nTekst ugovora:\n`;
  const room = Math.max(0, input.maxChars - header.length - grounding.length);
  const text = input.text.trim();
  const truncated = text.length > room;
  const body = truncated ? `${text.slice(0, room)}…` : text;
  const prompt = `${header}${body}${grounding}`;
  return {
    prompt,
    promptChars: prompt.length,
    truncated,
    reviewedChars: truncated ? room : text.length,
  };
}
