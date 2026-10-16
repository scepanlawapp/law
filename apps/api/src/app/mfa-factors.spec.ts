import { Secret, TOTP } from "otpauth";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  normalizeRecoveryCode,
  totpUri,
  verifyTotp,
} from "@law/auth";

const NOW = new Date("2026-10-16T12:00:10.000Z");
const STEP = BigInt(Math.floor(NOW.getTime() / 1000 / 30));

function codeAt(secret: string, offsetSteps: number): string {
  const totp = new TOTP({
    secret: Secret.fromBase32(secret),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });
  return totp.generate({ timestamp: NOW.getTime() + offsetSteps * 30_000 });
}

describe("TOTP", () => {
  const secret = generateTotpSecret();

  it("generates a base32 secret of 20 bytes", () => {
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateTotpSecret()).not.toEqual(secret);
  });

  it("accepts the current code", () => {
    expect(verifyTotp(secret, codeAt(secret, 0), null, NOW)).toBe(STEP);
  });

  it("accepts ±1 step and rejects ±2", () => {
    expect(verifyTotp(secret, codeAt(secret, -1), null, NOW)).toBe(
      STEP - BigInt(1),
    );
    expect(verifyTotp(secret, codeAt(secret, 1), null, NOW)).toBe(
      STEP + BigInt(1),
    );
    expect(verifyTotp(secret, codeAt(secret, -2), null, NOW)).toBeNull();
    expect(verifyTotp(secret, codeAt(secret, 2), null, NOW)).toBeNull();
  });

  it("rejects a step at or below lastUsedStep", () => {
    const code = codeAt(secret, 0);
    expect(verifyTotp(secret, code, STEP, NOW)).toBeNull();
    expect(verifyTotp(secret, code, STEP + BigInt(1), NOW)).toBeNull();
    expect(verifyTotp(secret, code, STEP - BigInt(1), NOW)).toBe(STEP);
  });

  it("rejects non-6-digit input", () => {
    expect(verifyTotp(secret, "12345", null, NOW)).toBeNull();
    expect(verifyTotp(secret, "1234567", null, NOW)).toBeNull();
    expect(verifyTotp(secret, "abcdef", null, NOW)).toBeNull();
    expect(verifyTotp(secret, "", null, NOW)).toBeNull();
    expect(verifyTotp("not base32 !!", "123456", null, NOW)).toBeNull();
  });

  it("uri contains issuer, account and SHA1/6/30", () => {
    const uri = totpUri(secret, "ana@example.rs", "Law Platform");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("Law%20Platform");
    expect(uri).toContain("ana%40example.rs");
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});

describe("recovery codes", () => {
  it("generates 10 unique codes matching xxxx-xxxx", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(/^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/);
    }
  });

  it("normalization: ' ABCD-efgh ' and 'abcdefgh' hash equal", () => {
    expect(normalizeRecoveryCode(" ABCD-efgh ")).toBe("abcdefgh");
    expect(hashRecoveryCode(" ABCD-efgh ")).toBe(hashRecoveryCode("abcdefgh"));
    expect(hashRecoveryCode("abcdefgh")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode("abcdefgh")).not.toBe(hashRecoveryCode("abcdefgi"));
  });
});
