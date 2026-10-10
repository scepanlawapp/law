import { Inject, Injectable, Optional } from "@nestjs/common";
import type {
  PricingSuggestionResponse,
  PricingSuggestionAlternative,
} from "@law/api-interfaces";
import type { ChatModelProvider } from "@law/llm";
import { MastraChatModelProvider, openRouterModel } from "@law/mastra";
import { PricingContextResolver } from "./pricing-context.resolver";
import { interpretPricing } from "./pricing-interpreter";
import { calculatePricingCandidate } from "./pricing-calculation";
import type { PricingSuggestionDto } from "./pricing-suggestion.dto";

export const PRICING_SUGGESTION_MODEL_PROVIDER = Symbol(
  "PRICING_SUGGESTION_MODEL_PROVIDER",
);

@Injectable()
export class PricingSuggestionService {
  constructor(
    private readonly resolver: PricingContextResolver,
    @Optional()
    @Inject(PRICING_SUGGESTION_MODEL_PROVIDER)
    private readonly injectedProvider?: ChatModelProvider,
  ) {}

  async suggest(
    input: PricingSuggestionDto,
  ): Promise<PricingSuggestionResponse> {
    const context = await this.resolver.resolve(input);
    const response: PricingSuggestionResponse = {
      status: "NEEDS_REVIEW",
      suggestedPrice: null,
      currency: null,
      explanation: "Cena nije pouzdano odredjena.",
      reviewRequired: true,
      confidence: "UNDETERMINED",
      calculation: null,
      sources: [],
      missingInformation: [],
      warnings: context.warnings,
      alternatives: [],
    };
    if (!context.sources.length) {
      response.explanation = "Nema dostupnih izvora za cenu ovog rada.";
      response.warnings.push("NO_PRICING_SOURCES");
      return response;
    }
    if (!this.injectedProvider && !process.env.OPENROUTER_API_KEY) {
      response.warnings.push("PRICING_MODEL_UNAVAILABLE");
      return response;
    }
    const provider =
      this.injectedProvider ??
      new MastraChatModelProvider(
        openRouterModel({
          apiKey: process.env.OPENROUTER_API_KEY as string,
          baseUrl:
            process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
          model: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
        }),
        { disableLogging: true },
      );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    try {
      const result = await Promise.race([
        interpretPricing(provider, context, controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("PRICING_TIMEOUT"));
          }, 20000);
        }),
      ]);
      response.status = result.status;
      response.explanation = result.explanation;
      response.missingInformation = result.missingInformation.map((fact) => ({
        key: fact.key,
        label: fact.label,
        reason: fact.reason,
        type: fact.type,
      }));
      const candidates: PricingSuggestionAlternative[] = [];
      for (const candidate of result.candidates) {
        try {
          candidates.push(calculatePricingCandidate(candidate, context));
        } catch (error) {
          response.warnings.push(
            error instanceof Error ? error.message : "INVALID_CALCULATION",
          );
        }
      }
      response.alternatives = candidates;
      response.sources = [
        ...new Map(
          candidates
            .flatMap((candidate) => candidate.sources)
            .map((source) => [`${source.id}:${source.excerpt}`, source]),
        ).values(),
      ];
      const amounts = new Set(
        candidates.map(
          (candidate) => `${candidate.currency}:${candidate.suggestedPrice}`,
        ),
      );
      const incompleteContext = response.warnings.some((warning) =>
        [
          "MULTIPLE_APPLICABLE_SOURCE_VERSIONS",
          "PRICE_SOURCE_CONTEXT_LIMIT",
          "PRICING_CONTEXT_TRUNCATED",
        ].includes(warning),
      );
      if (
        result.status === "SUGGESTED" &&
        !result.missingInformation.length &&
        !incompleteContext &&
        amounts.size === 1 &&
        candidates.length === result.candidates.length
      ) {
        response.status = "SUGGESTED";
        response.suggestedPrice = candidates[0].suggestedPrice;
        response.currency = candidates[0].currency;
        response.calculation = candidates[0].calculation;
        response.confidence = "EVIDENCE_BACKED_SUGGESTION";
      } else if (amounts.size > 1) {
        response.status = "NEEDS_REVIEW";
        response.warnings.push("SOURCE_PRIORITY_UNDEFINED");
      } else if (result.missingInformation.length)
        response.status = "NEEDS_INFORMATION";
      else if (
        !candidates.length &&
        result.candidates.length &&
        result.candidates.every(
          (candidate) => candidate.formula === "UNSUPPORTED",
        )
      )
        response.status = "UNSUPPORTED";
      else if (result.status === "SUGGESTED") response.status = "NEEDS_REVIEW";
      return response;
    } catch {
      response.warnings.push("PRICING_INTERPRETATION_FAILED_OR_TIMEOUT");
      return response;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
