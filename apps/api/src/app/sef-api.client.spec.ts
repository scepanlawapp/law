import { SefApiClient, sefApiInternals } from "@law/financials";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

describe("SefApiClient", () => {
  afterEach(() => jest.restoreAllMocks());

  it("preserves identifiers larger than JavaScript's safe integer range", () => {
    expect(
      sefApiInternals.parsePrecisionSafeJson(
        '{"InvoiceId":9223372036854775807,"SalesInvoiceId":9223372036854775806,"PurchaseInvoiceId":9223372036854775805}',
      ),
    ).toEqual({
      InvoiceId: "9223372036854775807",
      SalesInvoiceId: "9223372036854775806",
      PurchaseInvoiceId: "9223372036854775805",
    });
  });

  it("uses the documented multipart field, query flags and API-key header", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        '{"InvoiceId":9223372036854775807,"SalesInvoiceId":9223372036854775806,"PurchaseInvoiceId":9223372036854775805}',
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await new SefApiClient().upload({
      apiKey: "demo-secret",
      requestId: "request-1",
      invoiceNumber: "INV/1",
      xml: "<Invoice />",
    });

    expect(result.salesInvoiceId).toBe("9223372036854775806");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(
      "/api/publicApi/sales-invoice/ubl/upload?requestId=request-1&executeValidation=true&sendToCir=No",
    );
    expect(init?.headers).toEqual(
      expect.objectContaining({ ApiKey: "demo-secret" }),
    );
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get("ublFile")).toBeInstanceOf(Blob);
  });

  it("does not retry an upload whose network outcome is unknown", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockRejectedValue(new Error("connection reset"));

    await expect(
      new SefApiClient().upload({
        apiKey: "demo-secret",
        requestId: "request-2",
        invoiceNumber: "INV-2",
        xml: "<Invoice />",
      }),
    ).rejects.toMatchObject({
      code: "SEF_UPLOAD_OUTCOME_UNKNOWN",
      outcome: "UNKNOWN",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

const describeDemo = process.env.RUN_SEF_DEMO_INTEGRATION === "1"
  ? describe
  : describe.skip;

describeDemo("SEF DEMO smoke test", () => {
  it("uploads one explicitly supplied DEMO UBL and reads its status", async () => {
    const apiKey = process.env.SEF_DEMO_API_KEY?.trim();
    const ublPath = process.env.SEF_DEMO_UBL_FILE?.trim();
    if (!apiKey || !ublPath)
      throw new Error(
        "SEF_DEMO_API_KEY and SEF_DEMO_UBL_FILE are required for the opt-in DEMO test",
      );
    const xml = readFileSync(ublPath, "utf8");
    const client = new SefApiClient();

    const uploaded = await client.upload({
      apiKey,
      requestId: randomUUID(),
      invoiceNumber: `codex-demo-${Date.now()}`,
      xml,
    });
    const status = await client.status(apiKey, uploaded.salesInvoiceId);

    expect(uploaded.invoiceId).toBeTruthy();
    expect(uploaded.salesInvoiceId).toBeTruthy();
    expect(status.status).toBeTruthy();
  });
});
