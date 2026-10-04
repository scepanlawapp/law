-- CreateEnum
CREATE TYPE "WorkEntryStatus" AS ENUM ('RUNNING', 'PROPOSED', 'CONFIRMED', 'BILLED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "WorkEntryTreatment" AS ENUM ('RETAINER', 'AT', 'HOURLY', 'NON_BILLABLE', 'UNDECIDED');

-- CreateEnum
CREATE TYPE "WorkEntrySource" AS ENUM ('MANUAL', 'TIMER', 'QUICK_CAPTURE', 'TASK', 'EVENT', 'DEADLINE', 'ACTIVITY', 'EMAIL');

-- CreateEnum
CREATE TYPE "RetainerRule" AS ENUM ('HOURLY', 'AT', 'ABSORBED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TIMER_RUNNING_LONG';
ALTER TYPE "NotificationType" ADD VALUE 'TIME_REVIEW_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'RETAINER_USAGE_80';
ALTER TYPE "NotificationType" ADD VALUE 'RETAINER_USAGE_100';

-- AlterTable
ALTER TABLE "BillingStatement" ADD COLUMN     "billingMonth" TEXT,
ADD COLUMN     "printWorkSpecification" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "BillingStatementLine" ADD COLUMN     "minutes" INTEGER,
ADD COLUMN     "pricingRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "timeReviewReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "timeReviewReminderTime" TEXT NOT NULL DEFAULT '17:30';

-- AlterTable
ALTER TABLE "WorkspaceConfig" ADD COLUMN     "defaultVatRate" DECIMAL(5,2) NOT NULL DEFAULT 20,
ADD COLUMN     "internalCurrency" TEXT NOT NULL DEFAULT 'RSD',
ADD COLUMN     "paymentTermDays" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "targetHourlyRate" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "caseId" TEXT,
    "workDate" DATE NOT NULL,
    "minutes" INTEGER,
    "timerStartedAt" TIMESTAMPTZ(3),
    "description" TEXT NOT NULL DEFAULT '',
    "serviceCategoryId" TEXT,
    "treatment" "WorkEntryTreatment" NOT NULL DEFAULT 'UNDECIDED',
    "status" "WorkEntryStatus" NOT NULL DEFAULT 'PROPOSED',
    "writeOffReason" TEXT,
    "source" "WorkEntrySource" NOT NULL DEFAULT 'MANUAL',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "statementLineId" TEXT,
    "aiParsed" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetainerAgreement" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "monthlyFee" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "includedMinutes" INTEGER,
    "overageRule" "RetainerRule" NOT NULL,
    "overageHourlyRate" DECIMAL(18,2),
    "outOfScopeRule" "RetainerRule" NOT NULL,
    "outOfScopeHourlyRate" DECIMAL(18,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RetainerAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetainerAgreementCategory" (
    "workspaceId" TEXT NOT NULL,
    "retainerAgreementId" TEXT NOT NULL,
    "serviceCategoryId" TEXT NOT NULL,

    CONSTRAINT "RetainerAgreementCategory_pkey" PRIMARY KEY ("retainerAgreementId","serviceCategoryId")
);

-- CreateTable
CREATE TABLE "ClientBillingProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "hourlyRate" DECIMAL(18,2),
    "currency" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClientBillingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hourlyValue" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceCategory_workspaceId_active_order_idx" ON "ServiceCategory"("workspaceId", "active", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCategory_workspaceId_name_key" ON "ServiceCategory"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "WorkEntry_workspaceId_clientId_workDate_idx" ON "WorkEntry"("workspaceId", "clientId", "workDate");

-- CreateIndex
CREATE INDEX "WorkEntry_workspaceId_userId_workDate_idx" ON "WorkEntry"("workspaceId", "userId", "workDate");

-- CreateIndex
CREATE INDEX "WorkEntry_workspaceId_status_idx" ON "WorkEntry"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "WorkEntry_statementLineId_idx" ON "WorkEntry"("statementLineId");

-- CreateIndex
CREATE INDEX "WorkEntry_caseId_idx" ON "WorkEntry"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkEntry_workspaceId_sourceType_sourceId_key" ON "WorkEntry"("workspaceId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "RetainerAgreement_workspaceId_clientId_validFrom_idx" ON "RetainerAgreement"("workspaceId", "clientId", "validFrom");

-- CreateIndex
CREATE INDEX "RetainerAgreementCategory_workspaceId_serviceCategoryId_idx" ON "RetainerAgreementCategory"("workspaceId", "serviceCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientBillingProfile_clientId_key" ON "ClientBillingProfile"("clientId");

-- CreateIndex
CREATE INDEX "ClientBillingProfile_workspaceId_idx" ON "ClientBillingProfile"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRate_workspaceId_userId_effectiveFrom_key" ON "UserRate"("workspaceId", "userId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "ServiceCategory" ADD CONSTRAINT "ServiceCategory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEntry" ADD CONSTRAINT "WorkEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEntry" ADD CONSTRAINT "WorkEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEntry" ADD CONSTRAINT "WorkEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEntry" ADD CONSTRAINT "WorkEntry_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEntry" ADD CONSTRAINT "WorkEntry_serviceCategoryId_fkey" FOREIGN KEY ("serviceCategoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEntry" ADD CONSTRAINT "WorkEntry_statementLineId_fkey" FOREIGN KEY ("statementLineId") REFERENCES "BillingStatementLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEntry" ADD CONSTRAINT "WorkEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEntry" ADD CONSTRAINT "WorkEntry_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerAgreement" ADD CONSTRAINT "RetainerAgreement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerAgreement" ADD CONSTRAINT "RetainerAgreement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerAgreementCategory" ADD CONSTRAINT "RetainerAgreementCategory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerAgreementCategory" ADD CONSTRAINT "RetainerAgreementCategory_retainerAgreementId_fkey" FOREIGN KEY ("retainerAgreementId") REFERENCES "RetainerAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerAgreementCategory" ADD CONSTRAINT "RetainerAgreementCategory_serviceCategoryId_fkey" FOREIGN KEY ("serviceCategoryId") REFERENCES "ServiceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientBillingProfile" ADD CONSTRAINT "ClientBillingProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientBillingProfile" ADD CONSTRAINT "ClientBillingProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRate" ADD CONSTRAINT "UserRate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRate" ADD CONSTRAINT "UserRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written section 1: partial unique index (one RUNNING timer per user)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "WorkEntry_one_running_per_user" ON "WorkEntry"("workspaceId","userId") WHERE "status" = 'RUNNING';

-- ---------------------------------------------------------------------------
-- Hand-written section 2: seed the default service categories.
-- Guarded by the workspace row so a fresh database (workspace created later by
-- the auth seed) does not violate the foreign key.
-- ---------------------------------------------------------------------------
INSERT INTO "ServiceCategory" ("id", "workspaceId", "name", "active", "order", "updatedAt")
SELECT gen_random_uuid()::text, w."id", c."name", true, c."order", CURRENT_TIMESTAMP
FROM "Workspace" w
CROSS JOIN (VALUES
  ('Korporativno savetovanje', 0),
  ('Pregled ugovora', 1),
  ('Izrada ugovora', 2),
  ('Medijsko pravo', 3),
  ('Parnica', 4),
  ('Upravni postupak', 5),
  ('Ostalo', 6)
) AS c("name", "order")
WHERE w."id" = '11111111-1111-4111-a111-111111111111';

-- ---------------------------------------------------------------------------
-- Hand-written section 3: backfill WorkEntry from billing sources.
-- Unbilled sources that resolve to exactly one client become PROPOSED entries.
-- Sources already attached to a statement (statementId set) become BILLED
-- entries linked to the matching statement line; when their client cannot be
-- resolved from the source, the statement's client is used so that billing
-- history is never dropped. A billed task or deadline whose own client and
-- case client disagree is kept too, under the statement's client (the case
-- link is dropped when it belongs to another client). The client-conflict
-- guard only applies to unbilled sources: those cannot be attributed to
-- exactly one client, so they stay out of the proposed backlog.
-- Dates are taken in the office time zone (Europe/Belgrade; events use their
-- own time zone) so that late-evening work lands on the correct calendar day.
-- ---------------------------------------------------------------------------

-- Tasks
INSERT INTO "WorkEntry" (
  "id", "workspaceId", "userId", "clientId", "caseId", "workDate", "minutes",
  "description", "treatment", "status", "source", "sourceType", "sourceId",
  "statementLineId", "createdByUserId", "updatedByUserId", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  t."workspaceId",
  t."assigneeUserId",
  r."clientId",
  CASE WHEN c."clientId" IS NULL OR c."clientId" = r."clientId" THEN t."caseId" END,
  (COALESCE(t."completedAt", t."updatedAt") AT TIME ZONE 'Europe/Belgrade')::date,
  NULL,
  t."title",
  'UNDECIDED'::"WorkEntryTreatment",
  CASE WHEN t."statementId" IS NULL THEN 'PROPOSED' ELSE 'BILLED' END::"WorkEntryStatus",
  'TASK'::"WorkEntrySource",
  'TASK',
  t."id",
  l."id",
  t."assigneeUserId",
  t."assigneeUserId",
  CURRENT_TIMESTAMP
FROM "Task" t
LEFT JOIN "Case" c ON c."id" = t."caseId"
LEFT JOIN "BillingStatement" st ON st."id" = t."statementId"
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN t."statementId" IS NOT NULL AND t."clientId" IS NOT NULL
      AND c."clientId" IS NOT NULL AND t."clientId" <> c."clientId"
    THEN st."clientId"
    ELSE COALESCE(t."clientId", c."clientId", st."clientId")
  END AS "clientId"
) r
LEFT JOIN LATERAL (
  SELECT bl."id" FROM "BillingStatementLine" bl
  WHERE bl."statementId" = t."statementId" AND bl."sourceType" = 'TASK' AND bl."sourceId" = t."id"
  ORDER BY (bl."status" = 'CANCELLED'), bl."createdAt"
  LIMIT 1
) l ON t."statementId" IS NOT NULL
WHERE (t."status" = 'DONE' OR t."statementId" IS NOT NULL)
  AND (t."statementId" IS NOT NULL OR t."clientId" IS NULL OR c."clientId" IS NULL OR t."clientId" = c."clientId")
  AND r."clientId" IS NOT NULL;

-- Deadlines
INSERT INTO "WorkEntry" (
  "id", "workspaceId", "userId", "clientId", "caseId", "workDate", "minutes",
  "description", "treatment", "status", "source", "sourceType", "sourceId",
  "statementLineId", "createdByUserId", "updatedByUserId", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  d."workspaceId",
  d."responsibleUserId",
  r."clientId",
  CASE WHEN c."clientId" IS NULL OR c."clientId" = r."clientId" THEN d."caseId" END,
  (COALESCE(d."satisfiedAt", d."updatedAt") AT TIME ZONE 'Europe/Belgrade')::date,
  NULL,
  d."title",
  'UNDECIDED'::"WorkEntryTreatment",
  CASE WHEN d."statementId" IS NULL THEN 'PROPOSED' ELSE 'BILLED' END::"WorkEntryStatus",
  'DEADLINE'::"WorkEntrySource",
  'DEADLINE',
  d."id",
  l."id",
  d."responsibleUserId",
  d."responsibleUserId",
  CURRENT_TIMESTAMP
FROM "Deadline" d
LEFT JOIN "Case" c ON c."id" = d."caseId"
LEFT JOIN "BillingStatement" st ON st."id" = d."statementId"
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN d."statementId" IS NOT NULL AND d."clientId" IS NOT NULL
      AND c."clientId" IS NOT NULL AND d."clientId" <> c."clientId"
    THEN st."clientId"
    ELSE COALESCE(d."clientId", c."clientId", st."clientId")
  END AS "clientId"
) r
LEFT JOIN LATERAL (
  SELECT bl."id" FROM "BillingStatementLine" bl
  WHERE bl."statementId" = d."statementId" AND bl."sourceType" = 'DEADLINE' AND bl."sourceId" = d."id"
  ORDER BY (bl."status" = 'CANCELLED'), bl."createdAt"
  LIMIT 1
) l ON d."statementId" IS NOT NULL
WHERE (d."status" = 'SATISFIED' OR d."statementId" IS NOT NULL)
  AND (d."statementId" IS NOT NULL OR d."clientId" IS NULL OR c."clientId" IS NULL OR d."clientId" = c."clientId")
  AND r."clientId" IS NOT NULL;

-- Events (client set = EventClient clients united with the case client; exactly one required)
WITH event_clients AS (
  SELECT e."id" AS "eventId", x."clientId"
  FROM "Event" e
  CROSS JOIN LATERAL (
    SELECT ec."clientId" FROM "EventClient" ec WHERE ec."eventId" = e."id"
    UNION
    SELECT cs."clientId" FROM "Case" cs WHERE cs."id" = e."caseId"
  ) x
),
single_client AS (
  SELECT "eventId", MIN("clientId") AS "clientId"
  FROM event_clients
  GROUP BY "eventId"
  HAVING COUNT(DISTINCT "clientId") = 1
)
INSERT INTO "WorkEntry" (
  "id", "workspaceId", "userId", "clientId", "caseId", "workDate", "minutes",
  "description", "treatment", "status", "source", "sourceType", "sourceId",
  "statementLineId", "createdByUserId", "updatedByUserId", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  e."workspaceId",
  e."organizerUserId",
  COALESCE(sc."clientId", st."clientId"),
  e."caseId",
  (e."startsAt" AT TIME ZONE e."timeZone")::date,
  CASE
    WHEN NOT e."isAllDay"
      AND ROUND(EXTRACT(EPOCH FROM (e."endsAt" - e."startsAt")) / 60) BETWEEN 1 AND 1440
    THEN ROUND(EXTRACT(EPOCH FROM (e."endsAt" - e."startsAt")) / 60)::integer
    ELSE NULL
  END,
  e."title",
  'UNDECIDED'::"WorkEntryTreatment",
  CASE WHEN e."statementId" IS NULL THEN 'PROPOSED' ELSE 'BILLED' END::"WorkEntryStatus",
  'EVENT'::"WorkEntrySource",
  'EVENT',
  e."id",
  l."id",
  e."organizerUserId",
  e."organizerUserId",
  CURRENT_TIMESTAMP
FROM "Event" e
LEFT JOIN single_client sc ON sc."eventId" = e."id"
LEFT JOIN "BillingStatement" st ON st."id" = e."statementId"
LEFT JOIN LATERAL (
  SELECT bl."id" FROM "BillingStatementLine" bl
  WHERE bl."statementId" = e."statementId" AND bl."sourceType" = 'EVENT' AND bl."sourceId" = e."id"
  ORDER BY (bl."status" = 'CANCELLED'), bl."createdAt"
  LIMIT 1
) l ON e."statementId" IS NOT NULL
WHERE (e."status" = 'COMPLETED' OR e."statementId" IS NOT NULL)
  AND COALESCE(sc."clientId", st."clientId") IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Prisma-generated section: drop the legacy statementId links (after backfill)
-- ---------------------------------------------------------------------------
-- DropForeignKey
ALTER TABLE "Deadline" DROP CONSTRAINT "Deadline_statementId_fkey";

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_statementId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_statementId_fkey";

-- DropIndex
DROP INDEX "Deadline_workspaceId_statementId_idx";

-- DropIndex
DROP INDEX "Event_workspaceId_statementId_idx";

-- DropIndex
DROP INDEX "Task_workspaceId_statementId_idx";

-- AlterTable
ALTER TABLE "Deadline" DROP COLUMN "statementId";

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "statementId";

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "statementId";
