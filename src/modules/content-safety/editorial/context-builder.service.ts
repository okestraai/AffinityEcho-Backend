import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import logger from '../../../common/utils/logger.util';
import {
  EditorialPayload,
  SubjectPayload,
  ParentChainItem,
  ContainerInfo,
  AuthorSignals,
} from './dto/editorial-payload.dto';
import { POLICY_VERSION } from './editorial-prompts';

const MAX_PARENT_POST_CHARS = 1500;
const MAX_PARENT_COMMENT_CHARS = 800;

// Maps content type to its DB table and column info
const TABLE_MAP: Record<
  string,
  {
    table: string;
    contentCol: string;
    authorCol: string;
    parentIdCol?: string;
  }
> = {
  feed_post: {
    table: 'feed_posts',
    contentCol: 'content',
    authorCol: 'user_id',
  },
  feed_comment: {
    table: 'feed_comments',
    contentCol: 'content',
    authorCol: 'user_id',
    parentIdCol: 'parent_comment_id',
  },
  forum_topic: {
    table: 'forum_topics',
    contentCol: 'content',
    authorCol: 'user_id',
  },
  forum_comment: {
    table: 'forum_comments',
    contentCol: 'content',
    authorCol: 'user_id',
    parentIdCol: 'parent_comment_id',
  },
  nook: {
    table: 'nooks',
    contentCol: 'description',
    authorCol: 'creator_id',
  },
  nook_message: {
    table: 'nook_messages',
    contentCol: 'content',
    authorCol: 'user_id',
    parentIdCol: 'parent_message_id',
  },
  referral_post: {
    table: 'referral_posts',
    contentCol: 'description_encrypted',
    authorCol: 'user_id',
  },
  referral_comment: {
    table: 'referral_comments',
    contentCol: 'content',
    authorCol: 'user_id',
  },
};

@Injectable()
export class ContextBuilderService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async buildPayload(
    contentType: string,
    contentId: string,
    authorId: string,
  ): Promise<EditorialPayload> {
    const [subject, parentChain, container, authorSignals] = await Promise.all([
      this.loadSubject(contentType, contentId),
      this.walkParentChain(contentType, contentId),
      this.loadContainer(contentType, contentId),
      this.loadAuthorSignals(authorId),
    ]);

    return {
      subject,
      parentChain,
      container: container || undefined,
      authorSignals,
      policyVersion: POLICY_VERSION,
    };
  }

  private async loadSubject(
    contentType: string,
    contentId: string,
  ): Promise<SubjectPayload> {
    const info = TABLE_MAP[contentType];
    if (!info) {
      throw new Error(`Unknown content type: ${contentType}`);
    }

    const { data, error } = await this.admin
      .from(info.table)
      .select('*')
      .eq('id', contentId)
      .single();

    if (error || !data) {
      throw new Error(`Content not found: ${contentType}/${contentId}`);
    }

    return {
      type: contentType as SubjectPayload['type'],
      id: data.id,
      authorId: data[info.authorCol],
      authorIsAnonymous: data.is_anonymous ?? false,
      content: data[info.contentCol] || '',
      createdAt: data.created_at,
      mentions: [],
      attachments: [],
    };
  }

  /**
   * Walk from the content item up to its root, building a parent chain.
   * Never descends into siblings — only walks upward.
   */
  private async walkParentChain(
    contentType: string,
    contentId: string,
  ): Promise<ParentChainItem[]> {
    const chain: ParentChainItem[] = [];

    try {
      switch (contentType) {
        case 'feed_post':
        case 'forum_topic':
        case 'nook':
        case 'referral_post':
          // Root items — no parent chain
          break;

        case 'feed_comment':
          await this.walkFeedComment(contentId, chain);
          break;

        case 'forum_comment':
          await this.walkForumComment(contentId, chain);
          break;

        case 'nook_message':
          await this.walkNookMessage(contentId, chain);
          break;

        case 'referral_comment':
          await this.walkReferralComment(contentId, chain);
          break;
      }
    } catch (err) {
      logger.warn('Failed to build parent chain', {
        contentType,
        contentId,
        error: err,
      });
    }

    return chain;
  }

  private async walkFeedComment(
    commentId: string,
    chain: ParentChainItem[],
  ): Promise<void> {
    const { data: comment } = await this.admin
      .from('feed_comments')
      .select('*')
      .eq('id', commentId)
      .single();

    if (!comment) return;

    // If this is a reply to another comment, add the parent comment
    if (comment.parent_comment_id) {
      const { data: parent } = await this.admin
        .from('feed_comments')
        .select('*')
        .eq('id', comment.parent_comment_id)
        .single();

      if (parent) {
        chain.push({
          type: 'feed_comment',
          id: parent.id,
          authorId: parent.user_id,
          content: this.truncate(parent.content, MAX_PARENT_COMMENT_CHARS),
          createdAt: parent.created_at,
        });
      }
    }

    // Walk to the polymorphic parent (feed_post, forum_topic, or nook_message)
    await this.loadPolymorphicParent(
      comment.content_type,
      comment.content_id,
      chain,
    );
  }

  private async loadPolymorphicParent(
    contentType: string,
    contentId: string,
    chain: ParentChainItem[],
  ): Promise<void> {
    // feed_comments reference: content_type = 'post' | 'topic' | 'nook_message'
    const typeMap: Record<
      string,
      { table: string; type: string; contentCol: string }
    > = {
      post: {
        table: 'feed_posts',
        type: 'feed_post',
        contentCol: 'content',
      },
      topic: {
        table: 'forum_topics',
        type: 'forum_topic',
        contentCol: 'content',
      },
      nook_message: {
        table: 'nook_messages',
        type: 'nook_message',
        contentCol: 'content',
      },
    };

    const mapped = typeMap[contentType];
    if (!mapped) return;

    const { data: parent } = await this.admin
      .from(mapped.table)
      .select('*')
      .eq('id', contentId)
      .single();

    if (parent) {
      chain.push({
        type: mapped.type,
        id: parent.id,
        authorId: parent.user_id || parent.creator_id,
        title: parent.title || null,
        content: this.truncate(
          parent[mapped.contentCol] || parent.description || '',
          MAX_PARENT_POST_CHARS,
        ),
        createdAt: parent.created_at,
      });
    }
  }

  private async walkForumComment(
    commentId: string,
    chain: ParentChainItem[],
  ): Promise<void> {
    const { data: comment } = await this.admin
      .from('forum_comments')
      .select('*')
      .eq('id', commentId)
      .single();

    if (!comment) return;

    // If reply to another comment
    if (comment.parent_comment_id) {
      const { data: parent } = await this.admin
        .from('forum_comments')
        .select('*')
        .eq('id', comment.parent_comment_id)
        .single();

      if (parent) {
        chain.push({
          type: 'forum_comment',
          id: parent.id,
          authorId: parent.user_id,
          content: this.truncate(parent.content, MAX_PARENT_COMMENT_CHARS),
          createdAt: parent.created_at,
        });
      }
    }

    // Walk to the forum topic
    const { data: topic } = await this.admin
      .from('forum_topics')
      .select('*')
      .eq('id', comment.topic_id)
      .single();

    if (topic) {
      chain.push({
        type: 'forum_topic',
        id: topic.id,
        authorId: topic.user_id,
        title: topic.title,
        content: this.truncate(topic.content, MAX_PARENT_POST_CHARS),
        createdAt: topic.created_at,
      });
    }
  }

  private async walkNookMessage(
    messageId: string,
    chain: ParentChainItem[],
  ): Promise<void> {
    const { data: message } = await this.admin
      .from('nook_messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (!message) return;

    // If reply to another message
    if (message.parent_message_id) {
      const { data: parent } = await this.admin
        .from('nook_messages')
        .select('*')
        .eq('id', message.parent_message_id)
        .single();

      if (parent) {
        chain.push({
          type: 'nook_message',
          id: parent.id,
          authorId: parent.user_id,
          content: this.truncate(parent.content, MAX_PARENT_COMMENT_CHARS),
          createdAt: parent.created_at,
        });
      }
    }

    // Walk to the nook (container is loaded separately, but add as chain item too)
    const { data: nook } = await this.admin
      .from('nooks')
      .select('*')
      .eq('id', message.nook_id)
      .single();

    if (nook) {
      chain.push({
        type: 'nook',
        id: nook.id,
        authorId: nook.creator_id,
        title: nook.title,
        content: this.truncate(nook.description, MAX_PARENT_POST_CHARS),
        createdAt: nook.created_at,
      });
    }
  }

  private async walkReferralComment(
    commentId: string,
    chain: ParentChainItem[],
  ): Promise<void> {
    const { data: comment } = await this.admin
      .from('referral_comments')
      .select('*')
      .eq('id', commentId)
      .single();

    if (!comment) return;

    const { data: post } = await this.admin
      .from('referral_posts')
      .select('*')
      .eq('id', comment.referral_post_id)
      .single();

    if (post) {
      chain.push({
        type: 'referral_post',
        id: post.id,
        authorId: post.user_id,
        title: post.title_encrypted || null,
        content: this.truncate(
          post.description_encrypted || '',
          MAX_PARENT_POST_CHARS,
        ),
        createdAt: post.created_at,
      });
    }
  }

  /**
   * Load container info (nook or forum) for content that lives inside one.
   */
  private async loadContainer(
    contentType: string,
    contentId: string,
  ): Promise<ContainerInfo | null> {
    try {
      if (contentType === 'nook') {
        const { data } = await this.admin
          .from('nooks')
          .select('id, title, scope, urgency, temperature')
          .eq('id', contentId)
          .single();

        if (data) {
          return {
            type: 'nook',
            id: data.id,
            title: data.title,
            scope: data.scope,
            urgency: data.urgency,
            temperature: data.temperature,
          };
        }
      }

      if (contentType === 'nook_message') {
        const { data: msg } = await this.admin
          .from('nook_messages')
          .select('nook_id')
          .eq('id', contentId)
          .single();

        if (msg) {
          const { data: nook } = await this.admin
            .from('nooks')
            .select('id, title, scope, urgency, temperature')
            .eq('id', msg.nook_id)
            .single();

          if (nook) {
            return {
              type: 'nook',
              id: nook.id,
              title: nook.title,
              scope: nook.scope,
              urgency: nook.urgency,
              temperature: nook.temperature,
            };
          }
        }
      }

      if (contentType === 'forum_comment') {
        const { data: comment } = await this.admin
          .from('forum_comments')
          .select('topic_id')
          .eq('id', contentId)
          .single();

        if (comment) {
          const { data: topic } = await this.admin
            .from('forum_topics')
            .select('id, forum_id, title')
            .eq('id', comment.topic_id)
            .single();

          if (topic) {
            return {
              type: 'forum',
              id: topic.forum_id,
              title: topic.title,
            };
          }
        }
      }

      if (contentType === 'forum_topic') {
        const { data: topic } = await this.admin
          .from('forum_topics')
          .select('id, forum_id, title')
          .eq('id', contentId)
          .single();

        if (topic) {
          return {
            type: 'forum',
            id: topic.forum_id,
            title: topic.title,
          };
        }
      }
    } catch (err) {
      logger.warn('Failed to load container', {
        contentType,
        contentId,
        error: err,
      });
    }

    return null;
  }

  /**
   * Load lightweight author reputation signals.
   * No PII — just counts and account age.
   */
  private async loadAuthorSignals(authorId: string): Promise<AuthorSignals> {
    const defaults: AuthorSignals = {
      accountAgeDays: 0,
      priorFlagsAgainstAuthor: 0,
      priorRemovalsAgainstAuthor: 0,
      postsLast24h: 0,
    };

    try {
      const [profileResult, flagsResult, removalsResult] = await Promise.all([
        this.admin
          .from('user_profiles')
          .select('created_at')
          .eq('id', authorId)
          .single(),
        this.admin
          .from('content_flags')
          .select('id', { count: 'exact', head: true })
          .eq('reported_user_id', authorId),
        this.admin
          .from('content_moderation')
          .select('id', { count: 'exact', head: true })
          .eq('moderation_status', 'removed'),
      ]);

      if (profileResult.data?.created_at) {
        const created = new Date(profileResult.data.created_at);
        defaults.accountAgeDays = Math.floor(
          (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24),
        );
      }

      defaults.priorFlagsAgainstAuthor = flagsResult.count ?? 0;
      defaults.priorRemovalsAgainstAuthor = removalsResult.count ?? 0;
    } catch (err) {
      logger.warn('Failed to load author signals', {
        authorId,
        error: err,
      });
    }

    return defaults;
  }

  private truncate(text: string, maxChars: number): string {
    if (!text || text.length <= maxChars) return text || '';
    return text.substring(0, maxChars) + '...';
  }
}
