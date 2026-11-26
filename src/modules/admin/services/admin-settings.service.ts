import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { getPool } from '../../../database/pg-client';
import logger from '../../../common/utils/logger.util';
import { AdminUsersService } from './admin-users.service';
import {
  EVENT_DEFAULTS,
  STORAGE_DEFAULTS,
  checkEventSettings,
  checkStorageSettings,
  clearEventSettingsCache,
} from '../../events/event-settings';
import { coverBucketStatus } from '../../events/cover-bucket';

const VALID_KEYS = [
  'general',
  'security',
  'notifications',
  'moderation',
  'events',
  'storage',
] as const;
type SettingKey = (typeof VALID_KEYS)[number];

@Injectable()
export class AdminSettingsService {
  private admin;

  constructor(
    private config: ConfigService,
    private adminUsers: AdminUsersService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async getSettings() {
    const { data, error } = await this.admin
      .from('system_settings')
      .select('key, value, updated_by, updated_at')
      .in('key', [...VALID_KEYS]);

    if (error) throw new BadRequestException(error.message);

    const settings: Record<string, any> = {
      events: { ...EVENT_DEFAULTS },
      storage: { ...STORAGE_DEFAULTS },
    };
    for (const row of data ?? []) {
      settings[row.key] =
        row.key === 'events' || row.key === 'storage'
          ? { ...settings[row.key], ...row.value }
          : row.value;
    }
    // Read only: set on the server, shown so admins know whether the bucket can be chosen.
    settings.storage_status = coverBucketStatus(this.config);

    return { success: true, data: settings };
  }

  async updateSettings(
    adminId: string,
    adminUsername: string,
    key: SettingKey,
    value: Record<string, any>,
    ip?: string,
  ) {
    if (!VALID_KEYS.includes(key)) {
      throw new BadRequestException(
        `Invalid settings key. Must be one of: ${VALID_KEYS.join(', ')}`,
      );
    }

    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('Settings must be sent as an object');

    // Event and storage values are checked strictly; the older sections keep their free-form shape.
    if (key === 'events') value = checkEventSettings(value);
    if (key === 'storage')
      value = checkStorageSettings(
        value,
        coverBucketStatus(this.config).bucketReady,
      );

    // Merged inside the database in one step, so two admins saving at once both keep their change.
    let data: {
      key: string;
      value: Record<string, unknown>;
      updated_at: string;
    };
    try {
      const { rows } = await getPool().query(
        `INSERT INTO system_settings (key, value, updated_by, updated_at)
         VALUES ($1, $2::jsonb, $3, now())
         ON CONFLICT (key) DO UPDATE
           SET value = system_settings.value || EXCLUDED.value,
               updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING key, value, updated_at`,
        [key, JSON.stringify(value ?? {}), adminId],
      );
      data = rows[0];
    } catch (err: any) {
      logger.error('Settings save failed', { key, error: err?.message });
      throw new BadRequestException('Could not save the settings');
    }
    if (key === 'events' || key === 'storage') clearEventSettingsCache();

    await this.adminUsers.logAction(
      adminId,
      adminUsername,
      'update_settings',
      'settings',
      key,
      undefined,
      { key, changes: value },
      ip,
    );

    return { success: true, data };
  }
}
