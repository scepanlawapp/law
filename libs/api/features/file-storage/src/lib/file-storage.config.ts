import { Injectable } from "@nestjs/common";
import { mkdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export function resolveFileStorageRoot(
  value: string | undefined,
  nodeEnv = process.env.NODE_ENV ?? "development",
): string {
  const trimmed = value?.trim();
  if (trimmed) {
    if (!isAbsolute(trimmed)) {
      throw new Error("FILE_STORAGE_ROOT must be an absolute directory path");
    }
    return trimmed;
  }
  if (nodeEnv === "production") {
    throw new Error("FILE_STORAGE_ROOT is required in production");
  }
  return resolve(process.cwd(), "tmp/file-storage");
}

@Injectable()
export class FileStorageConfig {
  readonly root: string;
  readonly maxBytes: number;
  readonly staleHeartbeatMs: number;

  constructor() {
    this.root = resolveFileStorageRoot(process.env.FILE_STORAGE_ROOT);
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    this.maxBytes = Number(process.env.UPLOAD_MAX_BYTES ?? 25_000_000);
    this.staleHeartbeatMs = Number(
      process.env.FILE_STORAGE_STALE_HEARTBEAT_MS ?? 15 * 60 * 1000,
    );
  }
}

export function createFileStorageConfig(overrides: {
  root: string;
  maxBytes?: number;
  staleHeartbeatMs?: number;
}): FileStorageConfig {
  mkdirSync(overrides.root, { recursive: true, mode: 0o700 });
  return {
    root: overrides.root,
    maxBytes: overrides.maxBytes ?? Number(process.env.UPLOAD_MAX_BYTES ?? 25_000_000),
    staleHeartbeatMs:
      overrides.staleHeartbeatMs ??
      Number(process.env.FILE_STORAGE_STALE_HEARTBEAT_MS ?? 15 * 60 * 1000),
  } as FileStorageConfig;
}
