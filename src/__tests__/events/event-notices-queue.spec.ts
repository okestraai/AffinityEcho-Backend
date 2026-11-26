import { EventNoticesService } from '../../modules/events/event-notices.service';
import { eventSettings } from '../../modules/events/event-settings';
import { createMockConfigService } from '../helpers/mock-supabase';

jest.mock('../../database/supabase.client', () => ({ supabaseAdmin: jest.fn(() => ({})), supabaseClient: jest.fn() }));
jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('qrcode', () => ({ toBuffer: jest.fn() }));
jest.mock('../../modules/events/event-settings', () => ({ eventSettings: jest.fn() }));

describe('queueing update messages', () => {
  const queue = { add: jest.fn().mockResolvedValue(undefined), getJob: jest.fn() };
  const service = new EventNoticesService(createMockConfigService() as any, {} as any, {} as any, {} as any, queue as any);
  const minutes = (n: number) =>
    (eventSettings as jest.Mock).mockResolvedValue({ events: { update_grouping_minutes: n }, storage: {} });

  beforeEach(() => jest.clearAllMocks());

  it('waits for the admin grouping window, so quick edits become one message', async () => {
    minutes(5);
    queue.getJob.mockResolvedValue(undefined);
    await service.queueUpdate('e1');
    expect(queue.add).toHaveBeenCalledWith('updated', { eventId: 'e1' }, expect.objectContaining({ jobId: 'event-updated-e1', delay: 300000 }));
  });

  it('queues a new message when the waiting one is already being sent, so no edit is lost', async () => {
    minutes(2);
    queue.getJob.mockResolvedValue({ getState: jest.fn().mockResolvedValue('active') });
    await service.queueUpdate('e1');
    const opts = queue.add.mock.calls[0][2];
    expect(opts.jobId).toMatch(/^event-updated-e1-\d+$/);
  });

  it('joins a message that is still waiting', async () => {
    minutes(2);
    queue.getJob.mockResolvedValue({ getState: jest.fn().mockResolvedValue('delayed') });
    await service.queueUpdate('e1');
    expect(queue.add.mock.calls[0][2].jobId).toBe('event-updated-e1');
  });
});
