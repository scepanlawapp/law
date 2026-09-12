import { Injectable } from "@nestjs/common";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { ChatRuntimeConfig } from "./chat.config";

@Injectable()
export class ChatStorageService {
  constructor(private readonly config: ChatRuntimeConfig) {}

  async save(params: {
    workspaceId: string;
    sessionId: string;
    attachmentId: string;
    buffer: Buffer;
  }): Promise<string> {
    const directory = join(
      this.config.uploadDir,
      "tenants",
      params.workspaceId,
      params.sessionId,
    );
    await mkdir(directory, { recursive: true });
    const storedName = params.attachmentId;
    await writeFile(join(directory, storedName), params.buffer);
    return storedName;
  }

  async read(params: {
    workspaceId: string;
    sessionId: string;
    storedName: string;
  }): Promise<Buffer> {
    const tenantPath = join(
      this.config.uploadDir,
      "tenants",
      params.workspaceId,
      params.sessionId,
      params.storedName,
    );
    try {
      await stat(tenantPath);
      return await readFile(tenantPath);
    } catch {
      // Fallback for legacy un-prefixed storage paths
      const legacyPath = join(
        this.config.uploadDir,
        params.workspaceId,
        params.sessionId,
        params.storedName,
      );
      return await readFile(legacyPath);
    }
  }
}
