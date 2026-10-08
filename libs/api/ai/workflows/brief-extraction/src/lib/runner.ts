import type { ChatModelProvider } from "@law/llm";
import { z } from "zod";
import { briefLlmOutputSchema, type BriefLlmOutput, type BriefResult } from "./schema";
import { buildBriefSystemPrompt } from "./prompts";
import { getDocumentType } from "./document-types";
import type { BriefDocumentFact } from "./context";
import { normalizeBriefForType } from "./normalize-brief";
import type { DraftDocumentType } from "@law/api-interfaces";

export async function runBriefExtractionLlm(
  provider: ChatModelProvider,
  userPrompt: string,
  documentType: DraftDocumentType,
  documentFacts: readonly BriefDocumentFact[] = [],
): Promise<BriefResult> {
  const type = getDocumentType(documentType);
  const output = await provider.completeStructured({
    schema: briefLlmOutputSchema as z.ZodType<BriefLlmOutput>,
    messages: [
      { role: "system", content: buildBriefSystemPrompt(type) },
      { role: "user", content: userPrompt },
    ],
  });
  return normalizeBriefForType({ ...output, documentType }, type, {
    facts: documentFacts,
  });
}
