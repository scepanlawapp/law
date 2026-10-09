-- CreateTable
CREATE TABLE "public"."RevenueSharingSettings" (
    "workspaceId" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RevenueSharingSettings_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "public"."RevenueSharingVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "configuration" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueSharingVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RevenueSharingAgreement" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "terms" JSONB NOT NULL,

    CONSTRAINT "RevenueSharingAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RevenueSharingRule" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT,
    "earningType" TEXT NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "terms" JSONB NOT NULL,

    CONSTRAINT "RevenueSharingRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RevenueSharingVersion_workspaceId_effectiveFrom_version_idx" ON "public"."RevenueSharingVersion"("workspaceId", "effectiveFrom", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueSharingVersion_workspaceId_version_key" ON "public"."RevenueSharingVersion"("workspaceId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueSharingVersion_id_workspaceId_key" ON "public"."RevenueSharingVersion"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "RevenueSharingAgreement_workspaceId_memberId_effectiveFrom__idx" ON "public"."RevenueSharingAgreement"("workspaceId", "memberId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueSharingAgreement_versionId_agreementId_key" ON "public"."RevenueSharingAgreement"("versionId", "agreementId");

-- CreateIndex
CREATE INDEX "RevenueSharingRule_workspaceId_memberId_effectiveFrom_effec_idx" ON "public"."RevenueSharingRule"("workspaceId", "memberId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "RevenueSharingRule_workspaceId_scopeType_scopeId_earningTyp_idx" ON "public"."RevenueSharingRule"("workspaceId", "scopeType", "scopeId", "earningType");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueSharingRule_versionId_ruleId_key" ON "public"."RevenueSharingRule"("versionId", "ruleId");

-- AddForeignKey
ALTER TABLE "public"."RevenueSharingSettings" ADD CONSTRAINT "RevenueSharingSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RevenueSharingVersion" ADD CONSTRAINT "RevenueSharingVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RevenueSharingVersion" ADD CONSTRAINT "RevenueSharingVersion_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RevenueSharingAgreement" ADD CONSTRAINT "RevenueSharingAgreement_versionId_workspaceId_fkey" FOREIGN KEY ("versionId", "workspaceId") REFERENCES "public"."RevenueSharingVersion"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RevenueSharingAgreement" ADD CONSTRAINT "RevenueSharingAgreement_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RevenueSharingRule" ADD CONSTRAINT "RevenueSharingRule_versionId_workspaceId_fkey" FOREIGN KEY ("versionId", "workspaceId") REFERENCES "public"."RevenueSharingVersion"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RevenueSharingRule" ADD CONSTRAINT "RevenueSharingRule_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defense in depth: valid periods/percentages and append-only published history.
ALTER TABLE "RevenueSharingAgreement" ADD CONSTRAINT "RevenueSharingAgreement_valid_period" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");
ALTER TABLE "RevenueSharingRule" ADD CONSTRAINT "RevenueSharingRule_valid_period" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");
ALTER TABLE "RevenueSharingRule" ADD CONSTRAINT "RevenueSharingRule_valid_percentage" CHECK ("percentage" >= 0 AND "percentage" <= 100);
CREATE FUNCTION revenue_sharing_reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'revenue.HISTORY_IMMUTABLE';
END;
$$;
CREATE TRIGGER revenue_version_immutable BEFORE UPDATE OR DELETE ON "RevenueSharingVersion" FOR EACH ROW EXECUTE FUNCTION revenue_sharing_reject_history_mutation();
CREATE TRIGGER revenue_agreement_immutable BEFORE UPDATE OR DELETE ON "RevenueSharingAgreement" FOR EACH ROW EXECUTE FUNCTION revenue_sharing_reject_history_mutation();
CREATE TRIGGER revenue_rule_immutable BEFORE UPDATE OR DELETE ON "RevenueSharingRule" FOR EACH ROW EXECUTE FUNCTION revenue_sharing_reject_history_mutation();
