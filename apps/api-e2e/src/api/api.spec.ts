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
