jest.mock('../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
  supabaseClient: jest.fn(),
}));
jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('pdfkit', () =>
  jest.fn().mockImplementation(() => ({
    pipe: jest.fn(),
    text: jest.fn().mockReturnThis(),
    moveDown: jest.fn().mockReturnThis(),
    fontSize: jest.fn().mockReturnThis(),
    font: jest.fn().mockReturnThis(),
    end: jest.fn(),
    on: jest.fn((event: string, cb: any) => { if (event === 'end') cb(); }),
    rect: jest.fn().mockReturnThis(),
    fill: jest.fn().mockReturnThis(),
    fillColor: jest.fn().mockReturnThis(),
    addPage: jest.fn().mockReturnThis(),
    page: { width: 800, height: 600 },
  })),
);

import { BadRequestException } from '@nestjs/common';
import { AdminLogsService } from '../../modules/admin/services/admin-logs.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

describe('AdminLogsService', () => {
  let service: AdminLogsService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new AdminLogsService(createMockConfigService() as any);
  });

  describe('getLogs', () => {
    it('should return paginated logs', async () => {
      const chain = createMockQueryChain({
        data: [
          { id: 'log-1', action: 'hide_content', target_type: 'feed_post', admin_username: 'admin1' },
        ],
        error: null,
        count: 1,
      });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getLogs({ page: '1', limit: '10' });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.meta).toBeDefined();
    });

    it('should apply filters', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getLogs({
        adminId: 'admin-1',
        action: 'hide_content',
        targetType: 'feed_post',
        from: '2026-01-01',
        to: '2026-12-31',
        search: 'spam',
        sortDir: 'asc',
      });
      expect(result.success).toBe(true);
      expect(chain.eq).toHaveBeenCalledWith('admin_id', 'admin-1');
      expect(chain.eq).toHaveBeenCalledWith('action', 'hide_content');
    });

    it('should throw BadRequestException on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' }, count: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getLogs({})).rejects.toThrow(BadRequestException);
    });

    it('should return empty data when no logs', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getLogs({ page: '2', limit: '5' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('exportLogs', () => {
    it('should export logs as CSV', async () => {
      const chain = createMockQueryChain({
        data: [
          { id: 'log-1', action: 'hide_content', admin_username: 'admin1', target_type: 'feed_post', target_id: 'p1', reason: 'Spam', ip_address: '127.0.0.1', created_at: '2026-01-01' },
        ],
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      const result = await service.exportLogs({}, 'csv');
      expect(result.buffer).toBeDefined();
      expect(result.filename).toContain('.csv');
      expect(result.contentType).toContain('text/csv');
    });

    it('should export empty logs as CSV', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValue(chain);

      const result = await service.exportLogs({}, 'csv');
      expect(result.buffer).toBeDefined();
      expect(result.filename).toContain('.csv');
    });

    it('should throw BadRequestException on DB error during export', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.exportLogs({}, 'csv')).rejects.toThrow(BadRequestException);
    });

    it('should apply filters during export', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValue(chain);

      const result = await service.exportLogs({
        adminId: 'admin-1',
        action: 'hide',
        from: '2026-01-01',
        to: '2026-12-31',
        search: 'test',
      }, 'csv');
      expect(result.success).toBeUndefined(); // returns buffer/filename/contentType
      expect(result.buffer).toBeDefined();
    });
  });
});
