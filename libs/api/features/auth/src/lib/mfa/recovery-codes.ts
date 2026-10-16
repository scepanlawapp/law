import { createHash, randomInt } from "node:crypto";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_COUNT = 10;
const GROUP_LENGTH = 4;

function randomGroup(): string {
  let group = "";
  for (let i = 0; i < GROUP_LENGTH; i += 1) {
    group += ALPHABET[randomInt(ALPHABET.length)];
  }
  return group;
}

/** Generates a set of 10 unique recovery codes formatted `xxxx-xxxx`. */
export function generateRecoveryCodes(): string[] {
  const codes = new Set<string>();
  while (codes.size < CODE_COUNT) {
    codes.add(`${randomGroup()}-${randomGroup()}`);
  }
  return [...codes];
}

/** Strips whitespace and dashes and lower-cases the code. */
export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[\s-]/g, "").toLowerCase();
}

/** SHA-256 hex digest of the normalized code. */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}
