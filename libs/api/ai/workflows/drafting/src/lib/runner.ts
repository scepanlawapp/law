import type { ChatModelProvider } from "@law/llm";
import { z } from "zod";
import { draftResultSchema, type DraftResult } from "./schema";
import { DRAFTING_SYSTEM_PROMPT } from "./prompts";

export async function runDraftingLlm(
  provider: ChatModelProvider,
  userPrompt: string,
): Promise<DraftResult> {
  return provider.completeStructured({
    schema: draftResultSchema as z.ZodType<DraftResult>,
    messages: [
      { role: "system", content: DRAFTING_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });
}
