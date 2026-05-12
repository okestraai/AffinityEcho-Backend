import { EnforcementService } from '../../modules/content-safety/editorial/enforcement.service';
import { createMockConfigService } from '../helpers/mock-supabase';
import { EditorialVerdict } from '../../modules/content-safety/editorial/dto/editorial-verdict.dto';

describe('EnforcementService', () => {
  let service: EnforcementService;

  const baseVerdict: EditorialVerdict = {
    verdict: 'allow',
    confidence: 0.95,
    severity: 'none',
    categories: ['safe'],
    rationale: 'No policy concern.',
    userFacingReason: null,
  };

  function makeVerdict(overrides: Partial<EditorialVerdict>): EditorialVerdict {
    return { ...baseVerdict, ...overrides };
  }

  function createService(mode = 'full') {
    const config = createMockConfigService({
      MODERATION_MODE: mode,
      MODERATION_AUTO_REMOVE_CONFIDENCE: '0.90',
      MODERATION_AUTO_HIDE_CONFIDENCE: '0.75',
    });
    return new EnforcementService(config as any);
  }

  beforeEach(() => {
    service = createService('full');
  });

  // ─── CRISIS SIGNAL OVERRIDE ─────────────────────────────────

  describe('crisis signal override', () => {
    it('should always allow + urgent review + safety DM for crisis_signal', () => {
      const result = service.decide(
        makeVerdict({ verdict: 'remove', confidence: 0.99, severity: 'critical', categories: ['crisis_signal'] }),
      );
      expect(result.action).toBe('allow');
      expect(result.needsReview).toBe(true);
      expect(result.reviewPriority).toBe('urgent');
      expect(result.reviewReason).toBe('crisis_signal');
      expect(result.sendSafetyDm).toBe(true);
    });

    it('should trigger for self_harm with medium+ severity', () => {
      const result = service.decide(
        makeVerdict({ verdict: 'hide', severity: 'medium', categories: ['self_harm'] }),
      );
      expect(result.action).toBe('allow');
      expect(result.sendSafetyDm).toBe(true);
      expect(result.reviewPriority).toBe('urgent');
    });

    it('should NOT trigger for self_harm with low severity', () => {
      const result = service.decide(
        makeVerdict({ verdict: 'allow', severity: 'low', categories: ['self_harm'] }),
      );
      expect(result.sendSafetyDm).toBe(false);
    });
  });

  // ─── SHADOW MODE ────────────────────────────────────────────

  describe('shadow mode', () => {
    it('should always allow + pending_review in shadow mode', () => {
      const svc = createService('shadow');
      const result = svc.decide(
        makeVerdict({ verdict: 'remove', confidence: 0.99, severity: 'critical', categories: ['threat'] }),
      );
      // Crisis override still takes priority
      // For non-crisis:
      const result2 = svc.decide(
        makeVerdict({ verdict: 'remove', confidence: 0.99, severity: 'high', categories: ['spam'] }),
      );
      expect(result2.action).toBe('allow');
      expect(result2.moderationStatus).toBe('pending_review');
      expect(result2.reviewReason).toBe('shadow_mode');
    });

    it('should still trigger crisis override even in shadow mode', () => {
      const svc = createService('shadow');
      const result = svc.decide(
        makeVerdict({ categories: ['crisis_signal'] }),
      );
      expect(result.sendSafetyDm).toBe(true);
      expect(result.reviewPriority).toBe('urgent');
    });
  });

  // ─── ALLOW VERDICT ──────────────────────────────────────────

  describe('allow verdict', () => {
    it('should instant allow for high confidence + low severity', () => {
      const result = service.decide(
        makeVerdict({ verdict: 'allow', confidence: 0.92, severity: 'none', categories: ['safe'] }),
      );
      expect(result.action).toBe('allow');
      expect(result.moderationStatus).toBe('allowed');
      expect(result.needsReview).toBe(false);
    });

    it('should allow + review for low confidence', () => {
      const result = service.decide(
        makeVerdict({ verdict: 'allow', confidence: 0.60, severity: 'none' }),
      );
      expect(result.action).toBe('allow');
      expect(result.needsReview).toBe(true);
      expect(result.reviewReason).toBe('low_confidence_allow');
    });

    it('should allow + review for medium severity even with high confidence', () => {
      const result = service.decide(
        makeVerdict({ verdict: 'allow', confidence: 0.95, severity: 'medium' }),
      );
      expect(result.action).toBe('allow');
      expect(result.needsReview).toBe(true);
      expect(result.reviewReason).toBe('high_severity_allow');
    });
  });

  // ─── HIDE VERDICT ───────────────────────────────────────────

  describe('hide verdict', () => {
    it('should instant hide for high confidence + low severity', () => {
      const result = service.decide(
        makeVerdict({ verdict: 'hide', confidence: 0.85, severity: 'low' }),
      );
      expect(result.action).toBe('hide');
      expect(result.moderationStatus).toBe('hidden');
      expect(result.needsReview).toBe(true);
      expect(result.reviewPriority).toBe('normal');
    });

    it('should instant hide with high priority for high severity', () => {
      const result = service.decide(
        makeVerdict({ verdict: 'hide', confidence: 0.88, severity: 'high' }),
      );
      expect(result.action).toBe('hide');
      expect(result.reviewPriority).toBe('high');
    });

    it('should downgrade to allow for low confidence hide', () => {
      const result = service.decide(
        makeVerdict({ verdict: 'hide', confidence: 0.60, severity: 'medium' }),
      );
      expect(result.action).toBe('allow');
      expect(result.moderationStatus).toBe('pending_review');
      expect(result.reviewReason).toBe('low_confidence_hide');
    });

    it('should downgrade to allow in allow_only mode', () => {
      const svc = createService('allow_only');
      const result = svc.decide(
        makeVerdict({ verdict: 'hide', confidence: 0.95, severity: 'high' }),
      );
      expect(result.action).toBe('allow');
      expect(result.reviewReason).toBe('hide_in_allow_only_mode');
    });
  });

  // ─── REMOVE VERDICT ────────────────────────────────────────

  describe('remove verdict', () => {
    it('should downgrade low severity remove to hide', () => {
      const result = service.decide(
        makeVerdict({ verdict: 'remove', confidence: 0.95, severity: 'low', categories: ['spam'] }),
      );
      expect(result.action).toBe('hide');
      expect(result.needsReview).toBe(true);
      expect(result.reviewReason).toBe('remove_downgraded_low_severity');
    });

    it('should instant remove for high severity + high confidence + instant-remove category', () => {
      const result = service.decide(
        makeVerdict({ verdict: 'remove', confidence: 0.95, severity: 'high', categories: ['threat'] }),
      );
      expect(result.action).toBe('remove');
      expect(result.moderationStatus).toBe('removed');
      expect(result.needsReview).toBe(false);
    });

    it('should downgrade to hide when category not in instant-remove list', () => {
      const result = service.decide(
        makeVerdict({ verdict: 'remove', confidence: 0.95, severity: 'high', categories: ['harassment'] }),
      );
      expect(result.action).toBe('hide');
      expect(result.needsReview).toBe(true);
      expect(result.reviewPriority).toBe('high');
    });

    it('should downgrade to hide when confidence below threshold', () => {
      const result = service.decide(
        makeVerdict({ verdict: 'remove', confidence: 0.85, severity: 'high', categories: ['threat'] }),
      );
      expect(result.action).toBe('hide');
      expect(result.needsReview).toBe(true);
    });

    it('should instant remove for critical severity + 0.85 confidence + instant category', () => {
      const result = service.decide(
        makeVerdict({ verdict: 'remove', confidence: 0.88, severity: 'critical', categories: ['sexual'] }),
      );
      expect(result.action).toBe('remove');
      expect(result.moderationStatus).toBe('removed');
      expect(result.reviewPriority).toBe('urgent');
      expect(result.needsReview).toBe(true); // critical always reviewed
    });

    it('should downgrade critical to hide when confidence below 0.85', () => {
      const result = service.decide(
        makeVerdict({ verdict: 'remove', confidence: 0.80, severity: 'critical', categories: ['doxing'] }),
      );
      expect(result.action).toBe('hide');
      expect(result.reviewPriority).toBe('urgent');
    });

    it('should downgrade remove in allow_only mode', () => {
      const svc = createService('allow_only');
      const result = svc.decide(
        makeVerdict({ verdict: 'remove', confidence: 0.99, severity: 'critical', categories: ['threat'] }),
      );
      expect(result.action).toBe('allow');
      expect(result.reviewReason).toBe('remove_downgraded_by_mode');
    });

    it('should downgrade remove to hide in hide_enabled mode', () => {
      const svc = createService('hide_enabled');
      const result = svc.decide(
        makeVerdict({ verdict: 'remove', confidence: 0.95, severity: 'high', categories: ['threat'] }),
      );
      expect(result.action).toBe('hide');
      expect(result.reviewReason).toBe('remove_downgraded_by_mode');
    });

    it('should test all 4 instant-remove categories', () => {
      for (const cat of ['sexual', 'threat', 'doxing', 'spam']) {
        const result = service.decide(
          makeVerdict({ verdict: 'remove', confidence: 0.95, severity: 'high', categories: [cat] }),
        );
        expect(result.action).toBe('remove');
      }
    });
  });

  // ─── ESCALATE VERDICT ───────────────────────────────────────

  describe('escalate verdict', () => {
    it('should allow + normal review for escalate', () => {
      const result = service.decide(
        makeVerdict({ verdict: 'escalate', confidence: 0.40 }),
      );
      expect(result.action).toBe('allow');
      expect(result.moderationStatus).toBe('pending_review');
      expect(result.needsReview).toBe(true);
      expect(result.reviewReason).toBe('ai_escalated');
    });
  });

  // ─── UNKNOWN VERDICT ───────────────────────────────────────

  describe('unknown verdict', () => {
    it('should treat unknown verdict as escalate', () => {
      const result = service.decide(
        makeVerdict({ verdict: 'something_weird' as any }),
      );
      expect(result.action).toBe('allow');
      expect(result.reviewReason).toBe('ai_escalated');
    });
  });
});
