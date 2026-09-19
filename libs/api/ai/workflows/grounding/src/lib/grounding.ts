export interface GroundingSearchHitSource {
  title: string;
  publisher: string;
  sourceUrl: string;
  jurisdiction: string;
}

export interface GroundingSearchHit {
  id: string;
  text: string;
  score: number;
  source: GroundingSearchHitSource;
  articleNumber: string | null;
  paragraphNumber: number | null;
  pointNumber: number | null;
}

export interface GroundingCitation {
  marker: number;
  chunkId: string;
  articleNumber: string | null;
  sourceTitle: string;
  sourceUrl: string;
  snippet: string;
  score: number;
}

export type GroundingSearch = (
  query: string,
  limit: number,
) => Promise<readonly GroundingSearchHit[]>;

export interface RetrieveGroundingOptions {
  /** Chunks fetched per individual query, before dedupe/threshold/cap. */
  perQueryLimit?: number;
  /** Final citation count returned after dedupe/threshold/sort. */
  totalLimit?: number;
  /** Minimum cosine similarity a chunk must clear to be considered relevant. */
  minScore?: number;
  /** Max characters kept in the persisted/prompted snippet. */
  snippetMaxChars?: number;
}

const DEFAULT_PER_QUERY_LIMIT = 4;
const DEFAULT_TOTAL_LIMIT = 8;
const DEFAULT_MIN_SCORE = 0.55;
const DEFAULT_SNIPPET_MAX_CHARS = 320;
const MIN_QUERY_LENGTH = 3;

export async function retrieveGroundingCitations(
  search: GroundingSearch,
  queries: readonly string[],
  options: RetrieveGroundingOptions = {},
): Promise<GroundingCitation[]> {
  const perQueryLimit = options.perQueryLimit ?? DEFAULT_PER_QUERY_LIMIT;
  const totalLimit = options.totalLimit ?? DEFAULT_TOTAL_LIMIT;
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const snippetMaxChars = options.snippetMaxChars ?? DEFAULT_SNIPPET_MAX_CHARS;

  const bestById = new Map<string, GroundingSearchHit>();
  for (const rawQuery of queries) {
    const query = rawQuery.trim();
    if (query.length < MIN_QUERY_LENGTH) continue;
    const hits = await search(query, perQueryLimit);
    for (const hit of hits) {
      if (hit.score < minScore) continue;
      const existing = bestById.get(hit.id);
      if (!existing || hit.score > existing.score) bestById.set(hit.id, hit);
    }
  }

  return [...bestById.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, totalLimit)
    .map((hit, index) => ({
      marker: index + 1,
      chunkId: hit.id,
      articleNumber: hit.articleNumber,
      sourceTitle: hit.source.title,
      sourceUrl: hit.source.sourceUrl,
      snippet: truncateSnippet(hit.text, snippetMaxChars),
      score: hit.score,
    }));
}

export function formatGroundingContextBlock(
  citations: readonly GroundingCitation[],
): string {
  if (!citations.length) return "";
  const lines = citations.map((citation) => {
    const articleLabel = citation.articleNumber
      ? `Član ${citation.articleNumber}`
      : "Opšta odredba";
    return `[${citation.marker}] ${articleLabel} (${citation.sourceTitle}) — "${citation.snippet}"`;
  });
  return [
    "Dostupni izvori iz pravne baze znanja (citiraj isključivo ove izvore brojem u uglastim zagradama, npr. [1], samo kada direktno podržavaju rečenicu; nikada ne izmišljaj članove van ove liste):",
    ...lines,
  ].join("\n");
}

export function filterUsedCitations(
  citations: readonly GroundingCitation[],
  usedMarkers: readonly number[],
): GroundingCitation[] {
  const used = new Set(usedMarkers);
  return citations.filter((citation) => used.has(citation.marker));
}

const USED_MARKER_PATTERN = /\[(\d{1,2})]/g;

export function extractUsedMarkerNumbers(text: string): number[] {
  const found = new Set<number>();
  for (const match of text.matchAll(USED_MARKER_PATTERN)) {
    found.add(Number(match[1]));
  }
  return [...found];
}

function truncateSnippet(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > maxChars
    ? `${normalized.slice(0, maxChars - 1)}…`
    : normalized;
}
