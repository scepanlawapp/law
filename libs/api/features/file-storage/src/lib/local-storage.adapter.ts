import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
} from "node:fs";
import { link, lstat, mkdir, realpath, unlink } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { FileStorageConfig } from "./file-storage.config";
import { StorageError } from "./storage.errors";
import { StorageAdapter, StorageStat, StorageWriteResult } from "./storage.types";
import { assertStorageKey } from "./storage-key";

@Injectable()
export class LocalStorageAdapter implements StorageAdapter {
  readonly providerType = "LOCAL" as const;

  constructor(private readonly config: FileStorageConfig) {}

  async write(
    key: string,
    stream: Readable,
    options: { maxBytes: number; tempSuffix: string },
  ): Promise<StorageWriteResult> {
    const dest = this.resolvePath(key, { allowMissing: true });
    const tempPath = `${dest}.partial-${options.tempSuffix}`;
    await mkdir(dirname(dest), { recursive: true, mode: 0o700 });

    const hash = createHash("sha256");
    let bytes = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > options.maxBytes) {
          callback(
            new StorageError("Attachment exceeds the size limit", "DISK"),
          );
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });

    try {
      await pipeline(stream, limiter, createWriteStream(tempPath, { mode: 0o600 }));
      await this.finalizeExclusive(tempPath, dest);
      return { bytes, sha256: hash.digest("hex") };
    } catch (error) {
      await this.safeUnlink(tempPath);
      if (error instanceof StorageError) throw error;
      throw new StorageError(
        error instanceof Error ? error.message : "Storage write failed",
        "DISK",
      );
    }
  }

  async read(key: string): Promise<Readable> {
    const path = this.resolvePath(key);
    await this.assertRegularFile(path);
    return createReadStream(path);
  }

  async stat(key: string): Promise<StorageStat> {
    const path = this.resolvePath(key);
    const info = await this.assertRegularFile(path);
    return { bytes: info.size };
  }

  async delete(key: string): Promise<void> {
    const path = this.resolvePath(key, { allowMissing: true });
    await this.safeUnlink(path);
  }

  resolvePath(key: string, options?: { allowMissing?: boolean }): string {
    try {
      assertStorageKey(key);
    } catch {
      throw new StorageError("Invalid storage key", "INVALID_KEY");
    }
    if (key.includes("\0") || key.includes("..") || key.startsWith("/")) {
      throw new StorageError("Invalid storage key", "TRAVERSAL");
    }
    const root = this.ensureRoot();
    const resolved = resolve(root, key);
    const relative = resolved.startsWith(root + sep) || resolved === root;
    if (!relative) {
      throw new StorageError("Path escapes storage root", "TRAVERSAL");
    }
    this.assertNoSymlinkEscape(resolved, root, options?.allowMissing ?? false);
    return resolved;
  }

  private ensureRoot(): string {
    const root = this.config.root;
    if (!existsSync(root)) {
      mkdirSync(root, { recursive: true, mode: 0o700 });
    }
    const realRoot = realpathSync(root);
    const info = lstatSync(realRoot);
    if (!info.isDirectory()) {
      throw new StorageError("FILE_STORAGE_ROOT is not a directory", "DISK");
    }
    return realRoot;
  }

  private assertNoSymlinkEscape(
    path: string,
    root: string,
    allowMissing: boolean,
  ): void {
    let current = path;
    while (current !== root && current.startsWith(root)) {
      if (!existsSync(current)) {
        if (allowMissing) {
          current = dirname(current);
          continue;
        }
        current = dirname(current);
        continue;
      }
      const info = lstatSync(current);
      if (info.isSymbolicLink()) {
        const real = realpathSync(current);
        if (!(real === root || real.startsWith(root + sep))) {
          throw new StorageError("Path escapes storage root", "TRAVERSAL");
        }
      }
      current = dirname(current);
    }
  }

  private async assertRegularFile(path: string) {
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink() || !info.isFile()) {
        throw new StorageError("Path escapes storage root", "TRAVERSAL");
      }
      const real = await realpath(path);
      const root = this.ensureRoot();
      if (!(real === root || real.startsWith(root + sep))) {
        throw new StorageError("Path escapes storage root", "TRAVERSAL");
      }
      return info;
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError("File not found", "NOT_FOUND");
    }
  }

  private async finalizeExclusive(tempPath: string, dest: string): Promise<void> {
    try {
      // link(2) fails with EEXIST and does not overwrite. Same-filesystem is required.
      await link(tempPath, dest);
      await unlink(tempPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        await this.safeUnlink(tempPath);
        throw new StorageError(
          "Refusing to overwrite existing content",
          "ALREADY_EXISTS",
        );
      }
      throw error;
    }
  }

  private async safeUnlink(path: string): Promise<void> {
    try {
      await unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        /* ignore cleanup failures */
      }
    }
  }
}
