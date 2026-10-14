const { PrismaClient } = require("@prisma/client");
const fs = require("node:fs");
const url = process.env.PAYMENTS_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.includes("payment_collection_test"))
  throw new Error(
    "Use an explicitly configured disposable payment_collection_test database",
  );
fs.mkdirSync("tmp/payment-verification", { recursive: true });
const db = new PrismaClient({ datasourceUrl: url });
(async () => {
  const workspaceId = "11111111-1111-4111-a111-111111111111";
  const user = await db.user.findUniqueOrThrow({
    where: { email: "payment-ui@example.test" },
  });
  const client = await db.client.create({
    data: {
      workspaceId,
      clientNumber: crypto.randomUUID(),
      type: "ORGANIZATION",
      displayName: "Hotel Savski Venac d.o.o.",
      createdByUserId: user.id,
      updatedByUserId: user.id,
    },
  });
  const bank = await db.bankAccount.create({
    data: { workspaceId, name: "Test poslovni račun", currencyCode: "RSD" },
  });
  await db.organizationSettings.upsert({
    where: { workspaceId },
    update: { allowedCurrencyCodes: ["RSD", "EUR"] },
    create: {
      workspaceId,
      allowedCurrencyCodes: ["RSD", "EUR"],
      availableVatRates: [20],
      allowedSefAttachmentFileExtensions: [],
    },
  });
  const invoices = [];
  for (const [index, amount] of [96000, 96000, 132960].entries()) {
    const invoice = await db.invoice.create({
      data: {
        workspaceId,
        clientId: client.id,
        invoiceNumber: `VERIFY-${Date.now()}-${index + 1}`,
        dateOfCreate: new Date(`2026-0${index + 6}-01`),
        dateOfMaturity: new Date(`2026-0${index + 7}-15`),
        dateOfTurnover: new Date("2026-06-01"),
        placeOfIssue: "Beograd",
        methodOfPayment: "BANK_TRANSFER",
        comment: "",
        netAmount: amount,
        vatRate: 0,
        vatAmount: 0,
        grossAmount: amount,
        numberOfCashBill: "",
        country: "RS",
        currency: "RSD",
        status: "SENT",
        createdByUserId: user.id,
        updatedByUserId: user.id,
      },
    });
    invoices.push(invoice.id);
  }
  fs.writeFileSync(
    "tmp/payment-verification/fixture.json",
    JSON.stringify({ clientId: client.id, bankId: bank.id, invoices }),
  );
})().finally(() => db.$disconnect());
