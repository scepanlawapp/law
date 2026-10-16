import { RedisAuthRateLimitStore } from "@law/auth";

function stubRedis(overrides: Record<string, unknown> = {}) {
  const redis = {
    status: "wait",
    connect: jest.fn(async () => {
      redis.status = "ready";
    }),
    eval: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue("OK"),
    disconnect: jest.fn(),
    ...overrides,
  };
  return redis;
}

describe("RedisAuthRateLimitStore", () => {
  it("increments through one Lua script call with the prefixed key and window", async () => {
    const redis = stubRedis();
    redis.eval.mockResolvedValue(3);
    const store = new RedisAuthRateLimitStore(redis as never);

    await expect(store.hit("ip:1.2.3.4:/auth/login", 60_000)).resolves.toBe(3);

    expect(redis.eval).toHaveBeenCalledTimes(1);
    const [script, keyCount, key, windowMs] = redis.eval.mock.calls[0];
    expect(script).toContain("INCR");
    expect(script).toContain("PEXPIRE");
    expect(script).not.toContain("NX");
    expect(keyCount).toBe(1);
    expect(key).toBe("auth:rl:ip:1.2.3.4:/auth/login");
    expect(String(windowMs)).toBe("60000");
  });

  it("connects once for concurrent first hits", async () => {
    const redis = stubRedis();
    const store = new RedisAuthRateLimitStore(redis as never);

    await Promise.all([store.hit("a", 1000), store.hit("b", 1000)]);

    expect(redis.connect).toHaveBeenCalledTimes(1);
    expect(redis.eval).toHaveBeenCalledTimes(2);
  });

  it("rejects when the script fails", async () => {
    const redis = stubRedis({
      eval: jest.fn().mockRejectedValue(new Error("redis down")),
    });
    const store = new RedisAuthRateLimitStore(redis as never);

    await expect(store.hit("a", 1000)).rejects.toThrow("redis down");
  });

  it.each([["abc"], [null], [undefined], [NaN], [Infinity]])(
    "rejects a non-numeric result (%p) so the guard fails closed",
    async (result) => {
      const redis = stubRedis({
        eval: jest.fn().mockResolvedValue(result),
      });
      const store = new RedisAuthRateLimitStore(redis as never);

      await expect(store.hit("a", 1000)).rejects.toThrow();
    },
  );
});
