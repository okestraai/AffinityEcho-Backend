import { ConflictException, NotFoundException } from '@nestjs/common';
import { ForumService } from './forum.service';
import {
  createMockQueryChain,
  createMockSupabaseClient,
  createMockConfigService,
} from '../../../__tests__/helpers/mock-supabase';

/* ------------------------------------------------------------------ */
/*  Module-level mocks                                                 */
/* ------------------------------------------------------------------ */
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

import { supabaseAdmin } from '../../../database/supabase.client';

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
        message: 'Successfully joined forum',
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
        message: 'Successfully left forum',
      });
      expect(mockClient.from).toHaveBeenCalledWith('forum_members');
    });
  });
});
