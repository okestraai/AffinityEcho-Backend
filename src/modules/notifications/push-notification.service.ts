import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../database/supabase.client';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  /**
   * Register a push token for a user
   */
  async registerToken(
    userId: string,
    token: string,
    platform: 'android' | 'ios',
    deviceName?: string,
  ) {
    // Upsert: if this token already exists, update the user/device info
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
    return { success: true, message: 'Push token registered', data };
  }

  /**
   * Remove a push token (e.g. on logout)
   */
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
    return { success: true, message: 'Push token removed' };
  }

  /**
   * Send push notification to a user's devices
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
    options?: { badge?: number; channelId?: string },
  ) {
    // Get all active tokens for this user
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

    const messages: ExpoPushMessage[] = tokens.map((t: any) => ({
      to: t.token,
      title,
      body,
      data,
      sound: 'default' as const,
      badge: options?.badge,
      channelId: options?.channelId || this.getChannelId(data?.type),
    }));

    await this.sendExpoPush(messages);
  }

  /**
   * Send push notifications to multiple users
   */
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

    const messages: ExpoPushMessage[] = tokens.map((t: any) => ({
      to: t.token,
      title,
      body,
      data,
      sound: 'default' as const,
      badge: options?.badge,
      channelId: options?.channelId || this.getChannelId(data?.type),
    }));

    await this.sendExpoPush(messages);
  }

  /**
   * Send messages to Expo Push API (batched in chunks of 100)
   */
  private async sendExpoPush(messages: ExpoPushMessage[]) {
    const EXPO_PUSH_URL =
      this.config.get<string>('EXPO_PUSH_URL') ||
      'https://exp.host/--/api/v2/push/send';
    const EXPO_ACCESS_TOKEN = this.config.get<string>('EXPO_ACCESS_TOKEN');
    const BATCH_SIZE = 100;

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);

      try {
        const headers: Record<string, string> = {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        };

        // Add Expo access token if configured (recommended for production)
        if (EXPO_ACCESS_TOKEN) {
          headers['Authorization'] = `Bearer ${EXPO_ACCESS_TOKEN}`;
        }

        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify(batch),
        });

        const result = await response.json() as any;

        if (result.data) {
          // Check for individual ticket errors (invalid tokens)
          const invalidTokens: string[] = [];
          result.data.forEach((ticket: any, index: number) => {
            if (ticket.status === 'error') {
              this.logger.warn(`Push failed for token: ${ticket.message}`, {
                token: batch[index].to,
                details: ticket.details,
              });
              // Remove invalid tokens (DeviceNotRegistered = uninstalled app)
              if (ticket.details?.error === 'DeviceNotRegistered') {
                invalidTokens.push(batch[index].to);
              }
            }
          });

          // Clean up invalid tokens
          if (invalidTokens.length > 0) {
            await this.removeInvalidTokens(invalidTokens);
          }
        }

        this.logger.debug(`Sent ${batch.length} push notifications`);
      } catch (error) {
        this.logger.error('Expo Push API request failed', { error });
      }
    }
  }

  /**
   * Remove tokens that Expo reports as invalid
   */
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
   * Map notification type to Android notification channel
   */
  private getChannelId(type?: string): string {
    if (!type) return 'default';

    const channelMap: Record<string, string> = {
      message_received: 'messages',
      mentorship_request: 'requests',
      mentorship_accepted: 'requests',
      mentorship_declined: 'requests',
      referral_connection: 'requests',
      identity_reveal_request: 'requests',
      identity_reveal: 'social',
      user_followed: 'social',
      user_unfollowed: 'social',
      forum_like: 'social',
      feed_like: 'social',
      referral_like: 'social',
      post_reaction: 'social',
      forum_comment: 'comments',
      referral_comment: 'comments',
      topic_comment: 'comments',
      nook_reply: 'comments',
      mention: 'mentions',
    };

    return channelMap[type] || 'default';
  }
}
