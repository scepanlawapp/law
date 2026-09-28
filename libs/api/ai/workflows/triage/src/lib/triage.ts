import { z } from "zod";
import type { ChatModelMessage, ChatModelProvider } from "@law/llm";

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

export interface TriageHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TriageInput {
  userText: string;
  attachments?: AttachmentSummary[];
  /** Recent conversation before `userText`, oldest first. */
  history?: TriageHistoryMessage[];
  /** The assistant can also act on the office's matters (agent engine). */
  practiceActions?: boolean;
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

export const PORTIR_FOLLOW_UP_RULE = [
  "The previous conversation is included for context.",
  "If the new message continues an earlier legal conversation (a follow-up, clarification, or request to rephrase, shorten, or expand an earlier answer), classify it as LEGAL even when it is short or does not repeat legal terms.",
  "Detect the language from the new message only.",
].join(" ");

export const PORTIR_PRACTICE_RULE = [
  "The assistant can also help manage the office's matters.",
  "Requests to look up a case, link the conversation to a case, set or record a deadline (rok), schedule work, or create tasks for a matter are LEGAL with intent ANSWER, even without legal terms.",
  "Questions about the user's or the office's tasks (zadaci), deadlines (rokovi), events or hearings (ročišta), agenda or schedule, cases (predmeti), clients, documents, or recent activity are also LEGAL with intent ANSWER, even when short, such as 'moji zadaci' or 'rokovi ove nedelje'.",
].join(" ");

const HISTORY_ENTRY_MAX_CHARS = 600;

export function buildTriageMessages(input: TriageInput): ChatModelMessage[] {
  const hasHistory = (input.history?.length ?? 0) > 0;
  return [
    {
      role: "system",
      content: [
        PORTIR_SYSTEM_PROMPT,
        hasHistory ? PORTIR_FOLLOW_UP_RULE : null,
        input.practiceActions ? PORTIR_PRACTICE_RULE : null,
      ]
        .filter(Boolean)
        .join(" "),
    },
    { role: "user", content: buildTriageUserPrompt(input) },
  ];
}

function historyBlock(history: readonly TriageHistoryMessage[]): string {
  return history
    .map((message) => {
      const text = message.content.trim().replace(/\s+/g, " ");
      const clipped =
        text.length > HISTORY_ENTRY_MAX_CHARS
          ? `${text.slice(0, HISTORY_ENTRY_MAX_CHARS)}…`
          : text;
      return `${message.role === "user" ? "User" : "Assistant"}: ${clipped}`;
    })
    .join("\n");
}

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

  const current = `User message:\n${input.userText.trim() || "(empty)"}\n\nAttachments:\n${attachmentLines}`;
  return input.history?.length
    ? `Previous conversation (oldest first):\n${historyBlock(input.history)}\n\n${current}`
    : current;
}

export async function classifyTriage(
  provider: ChatModelProvider,
  input: TriageInput,
): Promise<TriageDecisionResult> {
  return provider.completeStructured({
    schema: triageDecisionSchema as z.ZodType<TriageDecisionResult>,
    messages: buildTriageMessages(input),
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
  /** Reply shown when the request is not accepted. */
  assistantContent: string;
  /** Legal requests go to the assistant agent; the intent is only a hint. */
  accepted: boolean;
}

export async function runPortirGraph(
  provider: ChatModelProvider,
  input: TriageInput,
): Promise<PortirGraphResult> {
  const decision = await classifyTriage(provider, input);
  return {
    decision,
    assistantContent: assistantReplyFor(decision),
    accepted: decision.decision === "LEGAL",
  };
}
