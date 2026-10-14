const { chromium, expect } = require("@playwright/test");
const fs = require("node:fs");
(async () => {
  const fixture = JSON.parse(
    fs.readFileSync("tmp/payment-verification/fixture.json"),
  );
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
  });
  const login = await context.request.post(
    "http://localhost:3002/api/auth/login",
    {
      headers: { Origin: "http://localhost:4200" },
      data: { email: "payment-ui@example.test", password: "PaymentVerify2026" },
    },
  );
  if (!login.ok())
    throw Error("Login " + login.status() + " " + (await login.text()));
  await context.route("**/config.json", (r) =>
    r.fulfill({ json: { apiUrl: "http://localhost:3002", apiPrefix: "/api" } }),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(
      "http://localhost:4200/finance/payments/new?clientId=" + fixture.clientId,
    );

    await page.locator('[formcontrolname="amount"]').fill("400000");
    const inputs = page.locator('input[id^="allocation-"]');
    await expect(inputs).toHaveCount(3);
    for (const input of await inputs.all())
      await expect(input).toHaveValue("0,00");
    await page.getByRole("button", { name: /Automatski rasporedi/ }).focus();
    await page
      .getByRole("button", { name: /Automatski rasporedi/ })
      .press("Enter");
    await expect(
      page.getByRole("status").filter({ hasText: "Predlog raspodele" }),
    ).toContainText("75.040,00");
    await expect(inputs.nth(0)).toHaveValue("96.000,00");
    await expect(inputs.nth(2)).toHaveValue("132.960,00");
    await page.screenshot({
      path: "tmp/payment-verification/desktop.png",
      fullPage: true,
      animations: "disabled",
    });
    await inputs.first().click();
    await inputs.first().fill("90000");
    await inputs.first().blur();
    await expect(
      page.getByText("Preostalo za raspodelu", { exact: false }).last(),
    ).toContainText("81.040,00");
    await page
      .getByRole("button", { name: "Obriši predlog", exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: "Izaberi sve dostupne fakture" })
      .check();
    await page.locator('[formcontrolname="amount"]').click();
    await page.locator('[formcontrolname="amount"]').fill("90000");
    await page.getByRole("button", { name: /Rasporedi jednako/ }).click();
    await expect(inputs.nth(0)).toHaveValue("30.000,00");
    await expect(inputs.nth(2)).toHaveValue("30.000,00");
    await page
      .getByRole("button", { name: "Obriši predlog", exact: true })
      .click();
    await page.locator('[formcontrolname="amount"]').click();
    await page.locator('[formcontrolname="amount"]').fill("300000");
    await page.getByRole("button", { name: /Rasporedi jednako/ }).click();
    await expect(inputs.nth(0)).toHaveValue("96.000,00");
    await expect(inputs.nth(2)).toHaveValue("108.000,00");
    await page
      .getByRole("button", { name: "Obriši predlog", exact: true })
      .click();
    await page.locator('[formcontrolname="amount"]').click();
    await page.locator('[formcontrolname="amount"]').fill("400000");
    await page
      .getByRole("button", { name: "Izabrane po dospeću", exact: true })
      .click();
    await expect(inputs.nth(2)).toHaveValue("132.960,00");
    await page
      .getByRole("button", { name: "Obriši predlog", exact: true })
      .click();
    await page.getByRole("button", { name: /Rasporedi jednako/ }).click();
    await expect(inputs.nth(0)).toHaveValue("96.000,00");
    await expect(inputs.nth(2)).toHaveValue("132.960,00");
    await page.screenshot({
      path: "tmp/payment-verification/selected.png",
      fullPage: true,
      animations: "disabled",
    });
    await page
      .getByRole("checkbox", { name: "Izaberi sve dostupne fakture" })
      .uncheck();
    await expect(inputs.nth(0)).toHaveValue("96.000,00");
    await page.getByText("Dodatni podaci o uplati", { exact: true }).click();
    await page.locator("#payment-bank").click();
    await page
      .getByRole("option", { name: /Test poslovni račun/ })
      .first()
      .click();
    await page.getByLabel("Broj bankovnog izvoda (opciono)").fill("015/2026");
    await page.screenshot({
      path: "tmp/payment-verification/details.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("button", { name: /Automatski rasporedi/ }),
    ).toBeVisible();
    await page.screenshot({
      path: "tmp/payment-verification/mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    if (
      await page
        .locator("law-payment-form fieldset")
        .evaluate((e) => e.getBoundingClientRect().right > innerWidth)
    )
      throw Error("Mobile form overflows horizontally");
    await page
      .getByRole("button", { name: /Automatski rasporedi/ })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "tmp/payment-verification/mobile-allocation.png",
      animations: "disabled",
    });
    await page.setViewportSize({ width: 1600, height: 1200 });
    await page
      .getByRole("button", { name: "Sačuvaj uplatu", exact: true })
      .click();
    await expect(page).toHaveURL(/payments\/[a-f0-9-]+$/);
    const id = page.url().split("/").pop();
    let detail = await (
      await context.request.get(
        "http://localhost:3002/api/financials/payments/" + id,
      )
    ).json();
    expect(detail.bankStatementNumber).toBe("015/2026");
    expect(detail.allocatedAmount).toBe("324960.00");
    await page.goto(
      "http://localhost:4200/finance/payments/new?clientId=" + fixture.clientId,
    );
    await expect(
      page.getByText(
        "Nema poslatih faktura sa preostalim dugom u izabranoj valuti.",
      ),
    ).toBeVisible();
    await page.goto("http://localhost:4200/finance/payments/" + id + "/edit");
    await expect(inputs).toHaveCount(3);
    await expect(inputs.nth(0)).toHaveValue("96.000,00");
    await expect(
      page.getByLabel("Broj bankovnog izvoda (opciono)"),
    ).toHaveValue("015/2026");
    const collection = await (
      await context.request.get(
        "http://localhost:3002/api/financials/payments/invoice/" +
          fixture.invoices[0] +
          "/collection",
      )
    ).json();
    expect(collection.remainingAmount).toBe("0.00");
    // Release test allocations for an existing-advance workflow.
    await page
      .getByRole("button", { name: "Obriši predlog", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Sačuvaj uplatu", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sačuvaj", exact: true })
      .click();
    await expect(page).toHaveURL(/payments\/[a-f0-9-]+$/);
    await page.goto(
      "http://localhost:4200/finance/payments/new?clientId=" + fixture.clientId,
    );

    await page.locator('[formcontrolname="amount"]').fill("10000");
    await page.getByText("Dodatni podaci o uplati", { exact: true }).click();
    await page.locator("#payment-purpose").click();
    await page.getByRole("option", { name: "Avans", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /Automatski rasporedi/ }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Sačuvaj uplatu", exact: true })
      .click();
    await expect(page).toHaveURL(/payments\/[a-f0-9-]+$/);
    const advanceId = page.url().split("/").pop();
    detail = await (
      await context.request.get(
        "http://localhost:3002/api/financials/payments/" + advanceId,
      )
    ).json();
    expect(detail.allocatedAmount).toBe("0.00");
    await page.goto(
      "http://localhost:4200/finance/payments/" + advanceId + "/edit",
    );
    await page.getByRole("button", { name: /Automatski rasporedi/ }).click();
    await expect(inputs.nth(0)).toHaveValue("10.000,00");
    await page
      .getByRole("button", { name: "Sačuvaj uplatu", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sačuvaj", exact: true })
      .click();
    await expect(page).toHaveURL(/payments\/[a-f0-9-]+$/);
    detail = await (
      await context.request.get(
        "http://localhost:3002/api/financials/payments/" + advanceId,
      )
    ).json();
    expect(detail.purpose).toBe("ADVANCE");
    expect(detail.allocatedAmount).toBe("10000.00");
    expect(errors).toEqual([]);
    console.log(
      "PASS: real API/browser allocation, capped equal, manual edits, independent selection, save/reload, balances, bank statement, advance and mobile workflows",
    );
  } catch (e) {
    await page.screenshot({
      path: "tmp/payment-verification/failure.png",
      fullPage: true,
      animations: "disabled",
    });
    console.error((await page.locator("body").innerText()).slice(-4500));
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
