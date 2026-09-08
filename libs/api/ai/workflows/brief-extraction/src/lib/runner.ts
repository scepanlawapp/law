import type { ChatModelProvider } from "@law/llm";
import { z } from "zod";
import { briefResultSchema, type BriefResult } from "./schema";
import { BRIEF_SYSTEM_PROMPT } from "./prompts";

export async function runBriefExtractionLlm(
  provider: ChatModelProvider,
  userPrompt: string,
): Promise<BriefResult> {
  return provider.completeStructured({
    schema: briefResultSchema as z.ZodType<BriefResult>,
    messages: [
      { role: "system", content: BRIEF_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });
}
