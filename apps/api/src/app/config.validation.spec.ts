import { validateEnvironment } from "./config.validation";

describe("validateEnvironment", () => {
  it("normalizes numeric server settings", () => {
    const result = validateEnvironment({
      NODE_ENV: "development",
      PORT: "3001",
      SMTP_PORT: "1025",
      AUTH_FRONTEND_ORIGIN: "http://localhost:4200",
    });

    expect(result).toMatchObject({ PORT: 3001, SMTP_PORT: 1025 });
  });

  it("rejects production without SMTP settings", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        PORT: "3001",
        AUTH_FRONTEND_ORIGIN: "https://law.example.com",
      }),
    ).toThrow("SMTP_HOST and SMTP_FROM are required in production");
  });

  it("rejects invalid frontend origins", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "development",
        PORT: "3001",
        AUTH_FRONTEND_ORIGIN: "not-a-url",
      }),
    ).toThrow("AUTH_FRONTEND_ORIGIN must be a valid URL");
  });

  it("rejects production without an OpenRouter key", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        PORT: "3001",
        AUTH_FRONTEND_ORIGIN: "https://law.example.com",
        SMTP_HOST: "smtp.example.com",
        SMTP_FROM: "no-reply@example.com",
      }),
    ).toThrow("OPENROUTER_API_KEY is required in production");
  });

  it("rejects a relative FILE_STORAGE_ROOT", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "development",
        PORT: "3001",
        AUTH_FRONTEND_ORIGIN: "http://localhost:4200",
        FILE_STORAGE_ROOT: "tmp/file-storage",
      }),
    ).toThrow("FILE_STORAGE_ROOT must be an absolute directory path");
  });

  it("requires FILE_STORAGE_ROOT in production", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        PORT: "3001",
        AUTH_FRONTEND_ORIGIN: "https://law.example.com",
        SMTP_HOST: "smtp.example.com",
        SMTP_FROM: "no-reply@example.com",
        OPENROUTER_API_KEY: "test-key",
      }),
    ).toThrow("FILE_STORAGE_ROOT is required in production");
  });

  it("production requires AUTH_MFA_ENCRYPTION_KEY of at least 32 characters", () => {
    const base = {
      NODE_ENV: "production",
      PORT: "3001",
      AUTH_FRONTEND_ORIGIN: "https://law.example.com",
      SMTP_HOST: "smtp.example.com",
      SMTP_FROM: "no-reply@example.com",
      OPENROUTER_API_KEY: "key",
      ORGANIZATION_SECRETS_KEY: "s".repeat(40),
      FILE_STORAGE_ROOT: "/var/lib/law",
    };
    expect(() => validateEnvironment(base)).toThrow(
      "AUTH_MFA_ENCRYPTION_KEY must contain at least 32 characters in production",
    );
    expect(() =>
      validateEnvironment({ ...base, AUTH_MFA_ENCRYPTION_KEY: "short" }),
    ).toThrow("AUTH_MFA_ENCRYPTION_KEY must contain at least 32 characters");
    expect(() =>
      validateEnvironment({ ...base, AUTH_MFA_ENCRYPTION_KEY: "m".repeat(40) }),
    ).not.toThrow();
  });
});
