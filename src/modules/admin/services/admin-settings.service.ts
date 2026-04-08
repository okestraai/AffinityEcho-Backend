import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { AdminUsersService } from './admin-users.service';

const VALID_KEYS = [
  'general',
  'security',
  'notifications',
  'moderation',
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

    const settings: Record<string, any> = {};
    for (const row of data ?? []) {
      settings[row.key] = row.value;
    }

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
