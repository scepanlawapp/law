import type { DocumentKind } from "@law/api-interfaces";
import type { ChatModelProvider } from "@law/llm";
import { z } from "zod";
import type { FactKind } from "./kinds";
import { normalizeFacts, type ExtractedFact, type RawFact } from "./normalize";
import {
  buildClassificationSystemPrompt,
  buildClassificationUserPrompt,
  buildFactExtractionSystemPrompt,
  buildFactExtractionUserPrompt,
} from "./prompts";
import {
  classificationSchema,
  factExtractionSchema,
  type Classification,
  type FactExtraction,
} from "./schema";

/**
 * Classifies a document from its first 4,000 characters; an answer below
 * `minConfidence` is reported as OTHER (with the model's confidence).
 */
export async function classifyDocument(
  provider: ChatModelProvider,
  text: string,
  minConfidence: number,
): Promise<{ kind: DocumentKind; confidence: number }> {
  const result = await provider.completeStructured({
    schema: classificationSchema as unknown as z.ZodType<Classification>,
    messages: [
      { role: "system", content: buildClassificationSystemPrompt() },
      { role: "user", content: buildClassificationUserPrompt(text) },
    ],
  });
  const confidence = Number.isFinite(result.confidence)
    ? Math.min(1, Math.max(0, result.confidence))
    : 0;
  return {
    kind: confidence < minConfidence ? "OTHER" : result.kind,
    confidence,
  };
}

/** One structured call, then only the facts whose quotes are in the text. */
export async function extractFacts(
  provider: ChatModelProvider,
  kind: FactKind,
  text: string,
): Promise<ExtractedFact[]> {
  const result = await provider.completeStructured({
    schema: factExtractionSchema as unknown as z.ZodType<FactExtraction>,
    messages: [
      { role: "system", content: buildFactExtractionSystemPrompt(kind) },
      { role: "user", content: buildFactExtractionUserPrompt(text) },
    ],
  });
  const raw: RawFact[] = result.subjects.flatMap((subject) =>
    subject.facts.map((fact) => ({
      subjectKey: subject.subjectKey,
      subjectType: subject.subjectType,
      subjectRole: subject.subjectRole,
      ...fact,
    })),
  );
  return normalizeFacts(raw, text, kind);
}
