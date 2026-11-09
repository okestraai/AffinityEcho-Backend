import type { RedisService } from '../services/redis.service';

// Counts attempts in Redis while it's connected, or in this server's memory, expiring the same way.
export class AttemptCounter {
  private readonly local = new Map<string, { n: number; until: number }>();

  constructor(private readonly redis?: RedisService) {}

  private client() {
    return this.redis?.isConnected() ? this.redis.getClient() : null;
  }

  async count(key: string): Promise<{ n: number; msLeft: number }> {
    const client = this.client();
    if (client) {
      try {
        const [n, ttl] = await Promise.all([client.get(key), client.pttl(key)]);
        return { n: Number(n) || 0, msLeft: Math.max(0, ttl) };
      } catch {
        // Fall through to the local count.
      }
    }
    const entry = this.local.get(key);
    if (!entry || entry.until <= Date.now()) return { n: 0, msLeft: 0 };
    return { n: entry.n, msLeft: entry.until - Date.now() };
  }

  // Adds one and returns the new count. The window starts at the first one, or restarts each time
  // when `slide` is set.
  async bump(key: string, ttlMs: number, slide = false): Promise<number> {
    const client = this.client();
    if (client) {
      try {
        const n = await client.incr(key);
        if (n === 1 || slide) await client.pexpire(key, ttlMs);
        return n;
      } catch {
        // Fall through to the local count.
      }
    }
    const now = Date.now();
    const entry = this.local.get(key);
    const live =
      entry && entry.until > now ? entry : { n: 0, until: now + ttlMs };
    const next = { n: live.n + 1, until: slide ? now + ttlMs : live.until };
    this.local.set(key, next);
    this.forgetExpired(now);
    return next.n;
  }

  async clear(...keys: string[]): Promise<void> {
    keys.forEach((key) => this.local.delete(key));
    const client = this.client();
    if (client) {
      try {
        await client.del(...keys);
      } catch {
        // Local counts are already cleared.
      }
    }
  }

  // Keeps the memory fallback from growing without end.
  private forgetExpired(now: number): void {
    if (this.local.size < 1000) return;
    for (const [key, entry] of this.local) {
      if (entry.until <= now) this.local.delete(key);
    }
  }
}
