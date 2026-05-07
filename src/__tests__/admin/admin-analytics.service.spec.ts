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

import { AdminAnalyticsService } from '../../modules/admin/services/admin-analytics.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

describe('AdminAnalyticsService', () => {
  let service: AdminAnalyticsService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new AdminAnalyticsService(createMockConfigService() as any);
  });

  describe('getAnalytics', () => {
    it('should return full analytics dashboard', async () => {
      // Mock all parallel queries
      const usersData = [
        {
          id: 'u1',
          auth_provider: 'email',
          has_completed_onboarding: true,
          is_company_verified: true,
          is_suspended: false,
          is_deactivated: false,
          is_deleted: false,
          created_at: '2026-04-01',
          last_active_at: '2026-05-01',
        },
        {
          id: 'u2',
          auth_provider: 'google',
          has_completed_onboarding: true,
          is_company_verified: false,
          is_suspended: false,
          is_deactivated: false,
          is_deleted: false,
          created_at: '2026-04-15',
          last_active_at: '2026-05-06',
        },
        {
          id: 'u3',
          auth_provider: 'email',
          has_completed_onboarding: false,
          is_company_verified: false,
          is_suspended: false,
          is_deactivated: false,
          is_deleted: false,
          created_at: '2026-05-01',
          last_active_at: '2026-05-01',
        },
      ];

      const usersChain = createMockQueryChain({ data: usersData, error: null });
      const countChain = createMockQueryChain({
        data: null,
        error: null,
        count: 10,
      });

      mockClient.from.mockReturnValue(countChain);
      // First call returns users data
      mockClient.from.mockReturnValueOnce(usersChain);

      const result = await service.getAnalytics();
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.signups).toBeDefined();
      expect(result.data.engagement).toBeDefined();
    });

    it('should handle empty data gracefully', async () => {
      const emptyChain = createMockQueryChain({
        data: [],
        error: null,
        count: 0,
      });
      mockClient.from.mockReturnValue(emptyChain);

      const result = await service.getAnalytics();
      expect(result.success).toBe(true);
      expect(result.data.signups.total).toBe(0);
    });

    it('should handle DB errors gracefully', async () => {
      const errorChain = createMockQueryChain({
        data: null,
        error: { message: 'connection failed' },
        count: null,
      });
      mockClient.from.mockReturnValue(errorChain);

      // Should not crash
      const result = await service.getAnalytics();
      expect(result.success).toBe(true);
    });
  });

  describe('getFunnel', () => {
    it('should return signup funnel data', async () => {
      const usersChain = createMockQueryChain({
        data: [
          { has_completed_onboarding: true },
          { has_completed_onboarding: true },
          { has_completed_onboarding: false },
        ],
        error: null,
        count: 3,
      });
      const postsChain = createMockQueryChain({
        data: [{ user_id: 'u1' }],
        error: null,
      });
      const messagesChain = createMockQueryChain({
        data: [{ sender_id: 'u1' }],
        error: null,
      });
      const mentorshipChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(usersChain)
        .mockReturnValueOnce(postsChain)
        .mockReturnValueOnce(messagesChain)
        .mockReturnValueOnce(mentorshipChain);

      const result = await service.getFunnel();
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.signup).toBeDefined();
    });

    it('should handle empty funnel', async () => {
      const emptyChain = createMockQueryChain({
        data: [],
        error: null,
        count: 0,
      });
      mockClient.from.mockReturnValue(emptyChain);

      const result = await service.getFunnel();
      expect(result.success).toBe(true);
    });
  });

  describe('getGrowth', () => {
    it('should return growth data for 30 days', async () => {
      const postsChain = createMockQueryChain({
        data: [{ created_at: '2026-05-01' }],
        error: null,
      });
      const topicsChain = createMockQueryChain({
        data: [{ created_at: '2026-05-01' }],
        error: null,
      });
      const messagesChain = createMockQueryChain({
        data: [{ created_at: '2026-05-01' }],
        error: null,
      });
      const signupsChain = createMockQueryChain({
        data: [{ created_at: '2026-05-01' }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(signupsChain)
        .mockReturnValueOnce(postsChain)
        .mockReturnValueOnce(topicsChain)
        .mockReturnValueOnce(messagesChain);

      const result = await service.getGrowth(30);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should default to 30 days', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getGrowth();
      expect(result.success).toBe(true);
    });
  });

  describe('getTopContent', () => {
    it('should return top posts, topics, and users', async () => {
      const postsChain = createMockQueryChain({
        data: [{ id: 'p1', likes_count: 10 }],
        error: null,
      });
      const topicsChain = createMockQueryChain({
        data: [{ id: 't1', comments_count: 5 }],
        error: null,
      });
      const forumsChain = createMockQueryChain({
        data: [{ id: 'f1' }],
        error: null,
      });
      const usersChain = createMockQueryChain({
        data: [{ id: 'u1', username: 'PowerUser' }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(postsChain)
        .mockReturnValueOnce(topicsChain)
        .mockReturnValueOnce(forumsChain)
        .mockReturnValueOnce(usersChain);

      const result = await service.getTopContent();
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should handle empty results', async () => {
      const emptyChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValue(emptyChain);

      const result = await service.getTopContent();
      expect(result.success).toBe(true);
    });
  });
});
