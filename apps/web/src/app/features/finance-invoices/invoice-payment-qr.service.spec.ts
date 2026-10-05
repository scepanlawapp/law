import { Invoice, OrganizationSettings } from "@law/api-interfaces";
import {
  InvoicePaymentQrService,
  interpolateInvoicePaymentTemplate,
  normalizeSerbianPaymentAccount,
} from "./invoice-payment-qr.service";

describe("InvoicePaymentQrService", () => {
  const service = new InvoicePaymentQrService();
  const invoice = {
    invoiceNumber: "FA-2026-0001",
    grossAmount: "1234.50",
    currency: "RSD",
    dateOfMaturity: "2026-10-20",
    client: { displayName: "Klijent DOO" },
  } as Invoice;
  const settings = {
    company: {
      legalName: "Advokatsko društvo Primer",
      displayName: "Primer",
      addressLine1: "Nemanjina 1",
      addressLine2: null,
      postalCode: "11000",
      city: "Beograd",
    },
    paymentQr: {
      enabled: true,
      paymentStandard: "NBS_IPS",
      paymentAccountId: "account-1",
      paymentPurposeTemplate: "Faktura {{invoiceNumber}}",
      referenceModel: null,
      referenceTemplate: null,
    },
    bankAccounts: [
      {
        id: "account-1",
        name: "Dinarski račun",
        bankName: "Banka",
        accountNumber: "160-1234567890123-45",
        iban: null,
        swiftBic: null,
        currencyCode: "RSD",
        isDefault: true,
        active: true,
      },
    ],
  } as OrganizationSettings;

  it("does not generate a payload when the feature is disabled", () => {
    expect(
      service.generate(invoice, {
        ...settings,
        paymentQr: { ...settings.paymentQr, enabled: false },
      }),
    ).toBeNull();
  });

  it("generates a valid NBS IPS payload from invoice and company data", () => {
    expect(service.generate(invoice, settings)).toBe(
      "K:PR|V:01|C:1|R:160123456789012345|" +
        "N:Advokatsko društvo Primer\nNemanjina 1\n11000 Beograd|" +
        "I:RSD1234,50|SF:221|S:Faktura FA-2026-0001",
    );
  });

  it("rejects a missing account and an account in another currency", () => {
    expect(
      service.generate(invoice, {
        ...settings,
        paymentQr: { ...settings.paymentQr, paymentAccountId: "missing" },
      }),
    ).toBeNull();
    expect(
      service.generate(invoice, {
        ...settings,
        bankAccounts: [{ ...settings.bankAccounts[0], currencyCode: "EUR" }],
      }),
    ).toBeNull();
  });

  it("rejects invoices outside the supported RSD payment flow", () => {
    expect(
      service.generate({ ...invoice, currency: "EUR" }, settings),
    ).toBeNull();
    expect(
      service.generate({ ...invoice, grossAmount: "not-an-amount" }, settings),
    ).toBeNull();
  });

  it("adds model 00 and computed model 97 payment references", () => {
    const model00 = service.generate(invoice, {
      ...settings,
      paymentQr: {
        ...settings.paymentQr,
        referenceModel: "00",
        referenceTemplate: "2026-0001",
      },
    });
    expect(model00).toContain("|RO:0020260001");

    const model97 = service.generate(invoice, {
      ...settings,
      paymentQr: {
        ...settings.paymentQr,
        referenceModel: "97",
        referenceTemplate: "20260001",
      },
    });
    expect(model97).toMatch(/\|RO:97\d{10}$/);
  });

  it("rejects incomplete or invalid optional reference configuration", () => {
    expect(
      service.generate(invoice, {
        ...settings,
        paymentQr: {
          ...settings.paymentQr,
          referenceModel: "97",
          referenceTemplate: null,
        },
      }),
    ).toBeNull();
    expect(
      service.generate(invoice, {
        ...settings,
        paymentQr: {
          ...settings.paymentQr,
          referenceModel: "97",
          referenceTemplate: "ABC",
        },
      }),
    ).toBeNull();
  });

  it("remains backward compatible when payment QR settings are unavailable", () => {
    expect(service.generate(invoice, null)).toBeNull();
    expect(
      service.generate(invoice, {
        ...settings,
        paymentQr: undefined,
      } as unknown as OrganizationSettings),
    ).toBeNull();
  });
});

describe("invoice payment QR helpers", () => {
  it("interpolates every supported template variable", () => {
    expect(
      interpolateInvoicePaymentTemplate(
        "{{invoiceNumber}} {{customerName}} {{amount}} {{currency}} {{dueDate}}",
        {
          invoiceNumber: "FA-1",
          customerName: "Klijent",
          amount: "100.00",
          currency: "RSD",
          dueDate: "2026-10-20",
        },
      ),
    ).toBe("FA-1 Klijent 100.00 RSD 2026-10-20");
  });

  it("normalizes domestic account numbers", () => {
    expect(normalizeSerbianPaymentAccount("160-1234567890123-45")).toBe(
      "160123456789012345",
    );
    expect(normalizeSerbianPaymentAccount("160-1-45")).toBe(
      "160000000000000145",
    );
    expect(normalizeSerbianPaymentAccount("RS35160123456789012345")).toBeNull();
  });
});
