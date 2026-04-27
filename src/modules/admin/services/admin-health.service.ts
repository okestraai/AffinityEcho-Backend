import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import logger from '../../../common/utils/logger.util';
import * as jwt from 'jsonwebtoken';

type ModuleStatus = 'up' | 'down';

export interface ModuleHealth {
  status: ModuleStatus;
  latency_ms: number | null;
  error?: string;
  details?: Record<string, any>;
  resolution?: string;
}

/**
 * Resolution guidance per module — shown to support staff when a module is down
 */
const RESOLUTION_GUIDE: Record<string, string> = {
  database:
    'Check Supabase dashboard for outages. Verify SUPABASE_URL and SUPABASE_SERVICE_KEY in .env. If connection times out, check firewall rules and connection pool limits.',
  auth: 'Verify JWT_SECRET is set in .env. If token signing fails, the secret may have been rotated — redeploy with the correct value.',
  feed: 'Database table "feed_posts" is unreachable. Check database connection. If the table was dropped or renamed, run prisma migrate deploy.',
  forum:
    'Database table "forum_topics" is unreachable. Check database connection. If the table was dropped or renamed, run prisma migrate deploy.',
  nooks:
    'Database table "nooks" is unreachable. Check database connection. If the table was dropped or renamed, run prisma migrate deploy.',
  messaging:
    'Database table "conversations" is unreachable. Check database connection. WebSocket gateway may also be affected — check server logs for WS errors.',
  mentorship:
    'Database table "mentorship_relationships" is unreachable. Check database connection.',
  notifications:
    'Database table "notifications" is unreachable. Check database connection.',
  email:
    'SMTP credentials are missing or invalid. Verify SMTP_HOST, SMTP_USER, and SMTP_PASS in .env. Test with a manual SMTP connection to confirm the mail provider is up.',
  push_notifications:
    'Firebase service account is not configured. Set FIREBASE_SERVICE_ACCOUNT in .env with the full JSON contents of your Firebase service account key file.',
  encryption:
    'Encryption key is invalid or missing. Verify ENCRYPTION_KEY in .env is a valid base64-encoded 32-byte key. If the key was rotated, existing encrypted data will not decrypt.',
};

@Injectable()
export class AdminHealthService {
  private admin;
  private startTime = Date.now();

  constructor(
    private config: ConfigService,
    private encryption: EncryptionUtil,
  ) {
    this.admin = supabaseAdmin(config);
  }

  /**
   * Live health check for all modules
   */
  async getHealth() {
    const modules: Record<string, ModuleHealth> = {};

    // Run all checks in parallel
    const [
      database,
      auth,
      feed,
      forum,
      nooks,
      messaging,
      mentorship,
      notifications,
      email,
      push,
      encryptionCheck,
    ] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkAuth(),
      this.checkTable('feed_posts', 'feed'),
      this.checkTable('forum_topics', 'forum'),
      this.checkTable('nooks', 'nooks'),
      this.checkTable('conversations', 'messaging'),
      this.checkTable('mentorship_relationships', 'mentorship'),
      this.checkTable('notifications', 'notifications'),
      this.checkEmail(),
      this.checkPush(),
      this.checkEncryption(),
    ]);

    modules.database = this.unwrap(database);
    modules.auth = this.unwrap(auth);
    modules.feed = this.unwrap(feed);
    modules.forum = this.unwrap(forum);
    modules.nooks = this.unwrap(nooks);
    modules.messaging = this.unwrap(messaging);
    modules.mentorship = this.unwrap(mentorship);
    modules.notifications = this.unwrap(notifications);
    modules.email = this.unwrap(email);
    modules.push_notifications = this.unwrap(push);
    modules.encryption = this.unwrap(encryptionCheck);

    // Attach resolution guidance for any module that's down
    for (const [name, health] of Object.entries(modules)) {
      if (health.status === 'down' && RESOLUTION_GUIDE[name]) {
        health.resolution = RESOLUTION_GUIDE[name];
      }
    }

    // Calculate overall status
    const criticalModules = ['database', 'auth'];
    const criticalDown = criticalModules.some(
      (m) => modules[m]?.status === 'down',
    );
    const anyDown = Object.values(modules).some((m) => m.status === 'down');

    let overall: 'up' | 'degraded' | 'down' = 'up';
    if (criticalDown) overall = 'down';
    else if (anyDown) overall = 'degraded';

    return {
      success: true,
      data: {
        status: overall,
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
        modules,
      },
    };
  }

  /**
   * Store health check result to DB (called by cron)
   */
  async storeHealthCheck() {
    try {
      const health = await this.getHealth();
      const modules = health.data.modules;

      const rows = Object.entries(modules).map(([module, data]) => ({
        module,
        status: data.status,
        latency_ms: data.latency_ms,
        error: data.error || null,
        checked_at: new Date().toISOString(),
      }));

      await this.admin.from('health_checks').insert(rows);

      // Auto-alert: check if any module has been down for 3+ consecutive checks
      for (const [module, data] of Object.entries(modules)) {
        if (data.status === 'down') {
          const { data: recentChecks } = await this.admin
            .from('health_checks')
            .select('status')
            .eq('module', module)
            .order('checked_at', { ascending: false })
            .limit(3);

          if (
            recentChecks &&
            recentChecks.length >= 3 &&
            recentChecks.every((c: any) => c.status === 'down')
          ) {
            // Create admin notification
            await this.admin.from('admin_notifications').insert({
              title: `Module Down: ${module}`,
              body: `The ${module} module has been down for 3 consecutive health checks. Error: ${data.error || 'Unknown'}`,
              type: 'alert',
              audience: 'admins',
              status: 'sent',
              sent_at: new Date().toISOString(),
              created_by: null,
            });
            logger.warn(`Health alert: ${module} down for 3+ checks`, {
              error: data.error,
            });
          }
        }
      }

      // Cleanup: remove checks older than 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      await this.admin
        .from('health_checks')
        .delete()
        .lt('checked_at', sevenDaysAgo);
    } catch (error: any) {
      logger.error('Failed to store health check', { error: error.message });
    }
  }

  /**
   * Health check history — last 24 hours
   */
  async getHistory() {
    try {
      const since = new Date(Date.now() - 24 * 3600000).toISOString();
      const { data, error } = await this.admin
        .from('health_checks')
        .select('module, status, latency_ms, error, checked_at')
        .gte('checked_at', since)
        .order('checked_at', { ascending: true });

      if (error) throw error;

      // Group by module
      const history: Record<
        string,
        Array<{ status: string; latency_ms: number | null; checked_at: string }>
      > = {};
      (data || []).forEach((row: any) => {
        if (!history[row.module]) history[row.module] = [];
        history[row.module].push({
          status: row.status,
          latency_ms: row.latency_ms,
          checked_at: row.checked_at,
        });
      });

      // Calculate uptime percentage per module
      const uptime: Record<string, string> = {};
      for (const [module, checks] of Object.entries(history)) {
        const upChecks = checks.filter((c) => c.status === 'up').length;
        uptime[module] = `${Math.round((upChecks / checks.length) * 100)}%`;
      }

      return {
        success: true,
        data: {
          period: '24h',
          uptime,
          history,
        },
      };
    } catch (error: any) {
      logger.error('Failed to get health history', { error: error.message });
      throw error;
    }
  }

  // ─── Individual module checks ───────────────────────────

  private async checkDatabase(): Promise<ModuleHealth> {
    const start = Date.now();
    try {
      const { error } = await this.admin
        .from('user_profiles')
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return { status: 'up', latency_ms: Date.now() - start };
    } catch (e: any) {
      return { status: 'down', latency_ms: null, error: e.message };
    }
  }

  private async checkAuth(): Promise<ModuleHealth> {
    const start = Date.now();
    try {
      const secret = this.config.get<string>('JWT_SECRET');
      if (!secret) throw new Error('JWT_SECRET not configured');
      const token = jwt.sign({ test: true }, secret, { expiresIn: '5s' });
      jwt.verify(token, secret);
      return { status: 'up', latency_ms: Date.now() - start };
    } catch (e: any) {
      return { status: 'down', latency_ms: null, error: e.message };
    }
  }

  private async checkTable(
    table: string,
    module: string,
  ): Promise<ModuleHealth> {
    const start = Date.now();
    try {
      const { error } = await this.admin
        .from(table)
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return { status: 'up', latency_ms: Date.now() - start };
    } catch (e: any) {
      return { status: 'down', latency_ms: null, error: e.message };
    }
  }

  private async checkEmail(): Promise<ModuleHealth> {
    const start = Date.now();
    try {
      const smtpHost = this.config.get<string>('SMTP_HOST');
      const smtpUser = this.config.get<string>('SMTP_USER');
      const smtpPass = this.config.get<string>('SMTP_PASS');
      if (!smtpHost || !smtpUser || !smtpPass)
        throw new Error('SMTP credentials not configured (SMTP_HOST, SMTP_USER, or SMTP_PASS missing)');
      return {
        status: 'up',
        latency_ms: Date.now() - start,
        details: { provider: 'smtp', host: smtpHost },
      };
    } catch (e: any) {
      return { status: 'down', latency_ms: null, error: e.message };
    }
  }

  private async checkPush(): Promise<ModuleHealth> {
    const start = Date.now();
    try {
      const firebaseConfig = this.config.get<string>(
        'FIREBASE_SERVICE_ACCOUNT',
      );
      if (!firebaseConfig)
        throw new Error('FIREBASE_SERVICE_ACCOUNT not configured');
      return {
        status: 'up',
        latency_ms: Date.now() - start,
        details: { provider: 'fcm' },
      };
    } catch (e: any) {
      return { status: 'down', latency_ms: null, error: e.message };
    }
  }

  private async checkEncryption(): Promise<ModuleHealth> {
    const start = Date.now();
    try {
      const testData = 'health_check_test';
      const encrypted = this.encryption.encrypt(testData);
      const decrypted = this.encryption.decrypt(encrypted);
      if (decrypted !== testData) throw new Error('Encrypt/decrypt mismatch');
      return { status: 'up', latency_ms: Date.now() - start };
    } catch (e: any) {
      return { status: 'down', latency_ms: null, error: e.message };
    }
  }

  private unwrap(result: PromiseSettledResult<ModuleHealth>): ModuleHealth {
    if (result.status === 'fulfilled') return result.value;
    return {
      status: 'down',
      latency_ms: null,
      error: result.reason?.message || 'Unknown error',
    };
  }
}
