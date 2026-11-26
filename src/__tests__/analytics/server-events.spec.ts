const query = jest.fn();
jest.mock('../../database/pg-client', () => ({ getPool: () => ({ query }) }));
jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

import { trackEventOnboarding, trackServerEvent } from '../../modules/analytics/server-events';

describe('server funnel steps', () => {
  beforeEach(() => query.mockReset().mockResolvedValue({ rows: [] }));

  it('records a step as a custom event from the server', () => {
    trackServerEvent('event_registered', 'user-1', { eventId: 'e1', again: false });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('"analytics_events"');
    expect(params).toEqual(['server', 'user-1', 'event_registered', '{"eventId":"e1","again":false}']);
  });

  it('never fails the request, even if the database is down or missing', async () => {
    query.mockRejectedValueOnce(new Error('down'));
    expect(() => trackServerEvent('event_created', 'u')).not.toThrow();
    query.mockImplementationOnce(() => {
      throw new Error('no pool');
    });
    expect(() => trackServerEvent('event_created', 'u')).not.toThrow();
    await new Promise((r) => setImmediate(r));
  });

  it('counts onboarding once, and only for members who came through an event link', () => {
    trackEventOnboarding('user-2');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("r.source = 'link'");
    // Only server rows count, and a unique index stops a double submit counting twice.
    expect(sql).toContain("session_key = $1");
    expect(sql).toContain("platform = 'server'");
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    expect(params).toEqual(['server', 'user-2']);
  });
});
