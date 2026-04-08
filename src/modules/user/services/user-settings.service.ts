import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import logger from '../../../common/utils/logger.util';
import {
  UpdatePrivacySettingsDto,
  UpdateNotificationSettingsDto,
} from '../dto/update-profile.dto';

@Injectable()
export class UserSettingsService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  // ============ PRIVACY SETTINGS ============

  async getPrivacySettings(userId: string) {
    logger.info('Fetching privacy settings', { userId });

    try {
      const { data: settings, error } = await this.admin
        .from('user_profiles')
        .select(
          `
          profile_visibility,
          show_email,
          show_company,
          show_location,
          allow_messages_from,
          show_activity,
          show_connections
        `,
        )
        .eq('id', userId)
        .single();

      if (error) {
        logger.warn('Could not fetch privacy settings, returning defaults', {
          userId,
          error: error.message,
        });
      }

      return {
        success: true,
        data: {
          profileVisibility: settings?.profile_visibility || 'public',
          showEmail: settings?.show_email ?? false,
          showCompany: settings?.show_company ?? true,
          showLocation: settings?.show_location ?? true,
          allowMessagesFrom: settings?.allow_messages_from || 'everyone',
          showActivity: settings?.show_activity ?? true,
          showConnections: settings?.show_connections ?? true,
        },
      };
    } catch (error) {
      logger.error('Failed to fetch privacy settings', { error });
      throw new BadRequestException('Failed to fetch privacy settings');
    }
  }

  async updatePrivacySettings(userId: string, dto: UpdatePrivacySettingsDto) {
    logger.info('Updating privacy settings', { userId });

    try {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (dto.profileVisibility !== undefined) {
        updateData.profile_visibility = dto.profileVisibility;
      }
      if (dto.showEmail !== undefined) {
        updateData.show_email = dto.showEmail;
      }
      if (dto.showCompany !== undefined) {
        updateData.show_company = dto.showCompany;
      }
      if (dto.showLocation !== undefined) {
        updateData.show_location = dto.showLocation;
      }
      if (dto.allowMessagesFrom !== undefined) {
        updateData.allow_messages_from = dto.allowMessagesFrom;
      }
      if (dto.showActivity !== undefined) {
        updateData.show_activity = dto.showActivity;
      }
      if (dto.showConnections !== undefined) {
        updateData.show_connections = dto.showConnections;
      }

      const { error } = await this.admin
        .from('user_profiles')
        .update(updateData)
        .eq('id', userId);

      if (error) {
        throw new BadRequestException('Failed to update privacy settings');
      }

      return {
        success: true,
        message: 'Privacy settings updated successfully',
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      logger.error('Failed to update privacy settings', { error });
      throw new BadRequestException('Failed to update privacy settings');
    }
  }

  // ============ NOTIFICATION SETTINGS ============

  async getNotificationSettings(userId: string) {
    logger.info('Fetching notification settings', { userId });

    try {
      const { data: settings, error } = await this.admin
        .from('user_profiles')
        .select(
          `
          email_notifications,
          push_notifications,
          notify_on_comment,
          notify_on_like,
          notify_on_follow,
          notify_on_mention,
          notify_on_message,
          notify_on_connection_request,
          digest_frequency
        `,
        )
        .eq('id', userId)
        .single();

      if (error) {
        logger.warn(
          'Could not fetch notification settings, returning defaults',
          { userId, error: error.message },
        );
      }

      return {
        success: true,
        data: {
          emailNotifications: settings?.email_notifications ?? true,
          pushNotifications: settings?.push_notifications ?? true,
          notifyOnComment: settings?.notify_on_comment ?? true,
          notifyOnLike: settings?.notify_on_like ?? true,
          notifyOnFollow: settings?.notify_on_follow ?? true,
          notifyOnMention: settings?.notify_on_mention ?? true,
          notifyOnMessage: settings?.notify_on_message ?? true,
          notifyOnConnectionRequest:
            settings?.notify_on_connection_request ?? true,
          digestFrequency: settings?.digest_frequency || 'daily',
        },
      };
    } catch (error) {
      logger.error('Failed to fetch notification settings', { error });
      throw new BadRequestException('Failed to fetch notification settings');
    }
  }

  async updateNotificationSettings(
    userId: string,
    dto: UpdateNotificationSettingsDto,
  ) {
    logger.info('Updating notification settings', { userId });

    try {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (dto.emailNotifications !== undefined) {
        updateData.email_notifications = dto.emailNotifications;
      }
      if (dto.pushNotifications !== undefined) {
        updateData.push_notifications = dto.pushNotifications;
      }
      if (dto.notifyOnComment !== undefined) {
        updateData.notify_on_comment = dto.notifyOnComment;
      }
      if (dto.notifyOnLike !== undefined) {
        updateData.notify_on_like = dto.notifyOnLike;
      }
      if (dto.notifyOnFollow !== undefined) {
        updateData.notify_on_follow = dto.notifyOnFollow;
      }
      if (dto.notifyOnMention !== undefined) {
        updateData.notify_on_mention = dto.notifyOnMention;
      }
      if (dto.notifyOnMessage !== undefined) {
        updateData.notify_on_message = dto.notifyOnMessage;
      }
      if (dto.notifyOnConnectionRequest !== undefined) {
        updateData.notify_on_connection_request = dto.notifyOnConnectionRequest;
      }
      if (dto.digestFrequency !== undefined) {
        updateData.digest_frequency = dto.digestFrequency;
      }

      const { error } = await this.admin
        .from('user_profiles')
        .update(updateData)
        .eq('id', userId);

      if (error) {
        throw new BadRequestException('Failed to update notification settings');
      }

      return {
        success: true,
        message: 'Notification settings updated successfully',
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      logger.error('Failed to update notification settings', { error });
      throw new BadRequestException('Failed to update notification settings');
    }
  }
}
