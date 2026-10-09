export interface TextChunk {
  ordinal: number;
  text: string;
  charStart: number;
  charEnd: number;
}

export interface ChunkOptions {
  /** Maximum chunk length in characters. */
  size?: number;
  /** Characters repeated between consecutive chunks. */
  overlap?: number;
}

const DEFAULT_SIZE = 1500;
const DEFAULT_OVERLAP = 200;
const PARAGRAPH_BREAK = "\n\n";
const MAX_BREAK_LOOKBACK = 300;

/**
 * Splits text into overlapping chunks of at most `size` characters. A chunk
 * ends on a paragraph break ("\n\n") when one lies in the last part of its
 * window; otherwise it is cut at the window edge.
 */
export function chunkText(
  text: string,
  options: ChunkOptions = {},
): TextChunk[] {
  if (text.length === 0) {
    return [];
  }
  const size = Math.max(1, Math.floor(options.size ?? DEFAULT_SIZE));
  const overlap = Math.min(
    Math.max(0, Math.floor(options.overlap ?? DEFAULT_OVERLAP)),
    size - 1,
  );
  const lookback = Math.min(MAX_BREAK_LOOKBACK, Math.floor(size / 3));

  const chunks: TextChunk[] = [];
  let start = 0;
  while (true) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const breakAt = text.lastIndexOf(
        PARAGRAPH_BREAK,
        end - PARAGRAPH_BREAK.length,
      );
      const candidate = breakAt + PARAGRAPH_BREAK.length;
      if (
        breakAt >= 0 &&
        candidate >= end - lookback &&
        candidate - start > overlap
      ) {
        end = candidate;
      }
    }
    chunks.push({
      ordinal: chunks.length,
      text: text.slice(start, end),
      charStart: start,
      charEnd: end,
    });
    if (end >= text.length) {
      break;
    }
    start = end - overlap;
  }
  return chunks;
}
