jest.mock('../../database/supabase.client', () => ({ supabaseAdmin: jest.fn(), supabaseClient: jest.fn() }));
jest.mock('../../common/utils/logger.util', () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { NotFoundException } from '@nestjs/common';
import { UnifiedProfileService } from '../../modules/user/services/unified-profile.service';
import { supabaseAdmin } from '../../database/supabase.client';
import { createMockSupabaseClient, createMockQueryChain, createMockConfigService } from '../helpers/mock-supabase';

describe('UnifiedProfileService', () => {
  let service: UnifiedProfileService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    const mockEncryption = { encrypt: jest.fn(v => 'enc_' + v), decrypt: jest.fn(v => 'dec_' + v) };
    service = new UnifiedProfileService(createMockConfigService() as any, mockEncryption);
  });

  describe('getFullProfile', () => {
    it.skip('should return full unified profile', async () => {
      const profileChain = createMockQueryChain({
        data: {
          id: 'u1', username: 'User1', avatar: '🔥', bio: 'hi', job_title: 'Dev',
          company_encrypted: 'enc_Google', career_level_encrypted: 'enc_senior',
          affinity_tags_encrypted: null, mentoring_as: 'mentor',
          is_company_verified: true,
        },
        error: null,
      });
      const followersChain = createMockQueryChain({ data: null, error: null, count: 10 });
      const followingChain = createMockQueryChain({ data: null, error: null, count: 5 });
      const postsChain = createMockQueryChain({ data: null, error: null, count: 15 });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(followersChain)
        .mockReturnValueOnce(followingChain)
        .mockReturnValueOnce(postsChain);

      const result = await service.getEditableProfile('u1');
      expect(result.success).toBe(true);
      expect(result.data.username).toBe('User1');
    });

    it('should throw if user not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getEditableProfile('nope')).rejects.toThrow(NotFoundException);
    });

    it.skip('should decrypt encrypted fields', async () => {
      const chain = createMockQueryChain({
        data: {
          id: 'u1', username: 'User1', avatar: '🔥',
          company_encrypted: 'enc_Google', career_level_encrypted: 'enc_senior',
          affinity_tags_encrypted: 'enc_tags',
        },
        error: null,
      });
      const countChain = createMockQueryChain({ data: null, error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain).mockReturnValue(countChain);

      const result = await service.getEditableProfile('u1');
      expect(result.data.company).toBe('dec_enc_Google');
    });
  });
});
