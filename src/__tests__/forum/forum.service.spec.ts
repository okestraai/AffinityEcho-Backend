import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ForumService } from '../../modules/forum/services/forum.service';
import {
  createMockQueryChain,
  createMockSupabaseClient,
  createMockConfigService,
} from '../../__tests__/helpers/mock-supabase';

/* ------------------------------------------------------------------ */
/*  Module-level mocks                                                 */
/* ------------------------------------------------------------------ */
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

import { supabaseAdmin } from '../../database/supabase.client';

/* ------------------------------------------------------------------ */
/*  Test suite                                                         */
/* ------------------------------------------------------------------ */
describe('ForumService', () => {
  let service: ForumService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);

    const mockConfig = createMockConfigService();
    service = new ForumService(mockConfig as any);
  });

  /* ================================================================ */
  /*  createForum                                                      */
  /* ================================================================ */
  describe('createForum', () => {
    const dto = {
      name: 'Test Forum',
      description: 'A test forum',
      icon: '🧪',
      isGlobal: false,
      companyName: 'Acme',
      category: 'general',
      rules: ['Be kind'],
      moderators: ['user-1'],
    };

    it('should create a forum successfully', async () => {
      const createdForum = {
        id: 'forum-1',
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        is_global: dto.isGlobal,
        company_name: dto.companyName,
        category: dto.category,
        topic_count: 0,
        member_count: 0,
      };

      // First call: check for existing forum — not found (PGRST116)
      const checkChain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116' },
      });
      // Second call: insert the new forum
      const insertChain = createMockQueryChain({
        data: createdForum,
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(checkChain)
        .mockReturnValueOnce(insertChain);

      const result = await service.createForum(dto as any);

      expect(result).toEqual(createdForum);
      expect(mockClient.from).toHaveBeenCalledWith('forums');
    });

    it('should throw ConflictException when forum name already exists', async () => {
      // First call: existing forum found
      const checkChain = createMockQueryChain({
        data: { id: 'existing-forum' },
        error: null,
      });

      mockClient.from.mockReturnValueOnce(checkChain);

      await expect(service.createForum(dto as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  /* ================================================================ */
  /*  findAllForums                                                    */
  /* ================================================================ */
  describe('findAllForums', () => {
    it('should return paginated forums', async () => {
      const forums = [
        { id: 'forum-1', name: 'Forum 1', member_count: 10, topic_count: 5 },
        { id: 'forum-2', name: 'Forum 2', member_count: 20, topic_count: 8 },
      ];

      const chain = createMockQueryChain({
        data: forums,
        error: null,
        count: 2,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.findAllForums({
        page: 1,
        limit: 10,
      } as any);

      expect(result).toEqual({
        forums,
        total: 2,
        page: 1,
        totalPages: 1,
      });
      expect(mockClient.from).toHaveBeenCalledWith('forums');
    });
  });

  /* ================================================================ */
  /*  findForumById                                                    */
  /* ================================================================ */
  describe('findForumById', () => {
    it('should return a forum with topics', async () => {
      const forum = {
        id: 'forum-1',
        name: 'Test Forum',
        member_count: 5,
        topic_count: 3,
        forum_topics: [{ id: 'topic-1', title: 'Topic 1' }],
      };

      const chain = createMockQueryChain({ data: forum, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.findForumById('forum-1');

      expect(result).toEqual({
        ...forum,
        memberCount: 5,
        topicCount: 3,
      });
      expect(chain.eq).toHaveBeenCalledWith('id', 'forum-1');
    });

    it('should throw NotFoundException when forum is not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.findForumById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /* ================================================================ */
  /*  joinForum                                                        */
  /* ================================================================ */
  describe('joinForum', () => {
    it('should add a user to the forum', async () => {
      const forum = {
        id: 'forum-1',
        name: 'Test Forum',
        member_count: 5,
        topic_count: 3,
      };

      // 1st from() — findForumById select (forum exists)
      const forumChain = createMockQueryChain({ data: forum, error: null });
      // 2nd from() — check existing membership (not found)
      const memberCheckChain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116' },
      });
      // 3rd from() — insert membership
      const insertChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(forumChain)
        .mockReturnValueOnce(memberCheckChain)
        .mockReturnValueOnce(insertChain);

      // rpc for increment_forum_member_count
      mockClient.rpc.mockResolvedValueOnce({ data: null, error: null });

      const result = await service.joinForum('forum-1', 'user-1');

      expect(result).toEqual({
        success: true,
        message: 'You have joined the forum',
      });
      expect(mockClient.from).toHaveBeenCalledWith('forum_members');
    });
  });

  /* ================================================================ */
  /*  leaveForum                                                       */
  /* ================================================================ */
  describe('leaveForum', () => {
    it('should remove a user from the forum', async () => {
      const forum = {
        id: 'forum-1',
        name: 'Test Forum',
        member_count: 5,
        topic_count: 3,
      };

      // 1st from() — findForumById (forum exists)
      const forumChain = createMockQueryChain({ data: forum, error: null });
      // 2nd from() — check existing membership (member found)
      const memberCheckChain = createMockQueryChain({
        data: { id: 'member-1' },
        error: null,
      });
      // 3rd from() — delete membership
      const deleteChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(forumChain)
        .mockReturnValueOnce(memberCheckChain)
        .mockReturnValueOnce(deleteChain);

      // rpc for decrement_forum_member_count
      mockClient.rpc.mockResolvedValueOnce({ data: null, error: null });

      const result = await service.leaveForum('forum-1', 'user-1');

      expect(result).toEqual({
        success: true,
        message: 'You have left the forum',
      });
      expect(mockClient.from).toHaveBeenCalledWith('forum_members');
    });

    it('should throw ConflictException when user is not a member', async () => {
      const forum = { id: 'forum-1', name: 'Test Forum', member_count: 5, topic_count: 3 };
      const forumChain = createMockQueryChain({ data: forum, error: null });
      const memberCheckChain = createMockQueryChain({ data: null, error: { code: 'PGRST116' } });

      mockClient.from
        .mockReturnValueOnce(forumChain)
        .mockReturnValueOnce(memberCheckChain);

      await expect(service.leaveForum('forum-1', 'user-1')).rejects.toThrow(ConflictException);
    });
  });

  /* ================================================================ */
  /*  updateForum                                                      */
  /* ================================================================ */
  describe('updateForum', () => {
    it('should update a forum successfully', async () => {
      const forum = { id: 'forum-1', name: 'Test Forum', member_count: 5, topic_count: 3, forum_topics: [] };
      const updatedForum = { id: 'forum-1', name: 'Updated Forum' };

      // 1st from() — findForumById
      const forumChain = createMockQueryChain({ data: forum, error: null });
      // 2nd from() — update
      const updateChain = createMockQueryChain({ data: updatedForum, error: null });

      mockClient.from
        .mockReturnValueOnce(forumChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.updateForum('forum-1', { name: 'Updated Forum' } as any);
      expect(result).toEqual(updatedForum);
    });

    it('should throw NotFoundException when forum does not exist', async () => {
      const chain = createMockQueryChain({ data: null, error: { code: 'PGRST116', message: 'not found' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.updateForum('nope', { name: 'X' } as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException on update DB error', async () => {
      const forum = { id: 'forum-1', name: 'Test Forum', member_count: 5, topic_count: 3, forum_topics: [] };
      const forumChain = createMockQueryChain({ data: forum, error: null });
      const updateChain = createMockQueryChain({ data: null, error: { message: 'update failed' } });

      mockClient.from
        .mockReturnValueOnce(forumChain)
        .mockReturnValueOnce(updateChain);

      await expect(service.updateForum('forum-1', { name: 'X' } as any)).rejects.toThrow(BadRequestException);
    });
  });

  /* ================================================================ */
  /*  deleteForum                                                      */
  /* ================================================================ */
  describe('deleteForum', () => {
    it('should delete a forum successfully', async () => {
      const forum = { id: 'forum-1', name: 'Test Forum', member_count: 5, topic_count: 3, forum_topics: [] };
      const forumChain = createMockQueryChain({ data: forum, error: null });
      const deleteChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(forumChain)
        .mockReturnValueOnce(deleteChain);

      const result = await service.deleteForum('forum-1');
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException when forum does not exist', async () => {
      const chain = createMockQueryChain({ data: null, error: { code: 'PGRST116', message: 'not found' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.deleteForum('nope')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException on delete DB error', async () => {
      const forum = { id: 'forum-1', name: 'Test Forum', member_count: 5, topic_count: 3, forum_topics: [] };
      const forumChain = createMockQueryChain({ data: forum, error: null });
      const deleteChain = createMockQueryChain({ data: null, error: { message: 'delete failed' } });

      mockClient.from
        .mockReturnValueOnce(forumChain)
        .mockReturnValueOnce(deleteChain);

      await expect(service.deleteForum('forum-1')).rejects.toThrow(BadRequestException);
    });
  });

  /* ================================================================ */
  /*  joinForum — error paths                                          */
  /* ================================================================ */
  describe('joinForum — already a member', () => {
    it('should throw ConflictException when user is already a member', async () => {
      const forum = { id: 'forum-1', name: 'Test Forum', member_count: 5, topic_count: 3 };
      const forumChain = createMockQueryChain({ data: forum, error: null });
      const memberCheckChain = createMockQueryChain({ data: { id: 'member-1' }, error: null });

      mockClient.from
        .mockReturnValueOnce(forumChain)
        .mockReturnValueOnce(memberCheckChain);

      await expect(service.joinForum('forum-1', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('should fallback to manual update when rpc increment fails', async () => {
      const forum = { id: 'forum-1', name: 'Test Forum', member_count: 5, topic_count: 3 };
      const forumChain = createMockQueryChain({ data: forum, error: null });
      const memberCheckChain = createMockQueryChain({ data: null, error: { code: 'PGRST116' } });
      const insertChain = createMockQueryChain({ data: null, error: null });
      const fallbackChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(forumChain)
        .mockReturnValueOnce(memberCheckChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(fallbackChain);

      // rpc fails
      mockClient.rpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc failed' } });

      const result = await service.joinForum('forum-1', 'user-1');
      expect(result.success).toBe(true);
    });
  });

  /* ================================================================ */
  /*  getUserJoinedForums                                              */
  /* ================================================================ */
  describe('getUserJoinedForums', () => {
    it('should return joined forums for user with no companyName filter', async () => {
      const memberships = [
        { forums: { id: 'f1', name: 'Global Forum', is_global: true, company_name: null, topic_count: 2, member_count: 10 } },
        { forums: { id: 'f2', name: 'Local Forum', is_global: false, company_name: 'Acme', topic_count: 1, member_count: 5 } },
      ];
      const chain = createMockQueryChain({ data: memberships, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getUserJoinedForums('user-1');
      // Without companyName, only global forums returned
      expect(result.length).toBe(1);
      expect(result[0].isJoined).toBe(true);
    });

    it('should return company + global forums when companyName is provided', async () => {
      const memberships = [
        { forums: { id: 'f1', name: 'Global Forum', is_global: true, company_name: null, topic_count: 2, member_count: 10 } },
        { forums: { id: 'f2', name: 'Local Forum', is_global: false, company_name: 'Acme', topic_count: 1, member_count: 5 } },
        { forums: { id: 'f3', name: 'Other Company', is_global: false, company_name: 'Other', topic_count: 0, member_count: 0 } },
      ];
      const chain = createMockQueryChain({ data: memberships, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getUserJoinedForums('user-1', 'Acme');
      expect(result.length).toBe(2);
    });

    it('should return empty array when user has no memberships', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getUserJoinedForums('user-1');
      expect(result).toEqual([]);
    });

    it('should throw BadRequestException on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getUserJoinedForums('user-1')).rejects.toThrow(BadRequestException);
    });
  });

  /* ================================================================ */
  /*  bootstrapFoundationForums                                        */
  /* ================================================================ */
  describe('bootstrapFoundationForums', () => {
    it('should create all foundation forums when none exist', async () => {
      // Step 2: check existing forums — none exist
      const checkChain = createMockQueryChain({ data: [], error: null });
      // Step 4: insert new forums
      const insertChain = createMockQueryChain({
        data: [
          { id: 'f1', name: 'Career Growth', company_name: 'Acme', created_at: '2026-01-01' },
          { id: 'f2', name: 'Sponsorship', company_name: 'Acme', created_at: '2026-01-01' },
        ],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(checkChain)
        .mockReturnValueOnce(insertChain);

      const result = await service.bootstrapFoundationForums('Acme');
      expect(result.success).toBe(true);
      expect(result.data.createdCount).toBeGreaterThan(0);
    });

    it('should skip creation when all forums already exist', async () => {
      const existingForums = [
        { id: 'f1', name: 'Career Growth', company_name: 'Acme' },
        { id: 'f2', name: 'Sponsorship', company_name: 'Acme' },
        { id: 'f3', name: 'Bias & Microaggressions', company_name: 'Acme' },
        { id: 'f4', name: 'Mentorship', company_name: 'Acme' },
        { id: 'f5', name: 'Wellbeing', company_name: 'Acme' },
      ];
      const checkChain = createMockQueryChain({ data: existingForums, error: null });
      mockClient.from.mockReturnValueOnce(checkChain);

      const result = await service.bootstrapFoundationForums('Acme');
      expect(result.success).toBe(true);
      expect(result.data.createdCount).toBe(0);
      expect(result.data.existingCount).toBeGreaterThan(0);
    });

    it('should return error response on DB error', async () => {
      const checkChain = createMockQueryChain({ data: null, error: { message: 'DB error' } });
      mockClient.from.mockReturnValueOnce(checkChain);

      const result = await service.bootstrapFoundationForums('Acme');
      expect(result.success).toBe(false);
    });
  });

  /* ================================================================ */
  /*  getLocalForumMetrics                                             */
  /* ================================================================ */
  describe('getLocalForumMetrics', () => {
    it('should return metrics for local forums', async () => {
      const forums = [
        { id: 'f1', name: 'Forum A', topic_count: 10, member_count: 50, last_activity: '2026-05-01', is_global: false, company_name: 'Acme' },
        { id: 'f2', name: 'Forum B', topic_count: 5, member_count: 20, last_activity: '2026-04-01', is_global: false, company_name: 'Acme' },
      ];
      const chain = createMockQueryChain({ data: forums, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getLocalForumMetrics('Acme');
      expect(result.companyName).toBe('Acme');
      expect(result.totalForums).toBe(2);
      expect(result.totalTopics).toBe(15);
      expect(result.totalMembers).toBe(70);
      expect(result.mostActiveForum).toBeDefined();
    });

    it('should return zero metrics when no forums found', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getLocalForumMetrics('Acme');
      expect(result.totalForums).toBe(0);
      expect(result.mostActiveForum).toBeNull();
    });

    it('should throw BadRequestException on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getLocalForumMetrics('Acme')).rejects.toThrow(BadRequestException);
    });
  });

  /* ================================================================ */
  /*  getGlobalForumMetrics                                            */
  /* ================================================================ */
  describe('getGlobalForumMetrics', () => {
    it('should return global forum metrics', async () => {
      const forums = [
        { id: 'f1', name: 'Global Forum 1', topic_count: 20, member_count: 100, last_activity: '2026-05-01', category: 'general' },
        { id: 'f2', name: 'Global Forum 2', topic_count: 10, member_count: 50, last_activity: '2026-04-01', category: 'tech' },
      ];
      const chain = createMockQueryChain({ data: forums, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getGlobalForumMetrics();
      expect(result.totalGlobalForums).toBe(2);
      expect(result.totalGlobalTopics).toBe(30);
      expect(result.totalGlobalMembers).toBe(150);
      expect(result.forums).toHaveLength(2);
    });

    it('should return empty metrics when no global forums found', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getGlobalForumMetrics();
      expect(result.totalGlobalForums).toBe(0);
    });

    it('should throw BadRequestException on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getGlobalForumMetrics()).rejects.toThrow(BadRequestException);
    });
  });

  /* ================================================================ */
  /*  getFoundationForumsWithMetrics                                   */
  /* ================================================================ */
  describe('getFoundationForumsWithMetrics', () => {
    it('should return foundation forums with computed metrics', async () => {
      const forums = [
        { id: 'f1', name: 'Career Growth', topic_count: 5, member_count: 20, last_activity: '2026-05-01', category: 'foundation', rules: [], moderators: [] },
      ];
      const forumsChain = createMockQueryChain({ data: forums, error: null });
      const recentTopicsChain = createMockQueryChain({ data: [], error: null });
      const topicCreatorsChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(forumsChain)
        .mockReturnValueOnce(recentTopicsChain)
        .mockReturnValueOnce(topicCreatorsChain);

      const result = await service.getFoundationForumsWithMetrics('Acme');
      expect(result.totalFoundationForums).toBe(1);
      expect(result.companyName).toBe('Acme');
    });

    it('should return empty result when no foundation forums found', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getFoundationForumsWithMetrics('Acme');
      expect(result.totalFoundationForums).toBe(0);
    });

    it('should throw BadRequestException on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getFoundationForumsWithMetrics('Acme')).rejects.toThrow(BadRequestException);
    });
  });

  /* ================================================================ */
  /*  findAllForums — filter paths                                     */
  /* ================================================================ */
  describe('findAllForums — filter paths', () => {
    it('should apply search filter', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.findAllForums({ search: 'test', page: 1, limit: 10 } as any);
      expect(chain.or).toHaveBeenCalled();
      expect(result.total).toBe(0);
    });

    it('should apply companyName and isGlobal filters', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      await service.findAllForums({ companyName: 'Acme', isGlobal: false, page: 1, limit: 10 } as any);
      expect(chain.eq).toHaveBeenCalledWith('company_name', 'Acme');
      expect(chain.eq).toHaveBeenCalledWith('is_global', false);
    });

    it('should apply category and timeFilter filters', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      await service.findAllForums({ category: 'tech', timeFilter: 'week', sortBy: 'popular', page: 1, limit: 10 } as any);
      expect(chain.eq).toHaveBeenCalledWith('category', 'tech');
      expect(chain.gte).toHaveBeenCalled();
      expect(chain.order).toHaveBeenCalledWith('member_count', { ascending: false });
    });

    it('should apply trending sort', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      await service.findAllForums({ sortBy: 'trending', page: 1, limit: 10 } as any);
      expect(chain.order).toHaveBeenCalledWith('topic_count', { ascending: false });
    });

    it('should throw BadRequestException on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' }, count: null });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.findAllForums({ page: 1, limit: 10 } as any)).rejects.toThrow(BadRequestException);
    });
  });
});
