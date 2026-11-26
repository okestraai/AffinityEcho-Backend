import * as crypto from 'crypto';
import { OtpStore, newOtp } from '../../common/utils/otp-store';

jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  return { ...actual, randomInt: jest.fn(actual.randomInt) };
});

// A small stand-in for a Redis server that several stores can share, like two app servers would.
function fakeRedis() {
  const data = new Map<string, { value: string; until: number }>();
  const client = {
    get: jest.fn(async (key: string) => {
      const entry = data.get(key);
      return entry && entry.until > Date.now() ? entry.value : null;
    }),
    set: jest.fn(
      async (key: string, value: string, _px: string, ttl: number) => {
        data.set(key, { value, until: Date.now() + ttl });
        return 'OK';
      },
    ),
    del: jest.fn(async (key: string) => (data.delete(key) ? 1 : 0)),
  };
  return {
    data,
    client,
    service: { isConnected: () => true, getClient: () => client } as any,
  };
}

const record = (
  store: OtpStore,
  email: string,
  code: string,
  ttl = 60_000,
) => ({
  hash: store.hash(email, code),
  expires: Date.now() + ttl,
  attempts: 1,
  lastSent: Date.now(),
  type: 'signup',
});

describe('newOtp', () => {
  it('makes 6-digit codes from the secure random source', () => {
    for (let i = 0; i < 200; i++) expect(newOtp()).toMatch(/^[1-9]\d{5}$/);
    expect(crypto.randomInt).toHaveBeenCalledWith(100000, 1000000);
  });

  it('never uses Math.random', () => {
    const spy = jest.spyOn(Math, 'random');
    newOtp();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('OtpStore', () => {
  let now: number;
  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());

  it('keeps only a keyed hash of the code, never the code', async () => {
    const redis = fakeRedis();
    const store = new OtpStore('secret-a', redis.service);
    await store.set(
      'User@Example.com',
      record(store, 'user@example.com', '482913'),
    );
    const saved = redis.data.get('otp:code:user@example.com')!.value;
    expect(saved).not.toContain('482913');
    expect(
      new OtpStore('secret-b').hash('user@example.com', '482913'),
    ).not.toBe(store.hash('user@example.com', '482913'));
  });

  it('matches the right code and refuses a wrong one', async () => {
    const store = new OtpStore('secret');
    await store.set('a@b.co', record(store, 'a@b.co', '111111'));
    const saved = (await store.get('A@B.co'))!;
    expect(store.matches(saved, 'a@b.co', '111111')).toBe(true);
    expect(store.matches(saved, 'a@b.co', '111112')).toBe(false);
    expect(store.matches(saved, 'other@b.co', '111111')).toBe(false);
  });

  it('lets a second server read a code the first one made', async () => {
    const redis = fakeRedis();
    const first = new OtpStore('secret', redis.service);
    const second = new OtpStore('secret', redis.service);
    await first.set('a@b.co', record(first, 'a@b.co', '222222'));
    const seen = await second.get('a@b.co');
    expect(seen).not.toBeNull();
    expect(second.matches(seen!, 'a@b.co', '222222')).toBe(true);
  });

  it('keeps codes through a restart, because they live in Redis', async () => {
    const redis = fakeRedis();
    await new OtpStore('secret', redis.service).set(
      'a@b.co',
      record(new OtpStore('secret'), 'a@b.co', '333333'),
    );
    const afterRestart = new OtpStore('secret', redis.service);
    expect(await afterRestart.get('a@b.co')).not.toBeNull();
  });

  it('expires codes in Redis at their expiry time', async () => {
    const redis = fakeRedis();
    const store = new OtpStore('secret', redis.service);
    await store.set('a@b.co', record(store, 'a@b.co', '444444', 1000));
    expect(redis.client.set).toHaveBeenCalledWith(
      'otp:code:a@b.co',
      expect.any(String),
      'PX',
      1000,
    );
    now += 1001;
    expect(await store.get('a@b.co')).toBeNull();
  });

  it('deletes a code everywhere', async () => {
    const redis = fakeRedis();
    const store = new OtpStore('secret', redis.service);
    await store.set('a@b.co', record(store, 'a@b.co', '555555'));
    await store.delete('A@B.CO');
    expect(await store.get('a@b.co')).toBeNull();
  });

  it('falls back to memory while Redis is down, and expires there too', async () => {
    const store = new OtpStore('secret', {
      isConnected: () => false,
      getClient: () => null,
    } as any);
    await store.set('a@b.co', record(store, 'a@b.co', '666666', 1000));
    expect(await store.get('a@b.co')).not.toBeNull();
    now += 1001;
    expect(await store.get('a@b.co')).toBeNull();
  });

  it('uses memory when a Redis call fails', async () => {
    const redis = fakeRedis();
    redis.client.set.mockRejectedValueOnce(new Error('down'));
    redis.client.get.mockRejectedValueOnce(new Error('down'));
    const store = new OtpStore('secret', redis.service);
    await store.set('a@b.co', record(store, 'a@b.co', '777777'));
    expect(await store.get('a@b.co')).not.toBeNull();
  });
});
