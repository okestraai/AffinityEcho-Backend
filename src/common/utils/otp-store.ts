import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import type { RedisService } from '../services/redis.service';

export type OtpType = 'signup' | 'password_reset';

export interface OtpRecord {
  hash: string;
  expires: number;
  attempts: number;
  lastSent: number;
  type: OtpType;
}

// Deletes the code only if its hash matches, in one step, so a code can be used once.
const TAKE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local ok, record = pcall(cjson.decode, raw)
if not ok or record.hash ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
return 1`;

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
  ) {
    // An empty key would let anyone with a Redis dump check all million codes.
    if (!secret) throw new Error('OtpStore needs a secret');
  }

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

  async get(email: string, type: OtpType): Promise<OtpRecord | null> {
    const key = this.key(email, type);
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
    const key = this.key(email, record.type);
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

  // Uses up the code if it is right. Returns false when it is wrong, already used, or can't be removed.
  async take(email: string, type: OtpType, code: string): Promise<boolean> {
    const key = this.key(email, type);
    const hash = this.hash(email, String(code ?? ''));
    const client = this.client();
    if (client) {
      try {
        return (
          (await client.eval(TAKE_SCRIPT, 1, this.redisKey(key), hash)) === 1
        );
      } catch {
        // A code that can't be removed must not be accepted.
        if (!this.local.has(key)) return false;
      }
    }
    const record = this.local.get(key);
    if (!record || record.expires <= Date.now()) return false;
    if (!this.matches(record, email, code)) return false;
    this.local.delete(key);
    return true;
  }

  private client() {
    return this.redis?.isConnected() ? this.redis.getClient() : null;
  }

  private key(email: string, type: OtpType): string {
    return `${type}:${email.toLowerCase()}`;
  }

  private redisKey(key: string): string {
    return `otp:code:${key}`;
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
