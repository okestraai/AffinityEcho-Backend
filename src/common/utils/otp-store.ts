import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import type { RedisService } from '../services/redis.service';

export interface OtpRecord {
  hash: string;
  expires: number;
  attempts: number;
  lastSent: number;
  type?: string;
}

// A 6-digit code from the system's secure random source.
export function newOtp(): string {
  return randomInt(100000, 1000000).toString();
}

// Keeps email codes in Redis so every server sees them and a restart doesn't lose them,
// falling back to this server's memory while Redis is down. Only a keyed hash of each code is stored.
export class OtpStore {
  private readonly local = new Map<string, OtpRecord>();

  constructor(
    private readonly secret: string,
    private readonly redis?: RedisService,
  ) {}

  hash(email: string, code: string): string {
    return createHmac('sha256', this.secret)
      .update(`${email.toLowerCase()}:${code}`)
      .digest('hex');
  }

  matches(record: OtpRecord, email: string, code: string): boolean {
    const given = Buffer.from(this.hash(email, String(code ?? '')), 'hex');
    const expected = Buffer.from(record.hash, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  async get(email: string): Promise<OtpRecord | null> {
    const key = email.toLowerCase();
    const client = this.client();
    if (client) {
      try {
        const raw = await client.get(this.redisKey(key));
        return raw ? (JSON.parse(raw) as OtpRecord) : null;
      } catch {
        // Fall through to the local copy.
      }
    }
    const record = this.local.get(key);
    if (!record) return null;
    if (record.expires <= Date.now()) {
      this.local.delete(key);
      return null;
    }
    return record;
  }

  async set(email: string, record: OtpRecord): Promise<void> {
    const key = email.toLowerCase();
    const ttl = Math.max(1, record.expires - Date.now());
    const client = this.client();
    if (client) {
      try {
        await client.set(this.redisKey(key), JSON.stringify(record), 'PX', ttl);
        this.local.delete(key);
        return;
      } catch {
        // Fall through to the local copy.
      }
    }
    this.local.set(key, record);
    this.forgetExpired();
  }

  async delete(email: string): Promise<void> {
    const key = email.toLowerCase();
    this.local.delete(key);
    const client = this.client();
    if (client) {
      try {
        await client.del(this.redisKey(key));
      } catch {
        // The local copy is already gone.
      }
    }
  }

  private client() {
    return this.redis?.isConnected() ? this.redis.getClient() : null;
  }

  private redisKey(email: string): string {
    return `otp:code:${email}`;
  }

  // Keeps the memory fallback from growing without end.
  private forgetExpired(): void {
    if (this.local.size < 1000) return;
    const now = Date.now();
    for (const [key, record] of this.local) {
      if (record.expires <= now) this.local.delete(key);
    }
  }
}
