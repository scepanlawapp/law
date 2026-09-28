import { getRuntimeConfig, loadRuntimeConfig } from "./runtime-config";

type Reply = { ok: boolean; status?: number; body?: unknown; html?: boolean };

function mockFetch(replies: Record<string, Reply>): jest.Mock {
  const fetchMock = jest.fn(async (url: string) => {
    const reply = replies[url] ?? { ok: false, status: 404 };
    return {
      ok: reply.ok,
      status: reply.status ?? 200,
      json: async () => {
        if (reply.html) throw new SyntaxError("Unexpected token '<'");
        return reply.body;
      },
    };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("loadRuntimeConfig", () => {
  const shipped = { apiUrl: "https://api.example.rs" };

  it("prefers config.local.json when it exists", async () => {
    const fetchMock = mockFetch({
      "/config.local.json": { ok: true, body: { apiUrl: "http://localhost:3000" } },
      "/config.json": { ok: true, body: shipped },
    });

    await loadRuntimeConfig();

    expect(getRuntimeConfig()).toEqual({
      apiUrl: "http://localhost:3000",
      apiPrefix: "/api",
    });
    expect(fetchMock).not.toHaveBeenCalledWith("/config.json");
  });

  it("falls back to config.json when there is no local file", async () => {
    mockFetch({ "/config.json": { ok: true, body: shipped } });

    await loadRuntimeConfig();

    expect(getRuntimeConfig().apiUrl).toBe("https://api.example.rs");
  });

  it("treats the dev server's index.html fallback as no local file", async () => {
    mockFetch({
      "/config.local.json": { ok: true, html: true },
      "/config.json": { ok: true, body: shipped },
    });

    await loadRuntimeConfig();

    expect(getRuntimeConfig().apiUrl).toBe("https://api.example.rs");
  });

  it("still fails when config.json cannot be loaded", async () => {
    mockFetch({ "/config.json": { ok: false, status: 500 } });

    await expect(loadRuntimeConfig()).rejects.toThrow(
      "Unable to load runtime config: 500",
    );
  });
});
