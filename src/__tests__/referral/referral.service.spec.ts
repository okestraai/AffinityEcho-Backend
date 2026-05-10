import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReferralService } from '../../modules/referral/services/referral.service';
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

describe('ReferralService', () => {
  let service: ReferralService;
  let mockClient: any;
  let mockConfig: any;
  let mockEncryption: any;
  let mockIdentityReveal: any;

  beforeEach(() => {
    jest.clearAllMocks();

    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);

    mockConfig = createMockConfigService();

    mockEncryption = {
      encrypt: jest.fn((text: string) => 'enc_' + text),
      decrypt: jest.fn((text: string) => 'dec_' + text),
    };

    mockIdentityReveal = {
      getRevealedUserIds: jest.fn().mockResolvedValue(new Set()),
      decryptRealName: jest.fn().mockReturnValue(null),
      isRevealed: jest.fn().mockResolvedValue(false),
    };

    service = new ReferralService(
      mockConfig,
      mockEncryption,
      mockIdentityReveal,
    );
  });

  describe('createReferral', () => {
    it('should create a referral successfully', async () => {
      const userId = 'user-123';
      const dto = {
        type: 'request' as const,
        title: 'Looking for SWE referral at Google',
        company: 'Google',
        jobTitle: 'Senior Software Engineer',
        description: 'Experienced full-stack developer',
        scope: 'global' as const,
        tags: ['software-engineering'],
        requiredSkills: ['React', 'Node.js'],
      };

      const insertedRow = {
        id: 'ref-001',
        type: 'request',
        status: 'open',
        created_at: '2026-01-01T00:00:00Z',
      };

      // Mock the insert chain: this.admin.from('referral_posts').insert(...).select().single()
      const insertChain = createMockQueryChain({
        data: insertedRow,
        error: null,
      });
      mockClient.from.mockReturnValueOnce(insertChain);

      // Mock the rpc call: this.admin.rpc('increment_user_posts', ...)
      mockClient.rpc.mockResolvedValueOnce({ data: null, error: null });

      const result = await service.createReferral(userId, dto);

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('ref-001');
      expect(result.data.type).toBe('request');
      expect(result.data.status).toBe('open');
      expect(result.message).toBe('Your referral has been posted');

      // Verify encryption was called for the correct fields
      expect(mockEncryption.encrypt).toHaveBeenCalledWith(dto.title);
      expect(mockEncryption.encrypt).toHaveBeenCalledWith(dto.company);
      expect(mockEncryption.encrypt).toHaveBeenCalledWith(dto.jobTitle);
      expect(mockEncryption.encrypt).toHaveBeenCalledWith(dto.description);

      // Verify the insert was called on the correct table
      expect(mockClient.from).toHaveBeenCalledWith('referral_posts');
    });
  });

  describe('getReferrals', () => {
    it('should return a paginated list of referrals', async () => {
      const userId = 'user-123';
      const query = { limit: 10, offset: 0 };

      const mockPosts = [
        {
          id: 'ref-001',
          user_id: 'user-456',
          type: 'request',
          title_encrypted: 'enc_title1',
          company_encrypted: 'enc_company1',
          job_title_encrypted: null,
          description_encrypted: 'enc_desc1',
          job_link: 'https://example.com',
          scope: 'global',
          status: 'open',
          available_slots: 3,
          total_slots: 5,
          tags: ['engineering'],
          required_skills: ['React'],
          preferred_experience: '3+ years',
          views_count: 10,
          likes_count: 2,
          comments_count: 1,
          bookmarks_count: 0,
          connection_requests_count: 0,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          last_activity_at: '2026-01-02T00:00:00Z',
          expires_at: null,
          author: {
            id: 'user-456',
            username: 'testuser',
            avatar: 'avatar.png',
            job_title: 'Engineer',
            company_encrypted: 'enc_author_company',
            bio: 'A bio',
            skills: ['React'],
            years_experience: 5,
          },
        },
      ];

      // getUserInteractions is called first (line 41 in service) and immediately
      // invokes from('referral_likes') and from('referral_bookmarks') via Promise.all
      // BEFORE the main query's from('referral_posts') call.
      const likesChain = createMockQueryChain({
        data: [{ referral_post_id: 'ref-001' }],
        error: null,
      });
      const bookmarksChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(likesChain);
      mockClient.from.mockReturnValueOnce(bookmarksChain);

      // Main posts query: from('referral_posts').select('*', { count: 'exact' })...
      const postsChain = createMockQueryChain({
        data: mockPosts,
        error: null,
        count: 1,
      });
      mockClient.from.mockReturnValueOnce(postsChain);

      const result = await service.getReferrals(userId, query);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('ref-001');
      expect(result.data[0].type).toBe('request');
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.offset).toBe(0);
      expect(result.pagination.hasMore).toBe(false);

      // Verify decryption was called
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('enc_title1');
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('enc_company1');
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('enc_desc1');
    });
  });

  describe('getReferralById', () => {
    it('should return a single referral by ID', async () => {
      const userId = 'user-123';
      const referralId = 'ref-001';

      const mockReferral = {
        id: 'ref-001',
        user_id: 'user-456',
        type: 'offer',
        title_encrypted: 'enc_title',
        company_encrypted: 'enc_company',
        job_title_encrypted: 'enc_job_title',
        description_encrypted: 'enc_desc',
        job_link: 'https://example.com/job',
        scope: 'global',
        status: 'open',
        available_slots: 2,
        total_slots: 5,
        tags: ['design'],
        required_skills: ['Figma'],
        preferred_experience: '2+ years',
        views_count: 20,
        likes_count: 5,
        comments_count: 3,
        bookmarks_count: 1,
        connection_requests_count: 2,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
        last_activity_at: '2026-01-03T00:00:00Z',
        expires_at: null,
        referral_likes: [],
        referral_bookmarks: [],
        user_profiles: {
          id: 'user-456',
          username: 'authoruser',
          avatar: 'avatar2.png',
          job_title: 'Designer',
          company_encrypted: 'enc_profile_company',
          bio: 'Designer bio',
          skills: ['Figma', 'Sketch'],
          years_experience: 4,
          first_name_encrypted: 'enc_first',
          last_name_encrypted: 'enc_last',
        },
      };

      const referralChain = createMockQueryChain({
        data: mockReferral,
        error: null,
      });
      mockClient.from.mockReturnValueOnce(referralChain);

      const result = await service.getReferralById(userId, referralId);

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('ref-001');
      expect(result.data.type).toBe('offer');
      expect(result.data.isLiked).toBe(false);
      expect(result.data.isBookmarked).toBe(false);
      expect(result.data.author).not.toBeNull();
      expect(result.data.author!.id).toBe('user-456');

      // Verify decryption was called for post fields
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('enc_title');
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('enc_company');
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('enc_job_title');
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('enc_desc');
    });

    it('should throw NotFoundException when referral is not found', async () => {
      const userId = 'user-123';
      const referralId = 'non-existent';

      const notFoundChain = createMockQueryChain({
        data: null,
        error: { message: 'Not found' },
      });
      mockClient.from.mockReturnValueOnce(notFoundChain);

      await expect(service.getReferralById(userId, referralId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateReferral', () => {
    it('should update a referral owned by the user', async () => {
      const ownerChain = createMockQueryChain({ data: { user_id: 'user-123' }, error: null });
      const updateChain = createMockQueryChain({ data: { id: 'ref-001', updated_at: '2026-05-01' }, error: null });

      mockClient.from
        .mockReturnValueOnce(ownerChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.updateReferral('user-123', 'ref-001', { title: 'New Title' } as any);
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException when referral not found', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.updateReferral('user-123', 'nope', {}  as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not the owner', async () => {
      const chain = createMockQueryChain({ data: { user_id: 'other-user' }, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.updateReferral('user-123', 'ref-001', {} as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('incrementViewCount', () => {
    it('should increment view count and return updated count', async () => {
      mockClient.rpc.mockResolvedValueOnce({ data: null, error: null });
      const chain = createMockQueryChain({ data: { views_count: 11 }, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.incrementViewCount('ref-001');
      expect(result.success).toBe(true);
      expect(result.data.viewsCount).toBe(11);
    });

    it('should return 0 viewsCount when post not found', async () => {
      mockClient.rpc.mockResolvedValueOnce({ data: null, error: null });
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.incrementViewCount('ref-001');
      expect(result.success).toBe(true);
      expect(result.data.viewsCount).toBe(0);
    });
  });

  describe('getStatistics', () => {
    it('should return community and user statistics', async () => {
      const emptyChain = createMockQueryChain({ data: [], error: null });
      // 9 parallel queries all use from()
      mockClient.from.mockReturnValue(emptyChain);

      const result = await service.getStatistics('user-123');
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should compute statistics from data', async () => {
      const posts = [
        { id: 'p1', type: 'request', status: 'open', views_count: 10, user_id: 'other' },
        { id: 'p2', type: 'offer', status: 'open', views_count: 5, user_id: 'user-123' },
      ];
      const postsChain = createMockQueryChain({ data: posts, error: null });
      const emptyChain = createMockQueryChain({ data: [], error: null });
      const companyChain = createMockQueryChain({ data: [{ company_encrypted: 'enc_Google' }], error: null });

      mockClient.from
        .mockReturnValueOnce(postsChain)   // all posts
        .mockReturnValueOnce(companyChain) // companies
        .mockReturnValueOnce(emptyChain)   // connections
        .mockReturnValue(emptyChain);      // user queries

      const result = await service.getStatistics('user-123');
      expect(result.success).toBe(true);
      expect(result.data.global.totalPosts).toBe(2);
    });
  });

  describe('searchReferrals', () => {
    it('should return empty results when no posts match', async () => {
      const postsChain = createMockQueryChain({ data: [], error: null });
      const profilesChain = createMockQueryChain({ data: [], error: null });
      const likesChain = createMockQueryChain({ data: [], error: null });
      const bookmarksChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(postsChain)
        .mockReturnValueOnce(profilesChain)
        .mockReturnValueOnce(likesChain)
        .mockReturnValueOnce(bookmarksChain);

      const result = await service.searchReferrals('user-123', {});
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('should return results matching search query', async () => {
      const allPosts = [
        {
          id: 'r1',
          user_id: 'user-456',
          type: 'request',
          title_encrypted: 'swe role',
          company_encrypted: 'google',
          job_title_encrypted: null,
          description_encrypted: 'great company',
          tags: ['engineering'],
          required_skills: ['React'],
          scope: 'global',
          status: 'open',
          available_slots: 1,
          total_slots: 3,
          views_count: 10,
          likes_count: 2,
          comments_count: 1,
          bookmarks_count: 0,
          job_link: null,
          created_at: '2026-01-01',
          last_activity_at: '2026-01-02',
        },
      ];

      const postsChain = createMockQueryChain({ data: allPosts, error: null });
      const profilesChain = createMockQueryChain({
        data: [{
          id: 'user-456',
          username: 'testuser',
          avatar: null,
          job_title: 'SWE',
          company_encrypted: 'enc_co',
          first_name_encrypted: null,
          last_name_encrypted: null,
          is_company_verified: false,
        }],
        error: null,
      });
      const likesChain = createMockQueryChain({ data: [], error: null });
      const bookmarksChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(postsChain)
        .mockReturnValueOnce(profilesChain)
        .mockReturnValueOnce(likesChain)
        .mockReturnValueOnce(bookmarksChain);

      const result = await service.searchReferrals('user-123', {});
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('r1');
      expect(result.total).toBe(1);
    });

    it('should filter by query string', async () => {
      const allPosts = [
        {
          id: 'r1',
          user_id: 'user-456',
          type: 'request',
          title_encrypted: 'swe role',
          company_encrypted: 'google',
          job_title_encrypted: null,
          description_encrypted: 'great company',
          tags: ['engineering'],
          required_skills: ['React'],
          scope: 'global',
          status: 'open',
          available_slots: 1,
          total_slots: 3,
          views_count: 5,
          likes_count: 0,
          comments_count: 0,
          bookmarks_count: 0,
          job_link: null,
          created_at: '2026-01-01',
          last_activity_at: '2026-01-01',
        },
      ];

      // encryption.decrypt returns 'dec_' + text, so query 'dec_swe role' should match title
      const postsChain = createMockQueryChain({ data: allPosts, error: null });
      const profilesChain = createMockQueryChain({ data: [], error: null });
      const likesChain = createMockQueryChain({ data: [], error: null });
      const bookmarksChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(postsChain)
        .mockReturnValueOnce(profilesChain)
        .mockReturnValueOnce(likesChain)
        .mockReturnValueOnce(bookmarksChain);

      // Query that matches the decrypted title ('dec_swe role')
      const result = await service.searchReferrals('user-123', { query: 'dec_swe role' });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('should filter posts that do not match query', async () => {
      const allPosts = [
        {
          id: 'r1',
          user_id: 'user-456',
          type: 'request',
          title_encrypted: 'swe role',
          company_encrypted: 'google',
          description_encrypted: 'great company',
          tags: ['engineering'],
          required_skills: ['React'],
        },
      ];

      const postsChain = createMockQueryChain({ data: allPosts, error: null });
      const profilesChain = createMockQueryChain({ data: [], error: null });
      const likesChain = createMockQueryChain({ data: [], error: null });
      const bookmarksChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(postsChain)
        .mockReturnValueOnce(profilesChain)
        .mockReturnValueOnce(likesChain)
        .mockReturnValueOnce(bookmarksChain);

      // Query that doesn't match any post
      const result = await service.searchReferrals('user-123', { query: 'nomatch_xyz' });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('should filter by type', async () => {
      const allPosts = [
        {
          id: 'r1',
          user_id: 'user-456',
          type: 'request',
          title_encrypted: 't1',
          company_encrypted: 'c1',
          description_encrypted: 'd1',
          tags: [],
          required_skills: [],
        },
        {
          id: 'r2',
          user_id: 'user-789',
          type: 'offer',
          title_encrypted: 't2',
          company_encrypted: 'c2',
          description_encrypted: 'd2',
          tags: [],
          required_skills: [],
        },
      ];

      const postsChain = createMockQueryChain({ data: allPosts, error: null });
      const profilesChain = createMockQueryChain({ data: [], error: null });
      const likesChain = createMockQueryChain({ data: [], error: null });
      const bookmarksChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(postsChain)
        .mockReturnValueOnce(profilesChain)
        .mockReturnValueOnce(likesChain)
        .mockReturnValueOnce(bookmarksChain);

      const result = await service.searchReferrals('user-123', { type: 'request' });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('r1');
    });

    it('should filter by tags', async () => {
      const allPosts = [
        {
          id: 'r1',
          user_id: 'user-456',
          type: 'request',
          title_encrypted: 't1',
          company_encrypted: 'c1',
          description_encrypted: 'd1',
          tags: ['engineering', 'react'],
          required_skills: [],
        },
        {
          id: 'r2',
          user_id: 'user-789',
          type: 'request',
          title_encrypted: 't2',
          company_encrypted: 'c2',
          description_encrypted: 'd2',
          tags: ['design'],
          required_skills: [],
        },
      ];

      const postsChain = createMockQueryChain({ data: allPosts, error: null });
      const profilesChain = createMockQueryChain({ data: [], error: null });
      const likesChain = createMockQueryChain({ data: [], error: null });
      const bookmarksChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(postsChain)
        .mockReturnValueOnce(profilesChain)
        .mockReturnValueOnce(likesChain)
        .mockReturnValueOnce(bookmarksChain);

      const result = await service.searchReferrals('user-123', { tags: ['engineering'] });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('r1');
    });

    it('should filter by skills', async () => {
      const allPosts = [
        {
          id: 'r1',
          user_id: 'user-456',
          type: 'request',
          title_encrypted: 't1',
          company_encrypted: 'c1',
          description_encrypted: 'd1',
          tags: [],
          required_skills: ['React', 'TypeScript'],
        },
        {
          id: 'r2',
          user_id: 'user-789',
          type: 'request',
          title_encrypted: 't2',
          company_encrypted: 'c2',
          description_encrypted: 'd2',
          tags: [],
          required_skills: ['Python'],
        },
      ];

      const postsChain = createMockQueryChain({ data: allPosts, error: null });
      const profilesChain = createMockQueryChain({ data: [], error: null });
      const likesChain = createMockQueryChain({ data: [], error: null });
      const bookmarksChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(postsChain)
        .mockReturnValueOnce(profilesChain)
        .mockReturnValueOnce(likesChain)
        .mockReturnValueOnce(bookmarksChain);

      const result = await service.searchReferrals('user-123', { skills: ['React'] });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('r1');
    });

    it('should throw BadRequestException on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.searchReferrals('user-123', {})).rejects.toThrow(BadRequestException);
    });
  });

  describe('getUserActivity', () => {
    it('should return activity data with empty results', async () => {
      const emptyChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValue(emptyChain);

      const result = await service.getUserActivity('user-123');
      expect(result.success).toBe(true);
      expect(result.data.posts).toHaveLength(0);
      expect(result.data.connections.total).toBe(0);
      expect(result.data.engagement.total).toBe(0);
      expect(result.data.recentActivity).toHaveLength(0);
    });

    it('should return activity with posts and connections', async () => {
      const postsChain = createMockQueryChain({
        data: [{
          id: 'r1',
          user_id: 'user-123',
          type: 'request',
          title_encrypted: 'job title',
          company_encrypted: 'acme corp',
          status: 'open',
          scope: 'global',
          available_slots: 2,
          total_slots: 5,
          views_count: 10,
          likes_count: 3,
          comments_count: 1,
          bookmarks_count: 0,
          connection_requests_count: 2,
          created_at: '2026-01-01T00:00:00Z',
          last_activity_at: '2026-01-02T00:00:00Z',
        }],
        error: null,
      });
      const connSentChain = createMockQueryChain({
        data: [{
          id: 'c1',
          referral_post_id: 'r1',
          status: 'pending',
          created_at: '2026-01-01T00:00:00Z',
          responded_at: null,
        }],
        error: null,
      });
      const connRecvChain = createMockQueryChain({ data: [], error: null });
      const likesChain = createMockQueryChain({
        data: [{ referral_post_id: 'r1', created_at: '2026-01-01T00:00:00Z' }],
        error: null,
      });
      const bookmarksChain = createMockQueryChain({ data: [], error: null });
      const commentsChain = createMockQueryChain({
        data: [{ id: 'cmt1', referral_post_id: 'r1', content: 'Nice post!', created_at: '2026-01-01T00:00:00Z' }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(postsChain)
        .mockReturnValueOnce(connSentChain)
        .mockReturnValueOnce(connRecvChain)
        .mockReturnValueOnce(likesChain)
        .mockReturnValueOnce(bookmarksChain)
        .mockReturnValueOnce(commentsChain);

      const result = await service.getUserActivity('user-123');
      expect(result.success).toBe(true);
      expect(result.data.posts).toHaveLength(1);
      expect(result.data.posts[0].id).toBe('r1');
      expect(result.data.connections.sent).toHaveLength(1);
      expect(result.data.connections.total).toBe(1);
      expect(result.data.connections.pending).toBe(1);
      expect(result.data.engagement.likes).toBe(1);
      expect(result.data.engagement.comments).toBe(1);
      expect(result.data.summary.totalPosts).toBe(1);
    });

    it('should compute activity stats correctly', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 1);
      const recentDateStr = recentDate.toISOString();

      const postsChain = createMockQueryChain({
        data: [{
          id: 'r1',
          user_id: 'user-123',
          type: 'offer',
          title_encrypted: 'enc_title',
          company_encrypted: 'enc_co',
          status: 'open',
          scope: 'global',
          available_slots: 1,
          total_slots: 2,
          views_count: 5,
          likes_count: 1,
          comments_count: 0,
          bookmarks_count: 0,
          connection_requests_count: 0,
          created_at: recentDateStr,
          last_activity_at: recentDateStr,
        }],
        error: null,
      });
      const connSentChain = createMockQueryChain({ data: [], error: null });
      const connRecvChain = createMockQueryChain({
        data: [{
          id: 'c1',
          referral_post_id: 'r1',
          status: 'accepted',
          created_at: recentDateStr,
          responded_at: recentDateStr,
        }],
        error: null,
      });
      const likesChain = createMockQueryChain({ data: [], error: null });
      const bookmarksChain = createMockQueryChain({
        data: [{ referral_post_id: 'r1', created_at: recentDateStr }],
        error: null,
      });
      const commentsChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(postsChain)
        .mockReturnValueOnce(connSentChain)
        .mockReturnValueOnce(connRecvChain)
        .mockReturnValueOnce(likesChain)
        .mockReturnValueOnce(bookmarksChain)
        .mockReturnValueOnce(commentsChain);

      const result = await service.getUserActivity('user-123');
      expect(result.success).toBe(true);
      expect(result.data.activityStats.postsThisMonth).toBe(1);
      expect(result.data.activityStats.connectionsThisMonth).toBe(1);
      expect(result.data.summary.activePosts).toBe(1);
    });
  });

  describe('getReferrals - additional', () => {
    it('should apply type, status, and scope filters', async () => {
      const likesChain = createMockQueryChain({ data: [], error: null });
      const bookmarksChain = createMockQueryChain({ data: [], error: null });
      const postsChain = createMockQueryChain({ data: [], error: null, count: 0 });

      mockClient.from
        .mockReturnValueOnce(likesChain)
        .mockReturnValueOnce(bookmarksChain)
        .mockReturnValueOnce(postsChain);

      const result = await service.getReferrals('user-123', { type: 'request', status: 'open', scope: 'local', limit: 5, offset: 0 });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
      expect(postsChain.eq).toHaveBeenCalledWith('type', 'request');
      expect(postsChain.eq).toHaveBeenCalledWith('status', 'open');
      expect(postsChain.eq).toHaveBeenCalledWith('scope', 'local');
    });

    it('should use cursor-based pagination when cursor provided', async () => {
      const likesChain = createMockQueryChain({ data: [], error: null });
      const bookmarksChain = createMockQueryChain({ data: [], error: null });
      const postsChain = createMockQueryChain({ data: [], error: null, count: 0 });

      mockClient.from
        .mockReturnValueOnce(likesChain)
        .mockReturnValueOnce(bookmarksChain)
        .mockReturnValueOnce(postsChain);

      const result = await service.getReferrals('user-123', { cursor: '2026-01-01T00:00:00Z', limit: 10 } as any);
      expect(result.success).toBe(true);
      expect(postsChain.lt).toHaveBeenCalledWith('last_activity_at', '2026-01-01T00:00:00Z');
      expect(postsChain.limit).toHaveBeenCalledWith(10);
    });

    it('should throw on posts query error', async () => {
      const likesChain = createMockQueryChain({ data: [], error: null });
      const bookmarksChain = createMockQueryChain({ data: [], error: null });
      const postsChain = createMockQueryChain({ data: null, error: { message: 'DB error', details: null, hint: null, code: '42P01' }, count: null });

      mockClient.from
        .mockReturnValueOnce(likesChain)
        .mockReturnValueOnce(bookmarksChain)
        .mockReturnValueOnce(postsChain);

      await expect(service.getReferrals('user-123', {})).rejects.toThrow(BadRequestException);
    });

    it('should apply identity reveal for own posts', async () => {
      const mockPost = {
        id: 'ref-001',
        user_id: 'user-123',
        type: 'offer',
        title_encrypted: 'enc_title',
        company_encrypted: 'enc_co',
        job_title_encrypted: null,
        description_encrypted: 'enc_desc',
        job_link: null,
        scope: 'global',
        status: 'open',
        available_slots: 1,
        total_slots: 2,
        tags: [],
        required_skills: [],
        preferred_experience: null,
        views_count: 5,
        likes_count: 1,
        comments_count: 0,
        bookmarks_count: 0,
        connection_requests_count: 0,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        last_activity_at: '2026-01-02',
        expires_at: null,
        author: { id: 'user-123', username: 'me', avatar: null, job_title: null, company_encrypted: 'enc_co', bio: null, skills: [], years_experience: 0, is_company_verified: false },
      };

      const likesChain = createMockQueryChain({ data: [], error: null });
      const bookmarksChain = createMockQueryChain({ data: [], error: null });
      const postsChain = createMockQueryChain({ data: [mockPost], error: null, count: 1 });
      const profilesChain = createMockQueryChain({ data: [{ id: 'user-123', first_name_encrypted: 'enc_first', last_name_encrypted: 'enc_last' }], error: null });

      mockClient.from
        .mockReturnValueOnce(likesChain)
        .mockReturnValueOnce(bookmarksChain)
        .mockReturnValueOnce(postsChain)
        .mockReturnValueOnce(profilesChain);

      mockIdentityReveal.decryptRealName.mockReturnValue('John Doe');

      const result = await service.getReferrals('user-123', {});
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].author.display_name).toBe('John Doe');
    });
  });

  describe('getStatistics - detailed', () => {
    it('should compute detailed breakdown with connections data', async () => {
      const allPosts = [
        { id: 'p1', type: 'request', status: 'open', views_count: 10, user_id: 'u1' },
        { id: 'p2', type: 'offer', status: 'open', views_count: 5, user_id: 'u2' },
        { id: 'p3', type: 'request', status: 'closed', views_count: 8, user_id: 'user-123' },
      ];
      const companies = [
        { company_encrypted: 'enc_Google' },
        { company_encrypted: 'enc_Apple' },
        { company_encrypted: 'enc_Google' }, // duplicate
      ];
      const connections = [
        { status: 'accepted', referral_submitted: true, interview_scheduled: true, offer_received: false },
        { status: 'pending', referral_submitted: false, interview_scheduled: false, offer_received: false },
        { status: 'accepted', referral_submitted: true, interview_scheduled: false, offer_received: true },
      ];
      const userPosts = [
        { id: 'p3', type: 'request', status: 'closed', connection_requests_count: 2 },
      ];
      const userConnSent = [
        { status: 'accepted' },
        { status: 'pending' },
        { status: 'rejected' },
      ];
      const userConnRecv = [
        { status: 'accepted' },
        { status: 'rejected' },
      ];
      const userLikes = [{ id: 'l1' }, { id: 'l2' }];
      const userBookmarks = [{ id: 'b1' }];
      const userComments = [{ id: 'c1' }];

      mockClient.from
        .mockReturnValueOnce(createMockQueryChain({ data: allPosts, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: companies, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: connections, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: userPosts, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: userConnSent, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: userConnRecv, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: userLikes, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: userBookmarks, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: userComments, error: null }));

      const result = await service.getStatistics('user-123');
      expect(result.success).toBe(true);
      // Global stats
      expect(result.data.global.totalPosts).toBe(3);
      expect(result.data.global.openRequests).toBe(1);
      expect(result.data.global.openOffers).toBe(1);
      expect(result.data.global.totalViews).toBe(23);
      expect(result.data.global.totalConnections).toBe(3);
      expect(result.data.global.acceptedConnections).toBe(2);
      expect(result.data.global.successfulReferrals).toBe(2);
      expect(result.data.global.interviewsScheduled).toBe(1);
      expect(result.data.global.offersReceived).toBe(1);
      // User stats
      expect(result.data.user.postsCreated).toBe(1);
      expect(result.data.user.connectionsSent).toBe(3);
      expect(result.data.user.connectionsReceived).toBe(2);
      expect(result.data.user.likes).toBe(2);
      expect(result.data.user.bookmarks).toBe(1);
      expect(result.data.user.comments).toBe(1);
      // Breakdown
      expect(result.data.breakdown.connectionsByStatus.sent.pending).toBe(1);
      expect(result.data.breakdown.connectionsByStatus.sent.accepted).toBe(1);
      expect(result.data.breakdown.connectionsByStatus.sent.rejected).toBe(1);
      expect(result.data.breakdown.connectionsByStatus.received.accepted).toBe(1);
      expect(result.data.breakdown.connectionsByStatus.received.rejected).toBe(1);
      expect(result.data.breakdown.postsByType.requests).toBe(1);
      expect(result.data.breakdown.postsByType.offers).toBe(0);
    });
  });

  describe('searchReferrals - additional', () => {
    it('should filter by companies', async () => {
      const allPosts = [
        { id: 'r1', user_id: 'u1', type: 'request', title_encrypted: 't1', company_encrypted: 'google', description_encrypted: 'd1', tags: [], required_skills: [] },
        { id: 'r2', user_id: 'u2', type: 'request', title_encrypted: 't2', company_encrypted: 'apple', description_encrypted: 'd2', tags: [], required_skills: [] },
      ];

      mockClient.from
        .mockReturnValueOnce(createMockQueryChain({ data: allPosts, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }));

      // decrypt returns 'dec_' + text, so 'dec_google' should match company filter 'dec_google'
      const result = await service.searchReferrals('user-123', { companies: ['dec_google'] });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('r1');
    });
  });

  describe('deleteReferral', () => {
    it('should delete a referral owned by the user successfully', async () => {
      const userId = 'user-123';
      const referralId = 'ref-001';

      // 1. Check ownership query: from('referral_posts').select('user_id').eq('id', ...).single()
      const ownershipChain = createMockQueryChain({
        data: { user_id: userId },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(ownershipChain);

      // 2. Delete query: from('referral_posts').delete().eq('id', ...)
      const deleteChain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(deleteChain);

      const result = await service.deleteReferral(userId, referralId);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Your referral has been deleted');
      expect(result.metadata).toBeDefined();
      expect(result.metadata.correlationId).toBeDefined();

      // Verify the correct table was used
      expect(mockClient.from).toHaveBeenCalledWith('referral_posts');
    });
  });
});
