import type { BriefResult } from "@law/brief-extraction";

export interface DraftingContextResult {
  prompt: string;
  promptChars: number;
  truncated: boolean;
}

export interface DraftingFeedback {
  previousDraft?: string;
  reviewerNote?: string;
}

function serializeBrief(brief: BriefResult): string {
  return JSON.stringify(brief, null, 2);
}

export function buildDraftingUserPrompt(
  brief: BriefResult,
  maxChars: number,
  feedback?: DraftingFeedback,
): DraftingContextResult {
  const header = "Izvučene činjenice (BriefResult) za nacrt tužbe:";
  let briefJson = serializeBrief(brief);
  let truncated = false;

  const previousDraft = feedback?.previousDraft;
  const reviewerNote = feedback?.reviewerNote;
  const feedbackSection =
    previousDraft || reviewerNote
      ? `\n\nPovratne informacije za izmenu prethodnog nacrta:\n${
          previousDraft ? `Prethodni nacrt:\n${previousDraft}\n` : ""
        }${reviewerNote ? `Napomena recenzenta:\n${reviewerNote}` : ""}`
      : "";
  let prompt = `${header}\n${briefJson}${feedbackSection}`;
  if (prompt.length > maxChars) {
    truncated = true;
    const overBy = prompt.length - maxChars;
    briefJson = `${briefJson.slice(0, Math.max(0, briefJson.length - overBy - 1))}…`;
    prompt = `${header}\n${briefJson}${feedbackSection}`;
  }

  return { prompt, promptChars: prompt.length, truncated };
}
