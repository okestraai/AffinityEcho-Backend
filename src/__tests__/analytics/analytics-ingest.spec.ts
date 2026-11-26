const query = jest.fn();
jest.mock('../../database/pg-client', () => ({ getPool: () => ({ query }) }));
jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
jest.mock('../../modules/analytics/analytics-context.util', () => ({
  clientIp: () => '127.0.0.1',
  hashIp: () => 'h',
  lookupGeo: () => ({ country: null, region: null, city: null }),
  parseUserAgent: () => ({ device_type: null, os: null, os_version: null, browser: null, device_model: null, is_bot: false }),
  referrerSource: () => ({ referrer_source: null, referrer_url: null }),
}));

import { AnalyticsIngestService } from '../../modules/analytics/analytics-ingest.service';

describe('visitor analytics ingest', () => {
  beforeEach(() => query.mockReset().mockResolvedValue({ rows: [] }));
  const service = new AnalyticsIngestService();

  it("refuses the server's own session id, so visitors can't forge server steps", async () => {
    for (const sid of ['server', ' Server ']) {
      await service.record(
        { sid, events: [{ type: 'custom', name: 'event_otp_verified', metadata: { newAccount: 'x' } }], context: {} } as any,
        { headers: {} },
        null,
      );
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('still records ordinary visitor events', async () => {
    await service.record(
      { sid: 'abc-123', events: [{ type: 'page_view', path: '/events/x' }], context: { platform: 'web' } } as any,
      { headers: {} },
      null,
    );
    expect(query).toHaveBeenCalledTimes(2);
  });
});
