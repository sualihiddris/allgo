import Redis from "ioredis";
import { env } from "./env";

declare global {
  var __redis: Redis | undefined;
}

// Lua script for atomic compare-and-delete:
// GET KEYS[1], compare with ARGV[1], DEL only on equality.
// Returns 1 when the key was deleted, 0 otherwise.
const COMPARE_AND_DELETE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

// In-memory store for development without Redis
class MemoryStore {
  private store = new Map<string, { value: string; expiry?: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiry && Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, mode?: string, ttl?: number): Promise<"OK"> {
    const expiry = mode === "EX" && ttl ? Date.now() + ttl * 1000 : undefined;
    this.store.set(key, { value, expiry });
    return "OK";
  }

  async setex(key: string, seconds: number, value: string): Promise<"OK"> {
    return this.set(key, value, "EX", seconds);
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    return Array.from(this.store.keys()).filter((k) => regex.test(k));
  }

  async scan(cursor: string, match: string, count: number): Promise<[string, string[]]> {
    const keys = await this.keys(match);
    return ["0", keys];
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return Promise.all(keys.map((k) => this.get(k)));
  }

  async incr(key: string): Promise<number> {
    const current = await this.get(key);
    const newValue = (parseInt(current || "0", 10) + 1).toString();
    const item = this.store.get(key);
    this.store.set(key, { value: newValue, expiry: item?.expiry });
    return parseInt(newValue, 10);
  }

  async decr(key: string): Promise<number> {
    const current = await this.get(key);
    const newValue = (parseInt(current || "0", 10) - 1).toString();
    const item = this.store.get(key);
    this.store.set(key, { value: newValue, expiry: item?.expiry });
    return parseInt(newValue, 10);
  }

  async expire(key: string, seconds: number): Promise<number> {
    const item = this.store.get(key);
    if (!item) return 0;
    item.expiry = Date.now() + seconds * 1000;
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const item = this.store.get(key);
    if (!item) return -2;
    if (!item.expiry) return -1;
    return Math.ceil((item.expiry - Date.now()) / 1000);
  }

  async exists(key: string): Promise<number> {
    return this.store.has(key) ? 1 : 0;
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    const current = await this.get(key);
    const hash = current ? JSON.parse(current) : {};
    const isNew = !(field in hash);
    hash[field] = value;
    await this.set(key, JSON.stringify(hash));
    return isNew ? 1 : 0;
  }

  async hget(key: string, field: string): Promise<string | null> {
    const current = await this.get(key);
    if (!current) return null;
    const hash = JSON.parse(current);
    return hash[field] || null;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const current = await this.get(key);
    if (!current) return {};
    return JSON.parse(current);
  }

  async hdel(key: string, field: string): Promise<number> {
    const current = await this.get(key);
    if (!current) return 0;
    const hash = JSON.parse(current);
    if (!(field in hash)) return 0;
    delete hash[field];
    await this.set(key, JSON.stringify(hash));
    return 1;
  }

  async pexpire(key: string, milliseconds: number): Promise<number> {
    const item = this.store.get(key);
    if (!item) return 0;
    item.expiry = Date.now() + milliseconds;
    return 1;
  }

  async pttl(key: string): Promise<number> {
    const item = this.store.get(key);
    if (!item) return -2;
    if (!item.expiry) return -1;
    return Math.max(0, item.expiry - Date.now());
  }

  /**
   * Atomic compare-and-delete against the Map.
   * Honors expiration equivalently to the Lua path and performs the
   * compare and delete with no await point in between.
   */
  async compareAndDelete(key: string, expected: string): Promise<boolean> {
    const item = this.store.get(key);
    if (!item) return false;
    if (item.expiry && Date.now() > item.expiry) {
      this.store.delete(key);
      return false;
    }
    if (item.value !== expected) return false;
    this.store.delete(key);
    return true;
  }

  async ping(): Promise<string> {
    return "PONG";
  }

  on(event: string, callback: Function) {
    if (event === "connect") setTimeout(() => callback(), 0);
    return this;
  }

  async connect() {
    console.log("✅ Using in-memory store (no Redis)");
  }

  async quit() {
    this.store.clear();
  }
}

// Use real Redis if URL provided, otherwise use in-memory store
const useMemoryStore = !env.REDIS_URL || env.REDIS_URL === "";

export const redis: Redis | MemoryStore = useMemoryStore
  ? new MemoryStore()
  : global.__redis || new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

if (!useMemoryStore && process.env.NODE_ENV !== "production") {
  global.__redis = redis as Redis;
}

if (!useMemoryStore) {
  (redis as Redis).on("error", (err) => {
    console.error("Redis error:", err.message);
  });

  (redis as Redis).on("connect", () => {
    console.log("✅ Redis connected");
  });
}

/**
 * Atomically delete `key` only when its current value equals `expected`.
 * Returns true when deletion occurred.
 *
 * Dispatch on the selected backend selector instead of re-reading env or
 * sniffing for .eval:
 * - MemoryStore: direct Map-backed compare-and-delete (no await between
 *   comparison and deletion, expiry honored).
 * - Real Redis: atomic Lua EVAL comparing GET(KEYS[1]) with ARGV[1].
 */
export async function compareAndDelete(key: string, expected: string): Promise<boolean> {
  if (useMemoryStore) {
    return (redis as MemoryStore).compareAndDelete(key, expected);
  }
  const result = await (redis as Redis).eval(COMPARE_AND_DELETE_SCRIPT, 1, key, expected);
  return Number(result) === 1;
}

export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
  } catch (error) {
    // Already connected is fine
    if ((error as Error).message?.includes("Already")) return;
    console.error("❌ Redis connection failed:", error);
    if (!useMemoryStore) process.exit(1);
  }
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  console.log("Redis disconnected");
}
