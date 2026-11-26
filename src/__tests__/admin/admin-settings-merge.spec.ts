const query = jest.fn();
jest.mock('../../database/pg-client', () => ({ getPool: () => ({ query }) }));
jest.mock('../../database/supabase.client', () => ({ supabaseAdmin: jest.fn(() => ({})), supabaseClient: jest.fn() }));
jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { AdminSettingsService } from '../../modules/admin/services/admin-settings.service';
import { createMockConfigService } from '../helpers/mock-supabase';

describe('saving admin settings', () => {
  const adminUsers = { logAction: jest.fn() };
  const service = new AdminSettingsService(createMockConfigService() as any, adminUsers as any);

  beforeEach(() => {
    jest.clearAllMocks();
    query.mockResolvedValue({ rows: [{ key: 'events', value: { events_per_day: 7 }, updated_at: 'now' }] });
  });

  it('merges the change inside the database in one step, so two admins saving at once both keep their change', async () => {
    await service.updateSettings('a1', 'ada', 'events', { events_per_day: 7 });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('system_settings.value || EXCLUDED.value');
    expect(params).toEqual(['events', '{"events_per_day":7}', 'a1']);
    expect(adminUsers.logAction).toHaveBeenCalled();
  });

  it('refuses a bad value before writing anything', async () => {
    await expect(service.updateSettings('a1', 'ada', 'events', { events_per_day: 0 })).rejects.toThrow('1 to 50');
    expect(query).not.toHaveBeenCalled();
  });
});
