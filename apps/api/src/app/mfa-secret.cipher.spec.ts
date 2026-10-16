import { ServiceUnavailableException } from "@nestjs/common";
import { MfaSecretCipher } from "@law/auth";

const KEY = "k".repeat(48);

function withKey(value: string | undefined): MfaSecretCipher {
  const previous = process.env.AUTH_MFA_ENCRYPTION_KEY;
  if (value === undefined) delete process.env.AUTH_MFA_ENCRYPTION_KEY;
  else process.env.AUTH_MFA_ENCRYPTION_KEY = value;
  try {
    return new MfaSecretCipher();
  } finally {
    if (previous === undefined) delete process.env.AUTH_MFA_ENCRYPTION_KEY;
    else process.env.AUTH_MFA_ENCRYPTION_KEY = previous;
  }
}

describe("MfaSecretCipher", () => {
  it("round-trips a secret", () => {
    const cipher = withKey(KEY);
    expect(cipher.available).toBe(true);
    const encrypted = cipher.encrypt("JBSWY3DPEHPK3PXP");
    expect(encrypted.ciphertext).not.toContain("JBSWY3DPEHPK3PXP");
    expect(cipher.decrypt(encrypted)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("uses a fresh iv per encryption", () => {
    const cipher = withKey(KEY);
    const first = cipher.encrypt("same-secret");
    const second = cipher.encrypt("same-secret");
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(Buffer.from(first.iv, "base64")).toHaveLength(12);
  });

  it("rejects a tampered ciphertext", () => {
    const cipher = withKey(KEY);
    const encrypted = cipher.encrypt("JBSWY3DPEHPK3PXP");
    const bytes = Buffer.from(encrypted.ciphertext, "base64");
    bytes[0] ^= 0xff;
    expect(() =>
      cipher.decrypt({ ...encrypted, ciphertext: bytes.toString("base64") }),
    ).toThrow();
  });

  it("is unavailable and throws 503 without a key or with a short key", () => {
    for (const value of [undefined, "", "too-short-key"]) {
      const cipher = withKey(value);
      expect(cipher.available).toBe(false);
      expect(() => cipher.encrypt("x")).toThrow(ServiceUnavailableException);
      expect(() =>
        cipher.decrypt({ ciphertext: "", iv: "", authTag: "" }),
      ).toThrow("Two-factor authentication is not configured");
    }
  });
});
