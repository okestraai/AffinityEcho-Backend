import { StudentStatusJobs } from '../../jobs/student-status.jobs';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

jest.mock('../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
  supabaseClient: jest.fn(),
}));
jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('StudentStatusJobs', () => {
  let client: any;
  let notifications: { createNotification: jest.Mock };
  let jobs: StudentStatusJobs;

  beforeEach(() => {
    client = createMockSupabaseClient().client;
    (supabaseAdmin as jest.Mock).mockReturnValue(client);
    notifications = { createNotification: jest.fn().mockResolvedValue({}) };
    jobs = new StudentStatusJobs(createMockConfigService() as any, notifications as any);
  });

  it('asks each student it claims, and skips one another server claimed', async () => {
    const claimU1 = createMockQueryChain({ data: [{ id: 'u1' }], error: null });
    client.from
      .mockReturnValueOnce(createMockQueryChain({ data: [{ id: 'u1' }, { id: 'u2' }], error: null }))
      .mockReturnValueOnce(claimU1)
      .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }))
      .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }));

    const asked = await jobs.askAll(new Date('2027-09-01T09:00:00Z'));

    expect(asked).toBe(1);
    expect(claimU1.or).toHaveBeenCalledWith(
      'student_status_checked_at.is.null,student_status_checked_at.lt.2027-07-03T09:00:00.000Z',
    );
    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', title: 'Still a student?' }),
    );
  });

  it('stops when no student is left to ask', async () => {
    client.from.mockReturnValueOnce(createMockQueryChain({ data: [], error: null }));
    expect(await jobs.askAll(new Date())).toBe(0);
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });
});
