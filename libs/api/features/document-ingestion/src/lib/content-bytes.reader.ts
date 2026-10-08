import { Injectable } from "@nestjs/common";
import { PlatformPrismaService } from "@law/core";
import { ChatAttachmentStorage, FileService } from "@law/file-storage";
import type { Readable } from "node:stream";

/**
 * Resolves the raw bytes behind a `DocumentContent` row. Content is keyed by
 * hash, so any document version or chat attachment pointing at it holds
 * identical bytes; the first one found is read. Always scoped to the workspace.
 */
@Injectable()
export class ContentBytesReader {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly files: FileService,
    private readonly chatStorage: ChatAttachmentStorage,
  ) {}

  async read(
    workspaceId: string,
    contentId: string,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const version = await this.prisma.documentVersion.findFirst({
      where: { contentId, workspaceId },
      select: { storedFileId: true },
      orderBy: { createdAt: "desc" },
    });
    if (version) {
      const download = await this.files.openDownload({
        workspaceId,
        storedFileId: version.storedFileId,
      });
      return {
        buffer: await readAll(download.stream),
        mimeType: download.mimeType,
      };
    }

    const attachment = await this.prisma.chatAttachment.findFirst({
      where: { contentId, workspaceId },
      select: { sessionId: true, storedName: true, mimeType: true },
      orderBy: { createdAt: "desc" },
    });
    if (attachment) {
      const buffer = await this.chatStorage.read({
        workspaceId,
        sessionId: attachment.sessionId,
        storedName: attachment.storedName,
      });
      return { buffer, mimeType: attachment.mimeType };
    }
    return null;
  }
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
