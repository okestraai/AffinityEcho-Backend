jest.mock('../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
  supabaseClient: jest.fn(),
}));
jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('pdfkit', () =>
  jest.fn().mockImplementation(() => ({
    pipe: jest.fn(),
    text: jest.fn().mockReturnThis(),
    moveDown: jest.fn().mockReturnThis(),
    fontSize: jest.fn().mockReturnThis(),
    font: jest.fn().mockReturnThis(),
    end: jest.fn(),
    on: jest.fn(),
  })),
);

import { BadRequestException } from '@nestjs/common';
import { AdminModerationService } from '../../modules/admin/services/admin-moderation.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

describe('AdminModerationService', () => {
  let service: AdminModerationService;
  let mockClient: any;
  const mockAdminUsers = { logAction: jest.fn().mockResolvedValue({}) };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new AdminModerationService(
      createMockConfigService() as any,
      mockAdminUsers as any,
    );
  });

  describe('listContent', () => {
    it('should return paginated content', async () => {
      const chain = createMockQueryChain({
        data: [
          {
            content_type: 'feed_post',
            content_id: 'p1',
            moderation_status: 'active',
            moderated_by: null,
          },
        ],
        error: null,
        count: 1,
      });
      mockClient.from.mockReturnValue(chain);
      const result = await service.listContent({} as any);
      expect(result.success).toBe(true);
    });

    it('should handle DB errors gracefully and return empty for failed types', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
        count: null,
      });
      mockClient.from.mockReturnValue(chain);
      const result = await service.listContent({} as any);
      expect(result.success).toBe(true);
      expect(result.data.items).toEqual([]);
    });
  });

  describe('getContentDetail', () => {
    it('should return content detail', async () => {
      // 1) from('content_moderation') 2) from(table).select
      const modChain = createMockQueryChain({
        data: {
          content_type: 'feed_post',
          content_id: 'p1',
          moderation_status: 'hidden',
        },
        error: null,
      });
      const contentChain = createMockQueryChain({
        data: { id: 'p1', content: 'hello', user_id: 'u1' },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(modChain)
        .mockReturnValue(contentChain);
      const result = await service.getContentDetail('feed_post', 'p1');
      expect(result.success).toBe(true);
    });

    it('should throw if content not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116' },
      });
      mockClient.from.mockReturnValue(chain);
      await expect(
        service.getContentDetail('feed_post', 'nope'),
      ).rejects.toThrow();
    });
  });

  describe('hideContent', () => {
    it('should hide content and create moderation record', async () => {
      const defaultChain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValue(defaultChain);
      const result = await service.hideContent(
        'admin-1',
        'Admin',
        'feed_post',
        'p1',
        'Spam',
      );
      expect(result.success).toBe(true);
    });

    it('should throw for invalid content type', async () => {
      await expect(
        service.hideContent('admin-1', 'Admin', 'invalid', 'p1', 'Spam'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('restoreContent', () => {
    it('should restore hidden content', async () => {
      const defaultChain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValue(defaultChain);
      const result = await service.restoreContent(
        'admin-1',
        'Admin',
        'feed_post',
        'p1',
        'Restored',
      );
      expect(result.success).toBe(true);
    });

    it('should throw for invalid content type', async () => {
      await expect(
        service.restoreContent('admin-1', 'Admin', 'bad', 'p1', 'x'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteContent', () => {
    it('should permanently delete content', async () => {
      const defaultChain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValue(defaultChain);
      const result = await service.deleteContent(
        'admin-1',
        'Admin',
        'feed_post',
        'p1',
        'Violation',
      );
      expect(result).toBeNull();
    });

    it('should throw for invalid content type', async () => {
      await expect(
        service.deleteContent('admin-1', 'Admin', 'bad', 'p1', 'x'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
