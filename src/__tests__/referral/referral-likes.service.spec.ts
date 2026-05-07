import { BadRequestException } from '@nestjs/common';
import { ReferralLikesService } from '../../modules/referral/services/referral-likes.service';
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
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ReferralLikesService', () => {
  let service: ReferralLikesService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    const mockIdentityReveal = {
      resolveNotificationName: jest.fn().mockResolvedValue('TestUser'),
    };
    const mockNotifications = {
      createNotification: jest.fn().mockResolvedValue({}),
    };
    service = new ReferralLikesService(
      createMockConfigService() as any,
      mockIdentityReveal as any,
      mockNotifications as any,
    );
  });

  describe('likeReferral', () => {
    it('should like successfully', async () => {
      const insertChain = createMockQueryChain({ data: null, error: null });
      const postChain = createMockQueryChain({
        data: { likes_count: 5, user_id: 'u2' },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(postChain);
      mockClient.rpc.mockResolvedValueOnce({ data: null, error: null });

      const result = await service.likeReferral('u1', 'ref-1');
      expect(result.success).toBe(true);
      expect(result.data.liked).toBe(true);
      expect(result.data.likesCount).toBe(5);
    });

    it('should throw on insert error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'duplicate' },
      });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(service.likeReferral('u1', 'ref-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('unlikeReferral', () => {
    it('should unlike successfully', async () => {
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const postChain = createMockQueryChain({
        data: { likes_count: 4 },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(postChain);
      mockClient.rpc.mockResolvedValueOnce({ data: null, error: null });

      const result = await service.unlikeReferral('u1', 'ref-1');
      expect(result.success).toBe(true);
      expect(result.data.liked).toBe(false);
    });

    it('should throw on error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(service.unlikeReferral('u1', 'ref-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getUserLikes', () => {
    it('should return user likes', async () => {
      const chain = createMockQueryChain({
        data: [{ referral_post_id: 'ref-1', created_at: '2026-01-01' }],
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);
      const result = await service.getUserLikes('u1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('should throw on error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(service.getUserLikes('u1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
