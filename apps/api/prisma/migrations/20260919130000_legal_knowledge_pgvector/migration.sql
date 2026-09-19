CREATE TABLE "LegalSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'sr',
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,

    CONSTRAINT "LegalSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegalSourceVersion" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "versionLabel" TEXT,
    "sourceScript" TEXT NOT NULL DEFAULT 'LATIN',
    "retrievedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parserVersion" TEXT NOT NULL,
    "embeddingModel" TEXT NOT NULL,
    "embeddingDimensions" INTEGER NOT NULL,
    "indexingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "indexingError" TEXT,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalSourceVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegalChunk" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "articleNumber" TEXT,
    "paragraphNumber" INTEGER,
    "pointNumber" INTEGER,
    "embedding" vector(1024),
    "embeddingModel" TEXT NOT NULL,
    "embeddingDimensions" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LegalSourceVersion_sourceId_contentHash_key" ON "LegalSourceVersion"("sourceId", "contentHash");
CREATE INDEX "LegalSource_workspaceId_visibility_slug_idx" ON "LegalSource"("workspaceId", "visibility", "slug");
CREATE INDEX "LegalSource_canonicalUrl_idx" ON "LegalSource"("canonicalUrl");
CREATE INDEX "LegalSourceVersion_sourceId_indexingStatus_createdAt_idx" ON "LegalSourceVersion"("sourceId", "indexingStatus", "createdAt");
CREATE UNIQUE INDEX "LegalChunk_versionId_ordinal_key" ON "LegalChunk"("versionId", "ordinal");
CREATE INDEX "LegalChunk_versionId_articleNumber_paragraphNumber_idx" ON "LegalChunk"("versionId", "articleNumber", "paragraphNumber");
CREATE INDEX "LegalChunk_embedding_hnsw_idx" ON "LegalChunk" USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "LegalSource" ADD CONSTRAINT "LegalSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LegalSourceVersion" ADD CONSTRAINT "LegalSourceVersion_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LegalSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LegalChunk" ADD CONSTRAINT "LegalChunk_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LegalSourceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
