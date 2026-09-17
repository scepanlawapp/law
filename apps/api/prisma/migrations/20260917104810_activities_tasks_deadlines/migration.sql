-- CreateEnum
CREATE TYPE "public"."EventType" AS ENUM ('MEETING', 'HEARING', 'CALL', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."EventStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."DeadlineType" AS ENUM ('COURT', 'STATUTORY', 'CONTRACTUAL', 'INTERNAL', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."DeadlineStatus" AS ENUM ('OPEN', 'SATISFIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."NoteType" AS ENUM ('GENERAL', 'CALL_SUMMARY', 'MEETING_SUMMARY', 'CASE_UPDATE');

-- CreateTable
CREATE TABLE "public"."Event" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "public"."EventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "timeZone" TEXT NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "status" "public"."EventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "location" TEXT,
    "meetingUrl" TEXT,
    "courtName" TEXT,
    "courtroom" TEXT,
    "organizerUserId" TEXT NOT NULL,
    "caseId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EventAssignee" (
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "EventAssignee_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateTable
CREATE TABLE "public"."EventClient" (
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,

    CONSTRAINT "EventClient_pkey" PRIMARY KEY ("eventId","clientId")
);

-- CreateTable
CREATE TABLE "public"."EventAttendee" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "clientContactId" TEXT,
    "displayName" TEXT NOT NULL,
    "email" TEXT,

    CONSTRAINT "EventAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Task" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "public"."CasePriority" NOT NULL DEFAULT 'NORMAL',
    "assigneeUserId" TEXT NOT NULL,
    "dueDate" DATE,
    "dueAt" TIMESTAMPTZ(3),
    "caseId" TEXT,
    "clientId" TEXT,
    "deadlineId" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "completedByUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Deadline" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "public"."DeadlineType" NOT NULL,
    "dueDate" DATE,
    "dueAt" TIMESTAMPTZ(3),
    "timeZone" TEXT,
    "status" "public"."DeadlineStatus" NOT NULL DEFAULT 'OPEN',
    "responsibleUserId" TEXT NOT NULL,
    "caseId" TEXT,
    "clientId" TEXT,
    "sourceDescription" TEXT,
    "satisfiedAt" TIMESTAMPTZ(3),
    "satisfiedByUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Deadline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Note" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "public"."NoteType" NOT NULL,
    "body" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "caseId" TEXT,
    "clientId" TEXT,
    "eventId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ActivityLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caseId" TEXT,
    "clientId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_workspaceId_startsAt_endsAt_idx" ON "public"."Event"("workspaceId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "Event_workspaceId_status_startsAt_idx" ON "public"."Event"("workspaceId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "Event_caseId_idx" ON "public"."Event"("caseId");

-- CreateIndex
CREATE INDEX "Event_organizerUserId_startsAt_idx" ON "public"."Event"("organizerUserId", "startsAt");

-- CreateIndex
CREATE INDEX "EventAssignee_workspaceId_userId_idx" ON "public"."EventAssignee"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "EventClient_workspaceId_clientId_idx" ON "public"."EventClient"("workspaceId", "clientId");

-- CreateIndex
CREATE INDEX "EventAttendee_workspaceId_eventId_idx" ON "public"."EventAttendee"("workspaceId", "eventId");

-- CreateIndex
CREATE INDEX "EventAttendee_clientContactId_idx" ON "public"."EventAttendee"("clientContactId");

-- CreateIndex
CREATE INDEX "Task_workspaceId_status_dueDate_idx" ON "public"."Task"("workspaceId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Task_workspaceId_assigneeUserId_status_idx" ON "public"."Task"("workspaceId", "assigneeUserId", "status");

-- CreateIndex
CREATE INDEX "Task_workspaceId_dueAt_idx" ON "public"."Task"("workspaceId", "dueAt");

-- CreateIndex
CREATE INDEX "Task_caseId_idx" ON "public"."Task"("caseId");

-- CreateIndex
CREATE INDEX "Task_clientId_idx" ON "public"."Task"("clientId");

-- CreateIndex
CREATE INDEX "Task_deadlineId_idx" ON "public"."Task"("deadlineId");

-- CreateIndex
CREATE INDEX "Deadline_workspaceId_status_dueDate_idx" ON "public"."Deadline"("workspaceId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Deadline_workspaceId_responsibleUserId_status_idx" ON "public"."Deadline"("workspaceId", "responsibleUserId", "status");

-- CreateIndex
CREATE INDEX "Deadline_workspaceId_dueAt_idx" ON "public"."Deadline"("workspaceId", "dueAt");

-- CreateIndex
CREATE INDEX "Deadline_caseId_idx" ON "public"."Deadline"("caseId");

-- CreateIndex
CREATE INDEX "Deadline_clientId_idx" ON "public"."Deadline"("clientId");

-- CreateIndex
CREATE INDEX "Note_workspaceId_occurredAt_idx" ON "public"."Note"("workspaceId", "occurredAt");

-- CreateIndex
CREATE INDEX "Note_workspaceId_type_occurredAt_idx" ON "public"."Note"("workspaceId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "Note_caseId_occurredAt_idx" ON "public"."Note"("caseId", "occurredAt");

-- CreateIndex
CREATE INDEX "Note_clientId_occurredAt_idx" ON "public"."Note"("clientId", "occurredAt");

-- CreateIndex
CREATE INDEX "Note_eventId_idx" ON "public"."Note"("eventId");

-- CreateIndex
CREATE INDEX "ActivityLog_workspaceId_occurredAt_idx" ON "public"."ActivityLog"("workspaceId", "occurredAt");

-- CreateIndex
CREATE INDEX "ActivityLog_workspaceId_caseId_occurredAt_idx" ON "public"."ActivityLog"("workspaceId", "caseId", "occurredAt");

-- CreateIndex
CREATE INDEX "ActivityLog_workspaceId_clientId_occurredAt_idx" ON "public"."ActivityLog"("workspaceId", "clientId", "occurredAt");

-- CreateIndex
CREATE INDEX "ActivityLog_workspaceId_entityType_entityId_idx" ON "public"."ActivityLog"("workspaceId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "public"."Event" ADD CONSTRAINT "Event_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Event" ADD CONSTRAINT "Event_organizerUserId_fkey" FOREIGN KEY ("organizerUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Event" ADD CONSTRAINT "Event_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Event" ADD CONSTRAINT "Event_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventAssignee" ADD CONSTRAINT "EventAssignee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventAssignee" ADD CONSTRAINT "EventAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventAssignee" ADD CONSTRAINT "EventAssignee_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventClient" ADD CONSTRAINT "EventClient_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventClient" ADD CONSTRAINT "EventClient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventClient" ADD CONSTRAINT "EventClient_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventAttendee" ADD CONSTRAINT "EventAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventAttendee" ADD CONSTRAINT "EventAttendee_clientContactId_fkey" FOREIGN KEY ("clientContactId") REFERENCES "public"."ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventAttendee" ADD CONSTRAINT "EventAttendee_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_deadlineId_fkey" FOREIGN KEY ("deadlineId") REFERENCES "public"."Deadline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Deadline" ADD CONSTRAINT "Deadline_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Deadline" ADD CONSTRAINT "Deadline_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Deadline" ADD CONSTRAINT "Deadline_satisfiedByUserId_fkey" FOREIGN KEY ("satisfiedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Deadline" ADD CONSTRAINT "Deadline_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Deadline" ADD CONSTRAINT "Deadline_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Deadline" ADD CONSTRAINT "Deadline_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Note" ADD CONSTRAINT "Note_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Note" ADD CONSTRAINT "Note_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Note" ADD CONSTRAINT "Note_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Note" ADD CONSTRAINT "Note_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Note" ADD CONSTRAINT "Note_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActivityLog" ADD CONSTRAINT "ActivityLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActivityLog" ADD CONSTRAINT "ActivityLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActivityLog" ADD CONSTRAINT "ActivityLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActivityLog" ADD CONSTRAINT "ActivityLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
