import { BadRequestException } from "@nestjs/common";
import { InvoiceNumberResetPolicy } from "@prisma/client";
import { WorkspaceRole } from "@law/api-interfaces";
import { WorkspaceContextService } from "@law/core";
import { InvoiceNumberingService } from "@law/financials";

describe("InvoiceNumberingService", () => {
  const settings = {
    invoiceNumberPattern: "FA-{YYYY}-{MM}-{SEQ:5}",
    invoiceNumberStartingSequence: 1,
    invoiceNumberIncrementBy: 1,
    invoiceNumberResetPolicy: InvoiceNumberResetPolicy.YEARLY,
  };
  const db = {
    organizationSettings: { findUnique: jest.fn(async () => settings) },
    invoiceNumberSequenceState: { findUnique: jest.fn(), upsert: jest.fn() },
  };
  const service = new InvoiceNumberingService(db as never);
  const date = new Date("2026-10-04T00:00:00.000Z");

  beforeEach(() => jest.clearAllMocks());

  it.each(["{YYYY}-{SEQ:6}", "FA-{YY}/{SEQ:4}", "{SEQ}/{MM}/{YYYY}"])(
    "accepts %s",
    (pattern) => {
      expect(() => service.validatePattern(pattern)).not.toThrow();
    },
  );

  it.each(["{FOO}-{SEQ}", "{SEQ}-{SEQ}", "{SEQ:ABC}"])(
    "rejects %s",
    (pattern) => {
      expect(() => service.validatePattern(pattern)).toThrow(
        BadRequestException,
      );
    },
  );

  it("renders supported date and padded sequence tokens", () => {
    expect(service.renderPattern("FA-{YYYY}-{MM}-{SEQ:5}", date, 23)).toBe(
      "FA-2026-10-00023",
    );
    expect(service.renderPattern("{YY}-{M}-{SEQ}", date, 23)).toBe("26-10-23");
  });

  it("parses only numbers matching the active pattern and date", () => {
    expect(
      service.parsePattern("FA-{YYYY}-{MM}-{SEQ:5}", "FA-2026-10-00150", date),
    ).toBe(150);
    expect(
      service.parsePattern("FA-{YYYY}-{MM}-{SEQ:5}", "manual-150", date),
    ).toBeNull();
  });

  it.each([
    [InvoiceNumberResetPolicy.NEVER, "global"],
    [InvoiceNumberResetPolicy.YEARLY, "2026"],
    [InvoiceNumberResetPolicy.MONTHLY, "2026-10"],
  ])("builds %s period keys", (policy, expected) => {
    expect(service.getPeriodKey(policy, date)).toBe(expected);
  });

  it("suggests the configured next sequence without reserving it", async () => {
    db.invoiceNumberSequenceState.findUnique.mockResolvedValue({
      lastSequenceValue: 124,
    });
    const result = await WorkspaceContextService.run(
      { workspaceId: "ws-1", userId: "u-1", role: WorkspaceRole.OWNER },
      () => service.suggestInvoiceNumber(date),
    );
    expect(result).toBe("FA-2026-10-00125");
    expect(db.invoiceNumberSequenceState.upsert).not.toHaveBeenCalled();
  });
});
