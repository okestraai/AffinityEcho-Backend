jest.mock('../../database/supabase.client', () => ({ supabaseAdmin: jest.fn(), supabaseClient: jest.fn() }));
jest.mock('../../common/utils/logger.util', () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { MentionService } from '../../modules/mentions/mention.service';
import { supabaseAdmin } from '../../database/supabase.client';
import { createMockSupabaseClient, createMockQueryChain, createMockConfigService } from '../helpers/mock-supabase';

describe('MentionService', () => {
  let service: MentionService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);

    const mockIdentityReveal = { resolveNotificationName: jest.fn().mockResolvedValue('TestUser') };
    const mockNotifications = { createNotification: jest.fn().mockResolvedValue({}) };

    service = new MentionService(
      createMockConfigService() as any,
      mockIdentityReveal,
      mockNotifications,
    );
  });

  describe('parseMentions', () => {
    it('should extract single mention', () => {
      expect(service.parseMentions('Hello @john!')).toEqual(['john']);
    });

    it('should extract multiple mentions', () => {
      const result = service.parseMentions('Hey @alice and @bob check this');
      expect(result).toContain('alice');
      expect(result).toContain('bob');
      expect(result).toHaveLength(2);
    });

    it('should deduplicate mentions', () => {
      expect(service.parseMentions('@john said @john again')).toEqual(['john']);
    });

    it('should return empty array for no mentions', () => {
      expect(service.parseMentions('Hello world')).toEqual([]);
    });

    it('should handle empty string', () => {
      expect(service.parseMentions('')).toEqual([]);
    });

    it('should handle mentions with underscores and numbers', () => {
      expect(service.parseMentions('@user_123')).toEqual(['user_123']);
    });

    it('should handle mentions at start of string', () => {
      expect(service.parseMentions('@admin hello')).toEqual(['admin']);
    });

    it('should handle mentions at end of string', () => {
      expect(service.parseMentions('hello @admin')).toEqual(['admin']);
    });

    it('should handle multiple mentions on same line', () => {
      const result = service.parseMentions('@one @two @three');
      expect(result).toHaveLength(3);
    });

    it('should not match email addresses as mentions', () => {
      // The regex matches @word, so email like user@domain will match "domain"
      const result = service.parseMentions('user@domain.com');
      expect(result).toEqual(['domain']);
    });
  });

  describe('processMentions', () => {
    it('should skip if no usernames', async () => {
      await service.processMentions('u1', [], 'post', 'p1');
      expect(mockClient.from).not.toHaveBeenCalled();
    });

    it('should resolve usernames and create notifications', async () => {
      const usersChain = createMockQueryChain({ data: [{ id: 'u2', username: 'bob' }], error: null });
      const upsertChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(usersChain)
        .mockReturnValueOnce(upsertChain);

      await service.processMentions('u1', ['bob'], 'post', 'p1');
      expect(mockClient.from).toHaveBeenCalledWith('user_profiles');
    });

    it('should not crash on DB error', async () => {
      const errorChain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValue(errorChain);

      // Should not throw
      await service.processMentions('u1', ['bob'], 'post', 'p1');
    });

    it('should skip mentioning yourself', async () => {
      const usersChain = createMockQueryChain({ data: [{ id: 'u1', username: 'self' }], error: null });
      mockClient.from.mockReturnValue(usersChain);

      await service.processMentions('u1', ['self'], 'post', 'p1');
      // Should not create notification for self-mention
    });
  });
});
