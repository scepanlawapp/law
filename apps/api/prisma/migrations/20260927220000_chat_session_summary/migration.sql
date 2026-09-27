-- AlterTable
ALTER TABLE "public"."ChatSession" ADD COLUMN     "summary" TEXT,
ADD COLUMN     "summaryModel" TEXT,
ADD COLUMN     "summaryThroughAt" TIMESTAMPTZ(3),
ADD COLUMN     "summaryUpdatedAt" TIMESTAMPTZ(3);

