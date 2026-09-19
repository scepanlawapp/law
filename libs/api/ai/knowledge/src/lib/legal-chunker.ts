import { detectScript, toLatin } from "@law/transliteration";
import type { LegalChunk, LegalSourceMetadata } from "./embeddings";

const DEFAULT_MAX_CHARS = 3500;
const ARTICLE_PATTERN = /^\s*Član\s+([0-9]+[a-z]?)\.?\s*$/i;
const PARAGRAPH_PATTERN = /^\s*\(([0-9]+)\)\s*/;
const POINT_PATTERN = /^\s*([0-9]+)\.\s+/;

export interface LegalChunkingOptions {
  maxChars?: number;
}

interface PendingChunk {
  text: string;
  articleNumber?: string;
  paragraphNumber?: number;
  pointNumber?: number;
}

export function chunkLegalText(
  rawText: string,
  metadata: Omit<LegalSourceMetadata, "sourceScript"> & {
    sourceScript?: LegalSourceMetadata["sourceScript"];
  },
  options: LegalChunkingOptions = {},
): LegalChunk[] {
  const normalizedText = toLatin(rawText).replace(/\r\n?/g, "\n").trim();
  const sourceScript = metadata.sourceScript ?? detectScript(rawText);
  const sourceMetadata: LegalSourceMetadata = { ...metadata, sourceScript };
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  if (!normalizedText) return [];

  const chunks: PendingChunk[] = [];
  let current: PendingChunk | null = null;
  let articleNumber: string | undefined;
  let paragraphNumber: number | undefined;
  let pointNumber: number | undefined;

  const flush = (): void => {
    if (!current || !current.text.trim()) return;
    chunks.push({ ...current, text: current.text.trim() });
    current = null;
  };

  for (const rawLine of normalizedText.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const articleMatch = line.match(ARTICLE_PATTERN);
    if (articleMatch) {
      flush();
      articleNumber = articleMatch[1];
      paragraphNumber = undefined;
      pointNumber = undefined;
      continue;
    }

    const paragraphMatch = line.match(PARAGRAPH_PATTERN);
    if (paragraphMatch) {
      flush();
      paragraphNumber = Number(paragraphMatch[1]);
      pointNumber = undefined;
    }

    const pointMatch = line.match(POINT_PATTERN);
    if (pointMatch) pointNumber = Number(pointMatch[1]);

    const nextText = current ? `${current.text}\n${line}` : line;
    if (current && nextText.length > maxChars) {
      flush();
    }
    if (current) {
      current.text = `${current.text}\n${line}`;
    } else {
      current = { text: line, articleNumber, paragraphNumber, pointNumber };
    }
  }
  flush();

  return chunks.map((chunk, ordinal) => ({
    ...chunk,
    ordinal,
    metadata: sourceMetadata,
  }));
}
