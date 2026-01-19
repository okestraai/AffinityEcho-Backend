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
//         throw new NotFoundException('Topic not found');
//       }

//       // Check if parent comment exists (only if parentCommentId is provided)
//       if (parentCommentId) {
//         const { data: parentComment, error: parentError } = await this.admin
//           .from('forum_comments')
//           .select('id')
//           .eq('id', parentCommentId)
//           .single();

//         if (parentError || !parentComment) {
//           throw new NotFoundException('Parent comment not found');
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
//         throw new BadRequestException('Failed to create comment');
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
//       throw new InternalServerErrorException('Failed to create comment');
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
//         throw new NotFoundException('Topic not found');
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
//         logger.error('Failed to fetch comments', {
//           topicId,
//           error: error.message,
//         });
//         throw new BadRequestException('Failed to fetch comments');
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
//       throw new InternalServerErrorException('Failed to fetch comments');
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
//           throw new NotFoundException('Comment not found');
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
//         throw new NotFoundException('Comment not found');
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

interface UserReactionMap {
  [commentId: string]: { helpful: boolean; supportive: boolean };
}

@Injectable()
export class CommentService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async createComment(createCommentDto: CreateCommentDto, userId: string) {
    logger.info('Creating comment', {
      topicId: createCommentDto.topicId,
      userId,
    });

    try {
      const { topicId, parentCommentId } = createCommentDto;

      // Check topic existence + get forum_id
      const { data: topic, error: topicError } = await this.admin
        .from('forum_topics')
        .select('id, forum_id, comments_count')
        .eq('id', topicId)
        .single();

      if (topicError || !topic) {
        throw new NotFoundException('Topic not found');
      }

      // Validate parent comment if provided
      if (parentCommentId) {
        const { data: parentComment, error: parentError } = await this.admin
          .from('forum_comments')
          .select('id')
          .eq('id', parentCommentId)
          .single();

        if (parentError || !parentComment) {
          throw new NotFoundException('Parent comment not found');
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
            avatar
          )
        `,
        )
        .single();

      if (error || !comment) {
        logger.error('Comment creation failed', { error });
        throw new BadRequestException('Failed to create comment');
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
      throw new InternalServerErrorException('Failed to create comment');
    }
  }

  async getTopicComments(topicId: string, userId?: string) {
    logger.info('Fetching comments', { topicId });

    const { data: topic } = await this.admin
      .from('forum_topics')
      .select('id')
      .eq('id', topicId)
      .single();

    if (!topic) throw new NotFoundException('Topic not found');

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
        user_profile:user_id(id, username, avatar)
      `,
      )
      .eq('topic_id', topicId)
      .order('created_at', { ascending: true });

    if (error || !allComments) {
      throw new BadRequestException('Failed to fetch comments');
    }

    // User reactions (single query)
    const userReactions: UserReactionMap = {};
    if (userId && allComments.length > 0) {
      const { data: reactions } = await this.admin
        .from('comment_reactions')
        .select('comment_id, reaction_type')
        .eq('user_id', userId)
        .in(
          'comment_id',
          allComments.map((c) => c.id),
        );

      (reactions || []).forEach((r) => {
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

    allComments.forEach((comment) => {
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

    allComments.forEach((comment) => {
      if (comment.parent_comment_id) {
        const parent = commentMap.get(comment.parent_comment_id);
        if (parent) parent.replies.push(commentMap.get(comment.id));
      }
    });

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
        .select('*, user_profile:user_id(id, username, avatar)')
        .eq('id', commentId)
        .single();

      return { action: 'removed', comment };
    }

    // Add reaction
    const { data: commentCheck } = await this.admin
      .from('forum_comments')
      .select('id')
      .eq('id', commentId)
      .single();

    if (!commentCheck) throw new NotFoundException('Comment not found');

    await this.admin.from('comment_reactions').insert({
      comment_id: commentId,
      user_id: userId,
      reaction_type: reactionType,
    });

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
      .select('*, user_profile:user_id(id, username, avatar)')
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

    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.user_id !== userId)
      throw new ForbiddenException('Not your comment');

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

    return { success: true, message: 'Comment deleted' };
  }
}
