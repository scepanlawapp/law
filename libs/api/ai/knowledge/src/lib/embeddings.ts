export const LEGAL_EMBEDDING_MODEL = "BAAI/bge-m3";
export const LEGAL_EMBEDDING_DIMENSIONS = 1024;

export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  embed(texts: readonly string[]): Promise<readonly number[][]>;
}

export interface LegalSourceMetadata {
  sourceUrl: string;
  canonicalUrl: string;
  title: string;
  publisher: string;
  jurisdiction: string;
  language: "sr";
  sourceScript: "LATIN" | "CYRILLIC" | "MIXED" | "NONE";
  retrievedAt: string;
  contentHash: string;
  versionLabel?: string;
}

export interface LegalChunk {
  ordinal: number;
  text: string;
  articleNumber?: string;
  paragraphNumber?: number;
  pointNumber?: number;
  metadata: LegalSourceMetadata;
}

export function assertEmbeddingDimensions(
  vectors: readonly (readonly number[])[],
  expectedDimensions = LEGAL_EMBEDDING_DIMENSIONS,
): void {
  for (const [index, vector] of vectors.entries()) {
    if (vector.length !== expectedDimensions) {
      throw new Error(
        `Embedding ${index} has ${vector.length} dimensions; expected ${expectedDimensions}`,
      );
    }
  }
}
