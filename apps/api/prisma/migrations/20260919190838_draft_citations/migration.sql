-- DropIndex
DROP INDEX "public"."LegalChunk_embedding_hnsw_idx";

-- CreateTable
CREATE TABLE "public"."DraftCitation" (
    "id" TEXT NOT NULL,
    "draftResultId" TEXT NOT NULL,
    "chunkId" TEXT,
    "marker" INTEGER NOT NULL,
    "articleNumber" TEXT,
    "sourceTitle" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftCitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DraftCitation_chunkId_idx" ON "public"."DraftCitation"("chunkId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftCitation_draftResultId_marker_key" ON "public"."DraftCitation"("draftResultId", "marker");

-- AddForeignKey
ALTER TABLE "public"."DraftCitation" ADD CONSTRAINT "DraftCitation_draftResultId_fkey" FOREIGN KEY ("draftResultId") REFERENCES "public"."DraftResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DraftCitation" ADD CONSTRAINT "DraftCitation_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "public"."LegalChunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;
