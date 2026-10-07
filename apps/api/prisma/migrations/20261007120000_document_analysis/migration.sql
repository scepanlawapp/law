-- CreateTable
CREATE TABLE "public"."DocumentAnalysis" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "caseId" TEXT,
    "jobId" TEXT,
    "kind" TEXT NOT NULL,
    "documentRef" TEXT NOT NULL,
    "documentTitle" TEXT NOT NULL,
    "contractType" TEXT NOT NULL,
    "clientSide" TEXT,
    "result" JSONB NOT NULL,
    "citations" JSONB NOT NULL DEFAULT '[]',
    "promptChars" INTEGER NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentAnalysis_workspaceId_sessionId_createdAt_idx" ON "public"."DocumentAnalysis"("workspaceId", "sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentAnalysis_workspaceId_caseId_idx" ON "public"."DocumentAnalysis"("workspaceId", "caseId");

-- AddForeignKey
ALTER TABLE "public"."DocumentAnalysis" ADD CONSTRAINT "DocumentAnalysis_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentAnalysis" ADD CONSTRAINT "DocumentAnalysis_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentAnalysis" ADD CONSTRAINT "DocumentAnalysis_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

