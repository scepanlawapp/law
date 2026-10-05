import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export interface MonetaryLine {
  netAmount: Prisma.Decimal | number | string;
  vatRate: Prisma.Decimal | number | string;
  vatAmount: Prisma.Decimal | number | string;
  grossAmount: Prisma.Decimal | number | string;
  taxCategoryCode?: string | null;
  taxExemptionReasonCode?: string | null;
}

const money = (value: Prisma.Decimal.Value) =>
  new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export function calculateLine(line: MonetaryLine) {
  const net = money(line.netAmount);
  const rate = new Prisma.Decimal(line.vatRate);
  const expectedVat = money(net.mul(rate).div(100));
  const expectedGross = money(net.add(expectedVat));
  return { net, rate, vat: expectedVat, gross: expectedGross };
}

export function verifyInvoiceMoney(
  invoice: {
    netAmount: Prisma.Decimal | number | string;
    vatAmount: Prisma.Decimal | number | string;
    grossAmount: Prisma.Decimal | number | string;
  },
  lines: MonetaryLine[],
): void {
  if (!lines.length) throw new ConflictException("Invoice requires at least one line");
  let net = money(0);
  let vat = money(0);
  let gross = money(0);
  lines.forEach((line, index) => {
    const calculated = calculateLine(line);
    if (!money(line.vatAmount).eq(calculated.vat))
      throw new ConflictException(`Invoice line ${index + 1} VAT amount is inconsistent`);
    if (!money(line.grossAmount).eq(calculated.gross))
      throw new ConflictException(`Invoice line ${index + 1} gross amount is inconsistent`);
    net = money(net.add(calculated.net));
    vat = money(vat.add(calculated.vat));
    gross = money(gross.add(calculated.gross));
  });
  if (!money(invoice.netAmount).eq(net))
    throw new ConflictException("Invoice net amount does not match its lines");
  if (!money(invoice.vatAmount).eq(vat))
    throw new ConflictException("Invoice VAT amount does not match its lines");
  if (!money(invoice.grossAmount).eq(gross))
    throw new ConflictException("Invoice gross amount does not match its lines");
}

export function calculateInvoiceMoney(lines: MonetaryLine[]) {
  return lines.reduce(
    (total, line) => {
      const calculated = calculateLine(line);
      return {
        netAmount: money(total.netAmount.add(calculated.net)),
        vatAmount: money(total.vatAmount.add(calculated.vat)),
        grossAmount: money(total.grossAmount.add(calculated.gross)),
      };
    },
    {
      netAmount: money(0),
      vatAmount: money(0),
      grossAmount: money(0),
    },
  );
}

export function formatMoney(value: Prisma.Decimal.Value): string {
  return money(value).toFixed(2);
}
