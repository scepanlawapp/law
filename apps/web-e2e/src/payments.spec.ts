import { expect, Page, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
async function shell(page: Page) {
  const errors: string[] = [];
  const requests: {
    path: string;
    method: string;
    body: unknown;
    key: string | null;
  }[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const catalog = await readFile(
    resolve("apps/web/public/i18n/ser.json"),
    "utf8",
  );
  await page.route("**/i18n/*.json", (r) =>
    r.fulfill({ contentType: "application/json", body: catalog }),
  );
  let payment = {
    id: "payment-1",
    clientId: null,
    clientName: null,
    amount: "100.00",
    allocatedAmount: "0.00",
    unallocatedAmount: "100.00",
    allocationState: "UNALLOCATED",
    payerName: "Uplatilac",
    currency: "RSD",
    receivedAt: "2026-10-14",
    paymentMethod: "BANK_TRANSFER",
    purpose: "ADVANCE",
    status: "ACTIVE",
    reference: null,
    note: null,
    bankAccountId: null,
    bankAccountName: null,
    version: 1,
    createdAt: "2026-10-14T08:00:00Z",
    updatedAt: "2026-10-14T08:00:00Z",
    createdBy: "Ana",
    updatedBy: "Ana",
    voidedAt: null,
    voidReason: null,
    allocations: [],
    auditEvents: [],
  } as Record<string, unknown>;
  let failSave = false;
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const body = req.postDataJSON();
    requests.push({
      path: req.url(),
      method: req.method(),
      body,
      key: req.headers()["idempotency-key"] ?? null,
    });
    let result: unknown = {
      items: [],
      meta: { totalItems: 0, totalPages: 1, page: 1, pageSize: 100 },
    };
    if (path.endsWith("/auth/me"))
      result = {
        user: {
          id: "user-1",
          name: "Ana",
          email: "ana@example.test",
          status: "ACTIVE",
        },
        memberships: [{ workspaceId: "test-workspace", role: "OWNER" }],
      };
    if (path.endsWith("/users/me/settings"))
      result = {
        profile: {
          firstName: "Ana",
          lastName: "Test",
          email: "ana@example.test",
        },
        preferences: {
          theme: "CHARCOAL",
          accentColor: "GOLD",
          finish: "MATTE",
          language: "SR",
        },
      };
    if (path.includes("timer")) result = null;
    if (path.includes("unread")) result = { count: 0 };
    if (path.endsWith("/clients"))
      result = {
        items: [{ id: "client-1", displayName: "Klijent A" }],
        meta: { totalItems: 1, totalPages: 1, page: 1, pageSize: 100 },
      };
    if (path.endsWith("/payments/options"))
      result = {
        currencies: ["RSD", "EUR"],
        defaultCurrency: "RSD",
        today: "2026-10-14",
        bankAccounts: [],
      };
    if (path.endsWith("/payments/summary"))
      result = [
        {
          currency: "RSD",
          received: "100.00",
          allocated: "0.00",
          unallocated: "100.00",
          advances: "100.00",
          outstanding: "200.00",
          overdue: "100.00",
          unpaidInvoices: 2,
        },
      ];
    if (path.endsWith("/payments/eligible-invoices"))
      result = [1, 2].map((n) => ({
        id: "invoice-" + n,
        invoiceNumber: "R-" + n,
        clientId: "client-1",
        clientName: "Klijent A",
        currency: "RSD",
        status: "SENT",
        dateOfCreate: "2026-10-01",
        dateOfMaturity: "2026-10-10",
        grossAmount: "100.00",
        paidAmount: "0.00",
        remainingAmount: "100.00",
        collectionStatus: "UNPAID",
        overdue: true,
        daysOverdue: 4,
      }));
    if (path.endsWith("/payments")) {
      if (req.method() === "POST") {
        if (failSave) {
          failSave = false;
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ message: "Veza je prekinuta." }),
          });
          return;
        }
        payment = { ...payment, ...body };
        result = payment;
      } else
        result = {
          items: [payment],
          meta: {
            totalItems: 1,
            totalPages: 1,
            page: 1,
            pageSize: 25,
            hasPreviousPage: false,
            hasNextPage: false,
            sort: [],
          },
        };
    }
    if (path.endsWith("/payments/payment-1")) result = payment;
    if (path.endsWith("/payments/payment-1/void")) {
      payment = {
        ...payment,
        status: "VOIDED",
        voidReason: body.reason,
        unallocatedAmount: "0.00",
      };
      result = payment;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
  return {
    errors,
    requests,
    failNextSave: () => {
      failSave = true;
    },
  };
}
test("payment listing applies real server filters and has an unavailable import action", async ({
  page,
}) => {
  const state = await shell(page);
  await page.goto("/finance/payments");
  await expect(
    page.getByRole("heading", { name: "Uplate", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Uvezi bankovni izvod/ }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Neraspoređene", exact: true })
    .click();
  await expect
    .poll(() =>
      state.requests.some((r) =>
        r.path.includes("allocationState=UNALLOCATED"),
      ),
    )
    .toBeTruthy();
  await page.getByRole("button", { name: "Dodatni filteri" }).click();
  await page.locator("#filter-currency").focus();
  await page.keyboard.press("Enter");
  await page.getByRole("option", { name: "EUR", exact: true }).click();
  await expect
    .poll(() =>
      state.requests.some(
        (r) =>
          r.path.includes("currency=EUR") &&
          r.path.includes("allocationState=UNALLOCATED"),
      ),
    )
    .toBeTruthy();
  await page.screenshot({ path: "/tmp/law-payments-list.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Uplate", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/law-payments-mobile.png",
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "ivory";
    document.documentElement.dataset.accent = "royal-blue";
  });
  await expect(
    page.getByRole("heading", { name: "Uplate", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/law-payments-ivory.png",
    fullPage: true,
  });
  expect(state.errors).toEqual([]);
});
test("advance form preserves input on failure, retries and voids with confirmation", async ({
  page,
}) => {
  const state = await shell(page);
  await page.goto("/finance/payments/new");
  await page.locator('[formcontrolname="amount"]').fill("100.00");
  await page.locator("#payment-purpose").click();
  await page.getByRole("option", { name: "Avans", exact: true }).click();
  state.failNextSave();
  await page
    .getByRole("button", { name: "Sačuvaj uplatu", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Veza je prekinuta.");
  await expect(page.locator('[formcontrolname="amount"]')).toHaveValue(
    "100,00",
  );
  await page
    .getByRole("button", { name: "Sačuvaj uplatu", exact: true })
    .click();
  await expect(page).toHaveURL(/payments\/payment-1$/);
  const saves = state.requests.filter(
    (r) => r.method === "POST" && r.path.endsWith("/payments"),
  );
  expect(saves).toHaveLength(2);
  expect(saves[0].key).toBe(saves[1].key);
  await page
    .getByRole("button", { name: "Poništi uplatu", exact: true })
    .click();
  await page.getByLabel("Razlog poništavanja (obavezno)").fill("Pogrešan unos");
  await page.getByRole("button", { name: "Potvrdi poništavanje" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Poništi uplatu", exact: true })
    .click();
  await expect(
    page.getByText("Razlog poništavanja: Pogrešan unos"),
  ).toBeVisible();
  expect(state.errors).toEqual([]);
});
test("searchable client picker and multi-invoice allocation keep exact totals", async ({
  page,
}) => {
  const state = await shell(page);
  await page.goto("/finance/payments/new");
  await page.locator('[formcontrolname="amount"]').fill("150.00");
  await page.locator("#payment-client").click();
  await page.getByRole("option", { name: "Klijent A", exact: true }).click();
  const add = page.getByRole("button", {
    name: "Dodaj raspodelu",
    exact: true,
  });
  await expect(add).toHaveCount(2);
  await add.first().click();
  await expect(add).toHaveCount(1);
  await add.first().click();
  await expect(
    page.getByRole("button", { name: "Ukloni raspodelu", exact: true }),
  ).toHaveCount(2);
  await expect(page.getByText("Preostalo neraspoređeno")).toHaveText(
    /Preostalo neraspoređeno\s+0,00/,
  );
  await page
    .getByRole("button", { name: "Ukloni raspodelu", exact: true })
    .last()
    .click();
  await expect(page.getByText("Preostalo neraspoređeno")).toContainText(
    "50,00",
  );
  await page
    .getByRole("button", { name: "Sačuvaj uplatu", exact: true })
    .click();
  await expect(page).toHaveURL(/payments\/payment-1$/);
  const body = state.requests.find(
    (r) => r.method === "POST" && r.path.endsWith("/payments"),
  )?.body as { allocations: unknown[] };
  expect(body.allocations).toHaveLength(1);
  expect(state.errors).toEqual([]);
});
