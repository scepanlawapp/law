import { Injectable } from "@nestjs/common";
import { PlatformPrismaService } from "@law/core";
import { extractAttachmentText } from "@law/extraction";
import type { DocumentContentStatus } from "@prisma/client";
import { ContentBytesReader } from "./content-bytes.reader";
import { DocumentIngestionQueue } from "./document-ingestion.queue";
import {
  ContentText,
  CURRENT_PIPELINE_VERSION,
} from "./document-ingestion.types";

/**
 * Content rows are keyed by (workspaceId, sha256): identical bytes within a
 * workspace share one row, one text, one set of chunks and facts. Content is
 * never shared across workspaces, and every query filters by workspaceId.
 */
@Injectable()
export class DocumentContentService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly queue: DocumentIngestionQueue,
    private readonly bytes: ContentBytesReader,
  ) {}

  async findOrCreate(input: {
    workspaceId: string;
    sha256: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<{
    id: string;
    status: DocumentContentStatus;
    pipelineVersion: number;
  }> {
    const { workspaceId, sha256, mimeType, sizeBytes } = input;
    const row = await this.prisma.documentContent.upsert({
      where: { workspaceId_sha256: { workspaceId, sha256 } },
      update: {},
      create: { workspaceId, sha256, mimeType, sizeBytes },
      select: { id: true, status: true, pipelineVersion: true },
    });
    return row;
  }

  /** Enqueue ingestion unless the content is already READY on this pipeline version. */
  async requestIngestion(
    workspaceId: string,
    contentId: string,
  ): Promise<void> {
    const content = await this.prisma.documentContent.findFirst({
      where: { id: contentId, workspaceId },
      select: { status: true, pipelineVersion: true },
    });
    if (!content) return;
    if (
      content.status === "READY" &&
      content.pipelineVersion >= CURRENT_PIPELINE_VERSION
    ) {
      return;
    }
    await this.queue.enqueue(workspaceId, contentId);
  }

  /**
   * Stored text of the content. When missing, extracts synchronously from the
   * bytes and stores the text; the rest of the pipeline status is left to the
   * ingestion processor.
   */
  async ensureText(
    workspaceId: string,
    contentId: string,
  ): Promise<ContentText> {
    const content = await this.prisma.documentContent.findFirst({
      where: { id: contentId, workspaceId },
      select: { id: true, status: true, extractedText: true },
    });
    if (!content) return { status: "UNAVAILABLE", text: null };
    if (content.extractedText !== null) {
      return { status: "COMPLETED", text: content.extractedText };
    }
    if (content.status === "UNSUPPORTED") {
      return { status: "UNSUPPORTED", text: null };
    }

    const source = await this.bytes.read(workspaceId, contentId);
    if (!source) return { status: "UNAVAILABLE", text: null };

    const result = await extractAttachmentText({
      mimeType: source.mimeType,
      buffer: source.buffer,
    });

    if (result.status === "COMPLETED") {
      const text = result.text ?? "";
      await this.prisma.documentContent.update({
        where: { id: content.id },
        data: {
          extractedText: text,
          sourceScript: result.sourceScript ?? null,
        },
      });
      return { status: "COMPLETED", text };
    }
    if (result.status === "UNSUPPORTED") {
      await this.prisma.documentContent.update({
        where: { id: content.id },
        data: { status: "UNSUPPORTED", error: result.error ?? null },
      });
      return { status: "UNSUPPORTED", text: null };
    }
    await this.prisma.documentContent.update({
      where: { id: content.id },
      data: { error: result.error ?? null },
    });
    return { status: "FAILED", text: null };
  }
}
