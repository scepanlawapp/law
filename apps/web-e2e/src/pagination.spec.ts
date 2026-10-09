import { expect, Page, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function mockLists(page: Page, language: "EN" | "SR") {
  const catalog = await readFile(
    resolve(`apps/web/public/i18n/${language === "EN" ? "eng" : "ser"}.json`),
    "utf8",
  );
  const errors: string[] = [];
  const requests: URL[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/i18n/*.json", (route) =>
    route.fulfill({ contentType: "application/json", body: catalog }),
  );
  const clients = Array.from({ length: 551 }, (_, index) => ({
    id: `client-${index}`,
    clientNumber: `C-${index}`,
    type: "COMPANY",
    displayName: `Client ${index}`,
    status: "ACTIVE",
    activeCaseCount: 1,
    responsibleUserId: null,
  }));
  const cases = clients.map((client, index) => ({
    id: `case-${index}`,
    caseNumber: `P-${index}`,
    name: `Matter ${index}`,
    clientId: client.id,
    client,
    responsibleUser: { id: "user", displayName: "Pagination Viewer" },
    status: "ACTIVE",
    priority: "NORMAL",
    openedDate: "2026-10-01",
    updatedAt: "2026-10-01T10:00:00Z",
  }));
  const documents = clients.map((_, index) => ({
    id: `document-${index}`,
    title: `Document ${index}.pdf`,
    archived: false,
    category: null,
    cases: [],
    clients: [],
    currentVersion: null,
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
  }));
  const invoices = clients.map((client, index) => ({
    id: `invoice-${index}`,
    invoiceNumber: `INV-${index}`,
    client,
    status: "SENT",
    currency: "RSD",
    dateOfCreate: "2026-10-01",
    dateOfMaturity: "2026-10-15",
    total: "1000.00",
  }));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const path = url.pathname.replace(/^\/api/, "");
    const pageNumber = Number(url.searchParams.get("page") ?? 1);
    const pageSize = Number(url.searchParams.get("pageSize") ?? 50);
    let result: unknown = {
      items: [],
      meta: { page: 1, pageSize, totalItems: 0, totalPages: 1 },
    };
    if (path === "/auth/me")
      result = {
        user: {
          id: "user",
          email: "pagination@example.test",
          name: "Pagination Viewer",
          status: "ACTIVE",
        },
        memberships: [{ workspaceId: "workspace", role: "OWNER" }],
      };
    else if (path === "/users/me/settings")
      result = {
        profile: {
          firstName: "Pagination",
          lastName: "Viewer",
          email: "pagination@example.test",
        },
        preferences: {
          theme: language === "EN" ? "IVORY" : "CHARCOAL",
          accentColor: "EMERALD",
          finish: "SOLID",
          language,
        },
      };
    else if (path.includes("timer")) result = null;
    else if (path.includes("unread")) result = { count: 0 };
    else if (path.includes("references")) result = [];
    else if (path === "/documents/folders")
      result = { folders: [], breadcrumbs: [] };
    else if (path === "/documents/statistics")
      result = {
        active: 551,
        archived: 0,
        addedThisMonth: 551,
        needsLinking: 551,
      };
    else if (path === "/financials/invoices") result = invoices;
    else if (["/clients", "/cases", "/documents"].includes(path)) {
      const source =
        path === "/clients" ? clients : path === "/cases" ? cases : documents;
      const rows = url.searchParams.get("search") ? source.slice(0, 7) : source;
      result = {
        items: rows.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
        meta: {
          page: pageNumber,
          pageSize,
          totalItems: rows.length,
          totalPages: Math.ceil(rows.length / pageSize),
        },
      };
    }
    await route.fulfill({ json: result });
  });
  return { errors, requests };
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 960 },
  { name: "mobile", width: 390, height: 844 },
]) {
  for (const surface of [
    {
      path: "/clients",
      host: "law-clients",
      search: "#client-search",
      query: false,
    },
    {
      path: "/cases",
      host: "law-cases-list",
      search: "#case-search",
      query: true,
    },
    {
      path: "/documents",
      host: "law-documents",
      search: 'input[aria-label="Pretražite dokumente"]',
      query: false,
    },
    {
      path: "/finance/invoices",
      host: "law-finance-invoices",
      search: "#invoice-search",
      query: false,
    },
  ]) {
    test(`${surface.path} numbered pagination on ${viewport.name}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      const language = viewport.name === "desktop" ? "EN" : "SR";
      const state = await mockLists(page, language);
      await page.goto(`${surface.path}?preserved=yes`);
      const host = page.locator(surface.host);
      const pagination = host.locator("law-pagination");
      await expect(pagination).toBeVisible();
      const sizeLabel =
        language === "EN" ? "Items per page" : "Stavki po strani";
      const nextLabel = language === "EN" ? "Next" : "Sledeća";
      const pageLabel = language === "EN" ? "Page" : "Strana";
      await expect(
        pagination.getByLabel(sizeLabel, { exact: true }),
      ).toHaveText("50");
      await expect(pagination).toContainText("551");
      await expect(pagination).toContainText("12");
      await expect(pagination.locator("hlm-pagination-ellipsis")).toHaveCount(
        1,
      );
      await pagination
        .getByRole(surface.query ? "link" : "button", {
          name: nextLabel,
          exact: true,
        })
        .click();
      await expect(pagination.locator('[aria-current="page"]')).toHaveText("2");
      if (surface.query) await expect(page).toHaveURL(/casePage=2/);
      await pagination.getByLabel(sizeLabel, { exact: true }).click();
      await page.getByRole("option", { name: "20", exact: true }).click();
      await expect(
        pagination.getByLabel(sizeLabel, { exact: true }),
      ).toHaveText("20");
      await expect(pagination.locator('[aria-current="page"]')).toHaveText("1");
      await pagination
        .getByRole(surface.query ? "link" : "button", {
          name: `${pageLabel} 2`,
          exact: true,
        })
        .click();
      await expect(pagination.locator('[aria-current="page"]')).toHaveText("2");
      const box = await pagination.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      const overflow = await pagination.evaluate(
        (element) => element.scrollWidth > element.clientWidth + 1,
      );
      expect(overflow).toBe(false);
      await pagination.screenshot({
        path: testInfo.outputPath("pagination.png"),
      });
      await page.screenshot({
        path: testInfo.outputPath("page.png"),
        fullPage: true,
      });
      const search =
        surface.path === "/documents"
          ? host.locator("input[hlmInput][placeholder]").first()
          : host.locator(surface.search);
      await search.fill(
        surface.path === "/finance/invoices" ? "INV-550" : "filtered",
      );
      await expect(pagination.locator('[aria-current="page"]')).toHaveText("1");
      await expect(pagination).toContainText(
        surface.path === "/finance/invoices" ? "1" : "7",
      );
      await expect(
        pagination.getByLabel(sizeLabel, { exact: true }),
      ).toHaveText("20");
      await expect(page).toHaveURL(/preserved=yes/);
      if (surface.query) await expect(page).toHaveURL(/casePage=1/);
      if (surface.path !== "/finance/invoices") {
        const listCalls = state.requests.filter(
          (url) => url.pathname === `/api${surface.path}`,
        );
        expect(
          listCalls.filter((url) => url.searchParams.get("pageSize") === "50"),
        ).toHaveLength(2);
        expect(
          listCalls.filter((url) => url.searchParams.get("pageSize") === "20"),
        ).toHaveLength(3);
      }
      expect(state.errors).toEqual([]);
    });
  }
}
