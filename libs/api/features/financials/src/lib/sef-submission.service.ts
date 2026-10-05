import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { randomUUID, createHash } from "node:crypto";
import { InvoiceSefStateResponse, InvoiceSefSubmission, SefValidationIssue, WorkspaceRole } from "@law/api-interfaces";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";
import { Prisma, SefEnvironment, SefSubmissionState } from "@prisma/client";
import { formatMoney } from "./invoice-monetary-calculator";
import { SefApiClient } from "./sef-api.client";
import { SefInvoiceValidator } from "./sef-invoice-validator";
import { SefSecretService } from "./sef-secret.service";
import { PreparedSefInvoice, SefApiError, SefInvoiceSnapshot } from "./sef.types";

const ACTIVE_STATES: SefSubmissionState[] = [
  SefSubmissionState.PREPARED,
  SefSubmissionState.SENDING,
  SefSubmissionState.SUBMITTED,
  SefSubmissionState.UNKNOWN,
];

@Injectable()
export class SefSubmissionService {
  constructor(
    private readonly db: PlatformPrismaService,
    private readonly validator: SefInvoiceValidator,
    private readonly api: SefApiClient,
    private readonly secrets: SefSecretService,
  ) {}

  private get context() {
    return WorkspaceContextService.required;
  }

  private get workspaceId() {
    return this.context.workspaceId;
  }

  private assertManager(): void {
    if (![WorkspaceRole.OWNER, WorkspaceRole.ADMIN].includes(this.context.role))
      throw new ForbiddenException("Finance manager access required");
  }

  async validate(invoiceId: string, bankAccountId?: string) {
    this.assertManager();
    return (await this.prepareInvoice(this.db, invoiceId, bankAccountId)).validation;
  }

  async xml(invoiceId: string, bankAccountId?: string): Promise<string> {
    this.assertManager();
    const submitted = await this.db.invoiceSefSubmission.findFirst({
      where: {
        workspaceId: this.workspaceId,
        invoiceId,
        environment: SefEnvironment.DEMO,
        state: SefSubmissionState.SUBMITTED,
      },
      orderBy: { revision: "desc" },
    });
    if (submitted) return submitted.ublXml;
    const prepared = await this.prepareInvoice(this.db, invoiceId, bankAccountId);
    if (!prepared.validation.valid || !prepared.xml)
      throw new UnprocessableEntityException(prepared.validation);
    return prepared.xml;
  }

  async state(invoiceId: string): Promise<InvoiceSefStateResponse> {
    this.assertManager();
    await this.assertInvoice(invoiceId);
    const [settings, latest] = await Promise.all([
      this.db.organizationSettings.findUnique({ where: { workspaceId: this.workspaceId } }),
      this.db.invoiceSefSubmission.findFirst({
        where: { workspaceId: this.workspaceId, invoiceId },
        orderBy: [{ environment: "asc" }, { revision: "desc" }],
      }),
    ]);
    let recovered = latest;
    if (
      latest?.state === SefSubmissionState.SENDING &&
      latest.sendingStartedAt &&
      latest.sendingStartedAt.getTime() < Date.now() - 15 * 60_000
    ) {
      recovered = await this.db.invoiceSefSubmission.update({
        where: { id: latest.id },
        data: {
          state: SefSubmissionState.UNKNOWN,
          lastErrorCode: "STALE_SENDING_OUTCOME_UNKNOWN",
          lastErrorMessage: "The process restarted or stopped after upload began; no automatic retry was attempted.",
        },
      });
    }
    return {
      configured: Boolean(settings?.sefApiKeyCiphertext),
      enabled: settings?.sefEnabled ?? false,
      environment: settings?.sefEnvironment ?? SefEnvironment.DEMO,
      immutable: Boolean(recovered && ACTIVE_STATES.includes(recovered.state)),
      submission: recovered ? this.response(recovered) : null,
    };
  }

  async send(invoiceId: string, idempotencyKey: string, bankAccountId?: string) {
    this.assertManager();
    if (!idempotencyKey.trim())
      throw new ConflictException("Idempotency-Key is required for SEF submission");

    const preparedRecord = await this.db.$transaction(
      async (tx) => {
        await this.lockInvoice(tx, invoiceId);
        const settings = await tx.organizationSettings.findUnique({
          where: { workspaceId: this.workspaceId },
        });
        if (!settings?.sefEnabled) throw new ConflictException("SEF integration is disabled");
        if (settings.sefEnvironment !== SefEnvironment.DEMO)
          throw new ConflictException("UNSUPPORTED_SCENARIO: Production SEF submission is not supported");

        const reused = await tx.invoiceSefSubmission.findUnique({
          where: {
            workspaceId_environment_idempotencyKey: {
              workspaceId: this.workspaceId,
              environment: SefEnvironment.DEMO,
              idempotencyKey,
            },
          },
        });
        if (reused) {
          if (reused.invoiceId !== invoiceId)
            throw new ConflictException("Idempotency-Key is already bound to another invoice");
          const storedSnapshot = reused.sourceSnapshot as unknown as SefInvoiceSnapshot;
          if (
            bankAccountId &&
            storedSnapshot.payment.accountId !== bankAccountId
          )
            throw new ConflictException(
              "Idempotency-Key is already bound to another payment account",
            );
          if (reused.state === SefSubmissionState.FAILED) {
            const current = await this.prepareInvoice(
              tx,
              invoiceId,
              bankAccountId ?? storedSnapshot.payment.accountId,
            );
            const currentHash = current.xml
              ? createHash("sha256").update(current.xml).digest("hex")
              : null;
            if (!current.validation.valid || currentHash !== reused.payloadSha256)
              throw new ConflictException(
                "Idempotency-Key is already bound to different invoice content",
              );
          }
          return reused;
        }
        const latest = await tx.invoiceSefSubmission.findFirst({
          where: { workspaceId: this.workspaceId, invoiceId, environment: SefEnvironment.DEMO },
          orderBy: { revision: "desc" },
        });
        if (latest && ACTIVE_STATES.includes(latest.state)) return latest;

        const prepared = await this.prepareInvoice(tx, invoiceId, bankAccountId);
        if (!prepared.validation.valid || !prepared.xml)
          throw new UnprocessableEntityException(prepared.validation);
        const revision = (latest?.revision ?? 0) + 1;
        return tx.invoiceSefSubmission.create({
          data: {
            workspaceId: this.workspaceId,
            invoiceId,
            environment: SefEnvironment.DEMO,
            revision,
            idempotencyKey,
            requestId: randomUUID(),
            supplierTaxId: prepared.snapshot.supplier.taxId,
            ublXml: prepared.xml,
            payloadSha256: createHash("sha256").update(prepared.xml).digest("hex"),
            sourceSnapshot: prepared.snapshot as unknown as Prisma.InputJsonValue,
            validationResult: prepared.validation as unknown as Prisma.InputJsonValue,
            submittedByUserId: this.context.userId,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (preparedRecord.state !== SefSubmissionState.PREPARED)
      return this.response(preparedRecord);

    const claimed = await this.db.invoiceSefSubmission.updateMany({
      where: { id: preparedRecord.id, state: SefSubmissionState.PREPARED },
      data: {
        state: SefSubmissionState.SENDING,
        sendingStartedAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      const current = await this.db.invoiceSefSubmission.findUniqueOrThrow({ where: { id: preparedRecord.id } });
      return this.response(current);
    }

    const settings = await this.db.organizationSettings.findUniqueOrThrow({
      where: { workspaceId: this.workspaceId },
    });
    if (settings.sefEnvironment !== SefEnvironment.DEMO) {
      const failed = await this.db.invoiceSefSubmission.update({
        where: { id: preparedRecord.id },
        data: {
          state: SefSubmissionState.FAILED,
          lastErrorCode: "SEF_ENVIRONMENT_CHANGED",
          lastErrorMessage: "SEF environment changed before upload; no request was sent",
        },
      });
      return this.response(failed);
    }
    if (settings.taxId !== preparedRecord.supplierTaxId) {
      const failed = await this.db.invoiceSefSubmission.update({
        where: { id: preparedRecord.id },
        data: {
          state: SefSubmissionState.FAILED,
          lastErrorCode: "SEF_ISSUER_IDENTITY_CHANGED",
          lastErrorMessage: "Issuer identity changed before upload; no request was sent",
        },
      });
      return this.response(failed);
    }

    try {
      const identifiers = await this.api.upload({
        apiKey: this.secrets.decrypt(settings),
        requestId: preparedRecord.requestId,
        invoiceNumber: (preparedRecord.sourceSnapshot as unknown as SefInvoiceSnapshot).invoice.invoiceNumber,
        xml: preparedRecord.ublXml,
      });
      const submitted = await this.db.invoiceSefSubmission.update({
        where: { id: preparedRecord.id },
        data: {
          state: SefSubmissionState.SUBMITTED,
          sefInvoiceId: identifiers.invoiceId,
          sefSalesInvoiceId: identifiers.salesInvoiceId,
          sefPurchaseInvoiceId: identifiers.purchaseInvoiceId,
          apiResponse: identifiers.sanitizedResponse as Prisma.InputJsonValue,
          httpStatus: 200,
          submittedAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      try {
        return await this.refreshRecord(submitted, settings);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Initial status check failed";
        const kept = await this.db.invoiceSefSubmission.update({
          where: { id: submitted.id },
          data: { lastErrorCode: "SEF_INITIAL_STATUS_UNAVAILABLE", lastErrorMessage: message },
        });
        return this.response(kept);
      }
    } catch (caught) {
      const error = caught instanceof SefApiError
        ? caught
        : new SefApiError("SEF_UPLOAD_OUTCOME_UNKNOWN", caught instanceof Error ? caught.message : "Upload failed", null, "UNKNOWN");
      const failed = await this.db.invoiceSefSubmission.update({
        where: { id: preparedRecord.id },
        data: {
          state: error.outcome === "FAILED" ? SefSubmissionState.FAILED : SefSubmissionState.UNKNOWN,
          lastErrorCode: error.code,
          lastErrorMessage: error.message,
          httpStatus: error.httpStatus,
          apiResponse: error.sanitizedResponse as Prisma.InputJsonValue | undefined,
        },
      });
      return this.response(failed);
    }
  }

  async refresh(invoiceId: string) {
    this.assertManager();
    const submission = await this.db.invoiceSefSubmission.findFirst({
      where: { workspaceId: this.workspaceId, invoiceId, environment: SefEnvironment.DEMO },
      orderBy: { revision: "desc" },
    });
    if (!submission) throw new NotFoundException("SEF submission not found");
    if (submission.state !== SefSubmissionState.SUBMITTED || !submission.sefSalesInvoiceId)
      throw new ConflictException("Only a confirmed SEF submission can be refreshed");
    const settings = await this.db.organizationSettings.findUniqueOrThrow({ where: { workspaceId: this.workspaceId } });
    return this.refreshRecord(submission, settings);
  }

  async assertMutable(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    action: "edit" | "delete" | "send" | "void",
  ): Promise<void> {
    const submission = await tx.invoiceSefSubmission.findFirst({
      where: {
        workspaceId: this.workspaceId,
        invoiceId,
        state: { in: ACTIVE_STATES },
      },
      orderBy: { revision: "desc" },
    });
    if (!submission) return;
    if (submission.state === SefSubmissionState.SUBMITTED && action === "void")
      throw new ConflictException("SEF cancellation/storno is not supported in this version");
    throw new ConflictException(`Invoice cannot be ${action}ed while SEF submission is ${submission.state}`);
  }

  async lockInvoice(tx: Prisma.TransactionClient, invoiceId: string): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "Invoice"
      WHERE "id" = ${invoiceId} AND "workspaceId" = ${this.workspaceId}
      FOR UPDATE
    `);
    if (!rows.length) throw new NotFoundException("Invoice not found");
  }

  private async refreshRecord(submission: any, settings: any) {
    if (settings.taxId !== submission.supplierTaxId)
      throw new ConflictException("Stored submission belongs to another issuer identity");
    const remote = await this.api.status(this.secrets.decrypt(settings), submission.sefSalesInvoiceId);
    const updated = await this.db.invoiceSefSubmission.update({
      where: { id: submission.id },
      data: {
        remoteStatus: remote.status,
        lastCheckedAt: new Date(),
        apiResponse: remote.response as Prisma.InputJsonValue,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    return this.response(updated);
  }

  private async assertInvoice(invoiceId: string) {
    const invoice = await this.db.invoice.findFirst({ where: { id: invoiceId, workspaceId: this.workspaceId }, select: { id: true } });
    if (!invoice) throw new NotFoundException("Invoice not found");
  }

  private async prepareInvoice(db: any, invoiceId: string, bankAccountId?: string): Promise<PreparedSefInvoice> {
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, workspaceId: this.workspaceId },
      include: { client: { include: { addresses: { orderBy: { createdAt: "asc" } } } }, lines: { orderBy: { lineOrder: "asc" } } },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    const settings = await db.organizationSettings.findUnique({ where: { workspaceId: this.workspaceId } });
    const issues: SefValidationIssue[] = [];
    const billing = invoice.client.addresses.filter(
      (address: any) => address.addressType?.trim().toUpperCase() === "BILLING",
    );
    const primary = invoice.client.addresses.filter((address: any) => address.isPrimary);
    const address = billing.length === 1
      ? billing[0]
      : billing.length === 0 && primary.length === 1
        ? primary[0]
        : billing.length === 0 && primary.length === 0 && invoice.client.addresses.length === 1
          ? invoice.client.addresses[0]
          : null;
    if (billing.length > 1 || (billing.length === 0 && primary.length > 1))
      issues.push(this.issue("AMBIGUOUS_RECIPIENT_ADDRESS", "customer.address"));
    else if (!address)
      issues.push(this.issue("RECIPIENT_ADDRESS_REQUIRED", "customer.address"));

    const accounts = await db.bankAccount.findMany({
      where: { workspaceId: this.workspaceId, active: true, currencyCode: invoice.currency },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    const selected = bankAccountId
      ? accounts.find((account: any) => account.id === bankAccountId)
      : accounts.filter((account: any) => account.isDefault).length === 1
        ? accounts.find((account: any) => account.isDefault)
        : accounts.length === 1
          ? accounts[0]
          : null;
    if (bankAccountId && !selected)
      issues.push(this.issue("PAYMENT_ACCOUNT_UNAVAILABLE", "payment.accountId"));
    else if (!selected && accounts.length > 1)
      issues.push(this.issue("AMBIGUOUS_PAYMENT_ACCOUNT", "payment.accountId"));
    else if (!selected)
      issues.push(this.issue("PAYMENT_ACCOUNT_REQUIRED", "payment.accountId"));

    const normalizeCountry = (country: string | null | undefined) => {
      const normalized = country?.trim().toUpperCase();
      if (["RS", "SRBIJA", "SERBIA", "REPUBLIKA SRBIJA", "REPUBLIC OF SERBIA"].includes(normalized ?? "")) return "RS";
      return /^[A-Z]{2}$/.test(normalized ?? "") ? normalized! : "";
    };
    const referencePattern = settings?.paymentReferencePattern?.trim();
    const reference = referencePattern
      ? referencePattern.replace(/\{\{?invoiceNumber\}?\}/gi, invoice.invoiceNumber)
      : invoice.invoiceNumber;
    const snapshot: SefInvoiceSnapshot = {
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.dateOfCreate.toISOString().slice(0, 10),
        dueDate: invoice.dateOfMaturity.toISOString().slice(0, 10),
        supplyDate: invoice.dateOfTurnover.toISOString().slice(0, 10),
        currency: invoice.currency,
        comment: invoice.comment,
        methodOfPayment: invoice.methodOfPayment,
        vatLiabilityTimingCode: invoice.vatLiabilityTimingCode,
        netAmount: formatMoney(invoice.netAmount),
        vatAmount: formatMoney(invoice.vatAmount),
        grossAmount: formatMoney(invoice.grossAmount),
      },
      supplier: {
        name: settings?.legalName?.trim() || settings?.displayName?.trim() || "",
        taxId: settings?.taxId?.trim() || "",
        registrationNumber: settings?.registrationNumber?.trim() || "",
        addressLine: [settings?.addressLine1, settings?.addressLine2].filter(Boolean).join(" ").trim(),
        city: settings?.city?.trim() || "",
        postalCode: settings?.postalCode?.trim() || "",
        countryCode: normalizeCountry(settings?.countryCode),
        email: settings?.email,
        vatRegistered: settings?.vatRegistered ?? false,
      },
      customer: {
        name: invoice.client.organizationName?.trim() || invoice.client.displayName.trim(),
        taxId: invoice.client.taxNumber?.trim() || "",
        registrationNumber: invoice.client.registrationNumber?.trim() || "",
        addressLine: address ? [address.street, address.streetAdditional].filter(Boolean).join(" ").trim() : "",
        city: address?.city?.trim() || "",
        postalCode: address?.postalCode?.trim() || "",
        countryCode: normalizeCountry(address?.country),
        email: invoice.client.email,
        isDomestic: invoice.client.isDomestic,
        isPublicSector: invoice.client.isPublicSector,
        jbkjs: invoice.client.jbkjs?.trim() || null,
      },
      payment: {
        accountId: selected?.id ?? "",
        accountNumber: selected?.accountNumber?.trim() || selected?.iban?.trim() || "",
        model: settings?.defaultPaymentModel?.trim() || null,
        reference,
      },
      lines: invoice.lines.map((line: any) => ({
        id: line.id,
        description: line.description,
        serviceDate: line.serviceDate.toISOString().slice(0, 10),
        currency: line.currency,
        netAmount: formatMoney(line.netAmount),
        vatRate: line.vatRate.toString(),
        vatAmount: formatMoney(line.vatAmount),
        grossAmount: formatMoney(line.grossAmount),
        taxCategoryCode: line.taxCategoryCode,
        taxExemptionReasonCode: line.taxExemptionReasonCode,
        taxExemptionReasonText: line.taxExemptionReasonText,
        pricingRequired: line.pricingRequired,
      })),
    };
    return this.validator.validate(snapshot, issues);
  }

  private issue(code: string, fieldPath: string): SefValidationIssue {
    return { code, severity: "ERROR", fieldPath, messageKey: `finance.sef.validation.${code}` };
  }

  private response(record: any): InvoiceSefSubmission {
    return {
      id: record.id,
      environment: record.environment,
      revision: record.revision,
      state: record.state,
      sefInvoiceId: record.sefInvoiceId,
      sefSalesInvoiceId: record.sefSalesInvoiceId,
      sefPurchaseInvoiceId: record.sefPurchaseInvoiceId,
      remoteStatus: record.remoteStatus,
      payloadSha256: record.payloadSha256,
      validationResult: record.validationResult,
      lastErrorCode: record.lastErrorCode,
      lastErrorMessage: record.lastErrorMessage,
      httpStatus: record.httpStatus,
      attemptCount: record.attemptCount,
      submittedAt: record.submittedAt?.toISOString() ?? null,
      sendingStartedAt: record.sendingStartedAt?.toISOString() ?? null,
      lastCheckedAt: record.lastCheckedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
