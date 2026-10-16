/**
 * The emailed sign-in code is withheld for this long after a password
 * change: whoever just took over the password (and possibly the mailbox)
 * must not get a second factor from the same mailbox.
 */
export const EMAIL_FALLBACK_SUPPRESSED_MS = 72 * 60 * 60 * 1000;

export function emailFallbackSuppressed(
  passwordChangedAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!passwordChangedAt) return false;
  return (
    now.getTime() - passwordChangedAt.getTime() < EMAIL_FALLBACK_SUPPRESSED_MS
  );
}
