import { z } from "zod";
import type { ChatModelProvider } from "@law/llm";

export const triageDecisionSchema = z.object({
  decision: z.enum(["LEGAL", "NON_LEGAL", "UNCLEAR"]),
  reason: z.string().min(1).max(500),
});

export type TriageDecisionResult = z.infer<typeof triageDecisionSchema>;

export interface AttachmentSummary {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface TriageInput {
  userText: string;
  attachments?: AttachmentSummary[];
}

export const PORTIR_SYSTEM_PROMPT = [
  "You are Portir, the gatekeeper for the Stojković law firm in Serbia.",
  "Classify whether the user message is a legitimate legal intake request.",
  "Accept Serbian legal matters such as tužba, ugovor, razvod, naknada štete, ZPP/ZOO questions, and client case facts.",
  "Reject weather, coding, trivia, and other non-legal requests.",
  "If the intent is ambiguous, return UNCLEAR.",
  "You only see attachment filenames, MIME types, and sizes — never file contents.",
  'Reply with JSON only: {"decision":"LEGAL|NON_LEGAL|UNCLEAR","reason":"short explanation"}.',
].join(" ");

export function buildTriageUserPrompt(input: TriageInput): string {
  const attachments = input.attachments ?? [];
  const attachmentLines =
    attachments.length === 0
      ? "No attachments."
      : attachments
          .map(
            (file) =>
              `- ${file.originalName} (${file.mimeType}, ${file.sizeBytes} bytes)`,
          )
          .join("\n");

  return `User message:\n${input.userText.trim() || "(empty)"}\n\nAttachments:\n${attachmentLines}`;
}

export async function classifyTriage(
  provider: ChatModelProvider,
  input: TriageInput,
): Promise<TriageDecisionResult> {
  return provider.completeStructured({
    schema: triageDecisionSchema,
    messages: [
      { role: "system", content: PORTIR_SYSTEM_PROMPT },
      { role: "user", content: buildTriageUserPrompt(input) },
    ],
  });
}

export function assistantReplyFor(decision: TriageDecisionResult): string {
  if (decision.decision === "LEGAL") {
    return "Zahtev je prihvaćen kao pravni upit. Queued for brief extraction / Zahtev je stavljen u red za izdvajanje činjenica.";
  }
  if (decision.decision === "UNCLEAR") {
    return "Nisam siguran da li je ovo pravni upit. Možete li ukratko opisati pravni problem (npr. tužba, ugovor, razvod)? / Please describe the legal issue.";
  }
  return "Ovo nije pravni upit za kancelariju Stojković, pa ne mogu da nastavim. / This is not a legal request, so I cannot continue.";
}

export interface PortirGraphResult {
  decision: TriageDecisionResult;
  assistantContent: string;
  queueBriefExtraction: boolean;
}

export async function runPortirGraph(
  provider: ChatModelProvider,
  input: TriageInput,
): Promise<PortirGraphResult> {
  const decision = await classifyTriage(provider, input);
  return {
    decision,
    assistantContent: assistantReplyFor(decision),
    queueBriefExtraction: decision.decision === "LEGAL",
  };
}
