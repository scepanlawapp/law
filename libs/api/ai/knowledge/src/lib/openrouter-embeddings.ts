import {
  assertEmbeddingDimensions,
  LEGAL_EMBEDDING_DIMENSIONS,
  LEGAL_EMBEDDING_MODEL,
  EmbeddingProvider,
} from "./embeddings";

export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  readonly model = LEGAL_EMBEDDING_MODEL;
  readonly dimensions = LEGAL_EMBEDDING_DIMENSIONS;

  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl: string;
      model?: string;
    },
  ) {}

  async embed(texts: readonly string[]): Promise<readonly number[][]> {
    if (!texts.length) return [];
    const response = await fetch(
      `${this.options.baseUrl.replace(/\/$/, "")}/embeddings`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.options.model ?? this.model,
          input: texts,
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `OpenRouter embeddings request failed (${response.status}): ${detail.slice(0, 300)}`,
      );
    }

    const payload = (await response.json()) as {
      data?: Array<{ index?: number; embedding?: number[] }>;
    };
    const data = [...(payload.data ?? [])].sort(
      (left, right) => (left.index ?? 0) - (right.index ?? 0),
    );
    const vectors = data.map((item) => item.embedding ?? []);
    if (vectors.length !== texts.length) {
      throw new Error(
        `OpenRouter embeddings returned ${vectors.length} vectors for ${texts.length} inputs`,
      );
    }
    assertEmbeddingDimensions(vectors, this.dimensions);
    return vectors;
  }
}
