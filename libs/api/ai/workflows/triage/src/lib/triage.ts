import { z } from "zod";
import type { ChatModelProvider } from "@law/llm";

export const triageDecisionSchema = z.object({
  decision: z.enum(["LEGAL", "NON_LEGAL", "UNCLEAR"]),
  reason: z.string().min(1).max(500),
  intent: z.enum(["ANSWER", "DRAFT"]).default("DRAFT"),
  language: z.enum(["sr", "en"]).default("sr"),
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
  "For a legal question that asks for guidance or explanation, use intent ANSWER.",
  "For a request to prepare a lawsuit or other document, use intent DRAFT.",
  "Set language to sr for Serbian input and en for English input.",
  "You only see attachment filenames, MIME types, and sizes — never file contents.",
  'Reply with JSON only: {"decision":"LEGAL|NON_LEGAL|UNCLEAR","reason":"short explanation","intent":"ANSWER|DRAFT","language":"sr|en"}.',
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
    schema: triageDecisionSchema as z.ZodType<TriageDecisionResult>,
    messages: [
      { role: "system", content: PORTIR_SYSTEM_PROMPT },
      { role: "user", content: buildTriageUserPrompt(input) },
    ],
  });
}

export function assistantReplyFor(decision: TriageDecisionResult): string {
  if (decision.decision === "LEGAL") {
    return decision.language === "en"
      ? "Your legal request was accepted and is being processed."
      : "Pravni zahtev je prihvaćen i obrađuje se.";
  }
  if (decision.decision === "UNCLEAR") {
    return decision.language === "en"
      ? "Please describe the legal issue more specifically, for example whether it concerns a lawsuit, contract, or divorce."
      : "Molimo vas da preciznije opišete pravni problem, na primer da li se odnosi na tužbu, ugovor ili razvod.";
  }
  return decision.language === "en"
    ? "This is not a legal request, so I cannot continue."
    : "Ovo nije pravni zahtev, pa ne mogu da nastavim.";
}

export interface PortirGraphResult {
  decision: TriageDecisionResult;
  assistantContent: string;
  queueBriefExtraction: boolean;
  queueAnswer: boolean;
}

export async function runPortirGraph(
  provider: ChatModelProvider,
  input: TriageInput,
): Promise<PortirGraphResult> {
  const decision = await classifyTriage(provider, input);
  return {
    decision,
    assistantContent: assistantReplyFor(decision),
    queueBriefExtraction:
      decision.decision === "LEGAL" && decision.intent === "DRAFT",
    queueAnswer: decision.decision === "LEGAL" && decision.intent === "ANSWER",
  };
}
