import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

@Injectable()
export class LegalDocumentStorage {
  private readonly root =
    process.env["CHAT_UPLOAD_DIR"] ?? "./tmp/chat-uploads";

  async save(
    workspaceId: string,
    documentId: string,
    filename: string,
    buffer: Buffer,
  ): Promise<{ storageKey: string; checksum: string }> {
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `tenants/${workspaceId}/documents/${documentId}/${safeFilename}`;
    const path = join(
      this.root,
      "tenants",
      workspaceId,
      "documents",
      documentId,
      safeFilename,
    );
    await mkdir(
      join(this.root, "tenants", workspaceId, "documents", documentId),
      { recursive: true },
    );
    await writeFile(path, buffer);
    return {
      storageKey,
      checksum: createHash("sha256").update(buffer).digest("hex"),
    };
  }

  async read(
    workspaceId: string,
    documentId: string,
    storageKey: string,
  ): Promise<Buffer> {
    const prefix = `tenants/${workspaceId}/documents/${documentId}/`;
    if (!storageKey.startsWith(prefix))
      throw new Error("Invalid document storage key");
    const baseDirectory = resolve(
      this.root,
      "tenants",
      workspaceId,
      "documents",
      documentId,
    );
    const candidate = resolve(this.root, ...storageKey.split("/"));
    if (candidate !== baseDirectory && !candidate.startsWith(`${baseDirectory}/`)) {
      throw new Error("Invalid document storage path");
    }
    return readFile(candidate);
  }
}
