import { expect, Page, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const october = "from=2026-10-01&to=2026-10-31";
async function mockShell(
  page: Page,
  role = "OWNER",
  language: "SR" | "EN" = "SR",
) {
  const errors: string[] = [];
  const writes: string[] = [];
  const financialReads: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const catalog = await readFile(
    resolve(`apps/web/public/i18n/${language === "EN" ? "eng" : "ser"}.json`),
    "utf8",
  );
  await page.route("**/i18n/*.json", (route) =>
    route.fulfill({ contentType: "application/json", body: catalog }),
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") writes.push(path);
    if (/\/billing|\/revenue-sharing|\/invoices|\/payments/.test(path))
      financialReads.push(path);
    let result: unknown = {
      items: [],
      meta: { totalItems: 0, totalPages: 1, page: 1, pageSize: 20 },
    };
    if (path.endsWith("/auth/me"))
      result = {
        user: {
          id: "report-viewer",
          name: "Demo Viewer",
          email: "reports@example.test",
          status: "ACTIVE",
        },
        memberships: [{ workspaceId: "demo-workspace", role }],
      };
    if (path.endsWith("/users/me/settings"))
      result = {
        profile: {
          firstName: "Demo",
          lastName: "Viewer",
          email: "reports@example.test",
        },
        preferences: {
          theme: "CHARCOAL",
          accentColor: "GOLD",
          finish: "MATTE",
          language,
        },
      };
    if (path.includes("timer")) result = null;
    if (path.includes("unread")) result = { count: 0 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
  return { errors, writes, financialReads };
}
async function select(page: Page, id: string, label: string) {
  await expect(page.getByRole("option")).toHaveCount(0);
  await page.locator("#" + id).click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await expect(page.locator("#" + id)).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.getByRole("option")).toHaveCount(0);
}

const report = (page: Page) => page.locator("law-report-page");
const kpis = (page: Page) => page.locator("law-report-kpi");
test("owner navigation, month/range/date-basis filters, chart tooltips and drilldown are functional", async ({
  page,
}) => {
  const state = await mockShell(page);
  await page.goto("/reports?" + october);
  await expect(page).toHaveURL(/\/reports\/overview/);
  await expect(report(page).getByRole("heading", { level: 1 })).toHaveText(
    "Pregled prihoda",
  );
  await expect(page.locator("#report-member")).toHaveText("Sve");
  const before = await kpis(page).first().innerText();
  await page
    .getByRole("button", { name: "Prethodni mesec", exact: true })
    .click();
  await expect(page.locator("#report-month")).toHaveValue("2026-09");
  await expect(kpis(page).first()).not.toHaveText(before);
  await page
    .getByRole("button", { name: "Sledeći mesec", exact: true })
    .click();
  await expect(page.locator("#report-month")).toHaveValue("2026-10");
  await page.locator("#report-month").fill("2026-08");
  await expect(page.locator("#report-from")).toHaveValue("2026-08-01");
  await page.locator("#report-from").fill("2026-07-01");
  await page.locator("#report-to").fill("2026-10-31");
  await select(page, "report-basis", "Datum naplate");
  await expect(page).toHaveURL(/basis=collection/);
  await select(page, "report-group", "Po mesecima");
  await expect(page).toHaveURL(/group=month/);
  const bar = page.locator('law-report-chart [role="img"]').first();
  await bar.focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.keyboard.press("Escape");
  const menu = page
    .locator("law-sidebar")
    .getByRole("button", { name: "Izveštaji", exact: true });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(
    page
      .locator("law-sidebar")
      .getByRole("link", { name: "Zarade advokata", exact: true }),
  ).toBeHidden();
  await page.keyboard.press("Enter");
  await page
    .locator("law-sidebar")
    .getByRole("link", { name: "Zarade advokata", exact: true })
    .click();
  await expect(report(page).getByRole("heading", { level: 1 })).toHaveText(
    "Zarade advokata",
  );
  await expect(page.locator("#report-group")).toHaveCount(0);
  await page.locator("#report-month").fill("2026-10");
  await page.locator("#report-search").fill("Ana");
  await expect(report(page).locator("tbody tr")).toHaveCount(1);
  await report(page)
    .getByRole("link", { name: "Ana Radović (demo)", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/reports\/earnings\/report-viewer/);
  await expect(report(page).locator("tbody tr")).not.toHaveCount(0);
  await report(page)
    .getByRole("button", { name: /^Detalji:/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Obračun pripadajućih iznosa" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zatvori detalje" }).click();
  await page.getByRole("link", { name: "Nazad na zarade" }).click();
  await expect(page).toHaveURL(/\/reports\/earnings/);
  expect(state.errors).toEqual([]);
  expect(state.writes).toEqual([]);
  expect(state.financialReads).toEqual([]);
});
test("filters and sorting change the outstanding table and show valid empty/error states", async ({
  page,
}) => {
  const state = await mockShell(page);
  await page.goto("/reports/outstanding?" + october);
  await expect(kpis(page)).toHaveCount(4);
  await expect(page.locator("#report-group")).toHaveCount(0);
  await select(page, "report-status", "Nije fakturisano");
  await expect(report(page).locator("tbody tr")).toHaveCount(2);
  await expect(
    report(page).getByRole("columnheader", { name: "Vrednost rada" }),
  ).toBeVisible();
  await select(page, "report-work-status", "Završeno");
  await expect(report(page).locator("tbody tr")).toHaveCount(1);
  await select(page, "report-status", "Sve");
  await select(page, "report-work-status", "Sve");
  await select(page, "report-client", "Javor Tehnika d.o.o.");
  await report(page)
    .getByRole("button", { name: /^Datum rada/ })
    .click();
  await expect(report(page).locator('th[aria-sort="ascending"]')).toContainText(
    "Datum rada",
  );
  await page.locator("#report-search").fill("no matching demo");
  await expect(report(page)).toContainText("Nema demonstracionih stavki");
  await page.locator("#report-search").fill("");
  await page.locator("#report-from").fill("2026-11-01");
  await expect(report(page).getByRole("alert")).toContainText(
    "Izaberite ispravne datume",
  );
  expect(state.errors).toEqual([]);
  expect(state.writes).toEqual([]);
});
test("individual reports keep company amounts and other allocations out of the UI, including direct URLs", async ({
  page,
}) => {
  const state = await mockShell(page, "LAWYER");
  await page.goto("/reports/earnings/demo-marko?" + october);
  await expect(page).toHaveURL(/\/reports\/my-earnings/);
  await expect(report(page).getByRole("heading", { level: 1 })).toHaveText(
    "Moja zarada",
  );
  await page.locator("#report-month").fill("2026-10");
  const body = await report(page).innerText();
  expect(body).not.toContain("Marko Vuković");
  expect(body).not.toContain("Ostaje kancelariji");
  expect(body).not.toContain("Profitabilnost");
  await expect(
    page
      .locator("law-sidebar")
      .getByRole("link", { name: "Zarade advokata", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("#report-member")).toHaveCount(0);
  await expect(kpis(page)).toHaveCount(6);
  await expect(report(page)).toContainText("Bonus za dovođenje klijenta");
  await report(page)
    .getByRole("button", { name: /^Detalji:/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Obračun pripadajućih iznosa" }),
  ).toBeVisible();
  expect(state.errors).toEqual([]);
  expect(state.financialReads).toEqual([]);
});
test("English labels, attorney filtering, table sorting and preserved real reports access", async ({
  page,
}) => {
  const state = await mockShell(page, "ADMIN", "EN");
  await page.goto("/reports/earnings?" + october);
  await expect(report(page).getByRole("heading", { level: 1 })).toHaveText(
    "Attorney Earnings",
  );
  await expect(page.locator("#report-member")).toHaveText("All");
  await select(page, "report-member", "Marko Vuković");
  await expect(report(page).locator("tbody tr")).toHaveCount(1);
  await expect(report(page).locator("tbody")).toContainText("Marko Vuković");
  await select(page, "report-member", "All");
  await report(page)
    .getByRole("button", { name: "Attorney", exact: true })
    .click();
  await expect(report(page).locator('th[aria-sort="ascending"]')).toContainText(
    "Attorney",
  );
  await expect(
    report(page).getByRole("link", { name: "Profitability", exact: true }),
  ).toHaveAttribute("href", "/reports/profitability");
  expect((await report(page).innerText()).includes("report.")).toBe(false);
  expect(state.errors).toEqual([]);
});
test("collapsed sidebar can open Reports and mobile navigation fits within the viewport", async ({
  page,
}) => {
  const state = await mockShell(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/reports/overview?" + october);
  await expect(report(page)).toBeVisible();
  await page
    .locator("law-sidebar")
    .getByRole("button", {
      name: "Prikaži ili sakrij bočnu traku",
      exact: true,
    })
    .click();
  await page
    .locator("law-sidebar")
    .getByRole("button", { name: "Izveštaji", exact: true })
    .click();
  await expect(
    page
      .locator("law-sidebar")
      .getByRole("link", { name: "Moja zarada", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    report(page).getByRole("button", {
      name: "Prikaži ili sakrij bočnu traku",
      exact: true,
    }),
  ).toBeVisible();
  await report(page)
    .getByRole("button", {
      name: "Prikaži ili sakrij bočnu traku",
      exact: true,
    })
    .click();
  await page.getByRole("link", { name: "Moja zarada", exact: true }).click();
  await expect(report(page).getByRole("heading", { level: 1 })).toHaveText(
    "Moja zarada",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("my-earnings-mobile.png"),
  });
  expect(state.errors).toEqual([]);
});

test("switching language through existing appearance settings localizes report labels and monetary formatting", async ({
  page,
}) => {
  await mockShell(page);
  // Exercise the real LocalizationService via the existing settings form, with only settings HTTP mocked.
  await page.unroute("**/i18n/*.json");
  let preferences = {
    theme: "CHARCOAL",
    accentColor: "GOLD",
    finish: "MATTE",
    language: "SR",
    dateTimeFormat: "TWENTY_FOUR_HOUR",
    script: "LATIN",
  };
  await page.route("**/api/users/me/settings", async (route) => {
    if (route.request().method() === "PATCH")
      preferences = {
        ...preferences,
        ...route.request().postDataJSON().preferences,
      };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        profile: {
          firstName: "Demo",
          lastName: "Viewer",
          email: "reports@example.test",
        },
        preferences,
      }),
    });
  });
  await page.goto("/settings/appearance");
  await select(page, "language-select", "English");
  await page
    .getByRole("button", { name: "Sačuvaj promene", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeEnabled();
  await page
    .locator("law-sidebar")
    .getByRole("button", { name: "Reports", exact: true })
    .click();
  await page
    .locator("law-sidebar")
    .getByRole("link", { name: "Revenue Overview", exact: true })
    .click();
  await expect(report(page).getByRole("heading", { level: 1 })).toHaveText(
    "Revenue Overview",
  );
  await page.locator("#report-month").fill("2026-10");
  await expect(kpis(page).first()).toContainText("609,000");
  await expect(page.locator("#report-member")).toHaveText("All");
});
