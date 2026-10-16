import { Secret, TOTP } from "otpauth";

const PERIOD_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1;
const SECRET_BYTES = 20;

function buildTotp(secret: Secret, issuer?: string, label?: string): TOTP {
  return new TOTP({
    issuer,
    label,
    secret,
    algorithm: "SHA1",
    digits: DIGITS,
    period: PERIOD_SECONDS,
  });
}

/** Generates a new base32 TOTP secret from 20 random bytes. */
export function generateTotpSecret(): string {
  return new Secret({ size: SECRET_BYTES }).base32;
}

/** Builds the `otpauth://` provisioning URI for authenticator apps. */
export function totpUri(
  secret: string,
  accountEmail: string,
  issuer: string,
): string {
  return buildTotp(Secret.fromBase32(secret), issuer, accountEmail).toString();
}

/**
 * Verifies a 6-digit code within ±1 step. Returns the matched time step, or
 * null when the code is invalid or its step is not newer than `lastUsedStep`.
 * Never throws on malformed input.
 */
export function verifyTotp(
  secret: string,
  code: string,
  lastUsedStep: bigint | null,
  now: Date = new Date(),
): bigint | null {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return null;
  }
  try {
    const timestamp = now.getTime();
    const delta = buildTotp(Secret.fromBase32(secret)).validate({
      token: code,
      timestamp,
      window: WINDOW,
    });
    if (delta === null) {
      return null;
    }
    const step =
      BigInt(Math.floor(timestamp / 1000 / PERIOD_SECONDS)) + BigInt(delta);
    if (lastUsedStep !== null && step <= lastUsedStep) {
      return null;
    }
    return step;
  } catch {
    return null;
  }
}
