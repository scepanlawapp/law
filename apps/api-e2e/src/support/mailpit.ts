import axios from "axios";

export interface MailpitMessageSummary {
  ID: string;
  Subject: string;
}

function mailpitUrl(): string {
  const url = process.env.MAILPIT_URL;
  if (!url) {
    throw new Error("MAILPIT_URL is not set");
  }
  return url.replace(/\/$/, "");
}

// Mailpit is a separate service, so these helpers use their own axios calls
// with absolute URLs and ignore the API base URL configured for the e2e run.
export async function clearMailbox(): Promise<void> {
  await axios.delete(`${mailpitUrl()}/api/v1/messages`);
}

/** Resolves with the matching messages, oldest first, once at least `count` arrived. */
export async function waitForMessages(
  to: string,
  count: number,
  timeoutMs = 10_000,
): Promise<MailpitMessageSummary[]> {
  const deadline = Date.now() + timeoutMs;
  let messages: MailpitMessageSummary[] = [];
  do {
    const response = await axios.get<{ messages: MailpitMessageSummary[] }>(
      `${mailpitUrl()}/api/v1/search`,
      { params: { query: `to:${to}` } },
    );
    // Mailpit lists the newest message first.
    messages = [...response.data.messages].reverse();
    if (messages.length >= count) {
      return messages;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  throw new Error(
    `Expected ${count} message(s) to ${to} within ${timeoutMs} ms, got ${messages.length}`,
  );
}

export async function messageText(id: string): Promise<string> {
  const response = await axios.get<{ Text: string }>(
    `${mailpitUrl()}/api/v1/message/${id}`,
  );
  return response.data.Text;
}
