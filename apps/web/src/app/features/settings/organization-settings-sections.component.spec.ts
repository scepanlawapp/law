import { renderInvoiceNumberPreview } from "./organization-settings-sections.component";

describe("organization invoice-number preview", () => {
  const date = new Date(2026, 3, 4);

  it("renders full and short year tokens", () => {
    expect(renderInvoiceNumberPreview("{YYYY}-{SEQ}", date, 1)).toBe("2026-1");
    expect(renderInvoiceNumberPreview("{YY}-{SEQ}", date, 1)).toBe("26-1");
  });

  it("renders padded and unpadded month tokens", () => {
    expect(renderInvoiceNumberPreview("{MM}-{SEQ}", date, 1)).toBe("04-1");
    expect(renderInvoiceNumberPreview("{M}-{SEQ}", date, 1)).toBe("4-1");
  });

  it("pads sequence tokens", () => {
    expect(renderInvoiceNumberPreview("FA-{SEQ:6}", date, 23)).toBe(
      "FA-000023",
    );
  });
});
