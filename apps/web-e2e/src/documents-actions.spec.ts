import { expect, Locator, Page, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const folderId = "a0000000-0000-4000-a000-000000000001";
const destinationId = "a0000000-0000-4000-a000-000000000002";
const nestedId = "a0000000-0000-4000-a000-000000000003";

async function mockDocuments(page: Page, documentCount = 2) {
  const english = await readFile(
    resolve("apps/web/public/i18n/eng.json"),
    "utf8",
  );
  await page.route("**/i18n/*.json", (route) =>
    route.fulfill({ contentType: "application/json", body: english }),
  );
  const folders = [
    {
      id: folderId,
      name: "Legal",
      parentId: null,
      archivedAt: null as string | null,
      createdAt: "2026-10-06T10:00:00Z",
    },
    {
      id: destinationId,
      name: "Destination",
      parentId: null,
      archivedAt: null as string | null,
      createdAt: "2026-10-06T10:00:00Z",
    },
    {
      id: nestedId,
      name: "Nested",
      parentId: destinationId,
      archivedAt: null as string | null,
      createdAt: "2026-10-06T10:00:00Z",
    },
  ];
  const titles = Array.from(
    { length: documentCount },
    (_, index) =>
      ["Brief.pdf", "Evidence.pdf"][index] ?? `Document ${index + 1}.pdf`,
  );
  const documents = titles.map((title, index) => ({
    id: `b0000000-0000-4000-a000-${String(index + 1).padStart(12, "0")}`,
    title,
    folderId: null as string | null,
    archived: false,
    archivedAt: null as string | null,
    category: null,
    cases: [],
    clients: [],
    createdByUserId: "user",
    updatedByUserId: "user",
    createdAt: "2026-10-06T10:00:00Z",
    updatedAt: "2026-10-06T10:00:00Z",
    currentVersion: {
      id: `version-${index}`,
      versionNumber: 1,
      originalFilename: title,
      mimeType: "application/pdf",
      sizeBytes: 100,
      createdAt: "2026-10-06T10:00:00Z",
      uploadedByUserId: "user",
    },
  }));
  const state = {
    failRename: false,
    mutations: [] as Array<{ path: string; body: Record<string, unknown> }>,
    downloads: [] as string[],
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    const body = request.postDataJSON() ?? {};
    let result: unknown = {
      items: [],
      meta: { page: 1, totalPages: 1, totalItems: 0, pageSize: 20 },
    };
    if (request.method() !== "GET") state.mutations.push({ path, body });
    if (path === "/auth/me")
      result = {
        user: {
          id: "user",
          email: "test@example.com",
          name: "Test User",
          status: "ACTIVE",
        },
        memberships: [{ workspaceId: "workspace", role: "OWNER" }],
      };
    else if (path === "/users/me/settings")
      result = {
        profile: {
          firstName: "Test",
          lastName: "User",
          email: "test@example.com",
        },
        preferences: {
          theme: "IVORY",
          accentColor: "EMERALD",
          finish: "SOLID",
          language: "EN",
          workspaceNotifications: false,
          notificationPreferences: {},
          dateTimeFormat: "TWENTY_FOUR_HOUR",
          timeZone: "Europe/Belgrade",
          timeReviewReminderEnabled: false,
          timeReviewReminderTime: "17:00",
        },
      };
    else if (path === "/documents/statistics")
      result = { active: 2, archived: 0, addedThisMonth: 2, needsLinking: 2 };
    else if (path === "/documents/folders") {
      const parentId = url.searchParams.get("parentId");
      const archived = url.searchParams.get("archived") === "true";
      result = {
        folders: folders.filter(
          (folder) =>
            folder.parentId === parentId && !!folder.archivedAt === archived,
        ),
        breadcrumbs: folders.filter((folder) => folder.id === parentId),
      };
    } else if (path === "/documents") {
      const items = documents.filter(
        (document) =>
          document.folderId ===
            (url.searchParams.get("folderId") === "root"
              ? null
              : url.searchParams.get("folderId")) &&
          document.archived === (url.searchParams.get("archived") === "true"),
      );
      result = {
        items,
        meta: {
          page: Number(url.searchParams.get("page") ?? 1),
          pageSize: documentCount,
          totalPages: documentCount > 2 ? 2 : 1,
          totalItems: documentCount > 2 ? items.length * 2 : items.length,
        },
      };
    } else if (/\/download$/.test(path)) {
      state.downloads.push(path);
      await route.fulfill({
        contentType: "application/octet-stream",
        headers: { "Content-Disposition": 'attachment; filename="test.bin"' },
        body: "mock download",
      });
      return;
    } else if (path.startsWith("/documents/folders/")) {
      const folder = folders.find((item) => item.id === path.split("/")[3]);
      if (folder) {
        if (body.name) folder.name = body.name;
        if ("parentId" in body) folder.parentId = body.parentId;
        if (path.endsWith("/archive"))
          folder.archivedAt = "2026-10-06T11:00:00Z";
        if (path.endsWith("/restore")) folder.archivedAt = null;
      }
      result = folder;
    } else if (path.startsWith("/documents/")) {
      const document = documents.find((item) => item.id === path.split("/")[2]);
      if (request.method() === "PATCH" && body.title && state.failRename) {
        await route.fulfill({
          status: 409,
          json: { message: "Rename failed" },
        });
        return;
      }
      if (document && request.method() === "PATCH")
        Object.assign(document, body);
      if (document && path.endsWith("/archive")) document.archived = true;
      if (document && path.endsWith("/restore")) document.archived = false;
      result = path.endsWith("/versions")
        ? { items: [], meta: { page: 1, totalPages: 1, totalItems: 0 } }
        : document;
    }
    await route.fulfill({ json: result });
  });
  await page.goto("/documents");
  await expect(
    page.getByRole("heading", { name: "Documents", exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(documentCount + 2);
  return state;
}

async function selectDocumentStatus(page: Page, label: string) {
  await page.getByLabel("Status", { exact: true }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await expect(page.getByLabel("Status", { exact: true })).toHaveText(label);
}

async function layoutBox(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`No layout box for ${locator}`);
  return box;
}

for (const viewport of [
  {
    name: "desktop",
    width: 1440,
    height: 960,
    maxToolbarOffset: 2,
    minHorizontalScroll: 0,
  },
  {
    name: "mobile",
    width: 390,
    height: 844,
    maxToolbarOffset: 40,
    minHorizontalScroll: 1,
  },
]) {
  test(`documents layout scrolls content with fixed controls on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const state = await mockDocuments(page, 40);
    await page
      .getByRole("checkbox", { name: "Select: Legal", exact: true })
      .check();
    const content = page.locator("law-documents .app-data-region");
    const breadcrumb = page.getByRole("navigation", {
      name: "Folder location",
    });
    const toolbar = page.locator("law-documents div[aria-label][aria-busy]");
    const filters = page.locator("law-documents .app-filter-toolbar");
    const pagination = page.getByRole("button", { name: "Next", exact: true });
    await expect(toolbar).toBeVisible();
    const breadcrumbBefore = await layoutBox(breadcrumb);
    const toolbarBox = await layoutBox(toolbar);
    const filtersBefore = await layoutBox(filters);
    const paginationBefore = await layoutBox(pagination);
    expect(
      Math.abs(
        breadcrumbBefore.y +
          breadcrumbBefore.height / 2 -
          toolbarBox.y -
          toolbarBox.height / 2,
      ),
    ).toBeLessThan(viewport.maxToolbarOffset);
    expect(toolbarBox.x).toBeGreaterThan(breadcrumbBefore.x);
    expect(toolbarBox.x + toolbarBox.width).toBeLessThanOrEqual(viewport.width);
    const metrics = await content.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      bottom: element.getBoundingClientRect().bottom,
      right: element.getBoundingClientRect().right,
    }));
    expect(
      Math.abs(toolbarBox.x + toolbarBox.width - metrics.right),
    ).toBeLessThan(2);
    expect(metrics.clientHeight).toBeGreaterThan(80);
    expect(metrics.clientHeight).toBeLessThan(metrics.scrollHeight);
    expect(metrics.bottom).toBeLessThanOrEqual(viewport.height);
    await content.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(
      await content.evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(0);
    const finalRow = page.locator("tbody tr").last();
    const finalBox = await layoutBox(finalRow);
    expect(finalBox.y + finalBox.height).toBeLessThanOrEqual(
      metrics.bottom + 1,
    );
    expect(await breadcrumb.boundingBox()).toEqual(breadcrumbBefore);
    expect(await filters.boundingBox()).toEqual(filtersBefore);
    expect(await pagination.boundingBox()).toEqual(paginationBefore);
    expect(paginationBefore.y + paginationBefore.height).toBeLessThanOrEqual(
      viewport.height,
    );
    await page.screenshot({
      path: `tmp/documents-layout-${viewport.name}.png`,
      fullPage: true,
    });
    await content.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    expect(
      await content.evaluate((element) => element.scrollLeft),
    ).toBeGreaterThanOrEqual(viewport.minHorizontalScroll);
    expect(await breadcrumb.boundingBox()).toEqual(breadcrumbBefore);
    await page.getByRole("button", { name: "Grid", exact: true }).click();
    const grid = page.locator("law-documents section > div.grid");
    expect(
      await grid.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);
    await grid.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(await grid.evaluate((element) => element.scrollTop)).toBeGreaterThan(
      0,
    );
    const finalCard = await layoutBox(
      grid.getByRole("group", { name: "Document 40.pdf", exact: true }),
    );
    const gridBox = await layoutBox(grid);
    expect(finalCard.y + finalCard.height).toBeLessThanOrEqual(
      gridBox.y + gridBox.height + 1,
    );
    expect(await breadcrumb.boundingBox()).toEqual(breadcrumbBefore);
    expect(await filters.boundingBox()).toEqual(filtersBefore);
    expect(await pagination.boundingBox()).toEqual(paginationBefore);
    expect(state.mutations).toHaveLength(0);
  });
}

test("single clicks select, modifiers select multiple, double-click and Enter open", async ({
  page,
}) => {
  await mockDocuments(page);
  const legal = page.locator("tbody tr").filter({ hasText: "Legal" });
  await legal.click();
  await expect(legal).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByText("Files: 0 · Folders: 1", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page
    .locator("tbody tr")
    .filter({ hasText: "Brief.pdf" })
    .locator("td")
    .nth(1)
    .click({ modifiers: ["Meta"] });
  await expect(
    page.getByText("Files: 1 · Folders: 1", { exact: true }),
  ).toBeVisible();
  await page
    .locator("tbody tr")
    .filter({ hasText: "Evidence.pdf" })
    .locator("td")
    .nth(1)
    .click({ modifiers: ["Shift"] });
  await expect(
    page.getByText("Files: 2 · Folders: 0", { exact: true }),
  ).toBeVisible();
  await legal.dblclick();
  await expect(page.getByText("Legal", { exact: true })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  const brief = page.locator("tbody tr").filter({ hasText: "Brief.pdf" });
  await brief.focus();
  await brief.press("Space");
  await expect(brief).toHaveAttribute("aria-selected", "true");
  await brief.press("Enter");
  await expect(page.locator("law-documents aside")).toContainText("Brief.pdf");
  await expect(
    page.getByRole("columnheader", { name: "Actions", exact: true }),
  ).toHaveCount(0);
});

test("inline rename retains errors, saves with Enter and cancels with Escape", async ({
  page,
}) => {
  const state = await mockDocuments(page);
  const row = page.locator("tbody tr").filter({ hasText: "Brief.pdf" });
  await row
    .getByRole("button", { name: "Rename: Brief.pdf", exact: true })
    .click();
  const input = page.getByRole("textbox", { name: "Rename", exact: true });
  await expect(input).toBeFocused();
  await input.fill("Updated.pdf");
  state.failRename = true;
  await input.press("Enter");
  await expect(page.getByRole("alert")).toContainText("Could not rename");
  await expect(input).toHaveValue("Updated.pdf");
  state.failRename = false;
  await input.press("Enter");
  await expect(
    page.locator("tbody tr").filter({ hasText: "Updated.pdf" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Rename: Updated.pdf", exact: true })
    .click();
  await input.fill("Cancelled.pdf");
  await input.press("Escape");
  await expect(page.getByText("Cancelled.pdf", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Updated.pdf", { exact: true })).toBeVisible();
});

test("association controls do not select rows and folders download without leaving the page", async ({
  page,
}) => {
  const state = await mockDocuments(page);
  await page
    .getByRole("checkbox", { name: "Select: Legal", exact: true })
    .check();
  await page
    .locator("tbody tr")
    .filter({ hasText: "Brief.pdf" })
    .getByRole("button")
    .last()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: "Select: Brief.pdf", exact: true }),
  ).not.toBeChecked();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("test.bin");
  expect(state.downloads).toEqual([`/documents/folders/${folderId}/download`]);
  await expect(page).toHaveURL(/\/documents$/);
  expect(state.mutations).toHaveLength(0);
});

test("moves selected files and folders to a nested destination and excludes selected folders", async ({
  page,
}) => {
  const state = await mockDocuments(page);
  await page
    .getByRole("checkbox", { name: "Select: Legal", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select: Brief.pdf", exact: true })
    .check();
  await page.getByRole("button", { name: "Move", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Legal", exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", {
      name: "Expand or collapse folder: Destination",
      exact: true,
    })
    .click();
  await dialog.getByRole("button", { name: "Nested", exact: true }).click();
  await dialog.getByRole("button", { name: "Move here", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  expect(state.mutations).toEqual(
    expect.arrayContaining([
      { path: `/documents/folders/${folderId}`, body: { parentId: nestedId } },
      {
        path: "/documents/b0000000-0000-4000-a000-000000000001",
        body: { folderId: nestedId },
      },
    ]),
  );
  await page.locator("tbody tr").filter({ hasText: "Destination" }).dblclick();
  await page.locator("tbody tr").filter({ hasText: "Nested" }).dblclick();
  await page
    .getByRole("checkbox", { name: "Select: Brief.pdf", exact: true })
    .check();
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Documents (root)", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Move here", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await expect(page.getByText("Brief.pdf", { exact: true })).toBeVisible();
  expect(state.mutations).toContainEqual({
    path: "/documents/b0000000-0000-4000-a000-000000000001",
    body: { folderId: null },
  });
});

test("status filter displays translated choices and resets selection and pagination", async ({
  page,
}) => {
  await mockDocuments(page, 40);
  const filters = page.locator("law-documents .app-filter-toolbar");
  await expect(filters.getByText("Status", { exact: true })).toBeVisible();
  await expect(filters.getByLabel("Status", { exact: true })).toHaveText("All");
  await expect(
    page.getByRole("button", { name: "All", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("checkbox", { name: "Select: Brief.pdf", exact: true })
    .check();

  for (const status of [
    { label: "Recent", view: "recent", archived: "false" },
    { label: "Needs linking", view: "needs-linking", archived: "false" },
    { label: "Archived", view: null, archived: "true" },
    { label: "All", view: null, archived: "false" },
  ]) {
    const response = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === "/api/documents" &&
        url.searchParams.get("view") === status.view &&
        url.searchParams.get("archived") === status.archived &&
        url.searchParams.get("page") === "1"
      );
    });
    await selectDocumentStatus(page, status.label);
    await response;
    await expect(
      page.getByRole("button", { name: "Previous", exact: true }),
    ).toBeDisabled();
    await expect(
      page.locator("law-documents div[aria-label][aria-busy]"),
    ).toHaveCount(0);
    await expect(page.locator("tbody tr")).toHaveCount(
      status.archived === "true" ? 0 : 42,
    );
  }
  await expect(
    page.getByRole("checkbox", { name: "Select: Brief.pdf", exact: true }),
  ).not.toBeChecked();
});

test("archive confirmation cancels safely and archived files restore", async ({
  page,
}) => {
  const state = await mockDocuments(page);
  await page
    .getByRole("checkbox", { name: "Select: Brief.pdf", exact: true })
    .check();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.mutations).toHaveLength(0);
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await expect(page.getByText("Brief.pdf", { exact: true })).toHaveCount(0);
  await selectDocumentStatus(page, "Archived");
  await page
    .getByRole("checkbox", { name: "Select: Brief.pdf", exact: true })
    .check();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText("Brief.pdf", { exact: true })).toHaveCount(0);
  await selectDocumentStatus(page, "All");
  await expect(page.getByText("Brief.pdf", { exact: true })).toBeVisible();
  expect(state.mutations.map(({ path }) => path)).toEqual([
    "/documents/b0000000-0000-4000-a000-000000000001/archive",
    "/documents/b0000000-0000-4000-a000-000000000001/restore",
  ]);
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 960 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`list/grid selection and layout on ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await mockDocuments(page);
    await page
      .getByRole("checkbox", { name: "Select: Brief.pdf", exact: true })
      .check();
    await page.getByRole("button", { name: "Grid", exact: true }).click();
    await expect(
      page.getByRole("checkbox", { name: "Select: Brief.pdf", exact: true }),
    ).toBeChecked();
    await page
      .getByRole("checkbox", { name: "Select: Legal", exact: true })
      .check();
    await expect(
      page.getByText("Files: 1 · Folders: 1", { exact: true }),
    ).toBeVisible();
    const legal = page.getByRole("group", { name: "Legal", exact: true });
    await legal.focus();
    await legal.press("Enter");
    await expect(page.getByText("Legal", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    await page
      .getByRole("checkbox", { name: "Select: Brief.pdf", exact: true })
      .check();
    await page.screenshot({
      path: testInfo.outputPath(`documents-${viewport.name}.png`),
      fullPage: true,
    });
    const widths = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(widths.content).toBeLessThanOrEqual(widths.viewport);
    await expect(
      page.getByRole("button", { name: "Move", exact: true }),
    ).toBeVisible();
    await page.getByRole("group", { name: "Brief.pdf", exact: true }).focus();
    await page
      .getByRole("group", { name: "Brief.pdf", exact: true })
      .press("Enter");
    const detail = page.locator("law-documents aside");
    await expect(detail).toContainText("Brief.pdf");
    const box = await detail.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(viewport.width);
    await detail.getByRole("button", { name: "Close", exact: true }).click();
    await expect(detail).toHaveCount(0);
  });
}
