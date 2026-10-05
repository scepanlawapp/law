import { WorkspaceRole } from "@law/api-interfaces";
import { WorkspaceContextService } from "@law/core";
import { SefSubmissionService } from "@law/financials";
import { SefEnvironment, SefSubmissionState } from "@prisma/client";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const userId = "22222222-2222-4222-a222-222222222222";
const invoiceId = "33333333-3333-4333-a333-333333333333";
const now = new Date("2026-10-05T10:00:00.000Z");

const prepared = {
  id: "44444444-4444-4444-a444-444444444444",
  workspaceId,
  invoiceId,
  environment: SefEnvironment.DEMO,
  revision: 1,
  idempotencyKey: "attempt-1",
  requestId: "55555555-5555-4555-a555-555555555555",
  supplierTaxId: "123456789",
  state: SefSubmissionState.PREPARED,
  sefInvoiceId: null,
  sefSalesInvoiceId: null,
  sefPurchaseInvoiceId: null,
  remoteStatus: null,
  ublXml: "<Invoice />",
  payloadSha256: "hash",
  sourceSnapshot: { invoice: { invoiceNumber: "INV-1" } },
  validationResult: { valid: true, issues: [], validationVersion: "test" },
  apiResponse: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  httpStatus: null,
  attemptCount: 0,
  submittedAt: null,
  sendingStartedAt: null,
  lastCheckedAt: null,
  createdAt: now,
  updatedAt: now,
};

describe("SefSubmissionService idempotency", () => {
  it("allows only one upload claim for concurrent requests using the same key", async () => {
    const settings = {
      workspaceId,
      sefEnabled: true,
      sefEnvironment: SefEnvironment.DEMO,
      taxId: prepared.supplierTaxId,
    };
    let claim = 0;
    const submission = {
      findUnique: jest.fn().mockResolvedValue(prepared),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(async () => ({ count: claim++ === 0 ? 1 : 0 })),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        ...prepared,
        state: SefSubmissionState.SENDING,
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...prepared,
        ...data,
        updatedAt: now,
      })),
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: invoiceId }]),
      organizationSettings: { findUnique: jest.fn().mockResolvedValue(settings) },
      invoiceSefSubmission: submission,
    };
    const db = {
      ...tx,
      $transaction: jest.fn(async (work: (value: typeof tx) => unknown) => work(tx)),
      organizationSettings: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(settings),
      },
    };
    const api = {
      upload: jest.fn().mockResolvedValue({
        invoiceId: "9223372036854775807",
        salesInvoiceId: "9223372036854775806",
        purchaseInvoiceId: "9223372036854775805",
        sanitizedResponse: {},
      }),
      status: jest.fn().mockResolvedValue({ status: "Sending", response: {} }),
    };
    const service = new SefSubmissionService(
      db as never,
      {} as never,
      api as never,
      { decrypt: jest.fn().mockReturnValue("secret") } as never,
    );

    const results = await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.ADMIN },
      () =>
        Promise.all([
          service.send(invoiceId, "attempt-1"),
          service.send(invoiceId, "attempt-1"),
        ]),
    );

    expect(results).toHaveLength(2);
    expect(api.upload).toHaveBeenCalledTimes(1);
    expect(submission.updateMany).toHaveBeenCalledTimes(2);
  });

  it("returns stored submitted XML without generating or uploading again", async () => {
    const api = { upload: jest.fn() };
    const service = new SefSubmissionService(
      {
        invoiceSefSubmission: {
          findFirst: jest.fn().mockResolvedValue({
            ...prepared,
            state: SefSubmissionState.SUBMITTED,
            ublXml: "<Invoice>immutable</Invoice>",
          }),
        },
      } as never,
      { validate: jest.fn() } as never,
      api as never,
      {} as never,
    );

    const xml = await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.OWNER },
      () => service.xml(invoiceId),
    );

    expect(xml).toBe("<Invoice>immutable</Invoice>");
    expect(api.upload).not.toHaveBeenCalled();
  });
});
