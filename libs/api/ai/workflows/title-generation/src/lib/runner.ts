import type { ChatModelProvider } from "@law/llm";
import { z } from "zod";
import { titleSchema, type ChatSessionTitle } from "./schema";
import { TITLE_SYSTEM_PROMPT } from "./prompts";

export async function generateTitle(
  provider: ChatModelProvider,
  userPrompt: string,
): Promise<ChatSessionTitle> {
  return provider.completeStructured({
    schema: titleSchema as z.ZodType<ChatSessionTitle>,
    messages: [
      { role: "system", content: TITLE_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });
}