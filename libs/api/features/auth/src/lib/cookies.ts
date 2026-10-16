import { Request } from "express";

export const SESSION_COOKIE = "law_session";
export const MFA_CHALLENGE_COOKIE = "law_mfa_challenge";
export const TRUSTED_DEVICE_COOKIE = "law_trusted_device";

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
export const MFA_CHALLENGE_TTL_MS = 1000 * 60 * 5;
export const TRUSTED_DEVICE_TTL_MS = 1000 * 60 * 60 * 24 * 30;

/** Reads one cookie from the raw header; empty values count as missing. */
export function readCookie(
  request: Pick<Request, "headers">,
  name: string,
): string | undefined {
  const prefix = `${name}=`;
  const part = request.headers.cookie
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  const value = part?.slice(prefix.length);
  return value ? value : undefined;
}

export function sessionCookieOptions(production: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: production,
    path: "/",
  };
}

/** Challenge cookie is only sent to the auth routes and never cross-site. */
export function mfaChallengeCookieOptions(production: boolean) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: production,
    path: "/api/auth",
  };
}

/**
 * Trusted-device cookie is only sent to the auth routes. `Lax` (not `Strict`)
 * so it still accompanies a top-level navigation into the app's login.
 */
export function trustedDeviceCookieOptions(production: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: production,
    path: "/api/auth",
  };
}
