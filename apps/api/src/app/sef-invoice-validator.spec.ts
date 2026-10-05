import {
  SefInvoiceSnapshot,
  SefInvoiceValidator,
  SefUblBuilder,
} from "@law/financials";

const snapshot = (): SefInvoiceSnapshot => ({
  invoice: {
    id: "invoice-1",
    invoiceNumber: "2026-000001 & test",
    issueDate: "2026-10-05",
    dueDate: "2026-10-20",
    supplyDate: "2026-10-01",
    currency: "RSD",
    comment: "Usluge <pravnog> savetovanja",
    methodOfPayment: "BANK_TRANSFER",
    vatLiabilityTimingCode: "35",
    netAmount: "1500.00",
    vatAmount: "200.00",
    grossAmount: "1700.00",
  },
  supplier: {
    name: "Advokatsko društvo & partneri",
    taxId: "123456789",
    registrationNumber: "12345678",
    addressLine: "Knez Mihailova 1",
    city: "Beograd",
    postalCode: "11000",
    countryCode: "RS",
    vatRegistered: true,
  },
  customer: {
    name: "Privredno društvo <Kupac>",
    taxId: "987654321",
    registrationNumber: "87654321",
    addressLine: "Bulevar 2",
    city: "Novi Sad",
    postalCode: "21000",
    countryCode: "RS",
    isDomestic: true,
    isPublicSector: false,
    jbkjs: null,
  },
  payment: {
    accountId: "account-1",
    accountNumber: "160-0000000000000-00",
    model: "97",
    reference: "2026-000001",
  },
  lines: [
    {
      id: "line-1",
      description: "Zastupanje & savetovanje",
      serviceDate: "2026-10-01",
      currency: "RSD",
      netAmount: "1000.00",
      vatRate: "20",
      vatAmount: "200.00",
      grossAmount: "1200.00",
      taxCategoryCode: "S20",
      taxExemptionReasonCode: null,
      taxExemptionReasonText: null,
      pricingRequired: false,
    },
    {
      id: "line-2",
      description: "Oslobođena usluga",
      serviceDate: "2026-10-01",
      currency: "RSD",
      netAmount: "500.00",
      vatRate: "0",
      vatAmount: "0.00",
      grossAmount: "500.00",
      taxCategoryCode: "E",
      taxExemptionReasonCode: "PDV-RS-25",
      taxExemptionReasonText: "Oslobođeno po članu 25",
      pricingRequired: false,
    },
  ],
});

describe("SEF UBL validation", () => {
  const validator = new SefInvoiceValidator(new SefUblBuilder());

  it("builds escaped, mixed-tax UBL that validates against bundled UBL 2.1 XSD", () => {
    const result = validator.validate(snapshot());

    expect(result.validation).toEqual(
      expect.objectContaining({ valid: true, issues: [] }),
    );
    expect(result.xml).toContain("2026-000001 &amp; test");
    expect(result.xml).toContain("Privredno društvo &lt;Kupac&gt;");
    expect(result.xml).toContain('unitCode="H87"');
    expect(result.xml).toContain("<cbc:ID>S</cbc:ID>");
    expect(result.xml).toContain("<cbc:ID>E</cbc:ID>");
  });

  it("rejects inconsistent arithmetic before producing XML", () => {
    const value = snapshot();
    value.lines[0].grossAmount = "1200.01";

    const result = validator.validate(value);

    expect(result.validation.valid).toBe(false);
    expect(result.validation.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "INCONSISTENT_AMOUNTS" })]),
    );
    expect(result.xml).toBeNull();
  });

  it("blocks unsupported public-sector recipients before upload", () => {
    const value = snapshot();
    value.customer.isPublicSector = true;
    value.customer.jbkjs = "12345";

    const result = validator.validate(value);

    expect(result.validation.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "UNSUPPORTED_PUBLIC_SECTOR" })]),
    );
  });

  it("reports required data, date, currency, pricing, and exemption errors together", () => {
    const value = snapshot();
    value.supplier.taxId = "";
    value.customer.addressLine = "";
    value.invoice.currency = "EUR";
    value.invoice.supplyDate = "2026-10-06";
    value.invoice.dueDate = "2026-10-04";
    value.lines[0].pricingRequired = true;
    value.lines[1].taxExemptionReasonCode = null;
    value.lines[1].taxExemptionReasonText = null;

    const codes = validator
      .validate(value)
      .validation.issues.map((issue) => issue.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        "ISSUER_TAX_ID_INVALID",
        "ADDRESS_REQUIRED",
        "UNSUPPORTED_CURRENCY",
        "SUPPLY_DATE_AFTER_ISSUE",
        "DUE_DATE_BEFORE_ISSUE",
        "PRICING_REQUIRED",
        "EXEMPTION_CODE_REQUIRED",
        "EXEMPTION_TEXT_REQUIRED",
      ]),
    );
  });
});
