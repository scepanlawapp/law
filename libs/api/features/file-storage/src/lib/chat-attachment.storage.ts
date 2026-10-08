import { Injectable } from "@nestjs/common";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Chat attachments stay on this dedicated disk layout. Workspace document
 * storage (`FileService`) is a separate stack and must not relocate
 * these files.
 */
@Injectable()
export class ChatAttachmentStorage {
  private readonly uploadDir =
    process.env.CHAT_UPLOAD_DIR ?? "./tmp/chat-uploads";

  async save(params: {
    workspaceId: string;
    sessionId: string;
    attachmentId: string;
    buffer: Buffer;
  }): Promise<string> {
    const directory = join(
      this.uploadDir,
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
      this.uploadDir,
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
        this.uploadDir,
        params.workspaceId,
        params.sessionId,
        params.storedName,
      );
      return await readFile(legacyPath);
    }
  }
}
