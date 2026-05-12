import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import logger from '../../../common/utils/logger.util';
import {
  EditorialVerdict,
  EnforcementResult,
} from './dto/editorial-verdict.dto';

// Categories where instant remove is allowed (high/critical + high confidence)
const INSTANT_REMOVE_CATEGORIES = new Set([
  'sexual', // when minors involved
  'threat', // with named target + explicit harm
  'doxing', // sharing PII to harm
  'spam', // high-severity commercial spam
]);

@Injectable()
export class EnforcementService {
  private readonly mode: string;
  private readonly autoRemoveConfidence: number;
  private readonly autoHideConfidence: number;

  constructor(private config: ConfigService) {
    this.mode =
      this.config.get<string>('MODERATION_MODE') || 'shadow';
    this.autoRemoveConfidence = parseFloat(
      this.config.get<string>(
        'MODERATION_AUTO_REMOVE_CONFIDENCE',
      ) || '0.90',
    );
    this.autoHideConfidence = parseFloat(
      this.config.get<string>('MODERATION_AUTO_HIDE_CONFIDENCE') ||
        '0.75',
    );
  }

  /**
   * Apply the enforcement matrix from §7 of the design doc.
   * Takes the AI verdict and returns what the platform should actually do.
   */
  decide(verdict: EditorialVerdict): EnforcementResult {
    // Crisis signal hard override — NEVER auto-remove, always route to human
    if (
      verdict.categories.includes('crisis_signal') ||
      (verdict.categories.includes('self_harm') &&
        ['medium', 'high', 'critical'].includes(verdict.severity))
    ) {
      return {
        action: 'allow',
        moderationStatus: 'pending_review',
        needsReview: true,
        reviewPriority: 'urgent',
        reviewReason: 'crisis_signal',
        sendSafetyDm: true,
      };
    }

    // Shadow mode — everything becomes pending_review, no enforcement
    if (this.mode === 'shadow') {
      return {
        action: 'allow',
        moderationStatus: 'pending_review',
        needsReview: true,
        reviewPriority: 'normal',
        reviewReason: 'shadow_mode',
        sendSafetyDm: false,
      };
    }

    // Apply the verdict × severity × confidence matrix
    switch (verdict.verdict) {
      case 'allow':
        return this.handleAllow(verdict);
      case 'hide':
        return this.handleHide(verdict);
      case 'remove':
        return this.handleRemove(verdict);
      case 'escalate':
        return this.handleEscalate();
      default:
        return this.handleEscalate();
    }
  }

  private handleAllow(verdict: EditorialVerdict): EnforcementResult {
    // High-confidence allow with low severity — instant allow, done
    if (
      verdict.confidence >= this.autoHideConfidence &&
      ['none', 'low'].includes(verdict.severity)
    ) {
      return {
        action: 'allow',
        moderationStatus: 'allowed',
        needsReview: false,
        reviewPriority: 'low',
        reviewReason: '',
        sendSafetyDm: false,
      };
    }

    // Allow but medium+ severity OR low confidence — allow + queue for review
    return {
      action: 'allow',
      moderationStatus: 'allowed',
      needsReview: true,
      reviewPriority:
        verdict.confidence < this.autoHideConfidence
          ? 'normal'
          : 'low',
      reviewReason:
        verdict.confidence < this.autoHideConfidence
          ? 'low_confidence_allow'
          : 'high_severity_allow',
      sendSafetyDm: false,
    };
  }

  private handleHide(verdict: EditorialVerdict): EnforcementResult {
    // allow_only mode — don't enforce hides
    if (this.mode === 'allow_only') {
      return {
        action: 'allow',
        moderationStatus: 'pending_review',
        needsReview: true,
        reviewPriority: 'normal',
        reviewReason: 'hide_in_allow_only_mode',
        sendSafetyDm: false,
      };
    }

    // Low confidence — downgrade to allow + review
    if (verdict.confidence < this.autoHideConfidence) {
      return {
        action: 'allow',
        moderationStatus: 'pending_review',
        needsReview: true,
        reviewPriority: 'normal',
        reviewReason: 'low_confidence_hide',
        sendSafetyDm: false,
      };
    }

    // High-confidence hide
    const isHighSeverity = ['high', 'critical'].includes(
      verdict.severity,
    );

    return {
      action: 'hide',
      moderationStatus: 'hidden',
      needsReview: true,
      reviewPriority: isHighSeverity ? 'high' : 'normal',
      reviewReason: isHighSeverity
        ? 'high_severity_hide'
        : 'auto_hide',
      sendSafetyDm: false,
    };
  }

  private handleRemove(
    verdict: EditorialVerdict,
  ): EnforcementResult {
    // allow_only or hide_enabled mode — don't enforce removes
    if (this.mode === 'allow_only' || this.mode === 'hide_enabled') {
      return {
        action:
          this.mode === 'hide_enabled' &&
          verdict.confidence >= this.autoHideConfidence
            ? 'hide'
            : 'allow',
        moderationStatus: 'pending_review',
        needsReview: true,
        reviewPriority: 'high',
        reviewReason: 'remove_downgraded_by_mode',
        sendSafetyDm: false,
      };
    }

    // Low/medium severity — always downgrade to hide + review
    if (['low', 'medium'].includes(verdict.severity)) {
      return {
        action:
          verdict.confidence >= this.autoHideConfidence
            ? 'hide'
            : 'allow',
        moderationStatus:
          verdict.confidence >= this.autoHideConfidence
            ? 'hidden'
            : 'pending_review',
        needsReview: true,
        reviewPriority: 'high',
        reviewReason: 'remove_downgraded_low_severity',
        sendSafetyDm: false,
      };
    }

    // High severity — check confidence + category
    if (verdict.severity === 'high') {
      const hasInstantCategory = verdict.categories.some((c) =>
        INSTANT_REMOVE_CATEGORIES.has(c),
      );

      if (
        verdict.confidence >= this.autoRemoveConfidence &&
        hasInstantCategory
      ) {
        return {
          action: 'remove',
          moderationStatus: 'removed',
          needsReview: false,
          reviewPriority: 'high',
          reviewReason: 'instant_remove',
          sendSafetyDm: false,
        };
      }

      // Not confident enough or not in instant-remove list
      return {
        action: 'hide',
        moderationStatus: 'hidden',
        needsReview: true,
        reviewPriority: 'high',
        reviewReason: 'high_severity_remove_needs_review',
        sendSafetyDm: false,
      };
    }

    // Critical severity
    if (verdict.severity === 'critical') {
      const hasInstantCategory = verdict.categories.some((c) =>
        INSTANT_REMOVE_CATEGORIES.has(c),
      );

      if (
        verdict.confidence >= 0.85 &&
        hasInstantCategory
      ) {
        logger.warn('Instant remove — critical severity', {
          categories: verdict.categories,
          confidence: verdict.confidence,
        });

        return {
          action: 'remove',
          moderationStatus: 'removed',
          needsReview: true,
          reviewPriority: 'urgent',
          reviewReason: 'critical_instant_remove',
          sendSafetyDm: false,
        };
      }

      // Not confident enough
      return {
        action: 'hide',
        moderationStatus: 'hidden',
        needsReview: true,
        reviewPriority: 'urgent',
        reviewReason: 'critical_needs_review',
        sendSafetyDm: false,
      };
    }

    // Fallback — hide + review
    return {
      action: 'hide',
      moderationStatus: 'hidden',
      needsReview: true,
      reviewPriority: 'high',
      reviewReason: 'remove_fallback',
      sendSafetyDm: false,
    };
  }

  private handleEscalate(): EnforcementResult {
    return {
      action: 'allow',
      moderationStatus: 'pending_review',
      needsReview: true,
      reviewPriority: 'normal',
      reviewReason: 'ai_escalated',
      sendSafetyDm: false,
    };
  }
}
