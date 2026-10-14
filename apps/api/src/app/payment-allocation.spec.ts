import {
  allocatePayment,
  AllocationCandidate,
} from "../../../../libs/api/features/financials/src/lib/payment-allocation";
const row = (
  id: string,
  remainingAmount = "100.00",
  extra: Partial<AllocationCandidate> = {},
): AllocationCandidate => ({
  id,
  remainingAmount,
  invoiceNumber: id,
  dateOfCreate: "2026-01-01",
  dateOfMaturity: "2026-01-10",
  ...extra,
});
describe("payment allocation previews", () => {
  it.each([
    ["100.00", ["100.00"], "0.00"],
    ["200.00", ["100.00", "100.00"], "0.00"],
    ["50.00", ["50.00"], "0.00"],
    ["150.00", ["100.00", "50.00"], "0.00"],
    ["250.00", ["100.00", "100.00"], "50.00"],
  ])("allocates %s oldest first", (amount, expected, remainder) => {
    const result = allocatePayment(amount, [row("b"), row("a")], "AUTOMATIC");
    expect(result.allocations.map((a) => a.amount)).toEqual(expected);
    expect(result.allocations[0].invoiceId).toBe("a");
    expect(result.unallocatedAmount).toBe(remainder);
  });
  it("handles no invoices and fully paid invoices", () => {
    expect(
      allocatePayment("50.00", [row("a", "0.00")], "AUTOMATIC"),
    ).toMatchObject({ allocations: [], unallocatedAmount: "50.00" });
  });
  it("uses outstanding amounts, includes future invoices and breaks ties by issue date", () => {
    expect(
      allocatePayment(
        "50.00",
        [
          row("a", "100.00", { dateOfMaturity: "2027-01-01" }),
          row("b", "30.00", { dateOfCreate: "2025-01-01" }),
          row("c"),
        ],
        "AUTOMATIC",
      ).allocations,
    ).toEqual([
      { invoiceId: "b", amount: "30.00" },
      { invoiceId: "c", amount: "20.00" },
    ]);
    expect(
      allocatePayment(
        "500.00",
        [row("a", "100.00", { dateOfMaturity: "2027-01-01" })],
        "AUTOMATIC",
      ).allocatedAmount,
    ).toBe("100.00");
  });
  it.each([
    "invoiceNumber",
    "externalInvoiceNumber",
    "externalReference",
  ] as const)(
    "matches %s exactly ignoring case and surrounding spaces",
    (field) => {
      expect(
        allocatePayment(
          "50.00",
          [row("a"), row("b", "100.00", { [field]: "Ref-001" })],
          "AUTOMATIC",
          " ref-001 ",
        ).allocations[0].invoiceId,
      ).toBe("b");
    },
  );
  it("does not fuzzy match or discard leading zeros and warns on ambiguity", () => {
    const rows = [
      row("a", "100.00", { externalReference: "001" }),
      row("b", "100.00", { externalReference: "001" }),
    ];
    for (const reference of ["1", "001", "prefix 001"]) {
      const result = allocatePayment("50.00", rows, "AUTOMATIC", reference);
      expect(result.warning).toBeTruthy();
      expect(result.allocations[0].invoiceId).toBe("a");
    }
  });
  it("redistributes capped equal shares and leaves surplus unallocated", () => {
    const rows = [
      row("a", "10000.00"),
      row("b", "100000.00"),
      row("c", "100000.00"),
    ];
    expect(
      allocatePayment("90000.00", rows, "EQUAL").allocations.map(
        (a) => a.amount,
      ),
    ).toEqual(["10000.00", "40000.00", "40000.00"]);
    expect(allocatePayment("300000.00", rows, "EQUAL").unallocatedAmount).toBe(
      "90000.00",
    );
  });
  it("distributes rounding cents deterministically, even below one cent per row", () => {
    expect(
      allocatePayment("0.02", [row("c"), row("b"), row("a")], "EQUAL")
        .allocations,
    ).toEqual([
      { invoiceId: "a", amount: "0.01" },
      { invoiceId: "b", amount: "0.01" },
    ]);
    expect(
      allocatePayment(
        "100.00",
        [row("c"), row("b"), row("a")],
        "EQUAL",
      ).allocations.map((a) => a.amount),
    ).toEqual(["33.34", "33.33", "33.33"]);
  });
  it("supports maximum decimal amounts without floating point loss", () => {
    expect(
      allocatePayment(
        "9999999999999999.99",
        [row("a", "9999999999999999.99")],
        "EQUAL",
      ).allocatedAmount,
    ).toBe("9999999999999999.99");
  });
  it("does not prioritize references in selected-oldest mode", () => {
    expect(
      allocatePayment("50.00", [row("a"), row("b")], "SELECTED_OLDEST", "b")
        .allocations[0].invoiceId,
    ).toBe("a");
  });
});
