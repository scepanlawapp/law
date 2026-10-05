import { WorkspaceRole } from "@law/api-interfaces";
import { WorkspaceContextService } from "@law/core";
import { OrganizationSettingsService } from "@law/financials";

describe("OrganizationSettingsService", () => {
  const base = {
    workspaceId: "ws-1",
    legalName: null,
    displayName: null,
    taxId: null,
    registrationNumber: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    postalCode: null,
    countryCode: "RS",
    email: null,
    phone: null,
    website: null,
    jbkjs: null,
    vatRegistered: false,
    defaultVatRate: null,
    availableVatRates: [0, 10, 20],
    defaultTaxCategoryCode: null,
    defaultTaxExemptionReasonCode: null,
    defaultTaxExemptionReasonText: null,
    cashAccountingEnabled: false,
    sefEnabled: false,
    sefEnvironment: "DEMO",
    sefApiKeyCiphertext: null as string | null,
    sefApiKeyIv: null as string | null,
    sefApiKeyAuthTag: null as string | null,
    invoiceNumberPattern: "{YYYY}-{SEQ:6}",
    invoiceNumberStartingSequence: 1,
    invoiceNumberIncrementBy: 1,
    invoiceNumberResetPolicy: "YEARLY",
    invoiceNumberAllowManualOverride: true,
    defaultPaymentTermDays: 15,
    defaultPaymentMethod: "BANK_TRANSFER",
    defaultPaymentModel: null,
    paymentReferencePattern: null,
    defaultCurrencyCode: "RSD",
    allowedCurrencyCodes: ["RSD"],
    exchangeRateSource: "NBS_MIDDLE",
    allowManualExchangeRate: true,
    exchangeRatePrecision: 4,
    amountPrecision: 2,
    defaultIssuePlace: null,
    defaultLanguage: "sr-Latn",
    defaultUnitOfMeasure: null,
    defaultNote: null,
    defaultFooterText: null,
    paymentQrEnabled: false,
    paymentQrStandard: "NBS_IPS",
    paymentQrAccountId: null as string | null,
    paymentQrPurposeTemplate: "Plaćanje po fakturi {{invoiceNumber}}",
    paymentQrReferenceModel: null as string | null,
    paymentQrReferenceTemplate: null as string | null,
    includeGeneratedInvoicePdf: false,
    includeUserAttachments: true,
    allowedSefAttachmentFileExtensions: [],
    maxSefAttachmentCount: null,
    maxSefSingleFileSizeMb: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let record = { ...base };
  const db = {
    organizationSettings: {
      upsert: jest.fn(async ({ create, update }: any) => {
        record = { ...record, ...create, ...update };
        return record;
      }),
    },
    bankAccount: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => ({
        id: "account-1",
        workspaceId: "ws-1",
        active: true,
        currencyCode: "RSD",
        accountNumber: "160-1234567890123-45",
      })),
    },
  };
  const config = {
    get: jest.fn(() => "a-secure-test-key-with-at-least-32-characters"),
  };
  const numbering = { validatePattern: jest.fn() };
  const service = new OrganizationSettingsService(
    db as never,
    config as never,
    numbering as never,
  );
  const run = <T>(fn: () => T) =>
    WorkspaceContextService.run(
      { workspaceId: "ws-1", userId: "u-1", role: WorkspaceRole.OWNER },
      fn,
    );

  beforeEach(() => {
    record = { ...base };
    jest.clearAllMocks();
  });

  it("lazily returns workspace defaults scoped by workspace id", async () => {
    const result = await run(() => service.get());
    expect(result.invoiceNumbering.pattern).toBe("{YYYY}-{SEQ:6}");
    expect(db.organizationSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "ws-1" } }),
    );
    expect(result.paymentQr.enabled).toBe(false);
  });

  it("stores a valid enabled NBS IPS payment QR configuration", async () => {
    record = { ...record, legalName: "Primer DOO" };
    const result = await run(() =>
      service.updatePaymentQr({
        enabled: true,
        paymentStandard: "NBS_IPS",
        paymentAccountId: "account-1",
        paymentPurposeTemplate: "Faktura {{invoiceNumber}}",
        referenceModel: "97",
        referenceTemplate: "{{invoiceNumber}}",
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        enabled: true,
        paymentAccountId: "account-1",
        referenceModel: "97",
      }),
    );
  });

  it("rejects enabling payment QR without company and account data", async () => {
    await expect(
      run(() =>
        service.updatePaymentQr({
          enabled: true,
          paymentStandard: "NBS_IPS",
          paymentAccountId: null,
          paymentPurposeTemplate: "Faktura {{invoiceNumber}}",
          referenceModel: null,
          referenceTemplate: null,
        }),
      ),
    ).rejects.toThrow("Company name is required");
  });

  it("stores the SEF key encrypted and only returns masked state", async () => {
    const result = await run(() => service.replaceSefApiKey("raw-secret-key"));
    expect(record.sefApiKeyCiphertext).not.toBe("raw-secret-key");
    expect(record.sefApiKeyCiphertext).toBeTruthy();
    expect(result).toEqual(
      expect.objectContaining({
        hasApiKey: true,
        maskedApiKey: "••••••••••••",
      }),
    );
    expect(JSON.stringify(result)).not.toContain("raw-secret-key");
  });

  it("replaces and removes the encrypted SEF key", async () => {
    await run(() => service.replaceSefApiKey("first-secret"));
    const first = record.sefApiKeyCiphertext;
    await run(() => service.replaceSefApiKey("second-secret"));
    expect(record.sefApiKeyCiphertext).not.toBe(first);
    const result = await run(() => service.removeSefApiKey());
    expect(result.hasApiKey).toBe(false);
    expect(record.sefApiKeyCiphertext).toBeNull();
  });
});
