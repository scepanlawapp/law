import { validateEnvironment } from "./config.validation";

describe("validateEnvironment", () => {
  it("normalizes numeric server settings", () => {
    const result = validateEnvironment({
      NODE_ENV: "development",
      PORT: "3000",
      SMTP_PORT: "1025",
      AUTH_FRONTEND_ORIGIN: "http://localhost:4200",
    });

    expect(result).toMatchObject({ PORT: 3000, SMTP_PORT: 1025 });
  });

  it("rejects production without SMTP settings", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        PORT: "3000",
        AUTH_FRONTEND_ORIGIN: "https://law.example.com",
      }),
    ).toThrow("SMTP_HOST and SMTP_FROM are required in production");
  });

  it("rejects invalid frontend origins", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "development",
        PORT: "3000",
        AUTH_FRONTEND_ORIGIN: "not-a-url",
      }),
    ).toThrow("AUTH_FRONTEND_ORIGIN must be a valid URL");
  });

  it("rejects production without an OpenRouter key", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        PORT: "3000",
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
        PORT: "3000",
        AUTH_FRONTEND_ORIGIN: "http://localhost:4200",
        FILE_STORAGE_ROOT: "tmp/file-storage",
      }),
    ).toThrow("FILE_STORAGE_ROOT must be an absolute directory path");
  });

  it("requires FILE_STORAGE_ROOT in production", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        PORT: "3000",
        AUTH_FRONTEND_ORIGIN: "https://law.example.com",
        SMTP_HOST: "smtp.example.com",
        SMTP_FROM: "no-reply@example.com",
        OPENROUTER_API_KEY: "test-key",
      }),
    ).toThrow("FILE_STORAGE_ROOT is required in production");
  });
});
