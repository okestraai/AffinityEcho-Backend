jest.mock('../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
}));

import { supabaseAdmin } from '../../database/supabase.client';
import { ContextBuilderService } from '../../modules/content-safety/editorial/context-builder.service';
import {
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

/**
 * Because buildPayload uses Promise.all (loadSubject, walkParentChain,
 * loadContainer, loadAuthorSignals run in parallel), we use table-name-based
 * dispatch so the order from() is called doesn't matter.
 */
function createTableDispatchClient(
  tableResults: Record<string, any[]>,
): any {
  const cursors: Record<string, number> = {};

  const client: any = {
    from: jest.fn((tableName: string) => {
      if (!cursors[tableName]) cursors[tableName] = 0;
      const results = tableResults[tableName] || [{ data: null, error: null }];
      const idx = Math.min(cursors[tableName], results.length - 1);
      cursors[tableName]++;
      return createMockQueryChain(results[idx]);
    }),
  };
  return client;
}

describe('ContextBuilderService', () => {
  let service: ContextBuilderService;

  function setup(tableResults: Record<string, any[]>) {
    const client = createTableDispatchClient(tableResults);
    (supabaseAdmin as jest.Mock).mockReturnValue(client);
    const config = createMockConfigService();
    service = new ContextBuilderService(config as any);
    return client;
  }

  describe('buildPayload', () => {
    it('should build payload for a feed_post (root, no parent chain)', async () => {
      setup({
        feed_posts: [
          {
            data: {
              id: 'post-1',
              user_id: 'user-1',
              content: 'Hello world',
              is_anonymous: false,
              created_at: '2026-01-01T00:00:00Z',
            },
            error: null,
          },
        ],
        user_profiles: [
          { data: { created_at: '2025-01-01' }, error: null },
        ],
        content_flags: [{ data: null, error: null, count: 0 }],
        content_moderation: [{ data: null, error: null, count: 0 }],
      });

      const result = await service.buildPayload('feed_post', 'post-1', 'user-1');

      expect(result.subject.type).toBe('feed_post');
      expect(result.subject.id).toBe('post-1');
      expect(result.subject.content).toBe('Hello world');
      expect(result.parentChain).toHaveLength(0);
      expect(result.container).toBeUndefined();
      expect(result.policyVersion).toBe('2026-05-12.v1');
      expect(result.authorSignals.accountAgeDays).toBeGreaterThan(0);
    });

    it('should build payload for forum_comment with topic parent', async () => {
      setup({
        forum_comments: [
          // loadSubject
          {
            data: {
              id: 'comment-1',
              user_id: 'user-1',
              content: 'Great point',
              is_anonymous: true,
              topic_id: 'topic-1',
              parent_comment_id: null,
              created_at: '2026-01-02T00:00:00Z',
            },
            error: null,
          },
          // walkForumComment: re-fetch
          {
            data: {
              id: 'comment-1',
              user_id: 'user-1',
              content: 'Great point',
              topic_id: 'topic-1',
              parent_comment_id: null,
              created_at: '2026-01-02T00:00:00Z',
            },
            error: null,
          },
          // loadContainer: forum_comments select topic_id
          {
            data: { topic_id: 'topic-1' },
            error: null,
          },
        ],
        forum_topics: [
          // walkForumComment: topic lookup
          {
            data: {
              id: 'topic-1',
              user_id: 'user-2',
              title: 'Discussion about workplace',
              content: 'A long topic...',
              forum_id: 'forum-1',
              created_at: '2026-01-01T00:00:00Z',
            },
            error: null,
          },
          // loadContainer: forum_topics
          {
            data: {
              id: 'topic-1',
              forum_id: 'forum-1',
              title: 'Discussion about workplace',
            },
            error: null,
          },
        ],
        user_profiles: [
          { data: { created_at: '2025-06-01' }, error: null },
        ],
        content_flags: [{ data: null, error: null, count: 1 }],
        content_moderation: [{ data: null, error: null, count: 0 }],
      });

      const result = await service.buildPayload('forum_comment', 'comment-1', 'user-1');

      expect(result.subject.type).toBe('forum_comment');
      expect(result.subject.authorIsAnonymous).toBe(true);
      expect(result.parentChain.length).toBeGreaterThan(0);
      expect(result.parentChain.some((p) => p.type === 'forum_topic')).toBe(true);
      expect(result.container).toBeDefined();
      expect(result.container!.type).toBe('forum');
      expect(result.authorSignals.priorFlagsAgainstAuthor).toBe(1);
    });

    it('should build payload for nook_message with nook container', async () => {
      const nookData = {
        id: 'nook-1',
        creator_id: 'user-2',
        title: 'Salary negotiation',
        description: 'A nook about salary...',
        scope: 'global',
        urgency: 'medium',
        temperature: 'warm',
        created_at: '2026-01-01T00:00:00Z',
      };

      setup({
        nook_messages: [
          // loadSubject
          {
            data: {
              id: 'msg-1',
              nook_id: 'nook-1',
              user_id: 'user-1',
              content: 'This is supportive',
              is_anonymous: true,
              parent_message_id: null,
              created_at: '2026-01-01T00:00:00Z',
            },
            error: null,
          },
          // walkNookMessage: re-fetch
          {
            data: {
              id: 'msg-1',
              nook_id: 'nook-1',
              user_id: 'user-1',
              content: 'This is supportive',
              parent_message_id: null,
              created_at: '2026-01-01T00:00:00Z',
            },
            error: null,
          },
          // loadContainer: nook_messages nook_id lookup
          {
            data: { nook_id: 'nook-1' },
            error: null,
          },
        ],
        nooks: [
          // walkNookMessage: nook lookup
          { data: nookData, error: null },
          // loadContainer: nook details
          { data: nookData, error: null },
        ],
        user_profiles: [
          { data: { created_at: '2025-01-01' }, error: null },
        ],
        content_flags: [{ data: null, error: null, count: 0 }],
        content_moderation: [{ data: null, error: null, count: 0 }],
      });

      const result = await service.buildPayload('nook_message', 'msg-1', 'user-1');

      expect(result.subject.type).toBe('nook_message');
      expect(result.container).toBeDefined();
      expect(result.container!.type).toBe('nook');
      expect(result.container!.title).toBe('Salary negotiation');
      expect(result.container!.scope).toBe('global');
      expect(result.container!.urgency).toBe('medium');
    });

    it('should throw for unknown content type', async () => {
      setup({});
      await expect(
        service.buildPayload('unknown_type', 'id-1', 'user-1'),
      ).rejects.toThrow('Unknown content type');
    });

    it('should throw when content not found', async () => {
      setup({
        feed_posts: [{ data: null, error: { message: 'not found' } }],
        user_profiles: [{ data: null, error: null }],
        content_flags: [{ data: null, error: null, count: 0 }],
        content_moderation: [{ data: null, error: null, count: 0 }],
      });

      await expect(
        service.buildPayload('feed_post', 'nonexistent', 'user-1'),
      ).rejects.toThrow('Content not found');
    });

    it('should build payload for referral_comment with referral_post parent', async () => {
      setup({
        referral_comments: [
          // loadSubject
          {
            data: {
              id: 'rc-1',
              referral_post_id: 'rp-1',
              user_id: 'user-1',
              content: 'Interested in this referral',
              is_anonymous: false,
              created_at: '2026-01-01T00:00:00Z',
            },
            error: null,
          },
          // walkReferralComment: re-fetch
          {
            data: {
              id: 'rc-1',
              referral_post_id: 'rp-1',
              user_id: 'user-1',
              content: 'Interested in this referral',
              created_at: '2026-01-01T00:00:00Z',
            },
            error: null,
          },
        ],
        referral_posts: [
          {
            data: {
              id: 'rp-1',
              user_id: 'user-2',
              title_encrypted: 'enc_title',
              description_encrypted: 'enc_desc',
              created_at: '2025-12-01T00:00:00Z',
            },
            error: null,
          },
        ],
        user_profiles: [
          { data: { created_at: '2025-01-01' }, error: null },
        ],
        content_flags: [{ data: null, error: null, count: 0 }],
        content_moderation: [{ data: null, error: null, count: 0 }],
      });

      const result = await service.buildPayload('referral_comment', 'rc-1', 'user-1');

      expect(result.subject.type).toBe('referral_comment');
      expect(result.parentChain.length).toBeGreaterThan(0);
      expect(result.parentChain[0].type).toBe('referral_post');
    });

    it('should handle author signals with no profile found', async () => {
      setup({
        feed_posts: [
          {
            data: {
              id: 'post-1',
              user_id: 'user-1',
              content: 'Test',
              is_anonymous: false,
              created_at: '2026-01-01T00:00:00Z',
            },
            error: null,
          },
        ],
        user_profiles: [{ data: null, error: null }],
        content_flags: [{ data: null, error: null, count: 0 }],
        content_moderation: [{ data: null, error: null, count: 0 }],
      });

      const result = await service.buildPayload('feed_post', 'post-1', 'user-1');

      expect(result.authorSignals.accountAgeDays).toBe(0);
      expect(result.authorSignals.priorFlagsAgainstAuthor).toBe(0);
    });

    it('should build payload for nook (root, container is self)', async () => {
      const nookData = {
        id: 'nook-1',
        creator_id: 'user-1',
        description: 'A safe space',
        is_anonymous: false,
        scope: 'company',
        urgency: 'high',
        temperature: 'hot',
        title: 'Urgent discussion',
        created_at: '2026-01-01T00:00:00Z',
      };

      setup({
        nooks: [
          // loadSubject
          { data: nookData, error: null },
          // loadContainer
          { data: nookData, error: null },
        ],
        user_profiles: [
          { data: { created_at: '2025-01-01' }, error: null },
        ],
        content_flags: [{ data: null, error: null, count: 0 }],
        content_moderation: [{ data: null, error: null, count: 0 }],
      });

      const result = await service.buildPayload('nook', 'nook-1', 'user-1');

      expect(result.subject.type).toBe('nook');
      expect(result.parentChain).toHaveLength(0);
      expect(result.container).toBeDefined();
      expect(result.container!.scope).toBe('company');
    });

    it('should build payload for feed_comment with nested reply + polymorphic parent', async () => {
      setup({
        feed_comments: [
          // loadSubject
          {
            data: {
              id: 'fc-2',
              user_id: 'user-1',
              content: 'I agree with you',
              is_anonymous: false,
              content_type: 'post',
              content_id: 'fp-1',
              parent_comment_id: 'fc-1',
              created_at: '2026-01-02T00:00:00Z',
            },
            error: null,
          },
          // walkFeedComment: re-fetch
          {
            data: {
              id: 'fc-2',
              user_id: 'user-1',
              content: 'I agree with you',
              content_type: 'post',
              content_id: 'fp-1',
              parent_comment_id: 'fc-1',
              created_at: '2026-01-02T00:00:00Z',
            },
            error: null,
          },
          // walkFeedComment: parent comment lookup
          {
            data: {
              id: 'fc-1',
              user_id: 'user-2',
              content: 'This is a great discussion',
              content_type: 'post',
              content_id: 'fp-1',
              created_at: '2026-01-01T12:00:00Z',
            },
            error: null,
          },
        ],
        feed_posts: [
          // loadPolymorphicParent
          {
            data: {
              id: 'fp-1',
              user_id: 'user-3',
              content: 'Original feed post content here',
              created_at: '2026-01-01T00:00:00Z',
            },
            error: null,
          },
        ],
        user_profiles: [
          { data: { created_at: '2025-01-01' }, error: null },
        ],
        content_flags: [{ data: null, error: null, count: 0 }],
        content_moderation: [{ data: null, error: null, count: 0 }],
      });

      const result = await service.buildPayload('feed_comment', 'fc-2', 'user-1');

      expect(result.parentChain).toHaveLength(2);
      expect(result.parentChain[0].type).toBe('feed_comment');
      expect(result.parentChain[0].id).toBe('fc-1');
      expect(result.parentChain[1].type).toBe('feed_post');
      expect(result.parentChain[1].id).toBe('fp-1');
    });

    it('should build payload for forum_topic (root, forum container)', async () => {
      setup({
        forum_topics: [
          // loadSubject
          {
            data: {
              id: 'topic-1',
              user_id: 'user-1',
              content: 'Topic content',
              title: 'My topic',
              forum_id: 'forum-1',
              is_anonymous: false,
              created_at: '2026-01-01T00:00:00Z',
            },
            error: null,
          },
          // loadContainer: forum_topics
          {
            data: {
              id: 'topic-1',
              forum_id: 'forum-1',
              title: 'My topic',
            },
            error: null,
          },
        ],
        user_profiles: [
          { data: { created_at: '2025-01-01' }, error: null },
        ],
        content_flags: [{ data: null, error: null, count: 0 }],
        content_moderation: [{ data: null, error: null, count: 0 }],
      });

      const result = await service.buildPayload('forum_topic', 'topic-1', 'user-1');

      expect(result.subject.type).toBe('forum_topic');
      expect(result.parentChain).toHaveLength(0);
      expect(result.container).toBeDefined();
      expect(result.container!.type).toBe('forum');
    });

    it('should handle nook_message reply with parent message', async () => {
      const nookData = {
        id: 'nook-1',
        creator_id: 'user-3',
        title: 'Support group',
        description: 'A support nook',
        scope: 'global',
        urgency: 'low',
        temperature: 'cool',
        created_at: '2026-01-01T00:00:00Z',
      };

      setup({
        nook_messages: [
          // loadSubject
          {
            data: {
              id: 'msg-2',
              nook_id: 'nook-1',
              user_id: 'user-1',
              content: 'I agree',
              is_anonymous: true,
              parent_message_id: 'msg-1',
              created_at: '2026-01-02T00:00:00Z',
            },
            error: null,
          },
          // walkNookMessage: re-fetch
          {
            data: {
              id: 'msg-2',
              nook_id: 'nook-1',
              user_id: 'user-1',
              content: 'I agree',
              parent_message_id: 'msg-1',
              created_at: '2026-01-02T00:00:00Z',
            },
            error: null,
          },
          // loadContainer: nook_messages nook_id lookup (3rd from() — runs synchronously before walkNookMessage's parent lookup)
          { data: { nook_id: 'nook-1' }, error: null },
          // walkNookMessage: parent message lookup via parent_message_id (4th from() — after first await resolves)
          {
            data: {
              id: 'msg-1',
              nook_id: 'nook-1',
              user_id: 'user-2',
              content: 'Original message',
              parent_message_id: null,
              created_at: '2026-01-01T12:00:00Z',
            },
            error: null,
          },
        ],
        nooks: [
          // walkNookMessage: nook
          { data: nookData, error: null },
          // loadContainer: nook details
          { data: nookData, error: null },
        ],
        user_profiles: [
          { data: { created_at: '2025-01-01' }, error: null },
        ],
        content_flags: [{ data: null, error: null, count: 0 }],
        content_moderation: [{ data: null, error: null, count: 0 }],
      });

      const result = await service.buildPayload('nook_message', 'msg-2', 'user-1');

      expect(result.parentChain).toHaveLength(2);
      expect(result.parentChain[0].type).toBe('nook_message');
      expect(result.parentChain[0].id).toBe('msg-1');
      expect(result.parentChain[1].type).toBe('nook');
      expect(result.parentChain[1].id).toBe('nook-1');
      expect(result.container).toBeDefined();
      expect(result.container!.type).toBe('nook');
    });

    it('should handle forum_comment reply with parent comment + topic', async () => {
      setup({
        forum_comments: [
          // #0 loadSubject
          {
            data: {
              id: 'fc-2',
              user_id: 'user-1',
              content: 'Reply to reply',
              is_anonymous: false,
              topic_id: 'topic-1',
              parent_comment_id: 'fc-1',
              created_at: '2026-01-03T00:00:00Z',
            },
            error: null,
          },
          // #1 walkForumComment: re-fetch
          {
            data: {
              id: 'fc-2',
              user_id: 'user-1',
              content: 'Reply to reply',
              topic_id: 'topic-1',
              parent_comment_id: 'fc-1',
              created_at: '2026-01-03T00:00:00Z',
            },
            error: null,
          },
          // #2 loadContainer: forum_comments select topic_id (runs synchronously before walkForumComment's parent lookup)
          { data: { topic_id: 'topic-1' }, error: null },
          // #3 walkForumComment: parent comment (after first await resolves)
          {
            data: {
              id: 'fc-1',
              user_id: 'user-2',
              content: 'Original comment',
              topic_id: 'topic-1',
              parent_comment_id: null,
              created_at: '2026-01-02T00:00:00Z',
            },
            error: null,
          },
        ],
        forum_topics: [
          // walkForumComment: topic
          {
            data: {
              id: 'topic-1',
              user_id: 'user-3',
              title: 'Big discussion',
              content: 'Topic content here',
              forum_id: 'forum-1',
              created_at: '2026-01-01T00:00:00Z',
            },
            error: null,
          },
          // loadContainer: forum_topics
          {
            data: {
              id: 'topic-1',
              forum_id: 'forum-1',
              title: 'Big discussion',
            },
            error: null,
          },
        ],
        user_profiles: [
          { data: { created_at: '2025-01-01' }, error: null },
        ],
        content_flags: [{ data: null, error: null, count: 0 }],
        content_moderation: [{ data: null, error: null, count: 0 }],
      });

      const result = await service.buildPayload('forum_comment', 'fc-2', 'user-1');

      expect(result.parentChain).toHaveLength(2);
      expect(result.parentChain[0].type).toBe('forum_comment');
      expect(result.parentChain[0].id).toBe('fc-1');
      expect(result.parentChain[1].type).toBe('forum_topic');
      expect(result.parentChain[1].id).toBe('topic-1');
      expect(result.container).toBeDefined();
      expect(result.container!.type).toBe('forum');
    });

    it('should handle referral_post (root, no container)', async () => {
      setup({
        referral_posts: [
          {
            data: {
              id: 'rp-1',
              user_id: 'user-1',
              description_encrypted: 'Looking for referral',
              is_anonymous: false,
              created_at: '2026-01-01T00:00:00Z',
            },
            error: null,
          },
        ],
        user_profiles: [
          { data: { created_at: '2025-01-01' }, error: null },
        ],
        content_flags: [{ data: null, error: null, count: 0 }],
        content_moderation: [{ data: null, error: null, count: 0 }],
      });

      const result = await service.buildPayload('referral_post', 'rp-1', 'user-1');

      expect(result.subject.type).toBe('referral_post');
      expect(result.parentChain).toHaveLength(0);
      expect(result.container).toBeUndefined();
    });
  });
});
