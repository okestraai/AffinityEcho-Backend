import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserAccountService } from '../../modules/user/services/user-account.service';
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

describe('UserAccountService', () => {
  let service: UserAccountService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new UserAccountService(createMockConfigService() as any);
  });

  describe('deactivateAccount', () => {
    it('should deactivate account', async () => {
      const userChain = createMockQueryChain({
        data: { id: 'u1', is_deactivated: false },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(userChain)
        .mockReturnValueOnce(updateChain);
      const result = await service.deactivateAccount('u1', {
        reason: 'taking a break',
      });
      expect(result.success).toBe(true);
    });

    it('should throw if user not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found', code: 'PGRST116' },
      });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(service.deactivateAccount('u1', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if already deactivated', async () => {
      const chain = createMockQueryChain({
        data: { id: 'u1', is_deactivated: true },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(service.deactivateAccount('u1', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw on update error', async () => {
      const userChain = createMockQueryChain({
        data: { id: 'u1', is_deactivated: false },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from
        .mockReturnValueOnce(userChain)
        .mockReturnValueOnce(updateChain);
      await expect(service.deactivateAccount('u1', {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('reactivateAccount', () => {
    it('should reactivate account', async () => {
      const userChain = createMockQueryChain({
        data: { id: 'u1', is_deactivated: true },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(userChain)
        .mockReturnValueOnce(updateChain);
      const result = await service.reactivateAccount('u1');
      expect(result.success).toBe(true);
    });

    it('should throw if not deactivated', async () => {
      const chain = createMockQueryChain({
        data: { id: 'u1', is_deactivated: false },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(service.reactivateAccount('u1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw on update error', async () => {
      const userChain = createMockQueryChain({
        data: { id: 'u1', is_deactivated: true },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from
        .mockReturnValueOnce(userChain)
        .mockReturnValueOnce(updateChain);
      await expect(service.reactivateAccount('u1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('deleteAccount', () => {
    it('should delete (soft) account', async () => {
      const userChain = createMockQueryChain({
        data: { id: 'u1', email: 'test@test.com', username: 'Test' },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(userChain)
        .mockReturnValueOnce(updateChain);
      const result = await service.deleteAccount('u1', {
        confirmDeletion: true,
      });
      expect(result.success).toBe(true);
    });

    it('should throw if not confirmed', async () => {
      await expect(
        service.deleteAccount('u1', { confirmDeletion: false }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if user not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(
        service.deleteAccount('u1', { confirmDeletion: true }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw on update error', async () => {
      const userChain = createMockQueryChain({
        data: { id: 'u1', email: 'test@test.com', username: 'Test' },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from
        .mockReturnValueOnce(userChain)
        .mockReturnValueOnce(updateChain);
      await expect(
        service.deleteAccount('u1', { confirmDeletion: true }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('exportUserData', () => {
    it('should export user data', async () => {
      const profileChain = createMockQueryChain({
        data: {
          id: 'u1',
          username: 'Test',
          email: 'test@test.com',
          created_at: '2026-01-01',
          bio: 'hi',
          job_title: 'Dev',
          avatar: '🔥',
        },
        error: null,
      });
      const postsChain = createMockQueryChain({ data: [], error: null });
      const commentsChain = createMockQueryChain({ data: [], error: null });
      const topicsChain = createMockQueryChain({ data: [], error: null });
      const messagesChain = createMockQueryChain({ data: [], error: null });
      const followersChain = createMockQueryChain({ data: [], error: null });
      const followingChain = createMockQueryChain({ data: [], error: null });
      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(postsChain)
        .mockReturnValueOnce(commentsChain)
        .mockReturnValueOnce(topicsChain)
        .mockReturnValueOnce(messagesChain)
        .mockReturnValueOnce(followersChain)
        .mockReturnValueOnce(followingChain);
      const result = await service.exportUserData('u1');
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });
});
