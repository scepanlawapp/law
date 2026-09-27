import { Injectable, Logger } from "@nestjs/common";
import { PlatformPrismaService } from "@law/core";
import { extractAttachmentText } from "@law/extraction";
import { FileService } from "@law/file-storage";
import type { Readable } from "node:stream";

export type DocumentTextStatus =
  | "COMPLETED"
  | "FAILED"
  | "UNSUPPORTED"
  | "UNAVAILABLE";

export interface DocumentText {
  status: DocumentTextStatus;
  /** Serbian Latin; present only when `status` is `COMPLETED`. */
  text: string | null;
}

/**
 * Extracted text of a document version for the assistant. Extraction is lazy:
 * the first read extracts and stores the text; later reads reuse it. Takes the
 * workspace explicitly because it runs inside assistant jobs.
 */
@Injectable()
export class DocumentTextService {
  private readonly logger = new Logger(DocumentTextService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly files: FileService,
  ) {}

  async ensureText(
    workspaceId: string,
    versionId: string,
  ): Promise<DocumentText> {
    const version = await this.prisma.documentVersion.findFirst({
      where: { id: versionId, workspaceId },
      select: {
        id: true,
        storedFileId: true,
        extractionStatus: true,
        extractedText: true,
      },
    });
    if (!version) return { status: "UNAVAILABLE", text: null };
    if (version.extractionStatus === "COMPLETED") {
      return { status: "COMPLETED", text: version.extractedText ?? "" };
    }
    if (version.extractionStatus === "UNSUPPORTED") {
      return { status: "UNSUPPORTED", text: null };
    }

    try {
      const download = await this.files.openDownload({
        workspaceId,
        storedFileId: version.storedFileId,
      });
      const result = await extractAttachmentText({
        mimeType: download.mimeType,
        buffer: await readAll(download.stream),
      });
      await this.prisma.documentVersion.update({
        where: { id: version.id },
        data: {
          extractionStatus: result.status,
          extractedText: result.text ?? null,
          sourceScript: result.sourceScript ?? null,
          extractionError: result.error ?? null,
          extractedAt: new Date(),
        },
      });
      return {
        status: result.status,
        text: result.status === "COMPLETED" ? (result.text ?? "") : null,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Extraction failed";
      this.logger.warn(`Document text extraction failed: ${message}`);
      await this.prisma.documentVersion.update({
        where: { id: version.id },
        data: {
          extractionStatus: "FAILED",
          extractionError: message,
          extractedAt: new Date(),
        },
      });
      return { status: "FAILED", text: null };
    }
  }
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
