import {
  LEGAL_EMBEDDING_DIMENSIONS,
  LEGAL_EMBEDDING_MODEL,
} from "@law/knowledge";

export const SNAPSHOT_FORMAT = "law-legal-corpus";
export const SNAPSHOT_FORMAT_VERSION = 1;

export interface SnapshotHeader {
  type: "header";
  format: typeof SNAPSHOT_FORMAT;
  formatVersion: number;
  embeddingModel: string;
  embeddingDimensions: number;
  latestMigration: string | null;
  exportedAt: string;
  sources: number;
  versions: number;
  chunks: number;
}

export interface SnapshotSource {
  type: "source";
  id: string;
  slug: string;
  title: string;
  publisher: string;
  sourceUrl: string;
  canonicalUrl: string;
  jurisdiction: string;
  language: string;
  visibility: string;
}

export interface SnapshotVersion {
  type: "version";
  id: string;
  contentHash: string;
  versionLabel: string | null;
  sourceScript: string;
  retrievedAt: string;
  parserVersion: string;
  embeddingModel: string;
  embeddingDimensions: number;
  chunks: number;
}

export interface SnapshotChunk {
  type: "chunk";
  id: string;
  ordinal: number;
  text: string;
  articleNumber: string | null;
  paragraphNumber: number | null;
  pointNumber: number | null;
  /** pgvector text form, e.g. "[0.1,0.2,...]". */
  embedding: string | null;
}

export type SnapshotLine =
  | SnapshotHeader
  | SnapshotSource
  | SnapshotVersion
  | SnapshotChunk;

/** Returns a reason the header can't be imported here, or null. */
export function incompatibility(header: SnapshotHeader): string | null {
  if (header.format !== SNAPSHOT_FORMAT)
    return `not a legal corpus snapshot (format "${header.format}")`;
  if (header.formatVersion !== SNAPSHOT_FORMAT_VERSION)
    return `snapshot format version ${header.formatVersion}, expected ${SNAPSHOT_FORMAT_VERSION}`;
  if (header.embeddingModel !== LEGAL_EMBEDDING_MODEL)
    return `embedding model ${header.embeddingModel}, expected ${LEGAL_EMBEDDING_MODEL}`;
  if (header.embeddingDimensions !== LEGAL_EMBEDDING_DIMENSIONS)
    return `embedding dimensions ${header.embeddingDimensions}, expected ${LEGAL_EMBEDDING_DIMENSIONS}`;
  return null;
}
