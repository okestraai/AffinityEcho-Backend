import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
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

    // Event and storage values are checked strictly; the older sections keep their free-form shape.
    if (key === 'events') value = checkEventSettings(value);
    if (key === 'storage')
      value = checkStorageSettings(
        value,
        coverBucketStatus(this.config).bucketReady,
      );

    // Fetch current value and merge (partial update)
    const { data: existing } = await this.admin
      .from('system_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    const merged = { ...(existing?.value ?? {}), ...value };

    const { data, error } = await this.admin
      .from('system_settings')
      .upsert(
        {
          key,
          value: merged,
          updated_by: adminId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      )
      .select('key, value, updated_at')
      .single();

    if (error) throw new BadRequestException(error.message);
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
