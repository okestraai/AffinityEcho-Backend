import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../../../database/supabase.client';
import logger from '../../../common/utils/logger.util';
import { EditorialService } from './editorial.service';
import { ContextBuilderService } from './context-builder.service';
import { EnforcementService } from './enforcement.service';
import { EditorialVerdict } from './dto/editorial-verdict.dto';
import { POLICY_VERSION } from './editorial-prompts';
import { EmailService } from '../../../common/utils/email/email.service';
import { NotificationsService } from '../../notifications/notifications.service';

export interface ModerationJobData {
  contentType: string;
  contentId: string;
  authorId: string;
}

// Content types → source table + hidden columns config
const SOURCE_TABLE: Record<string, string> = {
  feed_post: 'feed_posts',
  feed_comment: 'feed_comments',
  forum_topic: 'forum_topics',
  forum_comment: 'forum_comments',
  nook: 'nooks',
  nook_message: 'nook_messages',
  referral_post: 'referral_posts',
  referral_comment: 'referral_comments',
};

// Minimum content length to send to LLM (saves API cost on trivial replies)
const MIN_CONTENT_LENGTH = 12;

@Injectable()
@Processor('moderation')
export class EditorialProcessor extends WorkerHost {
  private admin;
  private readonly moderationEnabled: boolean;

  constructor(
    private config: ConfigService,
    private editorial: EditorialService,
    private contextBuilder: ContextBuilderService,
    private enforcement: EnforcementService,
    private emailService: EmailService,
    private notificationsService: NotificationsService,
  ) {
    super();
    this.admin = supabaseAdmin(config);
    this.moderationEnabled =
      this.config.get<string>('MODERATION_ENABLED') === 'true';
  }

  async process(job: Job<ModerationJobData>): Promise<void> {
    if (!this.moderationEnabled) return;

    const { contentType, contentId, authorId } = job.data;
    const startTime = Date.now();

    logger.info('Moderation job started', {
      contentType,
      contentId,
      jobId: job.id,
    });

    try {
      // 1. Hard-override checks
      const skipReason = await this.checkHardOverrides(
        contentType,
        contentId,
        authorId,
      );
      if (skipReason) {
        await this.writeAuditRow(
          contentType,
          contentId,
          'allowed',
          `Skipped: ${skipReason}`,
          null,
          null,
        );
        logger.info('Moderation skipped', {
          contentType,
          contentId,
          reason: skipReason,
          duration: Date.now() - startTime,
        });
        return;
      }

      // 2. Build context payload
      const payload = await this.contextBuilder.buildPayload(
        contentType,
        contentId,
        authorId,
      );

      // 3. Skip trivial content (< MIN_CONTENT_LENGTH chars, no URLs)
      if (
        payload.subject.content.length < MIN_CONTENT_LENGTH &&
        !payload.subject.content.includes('http')
      ) {
        await this.writeAuditRow(
          contentType,
          contentId,
          'allowed',
          'Content below minimum length threshold',
          null,
          null,
        );
        return;
      }

      // 4. Call the LLM
      let verdict: EditorialVerdict | null;
      try {
        verdict = await this.editorial.judge(payload);
      } catch (err) {
        // LLM call failed — fail open: allow + queue for human review
        logger.error('LLM call failed, failing open', {
          contentType,
          contentId,
          error: err instanceof Error ? err.message : String(err),
        });

        await this.writeAuditRow(
          contentType,
          contentId,
          'pending_review',
          'LLM call failed — content left visible for human review',
          null,
          null,
        );
        await this.insertReviewQueue(
          contentType,
          contentId,
          'normal',
          'system_error',
          { verdict: 'escalate', confidence: 0, severity: 'none', categories: [], rationale: 'LLM unavailable', userFacingReason: null },
          payload,
          'visible',
        );
        return;
      }

      // 5. No verdict (API key missing) — skip
      if (!verdict) {
        await this.writeAuditRow(
          contentType,
          contentId,
          'allowed',
          'AI moderation not configured',
          null,
          null,
        );
        return;
      }

      // 6. Apply enforcement matrix
      logger.info('AI verdict received', {
        contentType,
        contentId,
        verdict: verdict.verdict,
        confidence: verdict.confidence,
        severity: verdict.severity,
        categories: verdict.categories,
      });
      const result = this.enforcement.decide(verdict);

      // 7. Write audit row (always)
      await this.writeAuditRow(
        contentType,
        contentId,
        result.moderationStatus,
        verdict.rationale,
        verdict,
        verdict.confidence,
      );

      // 8. Update source table if hiding/removing
      if (result.action === 'hide' || result.action === 'remove') {
        await this.updateSourceHidden(
          contentType,
          contentId,
          true,
          verdict.userFacingReason || verdict.rationale,
        );

        // Send notification + email to author
        this.notifyAuthor(
          authorId,
          contentType,
          contentId,
          result.action,
          verdict.userFacingReason || verdict.rationale,
          payload.subject.content,
        ).catch((err) =>
          logger.warn('Failed to notify author of moderation', { error: err }),
        );
      }

      // 9. Insert review queue if needed
      if (result.needsReview) {
        await this.insertReviewQueue(
          contentType,
          contentId,
          result.reviewPriority,
          result.reviewReason,
          verdict,
          payload,
          result.action === 'hide' || result.action === 'remove'
            ? 'hidden'
            : 'visible',
        );
      }

      // 10. Safety DM for crisis signals
      if (result.sendSafetyDm) {
        logger.warn('Crisis signal detected — sending safety resources', {
          contentType,
          contentId,
          authorId,
        });
        this.sendSafetyResources(authorId).catch((err) =>
          logger.warn('Failed to send safety resources', { error: err }),
        );
      }

      logger.info('Moderation job completed', {
        contentType,
        contentId,
        verdict: verdict.verdict,
        confidence: verdict.confidence,
        action: result.action,
        needsReview: result.needsReview,
        duration: Date.now() - startTime,
      });
    } catch (err) {
      // Catch-all: fail open — never crash the queue
      logger.error('Moderation job failed unexpectedly', {
        contentType,
        contentId,
        error: err instanceof Error ? err.message : String(err),
      });

      // Still write an audit row so the item shows up for review
      try {
        await this.writeAuditRow(
          contentType,
          contentId,
          'pending_review',
          'Processing error — content left visible for human review',
          null,
          null,
        );
      } catch {
        // If even the audit write fails, just log and move on
      }
    }
  }

  /**
   * Check hard overrides that skip moderation entirely.
   * Returns a reason string if skipping, null otherwise.
   */
  private async checkHardOverrides(
    contentType: string,
    contentId: string,
    authorId: string,
  ): Promise<string | null> {
    // Check if author is admin/moderator
    const { data: profile } = await this.admin
      .from('user_profiles')
      .select('role')
      .eq('id', authorId)
      .single();

    if (
      profile?.role &&
      ['admin', 'super_admin', 'moderator'].includes(profile.role)
    ) {
      return 'author_is_admin';
    }

    // Check if content is already hidden/removed by user flags
    const { data: existing } = await this.admin
      .from('content_moderation')
      .select('moderation_status')
      .eq('content_type', contentType)
      .eq('content_id', contentId)
      .maybeSingle();

    if (
      existing &&
      ['hidden', 'removed'].includes(existing.moderation_status)
    ) {
      return 'already_actioned';
    }

    // Skip nooks expiring in < 1 hour
    if (contentType === 'nook') {
      const { data: nook } = await this.admin
        .from('nooks')
        .select('expires_at')
        .eq('id', contentId)
        .single();

      if (nook?.expires_at) {
        const expiresIn =
          new Date(nook.expires_at).getTime() - Date.now();
        if (expiresIn < 60 * 60 * 1000) {
          return 'nook_expiring_soon';
        }
      }
    }

    // Skip nook messages in expiring nooks
    if (contentType === 'nook_message') {
      const { data: msg } = await this.admin
        .from('nook_messages')
        .select('nook_id')
        .eq('id', contentId)
        .single();

      if (msg) {
        const { data: nook } = await this.admin
          .from('nooks')
          .select('expires_at')
          .eq('id', msg.nook_id)
          .single();

        if (nook?.expires_at) {
          const expiresIn =
            new Date(nook.expires_at).getTime() - Date.now();
          if (expiresIn < 60 * 60 * 1000) {
            return 'nook_expiring_soon';
          }
        }
      }
    }

    return null;
  }

  /**
   * Write or update the content_moderation audit row.
   */
  private async writeAuditRow(
    contentType: string,
    contentId: string,
    status: string,
    reason: string,
    verdict: EditorialVerdict | null,
    confidence: number | null,
  ): Promise<void> {
    const now = new Date().toISOString();

    const { data: existing } = await this.admin
      .from('content_moderation')
      .select('id')
      .eq('content_type', contentType)
      .eq('content_id', contentId)
      .maybeSingle();

    const row = {
      moderation_status: status,
      moderation_reason: reason,
      moderated_by: 'ai:editorial',
      moderated_at: now,
      model_version: 'llama-3.1-8b-instruct-turbo',
      policy_version: POLICY_VERSION,
      raw_response: verdict ? JSON.stringify(verdict) : null,
      ai_confidence: confidence,
      updated_at: now,
    };

    if (existing) {
      await this.admin
        .from('content_moderation')
        .update(row)
        .eq('content_type', contentType)
        .eq('content_id', contentId);
    } else {
      await this.admin.from('content_moderation').insert({
        id: randomUUID(),
        content_type: contentType,
        content_id: contentId,
        ...row,
        created_at: now,
      });
    }
  }

  /**
   * Update the source table's is_hidden column.
   */
  private async updateSourceHidden(
    contentType: string,
    contentId: string,
    isHidden: boolean,
    reason: string,
  ): Promise<void> {
    const table = SOURCE_TABLE[contentType];
    if (!table) return;

    const update: Record<string, any> = { is_hidden: isHidden };

    if (isHidden) {
      update.hidden_by = null; // AI doesn't have a user UUID
      update.hidden_at = new Date().toISOString();
      update.hidden_reason = reason;
    } else {
      update.hidden_by = null;
      update.hidden_at = null;
      update.hidden_reason = null;
    }

    await this.admin.from(table).update(update).eq('id', contentId);
  }

  /**
   * Insert into moderation_review_queue for human review.
   */
  private async insertReviewQueue(
    contentType: string,
    contentId: string,
    priority: string,
    reason: string,
    aiVerdict: any,
    aiPayload: any,
    currentState: string,
  ): Promise<void> {
    // Upsert — if a review item already exists for this content, update it
    const { data: existing } = await this.admin
      .from('moderation_review_queue')
      .select('id')
      .eq('content_type', contentType)
      .eq('content_id', contentId)
      .maybeSingle();

    if (existing) {
      await this.admin
        .from('moderation_review_queue')
        .update({
          priority,
          reason,
          ai_verdict: aiVerdict,
          ai_payload: aiPayload,
          current_state: currentState,
          status: 'pending',
          claimed_by: null,
          resolved_by: null,
          resolution: null,
          resolution_reason: null,
          resolved_at: null,
        })
        .eq('id', existing.id);
    } else {
      await this.admin.from('moderation_review_queue').insert({
        id: randomUUID(),
        content_type: contentType,
        content_id: contentId,
        priority,
        reason,
        ai_verdict: aiVerdict,
        ai_payload: aiPayload,
        current_state: currentState,
        status: 'pending',
      });
    }
  }

  /**
   * Human-readable content type for emails/notifications.
   */
  private humanContentType(contentType: string): string {
    const map: Record<string, string> = {
      feed_post: 'post',
      feed_comment: 'comment',
      forum_topic: 'topic',
      forum_comment: 'comment',
      nook: 'nook',
      nook_message: 'message',
      referral_post: 'referral post',
      referral_comment: 'comment',
    };
    return map[contentType] || 'content';
  }

  /**
   * Notify the author when their content is hidden or removed.
   * Sends both an in-app notification and an email.
   */
  private async notifyAuthor(
    authorId: string,
    contentType: string,
    contentId: string,
    action: 'hide' | 'remove',
    reason: string,
    contentText: string,
  ): Promise<void> {
    const humanType = this.humanContentType(contentType);
    const preview = contentText?.substring(0, 100) || null;

    // In-app notification
    const title =
      action === 'remove'
        ? 'Content Removed'
        : 'Content Under Review';
    const message =
      action === 'remove'
        ? `Your ${humanType} has been removed for violating community guidelines.`
        : `Your ${humanType} is being reviewed by our moderation team.`;

    await this.notificationsService.createNotification({
      user_id: authorId,
      actor_id: undefined,
      type: action === 'remove' ? 'content_removed' : 'content_hidden',
      title,
      message,
      action_url: `/settings/moderation`,
      reference_id: contentId,
      reference_type: contentType,
      metadata: { reason },
      delivery_method: ['in_app'],
    });

    // Email (look up author's email)
    const { data: profile } = await this.admin
      .from('user_profiles')
      .select('email, username')
      .eq('id', authorId)
      .single();

    if (profile?.email) {
      if (action === 'remove') {
        await this.emailService.sendContentRemovedEmail(
          profile.email,
          profile.username,
          humanType,
          reason,
        );
      } else {
        await this.emailService.sendContentHiddenEmail(
          profile.email,
          profile.username,
          humanType,
          preview,
          reason,
        );
      }
    }
  }

  /**
   * Send safety resources to an author when crisis signals are detected.
   * Content is NOT hidden — this is purely a supportive outreach.
   */
  private async sendSafetyResources(authorId: string): Promise<void> {
    // In-app notification
    await this.notificationsService.createNotification({
      user_id: authorId,
      actor_id: undefined,
      type: 'safety_resources',
      title: 'We Care About You',
      message:
        'If you or someone you know is struggling, free confidential support is available. Call or text 988.',
      action_url: undefined,
      reference_id: undefined,
      reference_type: undefined,
      metadata: {},
      delivery_method: ['in_app'],
    });

    // Email
    const { data: profile } = await this.admin
      .from('user_profiles')
      .select('email, username')
      .eq('id', authorId)
      .single();

    if (profile?.email) {
      await this.emailService.sendSafetyResourcesEmail(
        profile.email,
        profile.username,
      );
    }
  }
}
