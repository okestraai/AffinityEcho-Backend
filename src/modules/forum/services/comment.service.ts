// import {
//   Injectable,
//   NotFoundException,
//   ForbiddenException,
//   BadRequestException,
//   InternalServerErrorException,
// } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { supabaseAdmin } from '../../../database/supabase.client';
// import { CreateCommentDto } from '../dto/create-comment.dto';
// import logger from '../../../common/utils/logger.util';

// @Injectable()
// export class CommentService {
//   private admin;

//   constructor(private config: ConfigService) {
//     this.admin = supabaseAdmin(config);
//   }

//   async createComment(createCommentDto: CreateCommentDto, userId: string) {
//     logger.info('Creating comment', {
//       topicId: createCommentDto.topicId,
//       userId,
//     });

//     try {
//       const { topicId, parentCommentId } = createCommentDto;

//       // OPTIMIZED: Single query to check topic existence and get forum_id
//       const { data: topic, error: topicError } = await this.admin
//         .from('forum_topics')
//         .select('id, forum_id, comments_count')
//         .eq('id', topicId)
//         .single();

//       if (topicError || !topic) {
//         throw new NotFoundException(MSG.FORUM.TOPIC_NOT_FOUND);
//       }

//       // Check if parent comment exists (only if parentCommentId is provided)
//       if (parentCommentId) {
//         const { data: parentComment, error: parentError } = await this.admin
//           .from('forum_comments')
//           .select('id')
//           .eq('id', parentCommentId)
//           .single();

//         if (parentError || !parentComment) {
//           throw new NotFoundException(MSG.FORUM.PARENT_NOT_FOUND);
//         }
//       }

//       // OPTIMIZED: Simplified select - removed nested replies to avoid N+1
//       const { data: comment, error } = await this.admin
//         .from('forum_comments')
//         .insert({
//           content: createCommentDto.content,
//           topic_id: createCommentDto.topicId,
//           user_id: userId,
//           parent_comment_id: createCommentDto.parentCommentId,
//           is_anonymous: createCommentDto.isAnonymous || true,
//           helpful_count: 0,
//           supportive_count: 0,
//         })
//         .select(
//           `
//           *,
//           user_profile:user_id(
//             id,
//             username,
//             avatar
//           )
//         `,
//         )
//         .single();

//       if (error) {
//         logger.error('Comment creation failed', {
//           error: error.message,
//           data: createCommentDto,
//         });
//         throw new BadRequestException(MSG.FORUM.CREATE_COMMENT_FAILED);
//       }

//       // OPTIMIZED: Use RPC for atomic comment count increment
//       await this.admin
//         .rpc('increment_topic_comment_count', {
//           topic_id: topicId,
//         })
//         .catch(() => {
//           // Fallback: Traditional update
//           this.admin
//             .from('forum_topics')
//             .update({
//               comments_count: topic.comments_count + 1,
//               last_activity_at: new Date().toISOString(),
//             })
//             .eq('id', topicId);
//         });

//       // OPTIMIZED: Use RPC for forum activity update
//       await this.admin
//         .rpc('update_forum_activity', {
//           forum_id: topic.forum_id,
//         })
//         .catch(() => {
//           // Fallback: Traditional update
//           this.admin
//             .from('forums')
//             .update({
//               last_activity: new Date().toISOString(),
//             })
//             .eq('id', topic.forum_id);
//         });

//       logger.info('Comment created successfully', { commentId: comment.id });
//       return comment;
//     } catch (error) {
//       if (
//         error instanceof NotFoundException ||
//         error instanceof BadRequestException
//       ) {
//         throw error;
//       }
//       logger.error('Unexpected error creating comment', {
//         error: error instanceof Error ? error.message : String(error),
//       });
//       throw new InternalServerErrorException(MSG.FORUM.CREATE_COMMENT_FAILED);
//     }
//   }

//   async getTopicComments(topicId: string, userId?: string) {
//     logger.info('Fetching topic comments', { topicId, userId });

//     try {
//       // Check if topic exists
//       const { data: topic, error: topicError } = await this.admin
//         .from('forum_topics')
//         .select('id')
//         .eq('id', topicId)
//         .single();

//       if (topicError || !topic) {
//         throw new NotFoundException(MSG.FORUM.TOPIC_NOT_FOUND);
//       }

//       // OPTIMIZED: Single query to get all comments (parents and replies)
//       const { data: allComments, error } = await this.admin
//         .from('forum_comments')
//         .select(
//           `
//           id,
//           content,
//           created_at,
//           updated_at,
//           parent_comment_id,
//           is_anonymous,
//           is_removed,
//           removed_reason,
//           helpful_count,
//           supportive_count,
//           user_id,
//           user_profile:user_id(
//             id,
//             username,
//             avatar
//           )
//         `,
//         )
//         .eq('topic_id', topicId)
//         .order('created_at', { ascending: true });

//       if (error) {
//         logger.error(MSG.FORUM.FETCH_COMMENTS_FAILED, {
//           topicId,
//           error: error.message,
//         });
//         throw new BadRequestException(MSG.FORUM.FETCH_COMMENTS_FAILED);
//       }

//       // OPTIMIZED: Get user reactions in a single query if userId provided
//       let userReactions: {
//         [key: string]: { helpful: boolean; supportive: boolean };
//       } = {};
//       if (userId && allComments && allComments.length > 0) {
//         const commentIds = allComments.map((c) => c.id);
//         const { data: reactions } = await this.admin
//           .from('comment_reactions')
//           .select('comment_id, reaction_type')
//           .eq('user_id', userId)
//           .in('comment_id', commentIds);

//         userReactions = (reactions || []).reduce((acc, reaction) => {
//           if (!acc[reaction.comment_id]) {
//             acc[reaction.comment_id] = { helpful: false, supportive: false };
//           }
//           if (reaction.reaction_type === 'helpful') {
//             acc[reaction.comment_id].helpful = true;
//           }
//           if (reaction.reaction_type === 'supportive') {
//             acc[reaction.comment_id].supportive = true;
//           }
//           return acc;
//         }, {});
//       }

//       // OPTIMIZED: Build hierarchical structure in memory
//       const commentMap = new Map();
//       const rootComments = [];

//       // First pass: create all comment objects with user reactions
//       allComments?.forEach((comment) => {
//         const commentWithReactions = {
//           ...comment,
//           replies: [],
//           userReactions: userReactions[comment.id] || {
//             helpful: false,
//             supportive: false,
//           },
//         };
//         commentMap.set(comment.id, commentWithReactions);

//         if (!comment.parent_comment_id) {
//           rootComments.push(commentWithReactions);
//         }
//       });

//       // Second pass: link replies to parents
//       allComments?.forEach((comment) => {
//         if (comment.parent_comment_id) {
//           const parent = commentMap.get(comment.parent_comment_id);
//           if (parent) {
//             parent.replies.push(commentMap.get(comment.id));
//           }
//         }
//       });

//       logger.info('Comments fetched successfully', {
//         topicId,
//         count: rootComments.length,
//         totalComments: allComments?.length || 0,
//       });
//       return rootComments;
//     } catch (error) {
//       if (
//         error instanceof NotFoundException ||
//         error instanceof BadRequestException
//       ) {
//         throw error;
//       }
//       logger.error('Unexpected error fetching comments', {
//         topicId,
//         error: error instanceof Error ? error.message : String(error),
//       });
//       throw new InternalServerErrorException(MSG.FORUM.FETCH_COMMENTS_FAILED);
//     }
//   }

//   async addCommentReaction(
//     commentId: string,
//     userId: string,
//     reactionType: 'helpful' | 'supportive',
//   ) {
//     logger.info('Adding comment reaction', { commentId, userId, reactionType });

//     try {
//       // OPTIMIZED: Check existing reaction first (single query)
//       const { data: existingReaction, error: checkError } = await this.admin
//         .from('comment_reactions')
//         .select('id')
//         .eq('comment_id', commentId)
//         .eq('user_id', userId)
//         .eq('reaction_type', reactionType)
//         .single();

//       const reactionField = `${reactionType}_count`;

//       if (existingReaction) {
//         // Remove reaction
//         const { error: deleteError } = await this.admin
//           .from('comment_reactions')
//           .delete()
//           .eq('comment_id', commentId)
//           .eq('user_id', userId)
//           .eq('reaction_type', reactionType);

//         if (deleteError) {
//           throw new BadRequestException('Failed to remove reaction');
//         }

//         // OPTIMIZED: Use RPC for atomic decrement
//         await this.admin
//           .rpc('decrement_comment_reaction', {
//             comment_id: commentId,
//             reaction_field: reactionField,
//           })
//           .catch(() => {
//             // Fallback: Fetch and update
//             this.admin
//               .from('forum_comments')
//               .select(reactionField)
//               .eq('id', commentId)
//               .single()
//               .then(({ data: comment }) => {
//                 if (comment) {
//                   const currentCount = comment[reactionField] || 0;
//                   this.admin
//                     .from('forum_comments')
//                     .update({
//                       [reactionField]: Math.max(0, currentCount - 1),
//                     })
//                     .eq('id', commentId);
//                 }
//               });
//           });

//         // Fetch updated comment
//         const { data: updatedComment } = await this.admin
//           .from('forum_comments')
//           .select(
//             `
//             *,
//             user_profile:user_id(
//               id,
//               username,
//               avatar
//             )
//           `,
//           )
//           .eq('id', commentId)
//           .single();

//         logger.info('Comment reaction removed', {
//           commentId,
//           reactionType,
//         });
//         return { action: 'removed', comment: updatedComment };
//       } else {
//         // OPTIMIZED: Check comment exists only when adding
//         const { data: comment, error: commentError } = await this.admin
//           .from('forum_comments')
//           .select('id')
//           .eq('id', commentId)
//           .single();

//         if (commentError || !comment) {
//           throw new NotFoundException(MSG.FORUM.COMMENT_NOT_FOUND);
//         }

//         // Add reaction
//         const { error: insertError } = await this.admin
//           .from('comment_reactions')
//           .insert({
//             comment_id: commentId,
//             user_id: userId,
//             reaction_type: reactionType,
//           });

//         if (insertError) {
//           throw new BadRequestException('Failed to add reaction');
//         }

//         // OPTIMIZED: Use RPC for atomic increment
//         await this.admin
//           .rpc('increment_comment_reaction', {
//             comment_id: commentId,
//             reaction_field: reactionField,
//           })
//           .catch(() => {
//             // Fallback: Fetch and update
//             this.admin
//               .from('forum_comments')
//               .select(reactionField)
//               .eq('id', commentId)
//               .single()
//               .then(({ data: comment }) => {
//                 if (comment) {
//                   const currentCount = comment[reactionField] || 0;
//                   this.admin
//                     .from('forum_comments')
//                     .update({
//                       [reactionField]: currentCount + 1,
//                     })
//                     .eq('id', commentId);
//                 }
//               });
//           });

//         // Fetch updated comment
//         const { data: updatedComment } = await this.admin
//           .from('forum_comments')
//           .select(
//             `
//             *,
//             user_profile:user_id(
//               id,
//               username,
//               avatar
//             )
//           `,
//           )
//           .eq('id', commentId)
//           .single();

//         logger.info('Comment reaction added successfully', {
//           commentId,
//           reactionType,
//         });
//         return { action: 'added', comment: updatedComment };
//       }
//     } catch (error) {
//       if (
//         error instanceof NotFoundException ||
//         error instanceof BadRequestException
//       ) {
//         throw error;
//       }
//       logger.error('Unexpected error adding comment reaction', {
//         commentId,
//         userId,
//         reactionType,
//         error: error instanceof Error ? error.message : String(error),
//       });
//       throw new InternalServerErrorException('Failed to add reaction');
//     }
//   }

//   async deleteComment(commentId: string, userId: string) {
//     logger.info('Deleting comment', { commentId, userId });

//     try {
//       // Check if comment exists and user owns it
//       const { data: comment, error: commentError } = await this.admin
//         .from('forum_comments')
//         .select('id, user_id, topic_id')
//         .eq('id', commentId)
//         .single();

//       if (commentError || !comment) {
//         throw new NotFoundException(MSG.FORUM.COMMENT_NOT_FOUND);
//       }

//       if (comment.user_id !== userId) {
//         throw new ForbiddenException('You can only delete your own comments');
//       }

//       const { error } = await this.admin
//         .from('forum_comments')
//         .delete()
//         .eq('id', commentId);

//       if (error) {
//         logger.error('Comment deletion failed', {
//           commentId,
//           error: error.message,
//         });
//         throw new BadRequestException('Failed to delete comment');
//       }

//       // OPTIMIZED: Use RPC for atomic comment count decrement
//       await this.admin
//         .rpc('decrement_topic_comment_count', {
//           topic_id: comment.topic_id,
//         })
//         .catch(() => {
//           // Fallback: Fetch and update
//           this.admin
//             .from('forum_topics')
//             .select('comments_count')
//             .eq('id', comment.topic_id)
//             .single()
//             .then(({ data: topic }) => {
//               if (topic) {
//                 this.admin
//                   .from('forum_topics')
//                   .update({
//                     comments_count: Math.max(0, topic.comments_count - 1),
//                   })
//                   .eq('id', comment.topic_id);
//               }
//             });
//         });

//       logger.info('Comment deleted successfully', { commentId });
//       return { success: true, message: 'Comment deleted successfully' };
//     } catch (error) {
//       if (
//         error instanceof NotFoundException ||
//         error instanceof ForbiddenException ||
//         error instanceof BadRequestException
//       ) {
//         throw error;
//       }
//       logger.error('Unexpected error deleting comment', {
//         commentId,
//         error: error instanceof Error ? error.message : String(error),
//       });
//       throw new InternalServerErrorException('Failed to delete comment');
//     }
//   }
// }

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { CreateCommentDto } from '../dto/create-comment.dto';
import logger from '../../../common/utils/logger.util';
import { NotificationsService } from '../../notifications/notifications.service';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { IdentityRevealUtil } from '../../../common/utils/identity-reveal.util';
import { MentionService } from '../../mentions/mention.service';
import { OkestraService } from '../../okestra/services/okestra.service';
import { MSG } from '../../../common/constants/messages';
import { ContentSafetyService } from '../../content-safety/content-safety.service';

interface UserReactionMap {
  [commentId: string]: { helpful: boolean; supportive: boolean };
}

@Injectable()
export class CommentService {
  private admin;

  constructor(
    private config: ConfigService,
    private notificationsService: NotificationsService,
    private encryption: EncryptionUtil,
    private identityReveal: IdentityRevealUtil,
    private mentionService: MentionService,
    private okestraService: OkestraService,
    private contentSafety: ContentSafetyService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async createComment(createCommentDto: CreateCommentDto, userId: string) {
    logger.info('Creating comment', {
      topicId: createCommentDto.topicId,
      userId,
    });

    try {
      const { topicId, parentCommentId } = createCommentDto;

      // Check topic existence + get forum_id and creator
      const { data: topic, error: topicError } = await this.admin
        .from('forum_topics')
        .select('id, forum_id, comments_count, user_id, title')
        .eq('id', topicId)
        .single();

      if (topicError || !topic) {
        throw new NotFoundException(MSG.FORUM.TOPIC_NOT_FOUND);
      }

      // Validate parent comment if provided
      if (parentCommentId) {
        const { data: parentComment, error: parentError } = await this.admin
          .from('forum_comments')
          .select('id')
          .eq('id', parentCommentId)
          .single();

        if (parentError || !parentComment) {
          throw new NotFoundException(MSG.FORUM.PARENT_NOT_FOUND);
        }
      }
      const currentTimestamp = new Date().toISOString();
      // Insert comment
      const { data: comment, error } = await this.admin
        .from('forum_comments')
        .insert({
          content: createCommentDto.content,
          topic_id: topicId,
          user_id: userId,
          parent_comment_id: parentCommentId || null,
          is_anonymous: createCommentDto.isAnonymous ?? true,
          helpful_count: 0,
          supportive_count: 0,
          created_at: currentTimestamp,
          updated_at: currentTimestamp,
        })
        .select(
          `
          *,
          user_profile:user_id(
            id,
            username,
            avatar,
            first_name_encrypted,
            last_name_encrypted,
            is_company_verified
          )
        `,
        )
        .single();

      if (error || !comment) {
        logger.error('Comment creation failed', { error });
        throw new BadRequestException(MSG.FORUM.CREATE_COMMENT_FAILED);
      }

      // Atomic increment via RPC
      const { error: incError } = await this.admin.rpc(
        'increment_topic_comment_count',
        {
          topic_id: topicId,
        },
      );
      if (incError) {
        logger.warn('RPC increment failed, using fallback', {
          topicId,
          incError,
        });
        await this.admin
          .from('forum_topics')
          .update({
            comments_count: (topic.comments_count || 0) + 1,
            last_activity_at: new Date().toISOString(),
          })
          .eq('id', topicId);
      }

      // Update forum activity
      const { error: activityError } = await this.admin.rpc(
        'update_forum_activity',
        {
          forum_id: topic.forum_id,
        },
      );
      if (activityError) {
        logger.warn('Forum activity update failed', {
          forumId: topic.forum_id,
        });
        await this.admin
          .from('forums')
          .update({ last_activity: new Date().toISOString() })
          .eq('id', topic.forum_id);
      }

      // Create notification for topic creator (if not commenting on own topic)
      if (topic.user_id !== userId) {
        try {
          const actorName = await this.identityReveal.resolveNotificationName(userId, topic.user_id);

          await this.notificationsService.createNotification({
            user_id: topic.user_id,
            actor_id: userId,
            type: 'forum_comment',
            title: 'New Comment',
            message: `${actorName} commented on your topic: ${topic.title}`,
            action_url: `/forum/topics/${topicId}`,
            reference_id: comment.id,
            reference_type: 'forum_comment',
            metadata: { topic_id: topicId },
            delivery_method: ['in_app'],
          });
        } catch (notifError) {
          logger.error('Failed to create comment notification:', notifError);
        }
      }

      // If it's a reply to a comment, notify the parent comment author
      if (parentCommentId) {
        try {
          const { data: parentComment } = await this.admin
            .from('forum_comments')
            .select('user_id')
            .eq('id', parentCommentId)
            .single();

          // Notify parent comment author if different from current user and topic creator
          if (
            parentComment &&
            parentComment.user_id !== userId &&
            parentComment.user_id !== topic.user_id
          ) {
            const actorName = await this.identityReveal.resolveNotificationName(userId, parentComment.user_id);

            await this.notificationsService.createNotification({
              user_id: parentComment.user_id,
              actor_id: userId,
              type: 'forum_comment',
              title: 'New Reply',
              message: `${actorName} replied to your comment`,
              action_url: `/forum/topics/${topicId}#comment-${comment.id}`,
              reference_id: comment.id,
              reference_type: 'forum_comment',
              metadata: {
                parent_comment_id: parentCommentId,
                topic_id: topicId,
              },
              delivery_method: ['in_app'],
            });
          }
        } catch (notifError) {
          logger.error('Failed to create reply notification:', notifError);
        }
      }

      // Process @mentions in comment content
      const usernames = this.mentionService.parseMentions(
        createCommentDto.content,
      );
      if (usernames.length > 0) {
        this.mentionService.processMentions(
          userId,
          usernames,
          'comment',
          comment.id,
          topicId,
        );
      }

      // Invalidate AI insights cache for this topic
      this.okestraService.invalidateCache('topic', topicId).catch(() => {});

      logger.info('Comment created', { commentId: comment.id });
      return comment;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Unexpected error creating comment', { error });
      throw new InternalServerErrorException(MSG.FORUM.CREATE_COMMENT_FAILED);
    }
  }

  async getTopicComments(topicId: string, userId?: string) {
    logger.info('Fetching comments', { topicId });

    const { data: topic } = await this.admin
      .from('forum_topics')
      .select('id')
      .eq('id', topicId)
      .single();

    if (!topic) throw new NotFoundException(MSG.FORUM.TOPIC_NOT_FOUND);

    const { data: allComments, error } = await this.admin
      .from('forum_comments')
      .select(
        `
        id,
        content,
        created_at,
        updated_at,
        parent_comment_id,
        is_anonymous,
        is_removed,
        removed_reason,
        helpful_count,
        supportive_count,
        user_id,
        user_profile:user_id(id, username, avatar, first_name_encrypted, last_name_encrypted, is_company_verified)
      `,
      )
      .eq('topic_id', topicId)
      .order('created_at', { ascending: true });

    if (error || !allComments) {
      throw new BadRequestException(MSG.FORUM.FETCH_COMMENTS_FAILED);
    }

    // Filter out blocked users' comments and user-hidden comments
    let filteredComments = allComments;
    if (userId) {
      const [blockedIds, hiddenIds] = await Promise.all([
        this.contentSafety.getBlockedUserIds(userId),
        this.contentSafety.getHiddenContentIds(userId, 'comment'),
      ]);
      const blockedSet = new Set(blockedIds);
      const hiddenSet = new Set(hiddenIds);
      filteredComments = allComments.filter(
        (c: any) => !blockedSet.has(c.user_id) && !hiddenSet.has(c.id),
      );
    }

    // User reactions (single query)
    const userReactions: UserReactionMap = {};
    if (userId && filteredComments.length > 0) {
      const { data: reactions } = await this.admin
        .from('comment_reactions')
        .select('comment_id, reaction_type')
        .eq('user_id', userId)
        .in(
          'comment_id',
          filteredComments.map((c: any) => c.id),
        );

      (reactions || []).forEach((r: any) => {
        if (!userReactions[r.comment_id]) {
          userReactions[r.comment_id] = { helpful: false, supportive: false };
        }
        if (r.reaction_type === 'helpful')
          userReactions[r.comment_id].helpful = true;
        if (r.reaction_type === 'supportive')
          userReactions[r.comment_id].supportive = true;
      });
    }

    // Build tree
    const commentMap = new Map<string, any>();
    const rootComments: any[] = [];

    filteredComments.forEach((comment: any) => {
      const enriched = {
        ...comment,
        replies: [],
        userReactions: userReactions[comment.id] || {
          helpful: false,
          supportive: false,
        },
      };
      commentMap.set(comment.id, enriched);
      if (!comment.parent_comment_id) rootComments.push(enriched);
    });

    filteredComments.forEach((comment: any) => {
      if (comment.parent_comment_id) {
        const parent = commentMap.get(comment.parent_comment_id);
        if (parent) parent.replies.push(commentMap.get(comment.id));
      }
    });

    // Apply identity reveal — show real name for revealed users
    if (userId) {
      const allEnriched = Array.from(commentMap.values());
      await this.applyIdentityReveals(userId, allEnriched);
    }

    // Sort: user's comments first (newest first), then others (newest first)
    if (userId) {
      rootComments.sort((a: any, b: any) => {
        const aIsMine = a.user_id === userId ? 0 : 1;
        const bIsMine = b.user_id === userId ? 0 : 1;
        if (aIsMine !== bIsMine) return aIsMine - bIsMine;
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
    }

    return rootComments;
  }

  async addCommentReaction(
    commentId: string,
    userId: string,
    reactionType: 'helpful' | 'supportive',
  ) {
    const reactionField = `${reactionType}_count` as const;

    const { data: existing } = await this.admin
      .from('comment_reactions')
      .select('id')
      .eq('comment_id', commentId)
      .eq('user_id', userId)
      .eq('reaction_type', reactionType)
      .maybeSingle();

    if (existing) {
      // Remove reaction
      await this.admin.from('comment_reactions').delete().eq('id', existing.id);

      const { error } = await this.admin.rpc('decrement_comment_reaction', {
        comment_id: commentId,
        reaction_field: reactionField,
      });
      if (error) {
        await this.admin
          .from('forum_comments')
          .update({ [reactionField]: () => `${reactionField} - 1` })
          .eq('id', commentId)
          .gte(reactionField, 1);
      }

      const { data: comment } = await this.admin
        .from('forum_comments')
        .select(
          '*, user_profile:user_id(id, username, avatar, first_name_encrypted, last_name_encrypted, is_company_verified)',
        )
        .eq('id', commentId)
        .single();

      return { action: 'removed', comment };
    }

    // Add reaction - get comment details including author
    const { data: commentCheck } = await this.admin
      .from('forum_comments')
      .select('id, user_id, topic_id')
      .eq('id', commentId)
      .single();

    if (!commentCheck) throw new NotFoundException(MSG.FORUM.COMMENT_NOT_FOUND);

    await this.admin.from('comment_reactions').insert({
      comment_id: commentId,
      user_id: userId,
      reaction_type: reactionType,
    });

    // Create notification for comment author (if not reacting to own comment)
    if (commentCheck.user_id !== userId) {
      try {
        const actorName = await this.identityReveal.resolveNotificationName(userId, commentCheck.user_id);

        await this.notificationsService.createNotification({
          user_id: commentCheck.user_id,
          actor_id: userId,
          type: 'forum_like',
          title: 'Comment Reaction',
          message: `${actorName} reacted with ${reactionType} to your comment`,
          action_url: `/forum/topics/${commentCheck.topic_id}#comment-${commentId}`,
          reference_id: commentId,
          reference_type: 'forum_comment',
          metadata: { reaction_type: reactionType },
          delivery_method: ['in_app'],
        });
      } catch (notifError) {
        logger.error(
          'Failed to create comment reaction notification:',
          notifError,
        );
      }
    }

    const { error } = await this.admin.rpc('increment_comment_reaction', {
      comment_id: commentId,
      reaction_field: reactionField,
    });
    if (error) {
      await this.admin
        .from('forum_comments')
        .update({ [reactionField]: () => `${reactionField} + 1` })
        .eq('id', commentId);
    }

    const { data: comment } = await this.admin
      .from('forum_comments')
      .select(
        '*, user_profile:user_id(id, username, avatar, first_name_encrypted, last_name_encrypted, is_company_verified)',
      )
      .eq('id', commentId)
      .single();

    return { action: 'added', comment };
  }

  async deleteComment(commentId: string, userId: string) {
    const { data: comment } = await this.admin
      .from('forum_comments')
      .select('id, user_id, topic_id')
      .eq('id', commentId)
      .single();

    if (!comment) throw new NotFoundException(MSG.FORUM.COMMENT_NOT_FOUND);
    if (comment.user_id !== userId)
      throw new ForbiddenException(MSG.FORUM.NOT_YOUR_COMMENT);

    await this.admin.from('forum_comments').delete().eq('id', commentId);

    const { error } = await this.admin.rpc('decrement_topic_comment_count', {
      topic_id: comment.topic_id,
    });
    if (error) {
      await this.admin
        .from('forum_topics')
        .update({ comments_count: () => 'comments_count - 1' })
        .eq('id', comment.topic_id)
        .gte('comments_count', 1);
    }

    // Invalidate AI insights cache for this topic
    this.okestraService
      .invalidateCache('topic', comment.topic_id)
      .catch(() => {});

    return { success: true, message: MSG.FORUM.COMMENT_DELETED };
  }

  private async applyIdentityReveals(
    userId: string,
    items: any[],
  ): Promise<void> {
    const otherAuthorIds = [
      ...new Set(
        items
          .filter((item) => item.user_id && item.user_id !== userId)
          .map((item) => item.user_id),
      ),
    ];

    const revealedIds = await this.identityReveal.getRevealedUserIds(
      userId,
      otherAuthorIds,
    );

    // Cache decrypted names per user to avoid losing data when
    // multiple comments share the same user_profile object reference
    const nameCache = new Map<string, string | null>();

    items.forEach((item) => {
      const profile = Array.isArray(item.user_profile)
        ? item.user_profile[0]
        : item.user_profile;
      if (!profile) return;
      item.user_profile = profile;

      const authorId = item.user_id;
      const isOwnContent = authorId === userId;
      const isRevealed = revealedIds.has(authorId);

      let displayName = item.is_anonymous
        ? 'Anonymous User'
        : profile.username;

      if (isOwnContent || isRevealed) {
        if (!nameCache.has(authorId)) {
          nameCache.set(
            authorId,
            this.identityReveal.decryptRealName(
              profile.first_name_encrypted,
              profile.last_name_encrypted,
            ),
          );
        }
        const realName = nameCache.get(authorId);
        if (realName) displayName = realName;
      }

      profile.display_name = displayName;
    });

    // Clean up encrypted fields after all items are processed
    items.forEach((item) => {
      if (item.user_profile) {
        delete item.user_profile.first_name_encrypted;
        delete item.user_profile.last_name_encrypted;
      }
    });
  }
}
