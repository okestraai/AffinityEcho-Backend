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

      // Check if topic exists
      const { data: topic, error: topicError } = await this.admin
        .from('forum_topics')
        .select('id, forum_id, comments_count')
        .eq('id', topicId)
        .single();

      if (topicError || !topic) {
        throw new NotFoundException('Topic not found');
      }

      // Check if parent comment exists
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

      const { data: comment, error } = await this.admin
        .from('forum_comments')
        .insert({
          content: createCommentDto.content,
          topic_id: createCommentDto.topicId,
          user_id: userId,
          parent_comment_id: createCommentDto.parentCommentId,
          is_anonymous: createCommentDto.isAnonymous || true,
          helpful_count: 0,
          supportive_count: 0,
        })
        .select(
          `
          *,
          user_profile:user_id(
            id,
            username,
            avatar
          ),
          replies:forum_comments(
            id,
            content,
            created_at,
            user_profile:user_id(
              id,
              username,
              avatar
            ),
            helpful_count,
            supportive_count
          )
        `,
        )
        .single();

      if (error) {
        logger.error('Comment creation failed', {
          error: error.message,
          data: createCommentDto,
        });
        throw new BadRequestException('Failed to create comment');
      }

      // Update topic comment count and activity
      await this.admin
        .from('forum_topics')
        .update({
          comments_count: topic.comments_count + 1,
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', topicId);

      // Update forum activity
      await this.admin
        .from('forums')
        .update({
          last_activity: new Date().toISOString(),
        })
        .eq('id', topic.forum_id);

      logger.info('Comment created successfully', { commentId: comment.id });
      return comment;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Unexpected error creating comment', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerErrorException('Failed to create comment');
    }
  }

  async getTopicComments(topicId: string, userId?: string) {
    logger.info('Fetching topic comments', { topicId, userId });

    try {
      // Check if topic exists
      const { data: topic, error: topicError } = await this.admin
        .from('forum_topics')
        .select('id')
        .eq('id', topicId)
        .single();

      if (topicError || !topic) {
        throw new NotFoundException('Topic not found');
      }

      const { data: comments, error } = await this.admin
        .from('forum_comments')
        .select(
          `
          *,
          user_profile:user_id(
            id,
            username,
            avatar
          ),
          replies:forum_comments(
            id,
            content,
            created_at,
            user_profile:user_id(
              id,
              username,
              avatar
            ),
            helpful_count,
            supportive_count
          )
        `,
        )
        .eq('topic_id', topicId)
        .is('parent_comment_id', null)
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('Failed to fetch comments', {
          topicId,
          error: error.message,
        });
        throw new BadRequestException('Failed to fetch comments');
      }

      logger.info('Comments fetched successfully', {
        topicId,
        count: comments?.length || 0,
      });
      return comments || [];
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Unexpected error fetching comments', {
        topicId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerErrorException('Failed to fetch comments');
    }
  }

  async addCommentReaction(
    commentId: string,
    userId: string,
    reactionType: 'helpful' | 'supportive',
  ) {
    logger.info('Adding comment reaction', { commentId, userId, reactionType });

    try {
      // Check if comment exists and get current count
      const { data: comment, error: commentError } = await this.admin
        .from('forum_comments')
        .select('*')
        .eq('id', commentId)
        .single();

      if (commentError || !comment) {
        throw new NotFoundException('Comment not found');
      }

      // Check if user already reacted to this comment
      const { data: existingReaction, error: checkError } = await this.admin
        .from('comment_reactions') // You need to create this table
        .select('id')
        .eq('comment_id', commentId)
        .eq('user_id', userId)
        .eq('reaction_type', reactionType)
        .single();

      if (existingReaction) {
        // Remove reaction - decrement count
        const { error: deleteError } = await this.admin
          .from('comment_reactions')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', userId)
          .eq('reaction_type', reactionType);

        if (deleteError) {
          throw new BadRequestException('Failed to remove reaction');
        }

        const reactionField = `${reactionType}_count`;
        const currentCount = comment[reactionField] || 0;

        const { data: updatedComment, error } = await this.admin
          .from('forum_comments')
          .update({
            [reactionField]: Math.max(0, currentCount - 1),
          })
          .eq('id', commentId)
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

        if (error) {
          throw new BadRequestException('Failed to update comment');
        }

        logger.info('Comment reaction removed', {
          commentId,
          reactionType,
        });
        return { action: 'removed', comment: updatedComment };
      } else {
        // Add reaction - increment count
        const { error: insertError } = await this.admin
          .from('comment_reactions') // You need to create this table
          .insert({
            comment_id: commentId,
            user_id: userId,
            reaction_type: reactionType,
          });

        if (insertError) {
          throw new BadRequestException('Failed to add reaction');
        }

        const reactionField = `${reactionType}_count`;
        const currentCount = comment[reactionField] || 0;

        const { data: updatedComment, error } = await this.admin
          .from('forum_comments')
          .update({
            [reactionField]: currentCount + 1,
          })
          .eq('id', commentId)
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

        if (error) {
          throw new BadRequestException('Failed to update comment');
        }

        logger.info('Comment reaction added successfully', {
          commentId,
          reactionType,
        });
        return { action: 'added', comment: updatedComment };
      }
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Unexpected error adding comment reaction', {
        commentId,
        userId,
        reactionType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerErrorException('Failed to add reaction');
    }
  }

  async deleteComment(commentId: string, userId: string) {
    logger.info('Deleting comment', { commentId, userId });

    try {
      // Check if comment exists and user owns it
      const { data: comment, error: commentError } = await this.admin
        .from('forum_comments')
        .select('id, user_id, topic_id')
        .eq('id', commentId)
        .single();

      if (commentError || !comment) {
        throw new NotFoundException('Comment not found');
      }

      if (comment.user_id !== userId) {
        throw new ForbiddenException('You can only delete your own comments');
      }

      const { error } = await this.admin
        .from('forum_comments')
        .delete()
        .eq('id', commentId);

      if (error) {
        logger.error('Comment deletion failed', {
          commentId,
          error: error.message,
        });
        throw new BadRequestException('Failed to delete comment');
      }

      // Update topic comment count by fetching current value first
      const { data: topic } = await this.admin
        .from('forum_topics')
        .select('comments_count')
        .eq('id', comment.topic_id)
        .single();

      if (topic) {
        await this.admin
          .from('forum_topics')
          .update({
            comments_count: Math.max(0, topic.comments_count - 1),
          })
          .eq('id', comment.topic_id);
      }

      logger.info('Comment deleted successfully', { commentId });
      return { success: true, message: 'Comment deleted successfully' };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Unexpected error deleting comment', {
        commentId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerErrorException('Failed to delete comment');
    }
  }
}
