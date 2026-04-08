import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { supabaseAdmin } from '../../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../../../__tests__/helpers/mock-supabase';

jest.mock('../../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
  supabaseClient: jest.fn(),
}));

jest.mock('../../../common/utils/logger.util', () => ({
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
      expect(result.message).toBe('Referral post created successfully');

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
      expect(result.message).toBe('Referral deleted successfully');
      expect(result.metadata).toBeDefined();
      expect(result.metadata.correlationId).toBeDefined();

      // Verify the correct table was used
      expect(mockClient.from).toHaveBeenCalledWith('referral_posts');
    });
  });
});
