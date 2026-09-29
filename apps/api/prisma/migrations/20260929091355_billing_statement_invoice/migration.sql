-- RenameIndex
ALTER INDEX "public"."BillingStatementLine_workspaceId_clientId_status_serviceDate_id" RENAME TO "BillingStatementLine_workspaceId_clientId_status_serviceDat_idx";

-- RenameIndex
ALTER INDEX "public"."BillingStatementLine_workspaceId_performedByUserId_serviceDate_" RENAME TO "BillingStatementLine_workspaceId_performedByUserId_serviceD_idx";
