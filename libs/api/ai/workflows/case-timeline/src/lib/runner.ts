import type { ChatModelProvider } from "@law/llm";
import { z } from "zod";
import {
  timelineExtractionSchema,
  timelineSummarySchema,
  type TimelineExtraction,
  type TimelineSummary,
} from "./schema";

export async function runTimelineExtractionLlm(
  provider: ChatModelProvider,
  systemPrompt: string,
  userPrompt: string,
): Promise<TimelineExtraction> {
  return provider.completeStructured({
    schema:
      timelineExtractionSchema as unknown as z.ZodType<TimelineExtraction>,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
}

export async function runTimelineSummaryLlm(
  provider: ChatModelProvider,
  systemPrompt: string,
  userPrompt: string,
): Promise<TimelineSummary> {
  return provider.completeStructured({
    schema: timelineSummarySchema as unknown as z.ZodType<TimelineSummary>,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
}
