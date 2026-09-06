import axios from "axios";

describe("GET /api", () => {
  it("should return a message", async () => {
    const res = await axios.get(`/api`);

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ message: "Hello API" });
  });
});

describe("auth API", () => {
  it("rejects invalid credentials without creating a session", async () => {
    await expect(
      axios.post("/api/auth/login", {
        email: "missing@example.test",
        password: "invalid-password",
      }),
    ).rejects.toMatchObject({ response: { status: 401 } });
  });

  it("rejects current-user access without a session cookie", async () => {
    await expect(axios.get("/api/auth/me")).rejects.toMatchObject({
      response: { status: 401 },
    });
  });
});

const authCredentials =
  process.env.AUTH_E2E_EMAIL && process.env.AUTH_E2E_PASSWORD
    ? { email: process.env.AUTH_E2E_EMAIL, password: process.env.AUTH_E2E_PASSWORD }
    : undefined;

(authCredentials ? describe : describe.skip)("authenticated session journey", () => {
  let cookie = "";

  beforeAll(async () => {
    const response = await axios.post("/api/auth/login", authCredentials);
    cookie = response.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
    expect(cookie).toMatch(/^law_session=/);
  });

  it("restores the authenticated user", async () => {
    const response = await axios.get("/api/auth/me", {
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(200);
    expect(response.data.user.email).toBe(authCredentials?.email.toLowerCase());
  });

  it("rotates the session and rejects the previous token", async () => {
    const previousCookie = cookie;
    const refresh = await axios.post(
      "/api/auth/refresh",
      {},
      { headers: { Cookie: previousCookie } },
    );
    cookie = refresh.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";

    expect(cookie).toMatch(/^law_session=/);
    await expect(
      axios.get("/api/auth/me", { headers: { Cookie: previousCookie } }),
    ).rejects.toMatchObject({ response: { status: 401 } });
  });

  it("logs out and invalidates the current session", async () => {
    await axios.post("/api/auth/logout", {}, { headers: { Cookie: cookie } });

    await expect(
      axios.get("/api/auth/me", { headers: { Cookie: cookie } }),
    ).rejects.toMatchObject({ response: { status: 401 } });
  });
});
