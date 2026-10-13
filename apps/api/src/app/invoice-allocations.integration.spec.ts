import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { WorkspaceRole } from "@law/api-interfaces";
import { WorkspaceContextService, HARDCODED_WORKSPACE_ID } from "@law/core";
import { FinancialsService } from "@law/financials";

// Load the generated runtime explicitly: Nx's Jest resolver can select
// the .d.ts target of Prisma's private #main-entry-point package import.
jest.mock("@prisma/client", () =>
  jest.requireActual("../../../../node_modules/.prisma/client/index.js"),
);

// Explicit opt-in; all test records and mutations roll back, including on failure.
const integration =
  process.env.RUN_INVOICE_ALLOCATION_INTEGRATION === "1"
    ? describe
    : describe.skip;
integration("invoice allocations against PostgreSQL", () => {
  it("saves, reloads and edits the 380 EUR example without changing original snapshots", async () => {
    config({ path: resolve(__dirname, "../../../../.env") });
    const db = new PrismaClient();
    const rolledBack = new Error("ROLLBACK_INVOICE_ALLOCATION_TEST");
    try {
      await db.$transaction(
        async (tx) => {
          const client = await tx.client.findFirstOrThrow({
            where: { workspaceId: HARDCODED_WORKSPACE_ID },
          });
          const user = await tx.user.findFirstOrThrow();
          const work = [];
          for (const [value, currency] of [
            [100, "EUR"],
            [200, "USD"],
            [50, "EUR"],
          ] as const) {
            work.push(
              await tx.workEntry.create({
                data: {
                  workspaceId: HARDCODED_WORKSPACE_ID,
                  userId: user.id,
                  clientId: client.id,
                  workDate: new Date("2026-10-13"),
                  title: "Invoice allocation integration test",
                  minutes: 12,
                  treatment: "HOURLY",
                  status: "CONFIRMED",
                  value,
                  currency,
                  createdByUserId: user.id,
                  updatedByUserId: user.id,
                },
              }),
            );
          }
          // Let the production service use the same outer rollback transaction for every read/write.
          const transactionalDb = Object.assign(Object.create(tx), {
            $transaction: (callback: (transaction: typeof tx) => unknown) =>
              callback(tx),
          });
          const service = new FinancialsService(
            transactionalDb as never,
            {
              allocateInvoiceNumber: async () =>
                `allocation-test-${randomUUID()}`,
            } as never,
          );
          await WorkspaceContextService.run(
            {
              workspaceId: HARDCODED_WORKSPACE_ID,
              userId: user.id,
              role: WorkspaceRole.ADMIN,
            },
            async () => {
              const line = {
                serviceDate: "2026-10-13",
                description: "Allocation integration test",
                currency: "EUR",
                netAmount: 380,
                vatRate: 20,
                vatAmount: 76,
                grossAmount: 456,
                additionalAmount: 30,
                workEntryIds: work.map((entry) => entry.id),
                workEntryAllocations: work.map((entry, index) => ({
                  workEntryId: entry.id,
                  invoiceValue: [100, 180, 70][index],
                })),
              };
              const created = await service.createInvoice({
                clientId: client.id,
                dateOfCreate: "2026-10-13",
                dateOfMaturity: "2026-10-31",
                dateOfTurnover: "2026-10-13",
                placeOfIssue: "Beograd",
                methodOfPayment: "BANK_TRANSFER",
                comment: "",
                numberOfCashBill: "",
                country: "RS",
                currency: "EUR",
                netAmount: 380,
                vatRate: 20,
                vatAmount: 76,
                grossAmount: 456,
                lines: [line],
              });
              const loaded = await service.getInvoice(created.id);
              expect(loaded.lines[0]).toMatchObject({
                netAmount: "380",
                additionalAmount: "30",
              });
              expect(loaded.lines[0].workEntryAllocations).toEqual(
                expect.arrayContaining([
                  {
                    workEntryId: work[1].id,
                    originalValue: "200",
                    originalCurrency: "USD",
                    invoiceValue: "180",
                    currency: "EUR",
                  },
                ]),
              );
              const entry = await tx.workEntry.findUniqueOrThrow({
                where: { id: work[1].id },
              });
              expect(entry.value?.toString()).toBe("180");
              expect(entry.currency).toBe("EUR");
              expect(entry.minutes).toBe(12);
              expect(entry.title).toBe(work[1].title);
              const edited = await service.updateInvoice(created.id, {
                lines: [
                  {
                    ...line,
                    id: loaded.lines[0].id,
                    netAmount: 390,
                    vatAmount: 78,
                    grossAmount: 468,
                    workEntryAllocations: line.workEntryAllocations.map(
                      (allocation, index) => ({
                        ...allocation,
                        invoiceValue:
                          index === 1 ? 190 : allocation.invoiceValue,
                      }),
                    ),
                  },
                ],
              });
              expect(edited.lines[0].netAmount).toBe("390");
              expect(edited.lines[0].workEntryAllocations).toEqual(
                expect.arrayContaining([
                  {
                    workEntryId: work[1].id,
                    originalValue: "200",
                    originalCurrency: "USD",
                    invoiceValue: "190",
                    currency: "EUR",
                  },
                ]),
              );
              expect(
                await tx.invoiceWorkEntryAllocation.count({
                  where: {
                    workspaceId: HARDCODED_WORKSPACE_ID,
                    invoiceLine: { invoiceId: created.id },
                  },
                }),
              ).toBe(3);
            },
          );
          throw rolledBack;
        },
        { timeout: 30_000 },
      );
    } catch (error) {
      if (error !== rolledBack) throw error;
    } finally {
      await db.$disconnect();
    }
  }, 40_000);
});
