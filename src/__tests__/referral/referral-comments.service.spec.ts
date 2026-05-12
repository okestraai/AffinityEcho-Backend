jest.mock('../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
  supabaseClient: jest.fn(),
}));
jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ReferralCommentsService } from '../../modules/referral/services/referral-comments.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

describe('ReferralCommentsService', () => {
  let service: ReferralCommentsService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    mockClient.rpc = jest.fn().mockResolvedValue({ data: null, error: null });

    const mockIdentityReveal = {
      resolveNotificationName: jest.fn().mockResolvedValue('TestUser'),
    };
    const mockNotifications = {
      createNotification: jest.fn().mockResolvedValue({}),
    };

    const mockModerationQueue = { add: jest.fn().mockResolvedValue({}) };

    service = new ReferralCommentsService(
      createMockConfigService() as any,
      mockIdentityReveal as any,
      mockNotifications as any,
      mockModerationQueue as any,
    );
  });

  describe('getComments', () => {
    it('should return comments with author profiles', async () => {
      const commentsChain = createMockQueryChain({
        data: [{ id: 'c1', user_id: 'u1', content: 'Great referral!' }],
        error: null,
        count: 1,
      });
      const profilesChain = createMockQueryChain({
        data: [{ id: 'u1', username: 'User1', avatar: '🔥', is_company_verified: true }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(commentsChain)
        .mockReturnValueOnce(profilesChain);

      const result = await service.getComments('ref-1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].author).toBeDefined();
    });

    it('should throw BadRequestException on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' }, count: null });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getComments('ref-1')).rejects.toThrow(BadRequestException);
    });

    it('should support pagination', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      const profilesChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(chain).mockReturnValueOnce(profilesChain);

      const result = await service.getComments('ref-1', 10, 20);
      expect(result.success).toBe(true);
      expect(result.pagination.offset).toBe(20);
      expect(result.pagination.limit).toBe(10);
    });
  });

  describe('createComment', () => {
    it('should create a comment on a referral post', async () => {
      const referralChain = createMockQueryChain({
        data: { user_id: 'u2', title_encrypted: 'enc_title' },
        error: null,
      });
      const insertChain = createMockQueryChain({
        data: { id: 'c1', content: 'Great post!' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(referralChain)
        .mockReturnValueOnce(insertChain);

      const result = await service.createComment('u1', 'ref-1', { content: 'Great post!' } as any);
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('c1');
    });

    it('should throw BadRequestException on insert error', async () => {
      const referralChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: { message: 'fail' } });

      mockClient.from
        .mockReturnValueOnce(referralChain)
        .mockReturnValueOnce(insertChain);

      await expect(
        service.createComment('u1', 'ref-1', { content: 'Hi' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateComment', () => {
    it('should update own comment', async () => {
      const existChain = createMockQueryChain({ data: { user_id: 'u1' }, error: null });
      const updateChain = createMockQueryChain({ data: { id: 'c1', content: 'Updated!' }, error: null });

      mockClient.from
        .mockReturnValueOnce(existChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.updateComment('u1', 'c1', { content: 'Updated!' } as any);
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException if comment not found', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(
        service.updateComment('u1', 'nope', { content: 'x' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not comment owner', async () => {
      const chain = createMockQueryChain({ data: { user_id: 'other' }, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(
        service.updateComment('u1', 'c1', { content: 'x' } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteComment', () => {
    it('should delete own comment', async () => {
      const existChain = createMockQueryChain({
        data: { user_id: 'u1', referral_post_id: 'ref-1' },
        error: null,
      });
      const deleteChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(existChain)
        .mockReturnValueOnce(deleteChain);

      const result = await service.deleteComment('u1', 'c1');
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException if comment not found', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.deleteComment('u1', 'nope')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not comment owner', async () => {
      const chain = createMockQueryChain({
        data: { user_id: 'other', referral_post_id: 'ref-1' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.deleteComment('u1', 'c1')).rejects.toThrow(ForbiddenException);
    });
  });
});
