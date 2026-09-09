import type { BriefResult } from "@law/brief-extraction";

export interface DraftingContextResult {
  prompt: string;
  promptChars: number;
  truncated: boolean;
}

function serializeBrief(brief: BriefResult): string {
  return JSON.stringify(brief, null, 2);
}

export function buildDraftingUserPrompt(
  brief: BriefResult,
  maxChars: number,
): DraftingContextResult {
  const header = "Izvučene činjenice (BriefResult) za nacrt tužbe:";
  let briefJson = serializeBrief(brief);
  let truncated = false;

  let prompt = `${header}\n${briefJson}`;
  if (prompt.length > maxChars) {
    truncated = true;
    const overBy = prompt.length - maxChars;
    briefJson = `${briefJson.slice(0, Math.max(0, briefJson.length - overBy - 1))}…`;
    prompt = `${header}\n${briefJson}`;
  }

  return { prompt, promptChars: prompt.length, truncated };
}
