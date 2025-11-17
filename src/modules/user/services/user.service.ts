// src/user/services/user.service.ts
import { Injectable } from '@nestjs/common';
import { supabaseClient } from '../../../database/supabase.client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UserService {
  private supabase;

  constructor(private config: ConfigService) {
    this.supabase = supabaseClient(config);
  }

  async getProfile(userId: string) {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .select('*')
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
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}