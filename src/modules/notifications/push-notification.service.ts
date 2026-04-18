import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../database/supabase.client';
import * as admin from 'firebase-admin';
import { MSG } from '../../common/constants/messages';

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private admin;
  private firebaseApp: admin.app.App | null = null;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
    this.initFirebase();
  }

  // ─── Firebase Init ────────────────────────────────────────────────────────

  private initFirebase() {
    try {
      const raw = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT');
      if (!raw) {
        this.logger.warn(
          'FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled',
        );
        return;
      }

      const serviceAccount = JSON.parse(raw);

      // Avoid re-initialising if app already exists (e.g. hot reload)
      if (admin.apps.length > 0) {
        this.firebaseApp = admin.apps[0]!;
      } else {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }

      this.logger.log('Firebase Admin SDK initialised');
    } catch (error) {
      this.logger.error('Failed to initialise Firebase Admin SDK', { error });
    }
  }

  // ─── Token Management ─────────────────────────────────────────────────────

  async registerToken(
    userId: string,
    token: string,
    platform: 'android' | 'ios',
    deviceName?: string,
  ) {
    const { data, error } = await this.admin
      .from('push_tokens')
      .upsert(
        {
          user_id: userId,
          token,
          platform,
          device_name: deviceName || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'token' },
      )
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to register push token', { error, userId });
      throw error;
    }

    this.logger.log(`Push token registered for user ${userId} (${platform})`);
    return { success: true, message: MSG.NOTIFICATION.TOKEN_REGISTERED, data };
  }

  async removeToken(userId: string, token: string) {
    const { error } = await this.admin
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', token);

    if (error) {
      this.logger.error('Failed to remove push token', { error, userId });
      throw error;
    }

    this.logger.log(`Push token removed for user ${userId}`);
    return { success: true, message: MSG.NOTIFICATION.TOKEN_REMOVED };
  }

  // ─── Send to User ─────────────────────────────────────────────────────────

  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
    options?: { badge?: number; channelId?: string },
  ) {
    const { data: tokens, error } = await this.admin
      .from('push_tokens')
      .select('token, platform')
      .eq('user_id', userId);

    if (error) {
      this.logger.error('Failed to fetch push tokens', { error, userId });
      return;
    }

    if (!tokens || tokens.length === 0) {
      this.logger.debug(`No push tokens for user ${userId}, skipping push`);
      return;
    }

    const fcmTokens = tokens
      .map((t: any) => t.token)
      .filter((t: string) => this.isFcmToken(t));

    if (fcmTokens.length === 0) {
      this.logger.debug(
        `No FCM tokens for user ${userId} (may still be Expo tokens)`,
      );
      return;
    }

    const channelId =
      options?.channelId || this.getChannelId(data?.type as string);

    await this.sendFcm(fcmTokens, title, body, data, {
      badge: options?.badge,
      channelId,
    });
  }

  async sendToUsers(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, any>,
    options?: { badge?: number; channelId?: string },
  ) {
    if (userIds.length === 0) return;

    const { data: tokens, error } = await this.admin
      .from('push_tokens')
      .select('token, platform, user_id')
      .in('user_id', userIds);

    if (error || !tokens || tokens.length === 0) return;

    const fcmTokens = tokens
      .map((t: any) => t.token)
      .filter((t: string) => this.isFcmToken(t));

    if (fcmTokens.length === 0) return;

    const channelId =
      options?.channelId || this.getChannelId(data?.type as string);

    await this.sendFcm(fcmTokens, title, body, data, {
      badge: options?.badge,
      channelId,
    });
  }

  // ─── FCM Send ─────────────────────────────────────────────────────────────

  private async sendFcm(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, any>,
    options?: { badge?: number; channelId?: string },
  ) {
    if (!this.firebaseApp) {
      this.logger.warn('Firebase not initialised — skipping push');
      return;
    }

    // FCM data payload values must all be strings
    const stringData: Record<string, string> = {};
    if (data) {
      for (const [k, v] of Object.entries(data)) {
        if (v !== null && v !== undefined) {
          stringData[k] =
            typeof v === 'object' ? JSON.stringify(v) : String(v);
        }
      }
    }

    const channelId = options?.channelId || 'default-v2';
    const BATCH_SIZE = 500;

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);

      try {
        const message: admin.messaging.MulticastMessage = {
          tokens: batch,
          notification: { title, body },
          data: stringData,
          android: {
            priority: 'high',
            notification: {
              channelId,
              sound: 'notification',
              priority: 'high',
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'notification.wav',
                badge: options?.badge ?? 1,
                'content-available': 1,
              },
            },
          },
        };

        const response = await admin
          .messaging(this.firebaseApp)
          .sendEachForMulticast(message);

        this.logger.debug(
          `FCM batch sent: ${response.successCount} ok, ${response.failureCount} failed`,
        );

        // Clean up dead tokens
        const deadTokens: string[] = [];
        response.responses.forEach((res, idx) => {
          if (!res.success) {
            const code = res.error?.code;
            this.logger.warn(
              `FCM send failed for a token: ${res.error?.message}`,
              {
                code,
              },
            );
            if (
              code === 'messaging/registration-token-not-registered' ||
              code === 'messaging/invalid-registration-token'
            ) {
              deadTokens.push(batch[idx]);
            }
          }
        });

        if (deadTokens.length > 0) {
          await this.removeInvalidTokens(deadTokens);
        }
      } catch (error) {
        this.logger.error('FCM batch send failed', { error });
      }
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Expo tokens look like ExponentPushToken[xxxxx].
   * FCM tokens are long alphanumeric strings (100–200 chars).
   * During the migration period we skip Expo tokens so they don't error.
   */
  private isFcmToken(token: string): boolean {
    return !token.startsWith('ExponentPushToken');
  }

  private async removeInvalidTokens(tokens: string[]) {
    const { error } = await this.admin
      .from('push_tokens')
      .delete()
      .in('token', tokens);

    if (error) {
      this.logger.error('Failed to clean up invalid tokens', { error });
    } else {
      this.logger.log(`Cleaned up ${tokens.length} invalid push tokens`);
    }
  }

  /**
   * Map notification type to Android notification channel.
   * These must match the channels registered in the mobile app.
   */
  private getChannelId(type?: string): string {
    if (!type) return 'default-v2';

    const channelMap: Record<string, string> = {
      message_received: 'messages-v2',
      new_message: 'messages-v2',
      message: 'messages-v2',
      mentorship_request: 'mentorship-v2',
      mentorship_accepted: 'mentorship-v2',
      mentorship_declined: 'mentorship-v2',
      nook_message: 'messages-v2',
    };

    return channelMap[type] || 'default-v2';
  }
}
