import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

export const AUTH_REDIS = Symbol("AUTH_REDIS");
const KEY_PREFIX = "auth:rl:";

export abstract class AuthRateLimitStore {
  /** Increments `auth:rl:${key}`; sets TTL on first hit; returns the count in the current window. */
  abstract hit(key: string, windowMs: number): Promise<number>;
}

/**
 * Version-agnostic (Redis < 7 has no `PEXPIRE ... NX`): INCR and, on the first
 * hit of a window, set the TTL atomically in one script.
 */
const HIT_SCRIPT = `local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return c`;

export function createAuthRedisClient(): Redis {
  const logger = new Logger("AuthRedis");
  const redis = new Redis(
    process.env["REDIS_URL"] ?? "redis://localhost:6379",
    {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
    },
  );
  // Without a listener ioredis prints "Unhandled error event" on every reconnect.
  redis.on("error", (error: Error) => {
    logger.warn(`Auth Redis client error: ${error.message}`);
  });
  return redis;
}

@Injectable()
export class RedisAuthRateLimitStore
  extends AuthRateLimitStore
  implements OnModuleDestroy
{
  private connecting?: Promise<void>;

  constructor(@Inject(AUTH_REDIS) private readonly redis: Redis) {
    super();
  }

  async hit(key: string, windowMs: number): Promise<number> {
    await this.ensureConnected();
    const redisKey = `${KEY_PREFIX}${key}`;
    const count: unknown = await this.redis.eval(
      HIT_SCRIPT,
      1,
      redisKey,
      String(windowMs),
    );
    if (typeof count !== "number" || !Number.isFinite(count)) {
      throw new Error("Unexpected rate limit counter");
    }
    return count;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status === "end") return;
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  /**
   * The client is created with `lazyConnect` and no offline queue, so commands
   * fail until a connection exists. Connect once on first use; later drops are
   * handled by ioredis reconnection (commands fail fast meanwhile).
   */
  private async ensureConnected(): Promise<void> {
    if (this.redis.status === "ready") return;
    if (this.redis.status === "wait") {
      this.connecting ??= this.redis.connect().finally(() => {
        this.connecting = undefined;
      });
    }
    if (this.connecting) await this.connecting;
  }
}

interface MemoryWindow {
  count: number;
  expiresAt: number;
}

/** Single-process store, used by tests. */
export class InMemoryAuthRateLimitStore extends AuthRateLimitStore {
  private readonly windows = new Map<string, MemoryWindow>();

  async hit(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const current = this.windows.get(key);
    if (!current || now >= current.expiresAt) {
      this.windows.set(key, { count: 1, expiresAt: now + windowMs });
      return 1;
    }
    current.count += 1;
    return current.count;
  }
}
