import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { ChatAttachmentStorage } from "../libs/api/features/file-storage/src/lib/chat-attachment.storage";
import { resolveFileStorageRoot } from "../libs/api/features/file-storage/src/lib/file-storage.config";
import { assertStorageKey } from "../libs/api/features/file-storage/src/lib/storage-key";
import { backfillDocumentContent } from "./document-content-backfill";

/**
 * `npm run documents:backfill-content`
 *
 * Links existing document versions and chat attachments to hash-keyed
 * DocumentContent rows, carries legacy extracted text over, and opts in
 * documents that came from chat attachments. Idempotent; calls no providers.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const chatStorage = new ChatAttachmentStorage();
  const storageRoot = resolveFileStorageRoot(process.env.FILE_STORAGE_ROOT);

  try {
    const result = await backfillDocumentContent(
      prisma,
      {
        // Same resolution as LocalStorageAdapter.resolvePath, minus Nest DI.
        async readStoredFile(workspaceId, storedFileId) {
          const location = await prisma.fileLocation.findFirst({
            where: {
              storedFileId,
              workspaceId,
              isActive: true,
              state: "AVAILABLE",
            },
            include: { connection: true },
          });
          if (!location) throw new Error("no active file location");
          if (location.connection.providerType !== "LOCAL") {
            throw new Error(
              `unsupported storage provider ${location.connection.providerType}`,
            );
          }
          assertStorageKey(location.storageKey);
          return readFile(resolve(storageRoot, location.storageKey));
        },
        readChatAttachment: (row) => chatStorage.read(row),
      },
      { warn: (message) => console.warn(message) },
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
