import { getDocumentType } from "@law/brief-extraction";
import type { DraftDocumentType } from "@law/api-interfaces";
import type { ChatModelProvider } from "@law/llm";
import { z } from "zod";
import { draftResultSchema, type DraftResult } from "./schema";
import { buildDraftingSystemPrompt } from "./prompts";

export async function runDraftingLlm(
  provider: ChatModelProvider,
  userPrompt: string,
  documentType: DraftDocumentType,
): Promise<DraftResult> {
  return provider.completeStructured({
    schema: draftResultSchema as z.ZodType<DraftResult>,
    messages: [
      {
        role: "system",
        content: buildDraftingSystemPrompt(getDocumentType(documentType)),
      },
      { role: "user", content: userPrompt },
    ],
  });
}
