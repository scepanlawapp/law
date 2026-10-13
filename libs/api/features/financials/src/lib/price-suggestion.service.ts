import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  createPriceSuggestionAgent,
  openRouterModel,
  priceSuggestionSchema,
} from "@law/mastra";
import {
  PriceSuggestionResponse,
  PriceSuggestionWorkEvent,
} from "@law/api-interfaces";
import { toLatin } from "@law/transliteration";
import { PriceSuggestionContextBuilder } from "./price-suggestion-context.builder";

// A model can still echo identifiers despite the prompt. Keep them in source metadata only.
function displayPricingText(text: string): string {
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  return toLatin(text)
    .replace(
      new RegExp("\\s*[([]\\s*(?:ID\\s*:\\s*)?" + uuid + "\\s*[)\\]]", "gi"),
      "",
    )
    .replace(new RegExp("(?:ID\\s*:\\s*)?" + uuid, "gi"), "")
    .replace(/[ \t]+([,.;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

@Injectable()
export class PriceSuggestionService {
  constructor(private readonly contextBuilder: PriceSuggestionContextBuilder) {}

  async suggest(
    workEvent: PriceSuggestionWorkEvent,
  ): Promise<PriceSuggestionResponse> {
    const context = await this.contextBuilder.build(workEvent);
    const missing = (reason: string): PriceSuggestionResponse => ({
      suggestedPrice: null,
      currency: context.currency,
      explanation: reason,
      reviewRequired: true,
      confidence: "LOW",
      missingInformation: [reason],
      warnings: context.warnings,
      sources: [],
    });
    if (!context.client)
      return missing("Izaberite klijenta za procenu vrednosti rada.");
    if (!context.orderedSources.length)
      return missing("Nema važećih izvora cena za datum rada.");
    // Reject oversized context instead of silently dropping higher-priority terms.
    const prompt = JSON.stringify(context);
    if (prompt.length > 120000)
      return missing(
        "Izvori cena su preobimni za jednu procenu; suzite relevantne cenovnike.",
      );
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey)
      throw new ServiceUnavailableException(
        "Price suggestion model is not configured",
      );
    const agent = createPriceSuggestionAgent(
      openRouterModel({
        apiKey,
        model:
          process.env.PRICE_SUGGESTION_MODEL ||
          process.env.OPENROUTER_MODEL ||
          "openai/gpt-4o-mini",
        baseUrl: process.env.OPENROUTER_BASE_URL,
      }),
    );
    try {
      const result = await agent.generate([{ role: "user", content: prompt }], {
        structuredOutput: { schema: priceSuggestionSchema },
        modelSettings: { temperature: 0 },
        abortSignal: AbortSignal.timeout(45000),
      });
      if (result.error) throw result.error;
      const parsed = priceSuggestionSchema.parse(result.object);
      const ids = new Set(parsed.sourceIds);
      if (
        [...ids].some(
          (id) => !context.orderedSources.some((source) => source.id === id),
        )
      )
        throw new Error("Unknown pricing source");
      if (parsed.currency !== context.currency)
        return missing(
          "Valuta procene se razlikuje od tražene valute; potreban je potvrđen kurs.",
        );
      if (parsed.suggestedPrice !== null && !ids.size)
        throw new Error("Price without sources");
      if (context.warnings.length && parsed.suggestedPrice !== null)
        return missing(context.warnings[0]);
      return {
        suggestedPrice:
          parsed.suggestedPrice === null
            ? null
            : Math.round((parsed.suggestedPrice + Number.EPSILON) * 100) / 100,
        currency: parsed.currency,
        explanation: displayPricingText(parsed.explanation),
        reviewRequired: true,
        confidence: parsed.suggestedPrice === null ? "LOW" : parsed.confidence,
        missingInformation: (parsed.suggestedPrice === null &&
        !parsed.missingInformation.length
          ? [parsed.explanation]
          : parsed.missingInformation
        ).map(displayPricingText),
        warnings: [
          ...context.warnings,
          ...parsed.warnings.map(displayPricingText),
        ],
        sources: context.orderedSources
          .filter((source) => ids.has(source.id))
          .map(({ id, kind, title, versionId, sourceUrl }) => ({
            id,
            kind,
            title,
            versionId,
            sourceUrl,
          })),
      };
    } catch {
      // Do not log request/source text or model output.
      throw new ServiceUnavailableException(
        "Price suggestion is temporarily unavailable",
      );
    }
  }
}
