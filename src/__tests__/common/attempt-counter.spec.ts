import { AttemptCounter } from '../../common/utils/attempt-counter';

describe('AttemptCounter', () => {
  let now: number;
  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());

  it('counts in memory when Redis is not connected, and expires', async () => {
    const counter = new AttemptCounter({
      isConnected: () => false,
      getClient: () => null,
    } as any);
    expect(await counter.bump('k', 1000)).toBe(1);
    expect(await counter.bump('k', 1000)).toBe(2);
    expect(await counter.count('k')).toEqual({ n: 2, msLeft: 1000 });
    now += 1001;
    expect((await counter.count('k')).n).toBe(0);
  });

  it('restarts the window on each bump when sliding', async () => {
    const counter = new AttemptCounter();
    await counter.bump('k', 1000, true);
    now += 900;
    await counter.bump('k', 1000, true);
    now += 900;
    expect((await counter.count('k')).n).toBe(2);
  });

  it('uses Redis while it is connected, setting the count and its expiry together', async () => {
    const calls: unknown[][] = [];
    const tx: any = {
      set: (...a: unknown[]) => (calls.push(['set', ...a]), tx),
      incr: (...a: unknown[]) => (calls.push(['incr', ...a]), tx),
      pexpire: (...a: unknown[]) => (calls.push(['pexpire', ...a]), tx),
      exec: jest.fn().mockResolvedValue([
        [null, 'OK'],
        [null, 1],
      ]),
    };
    const client = {
      multi: () => tx,
      get: jest.fn().mockResolvedValue('1'),
      pttl: jest.fn().mockResolvedValue(500),
      del: jest.fn(),
    };
    const counter = new AttemptCounter({
      isConnected: () => true,
      getClient: () => client,
    } as any);
    expect(await counter.bump('k', 1000)).toBe(1);
    expect(calls).toEqual([
      ['set', 'k', 0, 'PX', 1000, 'NX'],
      ['incr', 'k'],
    ]);
    expect(await counter.count('k')).toEqual({ n: 1, msLeft: 500 });
    await counter.clear('k');
    expect(client.del).toHaveBeenCalledWith('k');
  });

  it('falls back to memory when a Redis call fails', async () => {
    const client = {
      incr: jest.fn().mockRejectedValue(new Error('down')),
      get: jest.fn().mockRejectedValue(new Error('down')),
      pttl: jest.fn(),
    };
    const counter = new AttemptCounter({
      isConnected: () => true,
      getClient: () => client,
    } as any);
    expect(await counter.bump('k', 1000)).toBe(1);
    expect((await counter.count('k')).n).toBe(1);
  });
});
