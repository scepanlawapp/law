import axios from "axios";
import Redis from "ioredis";
import { clearMailbox, messageText, waitForMessages } from "../support/mailpit";

const email = process.env.AUTH_E2E_EMAIL;
const password = process.env.AUTH_E2E_PASSWORD;
const mailpitUrl = process.env.MAILPIT_URL;

// Mailpit can take several seconds per delivery (reverse DNS lookups on some
// setups, e.g. WSL), and the auth-mail worker sends one message at a time.
const MAIL_TIMEOUT_MS = 40_000;

function tokenFrom(text: string): string {
  const match = /\/reset-password\?token=([^\s"<>]+)/.exec(text);
  if (!match) {
    throw new Error("No reset link found in email text");
  }
  return decodeURIComponent(match[1]);
}

(email && password && mailpitUrl ? describe : describe.skip)(
  "password reset via Mailpit",
  () => {
    it("delivers reset links, honours only the newest and sends a change notice", async () => {
      const address = (email as string).trim().toLowerCase();
      const redis = new Redis(
        process.env.REDIS_URL ?? "redis://localhost:6379",
      );
      try {
        await redis.del(`auth:rl:pwreset-email:${address}`);
      } finally {
        redis.disconnect();
      }
      await clearMailbox();

      for (let i = 0; i < 2; i += 1) {
        const response = await axios.post("/api/auth/password/forgot", {
          email,
        });
        expect(response.status).toBeLessThan(300);
      }

      const resetMessages = await waitForMessages(address, 2, MAIL_TIMEOUT_MS);
      expect(resetMessages).toHaveLength(2);
      const [firstToken, secondToken] = await Promise.all(
        resetMessages.map(async (message) =>
          tokenFrom(await messageText(message.ID)),
        ),
      );
      expect(firstToken).not.toBe(secondToken);

      // The first link was consumed by the second request.
      await expect(
        axios.post("/api/auth/password/reset", {
          token: firstToken,
          password,
        }),
      ).rejects.toMatchObject({ response: { status: 401 } });

      const reset = await axios.post("/api/auth/password/reset", {
        token: secondToken,
        password,
      });
      expect(reset.status).toBeLessThan(300);

      const login = await axios.post("/api/auth/login", { email, password });
      expect(login.status).toBeLessThan(300);
      expect(login.headers["set-cookie"]?.[0]).toMatch(/^law_session=/);

      // Third message: "password changed" notification.
      const all = await waitForMessages(address, 3, MAIL_TIMEOUT_MS);
      expect(all).toHaveLength(3);
    }, 90_000);
  },
);
