import type { GroundingCitation } from "@law/legal-grounding";

export const MAX_CITATIONS_PER_TURN = 12;

/**
 * Keeps `[n]` markers unique and stable across several `search_legal_sources`
 * calls within one agent turn. Created per turn; never shared between turns.
 */
export class CitationRegistry {
  private readonly byChunkId = new Map<string, GroundingCitation>();

  constructor(private readonly limit = MAX_CITATIONS_PER_TURN) {}

  /** Registers a search result (markers restart at 1) and returns it renumbered. */
  add(citations: readonly GroundingCitation[]): GroundingCitation[] {
    const numbered: GroundingCitation[] = [];
    for (const citation of citations) {
      const existing = this.byChunkId.get(citation.chunkId);
      if (existing) {
        numbered.push(existing);
        continue;
      }
      if (this.byChunkId.size >= this.limit) continue;
      const registered = { ...citation, marker: this.byChunkId.size + 1 };
      this.byChunkId.set(citation.chunkId, registered);
      numbered.push(registered);
    }
    return numbered;
  }

  all(): GroundingCitation[] {
    return [...this.byChunkId.values()];
  }
}
