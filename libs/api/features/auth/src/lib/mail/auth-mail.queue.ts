import type { AuthEmailLocale, AuthEmailMessage } from "./auth-mail.templates";

export const AUTH_MAIL_QUEUE = "auth-mail";

/** Everything the processor needs; the rendered body is built at send time. */
export interface AuthMailJob {
  to: string;
  userId: string | null;
  locale: AuthEmailLocale;
  officeName: string;
  message: AuthEmailMessage;
}

/** BullMQ options for every `auth-mail` job. */
export const AUTH_MAIL_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: true,
  removeOnFail: { age: 3600 },
} as const;
