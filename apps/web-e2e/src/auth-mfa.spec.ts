// Needs a running API with AUTH_MFA_ENCRYPTION_KEY set, Redis, and a dedicated
// e2e account (AUTH_E2E_EMAIL / AUTH_E2E_PASSWORD): the test enables TOTP on
// it and always disables it again. The web app talks to AUTH_E2E_API_URL
// (default http://localhost:3001) through an overridden runtime config, and
// that API must allow the web origin (AUTH_FRONTEND_ORIGIN).
import {
  APIRequestContext,
  expect,
  request as playwrightRequest,
  test,
} from "@playwright/test";
import Redis from "ioredis";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Secret, TOTP } from "otpauth";

const email = process.env["AUTH_E2E_EMAIL"];
const password = process.env["AUTH_E2E_PASSWORD"];
const apiUrl = (
  process.env["AUTH_E2E_API_URL"] ?? "http://localhost:3001"
).replace(/\/$/, "");

test.skip(
  !email || !password,
  "Set AUTH_E2E_EMAIL and AUTH_E2E_PASSWORD to run the MFA login e2e",
);

async function clearRateLimits(): Promise<void> {
  const redis = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379");
  try {
    const stream = redis.scanStream({ match: "auth:rl:ip:*:/api/auth/*" });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length > 0) await redis.del(...keys);
    }
  } finally {
    redis.disconnect();
  }
}

function totpCode(secret: string, offsetSteps = 0): string {
  return new TOTP({
    secret: Secret.fromBase32(secret),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  }).generate({ timestamp: Date.now() + offsetSteps * 30_000 });
}

async function apiPost<T>(
  api: APIRequestContext,
  path: string,
  data?: unknown,
): Promise<T> {
  await clearRateLimits();
  const response = await api.post(`${apiUrl}/api/auth${path}`, { data });
  expect(response.ok(), `${path} -> ${response.status()}`).toBeTruthy();
  return response.status() === 204 || response.status() === 205
    ? (undefined as T)
    : ((await response.json()) as T);
}

test.describe("MFA login", () => {
  let secret = "";
  let recoveryCodes: string[] = [];

  test.beforeAll(async () => {
    const api = await playwrightRequest.newContext();
    try {
      await apiPost(api, "/login", { email, password });
      const started = await apiPost<{ secret: string }>(
        api,
        "/mfa/enrollment/start",
        { currentPassword: password },
      );
      secret = started.secret;
      const confirmed = await apiPost<{ recoveryCodes: string[] }>(
        api,
        "/mfa/enrollment/confirm",
        { code: totpCode(secret) },
      );
      recoveryCodes = confirmed.recoveryCodes;
    } finally {
      await api.dispose();
    }
  });

  test.afterAll(async () => {
    const api = await playwrightRequest.newContext();
    try {
      const login = await apiPost<{ status: string }>(api, "/login", {
        email,
        password,
      });
      if (login.status === "MFA_REQUIRED") {
        // The UI test spent the TOTP step; a recovery code is still unused.
        await apiPost(api, "/mfa/verify", {
          method: "RECOVERY",
          code: recoveryCodes[0],
          rememberDevice: false,
        });
      }
      await apiPost(api, "/mfa/disable", { currentPassword: password });
    } finally {
      await api.dispose();
    }
  });

  test("asks for a code after the password and signs in with TOTP", async ({
    page,
  }) => {
    const english = await readFile(
      resolve("apps/web/public/i18n/eng.json"),
      "utf8",
    );
    await page.route("**/i18n/*.json", (route) =>
      route.fulfill({ contentType: "application/json", body: english }),
    );
    await page.route("**/config.local.json", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ apiUrl, apiPrefix: "/api" }),
      }),
    );
    await clearRateLimits();

    await page.goto("/login");
    await page.locator("#email").fill(email as string);
    await page.locator("#password").fill(password as string);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(
      page.getByRole("heading", { name: "Confirm your sign-in" }),
    ).toBeVisible();
    // The enrollment step is spent; the next step is inside the server window.
    await page.locator("#mfa-code").fill(totpCode(secret, 1));
    await page.getByRole("button", { name: "Verify" }).click();

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).toHaveURL(/localhost:\d+\/?$/);
  });
});
