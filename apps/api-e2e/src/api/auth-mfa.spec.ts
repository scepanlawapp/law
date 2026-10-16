// Use a dedicated/seeded e2e user whose password equals AUTH_E2E_PASSWORD, never a real account: this test enables TOTP two-factor authentication on that account, signs it in and out, and always disables 2FA again at the end. It also clears the local Mailpit inbox.
// The API process needs AUTH_MFA_ENCRYPTION_KEY (at least 32 characters).
import { Secret, TOTP } from "otpauth";
import Redis from "ioredis";
import type {
  LoginResponse,
  MfaEnrollmentConfirmResponse,
  MfaEnrollmentStartResponse,
  MfaStatusResponse,
} from "@law/api-interfaces";
import { CookieJar } from "../support/cookies";
import { clearMailbox, messageText, waitForMessages } from "../support/mailpit";

const email = process.env.AUTH_E2E_EMAIL;
const password = process.env.AUTH_E2E_PASSWORD;
const mailpitUrl = process.env.MAILPIT_URL;

const MAIL_TIMEOUT_MS = 40_000;
const AUTH_PATHS = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/mfa/verify",
  "/api/auth/mfa/email-code",
  "/api/auth/mfa/disable",
  "/api/auth/mfa/enrollment/start",
  "/api/auth/mfa/enrollment/confirm",
];

/** Per-IP buckets (5 per 60 s) from earlier runs or earlier steps answer 429. */
async function clearRateLimits(): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    for (const path of AUTH_PATHS) {
      const stream = redis.scanStream({ match: `auth:rl:ip:*:${path}` });
      for await (const keys of stream as AsyncIterable<string[]>) {
        if (keys.length > 0) await redis.del(...keys);
      }
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

async function login(jar: CookieJar): Promise<LoginResponse> {
  await clearRateLimits();
  const response = await jar.request<LoginResponse>("post", "/api/auth/login", {
    email,
    password,
  });
  expect(response.status).toBeLessThan(300);
  return response.data;
}

async function verify(
  jar: CookieJar,
  method: "TOTP" | "RECOVERY" | "EMAIL",
  code: string,
  rememberDevice = false,
) {
  await clearRateLimits();
  return jar.request("post", "/api/auth/mfa/verify", {
    method,
    code,
    rememberDevice,
  });
}

async function mfaStatus(jar: CookieJar): Promise<MfaStatusResponse> {
  return (await jar.request<MfaStatusResponse>("get", "/api/auth/mfa")).data;
}

(email && password && mailpitUrl ? describe : describe.skip)(
  "TOTP two-factor authentication",
  () => {
    const address = (email as string).trim().toLowerCase();
    let secret = "";
    let recoveryCodes: string[] = [];

    /**
     * Best effort: leave the account with 2FA disabled even when a step failed.
     * Every second-factor attempt starts from a fresh login (a new challenge),
     * so an earlier failed attempt cannot exhaust the attempt budget.
     */
    async function disableTwoFactor(): Promise<void> {
      const attempts: Array<["TOTP" | "RECOVERY", string]> = [];
      if (secret) {
        for (const offset of [1, 0, -1]) {
          attempts.push(["TOTP", totpCode(secret, offset)]);
        }
      }
      for (const code of recoveryCodes) attempts.push(["RECOVERY", code]);

      let jar = new CookieJar();
      let result = await login(jar);
      let next = 0;
      while (result.status === "MFA_REQUIRED") {
        if (next >= attempts.length) {
          throw new Error(
            "Could not sign in to disable 2FA; disable it manually for " +
              address,
          );
        }
        const [method, code] = attempts[next];
        next += 1;
        try {
          await verify(jar, method, code);
          result = { status: "AUTHENTICATED" } as LoginResponse;
        } catch {
          // Used step or code: start over with a fresh challenge.
          jar = new CookieJar();
          result = await login(jar);
        }
      }
      if (result.status !== "AUTHENTICATED") return;
      const status = await mfaStatus(jar);
      if (status.enabled) {
        await clearRateLimits();
        await jar.request("post", "/api/auth/mfa/disable", {
          currentPassword: password,
        });
      }
      await jar.request("post", "/api/auth/logout");
    }

    it("enrolls, requires a second factor, trusts devices and honours recovery and email codes", async () => {
      try {
        await disableTwoFactor().catch(() => undefined);

        // 1. Plain login, then enroll from the session.
        const session = new CookieJar();
        expect((await login(session)).status).toBe("AUTHENTICATED");
        expect((await mfaStatus(session)).enabled).toBe(false);

        await clearRateLimits();
        const started = (
          await session.request<MfaEnrollmentStartResponse>(
            "post",
            "/api/auth/mfa/enrollment/start",
            { currentPassword: password },
          )
        ).data;
        expect(started.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
        secret = started.secret;

        await clearRateLimits();
        const confirmed = (
          await session.request<MfaEnrollmentConfirmResponse>(
            "post",
            "/api/auth/mfa/enrollment/confirm",
            { code: totpCode(secret) },
          )
        ).data;
        recoveryCodes = confirmed.recoveryCodes;
        expect(recoveryCodes.length).toBeGreaterThan(0);
        expect(await mfaStatus(session)).toMatchObject({
          enabled: true,
          recoveryCodesRemaining: recoveryCodes.length,
        });
        await session.request("post", "/api/auth/logout");

        // 2. A new login now needs a second factor; TOTP with "remember".
        const trusting = new CookieJar();
        const required = await login(trusting);
        expect(required.status).toBe("MFA_REQUIRED");
        expect(trusting.get("law_mfa_challenge")).toBeTruthy();
        expect(trusting.get("law_session")).toBeUndefined();
        // The enrollment step is spent; the next step is inside the window.
        const verified = await verify(
          trusting,
          "TOTP",
          totpCode(secret, 1),
          true,
        );
        expect(verified.status).toBe(200);
        expect(trusting.get("law_session")).toBeTruthy();
        const trustedToken = trusting.get("law_trusted_device");
        expect(trustedToken).toBeTruthy();
        expect((await mfaStatus(trusting)).trustedDevices).toHaveLength(1);
        await trusting.request("post", "/api/auth/logout");

        // 3. The trusted-device cookie skips the second factor ...
        const trustedJar = new CookieJar();
        trustedJar.set("law_trusted_device", trustedToken as string);
        expect((await login(trustedJar)).status).toBe("AUTHENTICATED");
        await trustedJar.request("post", "/api/auth/logout");

        // ... and a client without it does not.
        const stranger = new CookieJar();
        expect((await login(stranger)).status).toBe("MFA_REQUIRED");

        // 4. A recovery code works exactly once.
        const recoveryCode = recoveryCodes[0];
        expect((await verify(stranger, "RECOVERY", recoveryCode)).status).toBe(
          200,
        );
        expect((await mfaStatus(stranger)).recoveryCodesRemaining).toBe(
          recoveryCodes.length - 1,
        );
        await stranger.request("post", "/api/auth/logout");

        const reuse = new CookieJar();
        expect((await login(reuse)).status).toBe("MFA_REQUIRED");
        await expect(
          verify(reuse, "RECOVERY", recoveryCode),
        ).rejects.toMatchObject({ response: { status: 401 } });

        // 5. An emailed code works (same challenge as the failed attempt).
        await clearMailbox();
        await clearRateLimits();
        const sent = await reuse.request("post", "/api/auth/mfa/email-code");
        expect(sent.status).toBe(204);
        const [message] = await waitForMessages(address, 1, MAIL_TIMEOUT_MS);
        const code = /\b(\d{6})\b/.exec(await messageText(message.ID))?.[1];
        expect(code).toBeTruthy();
        expect((await verify(reuse, "EMAIL", code as string)).status).toBe(200);
        expect(reuse.get("law_session")).toBeTruthy();

        // 6. Disabling needs the password and is the way back to "as found".
        await clearRateLimits();
        await expect(
          reuse.request("post", "/api/auth/mfa/disable", {
            currentPassword: `${password}-wrong`,
          }),
        ).rejects.toMatchObject({ response: { status: 401 } });
        await reuse.request("post", "/api/auth/mfa/disable", {
          currentPassword: password,
        });
        expect((await mfaStatus(reuse)).enabled).toBe(false);
        await reuse.request("post", "/api/auth/logout");
      } catch (error) {
        // Never mask the assertion error that got us here.
        await disableTwoFactor().catch((cleanupError: unknown) => {
          console.error("2FA cleanup failed:", cleanupError);
        });
        throw error;
      }
      await disableTwoFactor();

      // The account is left as found: password-only login works again.
      const after = new CookieJar();
      expect((await login(after)).status).toBe("AUTHENTICATED");
      expect((await mfaStatus(after)).enabled).toBe(false);
      await after.request("post", "/api/auth/logout");
    }, 180_000);
  },
);
