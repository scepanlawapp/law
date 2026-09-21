import { Readable } from "node:stream";

export const LOCAL_DEFAULT_CONFIG_REF = "local-default";

export interface StorageWriteResult {
  bytes: number;
  sha256: string;
}

export interface StorageStat {
  bytes: number;
}

export interface StorageAdapter {
  readonly providerType: "LOCAL";
  write(
    key: string,
    stream: Readable,
    options: { maxBytes: number; tempSuffix: string },
  ): Promise<StorageWriteResult>;
  read(key: string): Promise<Readable>;
  stat(key: string): Promise<StorageStat>;
  delete(key: string): Promise<void>;
}

export interface PersistedStorageConnection {
  id: string;
  workspaceId: string;
  providerType: "LOCAL";
  enabled: boolean;
  isDefault: boolean;
  configRef: string;
}

export const DOCUMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export type DocumentAllowedMimeType =
  (typeof DOCUMENT_ALLOWED_MIME_TYPES)[number];
