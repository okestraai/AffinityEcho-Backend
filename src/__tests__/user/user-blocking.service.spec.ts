import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UserBlockingService } from '../../modules/user/services/user-blocking.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../../__tests__/helpers/mock-supabase';

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

describe('UserBlockingService', () => {
  let service: UserBlockingService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new UserBlockingService(createMockConfigService() as any);
  });

  describe('blockUser', () => {
    it('should block user successfully', async () => {
      const userChain = createMockQueryChain({
        data: { id: 'u2', username: 'Test' },
        error: null,
      });
      const existsChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: null });
      const followChain = createMockQueryChain({ data: null, error: null });
      const connChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(userChain) // verify user exists
        .mockReturnValueOnce(existsChain) // check existing block
        .mockReturnValueOnce(insertChain) // insert block
        .mockReturnValueOnce(followChain) // remove follows
        .mockReturnValueOnce(connChain); // remove connections

      const result = await service.blockUser('u1', 'u2', { reason: 'spam' });
      expect(result.success).toBe(true);
    });

    it('should throw if blocking self', async () => {
      await expect(service.blockUser('u1', 'u1', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if already blocked', async () => {
      const userChain = createMockQueryChain({
        data: { id: 'u2', username: 'Test' },
        error: null,
      });
      const existsChain = createMockQueryChain({
        data: { id: 'existing' },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(userChain)
        .mockReturnValueOnce(existsChain);

      await expect(service.blockUser('u1', 'u2', {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('unblockUser', () => {
    it('should unblock user successfully', async () => {
      const findChain = createMockQueryChain({
        data: { id: 'block-1' },
        error: null,
      });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(findChain)
        .mockReturnValueOnce(deleteChain);

      const result = await service.unblockUser('u1', 'u2');
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException if not blocked', async () => {
      const findChain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(findChain);

      await expect(service.unblockUser('u1', 'u2')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getBlockedUsers', () => {
    it('should return formatted blocked users', async () => {
      const blocksChain = createMockQueryChain({
        data: [
          {
            id: 'b1',
            blocked_id: 'u2',
            reason: 'spam',
            created_at: '2026-01-01',
          },
        ],
        error: null,
        count: 1,
      });
      const usersChain = createMockQueryChain({
        data: [{ id: 'u2', username: 'TestUser', avatar: '🔥', bio: 'hi' }],
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(blocksChain)
        .mockReturnValueOnce(usersChain);

      const result = await service.getBlockedUsers('u1', 1, 20);
      expect(result.success).toBe(true);
      expect(result.data[0].userId).toBe('u2');
      expect(result.data[0].username).toBe('TestUser');
    });

    it('should handle empty results', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getBlockedUsers('u1');
      expect(result.data).toEqual([]);
    });
  });

  describe('getBlockStatus', () => {
    it('should return isBlocked true when user blocked target', async () => {
      const blockedByMe = createMockQueryChain({
        data: { id: 'b1' },
        error: null,
      });
      const blockedByThem = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(blockedByMe)
        .mockReturnValueOnce(blockedByThem);

      const result = await service.getBlockStatus('u1', 'u2');
      expect(result.data.isBlocked).toBe(true);
      expect(result.data.isBlockedBy).toBe(false);
    });

    it('should return isBlockedBy true when target blocked user', async () => {
      const blockedByMe = createMockQueryChain({ data: null, error: null });
      const blockedByThem = createMockQueryChain({
        data: { id: 'b1' },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(blockedByMe)
        .mockReturnValueOnce(blockedByThem);

      const result = await service.getBlockStatus('u1', 'u2');
      expect(result.data.isBlocked).toBe(false);
      expect(result.data.isBlockedBy).toBe(true);
    });

    it('should return both false when no blocks', async () => {
      const noBlock = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(noBlock).mockReturnValueOnce(noBlock);

      const result = await service.getBlockStatus('u1', 'u2');
      expect(result.data.isBlocked).toBe(false);
      expect(result.data.isBlockedBy).toBe(false);
    });
  });
});
