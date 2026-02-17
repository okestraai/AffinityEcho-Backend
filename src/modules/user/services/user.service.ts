// src/user/services/user.service.ts
import { Injectable } from '@nestjs/common';
import { supabaseClient } from '../../../database/supabase.client';
import { ConfigService } from '@nestjs/config';
import { USER_PROFILE_OWN_FIELDS } from '../../../common/constants/select-fields';

@Injectable()
export class UserService {
  private supabase;

  constructor(private config: ConfigService) {
    this.supabase = supabaseClient(config);
  }

  async getProfile(userId: string) {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .select(USER_PROFILE_OWN_FIELDS)
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  }

  async updateProfile(userId: string, updates: any) {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', userId)
      .select(USER_PROFILE_OWN_FIELDS)
      .single();

    if (error) throw error;
    return data;
  }
}