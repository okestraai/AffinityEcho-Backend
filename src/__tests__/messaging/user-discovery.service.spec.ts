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

import { BadRequestException } from '@nestjs/common';
import { UserDiscoveryService } from '../../modules/messaging/services/user-discovery.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';
import { MSG } from '../../common/constants/messages';

describe('UserDiscoveryService', () => {
  let service: UserDiscoveryService;
  let mockClient: any;

  const mockUser = {
    id: 'u2',
    username: 'User2',
    avatar: '📚',
    job_title: 'Designer',
    company_encrypted: 'enc_Google',
    career_level_encrypted: 'enc_mid',
    bio: 'hello',
    skills: ['design'],
    location: 'NYC',
    is_company_verified: true,
    mentoring_as: 'mentor',
    is_active_mentor: true,
    is_active_mentee: false,
    privacy_level: 'public',
    created_at: '2026-01-01',
    last_active_at: '2026-05-01',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    const mockEncryption = {
      encrypt: jest.fn((v) => 'enc_' + v),
      decrypt: jest.fn((v) => 'dec_' + v),
    };

    service = new UserDiscoveryService(
      createMockConfigService() as any,
      mockEncryption,
    );
  });

  describe('getConnectableUsers', () => {
    it('should return connectable users', async () => {
      const usersChain = createMockQueryChain({
        data: [mockUser],
        error: null,
      });
      const convsChain = createMockQueryChain({ data: [], error: null });
      const mutualChain = createMockQueryChain({
        data: null,
        error: null,
        count: 2,
      });

      mockClient.from
        .mockReturnValueOnce(usersChain)
        .mockReturnValueOnce(convsChain)
        .mockReturnValueOnce(mutualChain);

      const result = await service.getConnectableUsers('u1', {});
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should exclude self from results', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValue(chain);

      await service.getConnectableUsers('u1', {});
      expect(chain.neq).toHaveBeenCalledWith('id', 'u1');
    });

    it('should filter by search term', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValue(chain);

      await service.getConnectableUsers('u1', { search: 'Designer' });
      expect(chain.or).toHaveBeenCalled();
    });

    it('should exclude existing conversations when requested', async () => {
      const usersChain = createMockQueryChain({
        data: [mockUser, { ...mockUser, id: 'u3' }],
        error: null,
      });
      const convsChain = createMockQueryChain({
        data: [{ user1_id: 'u1', user2_id: 'u2' }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(usersChain)
        .mockReturnValueOnce(convsChain);

      const result = await service.getConnectableUsers('u1', {
        exclude_existing: true,
      });
      expect(result.success).toBe(true);
    });

    it('should decrypt company and career_level', async () => {
      const usersChain = createMockQueryChain({
        data: [mockUser],
        error: null,
      });
      const convsChain = createMockQueryChain({ data: [], error: null });
      const mutualChain = createMockQueryChain({
        data: null,
        error: null,
        count: 0,
      });

      mockClient.from
        .mockReturnValueOnce(usersChain)
        .mockReturnValueOnce(convsChain)
        .mockReturnValueOnce(mutualChain);

      const result = await service.getConnectableUsers('u1', {});
      // Should have decrypted fields
      expect(result.data.users[0].company).toBeDefined();
    });

    it('should handle DB error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getConnectableUsers('u1', {})).rejects.toThrow();
    });
  });

  describe('searchUsers', () => {
    it('should search users by query', async () => {
      const chain = createMockQueryChain({ data: [mockUser], error: null });
      mockClient.from.mockReturnValue(chain);

      const result = await service.search('u1', 'Designer');
      expect(result.success).toBe(true);
    });

    it('should return empty for no matches', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValue(chain);

      const result = await service.search('u1', 'nonexistent');
      expect(result.success).toBe(true);
      expect(result.data.users).toEqual([]);
    });
  });

  describe('getUserSuggestions', () => {
    it('should return user suggestions', async () => {
      // 1) from('user_profiles') - current user
      // 2) from('user_profiles') - query chain
      // 3) from('conversations') - existing conversations
      const currentUserChain = createMockQueryChain({
        data: { skills: ['design'], mentoring_as: 'mentor', job_title: 'Designer', company_type: 'tech' },
        error: null,
      });
      const suggestionsChain = createMockQueryChain({
        data: [mockUser],
        error: null,
      });
      const convsChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(currentUserChain)
        .mockReturnValueOnce(suggestionsChain)
        .mockReturnValueOnce(convsChain);

      const result = await service.getUserSuggestions('u1');
      expect(result.success).toBe(true);
      expect(result.data.suggestions).toBeDefined();
    });

    it('should handle existing conversations and filter them out', async () => {
      const currentUserChain = createMockQueryChain({
        data: { skills: [], mentoring_as: 'mentee', job_title: null, company_type: null },
        error: null,
      });
      const suggestionsChain = createMockQueryChain({ data: [], error: null });
      const convsChain = createMockQueryChain({
        data: [{ user1_id: 'u1', user2_id: 'u3' }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(currentUserChain)
        .mockReturnValueOnce(suggestionsChain)
        .mockReturnValueOnce(convsChain);

      const result = await service.getUserSuggestions('u1');
      expect(result.success).toBe(true);
    });

    it('should return empty suggestions on error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getUserSuggestions('u1');
      expect(result.success).toBe(true);
      expect(result.data.suggestions).toEqual([]);
    });
  });
});
