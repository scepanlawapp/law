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
});