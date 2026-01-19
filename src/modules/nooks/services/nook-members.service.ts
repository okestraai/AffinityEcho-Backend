import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JoinNookDto } from '../dto/join-nook.dto';
import { supabaseAdmin } from '../../../database/supabase.client';

@Injectable()
export class NookMembersService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async join(nookId: string, userId: string, joinDto: JoinNookDto) {
    const { is_anonymous = true, notifications_enabled = true } = joinDto;

    // Check nook exists and is active
    const { data: nook, error: nookError } = await this.admin
      .from('nooks')
      .select('*')
      .eq('id', nookId)
      .single();

    if (nookError || !nook) throw new NotFoundException('Nook not found');

    if (!nook.is_active || nook.is_locked) {
      throw new BadRequestException('Nook is not active or is locked');
    }

    if (new Date(nook.expires_at) < new Date()) {
      throw new BadRequestException('Nook has expired');
    }

    // Check if already a member
    const { data: existingMembership } = await this.admin
      .from('nook_members')
      .select('id')
      .eq('nook_id', nookId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingMembership) {
      throw new BadRequestException('You are already a member of this nook');
    }

    // Create membership
    const { data: membership, error: createError } = await this.admin
      .from('nook_members')
      .insert([
        {
          nook_id: nookId,
          user_id: userId,
          is_anonymous,
          notifications_enabled,
        },
      ])
      .select(
        `
        id,
        nook_id,
        user_id,
        joined_at
      `,
      )
      .single();

    if (createError) throw new BadRequestException(createError.message);

    // Update nook member count
    await this.admin
      .from('nooks')
      .update({
        members_count: (nook.members_count || 0) + 1,
      })
      .eq('id', nookId);

    return {
      success: true,
      data: { membership },
      message: 'Successfully joined the nook',
    };
  }

  async leave(nookId: string, userId: string) {
    const { data: nook, error: nookError } = await this.admin
      .from('nooks')
      .select('creator_id, members_count')
      .eq('id', nookId)
      .single();

    if (nookError || !nook) throw new NotFoundException('Nook not found');

    // Check if user is creator (creators cannot leave)
    if (nook.creator_id === userId) {
      throw new BadRequestException('Creator cannot leave the nook');
    }

    const { data: membership, error: membershipError } = await this.admin
      .from('nook_members')
      .select('id')
      .eq('nook_id', nookId)
      .eq('user_id', userId)
      .maybeSingle();

    if (membershipError || !membership) {
      throw new BadRequestException('You are not a member of this nook');
    }

    // Delete membership
    const { error: deleteError } = await this.admin
      .from('nook_members')
      .delete()
      .eq('nook_id', nookId)
      .eq('user_id', userId);

    if (deleteError) throw new BadRequestException(deleteError.message);

    // Update nook member count
    await this.admin
      .from('nooks')
      .update({
        members_count: Math.max(0, (nook.members_count || 1) - 1),
      })
      .eq('id', nookId);

    return {
      success: true,
      message: 'Successfully left the nook',
    };
  }

  async getMembers(nookId: string) {
    const { data: nook, error: nookError } = await this.admin
      .from('nooks')
      .select('id')
      .eq('id', nookId)
      .single();

    if (nookError || !nook) throw new NotFoundException('Nook not found');

    const { data: members, error: membersError } = await this.admin
      .from('nook_members')
      .select(
        `
        id,
        user_id,
        joined_at,
        messages_sent,
        last_read_at
      `,
      )
      .eq('nook_id', nookId)
      .order('joined_at', { ascending: false });

    if (membersError) throw new BadRequestException(membersError.message);

    return {
      success: true,
      data: {
        members: members || [],
        total: members?.length || 0,
      },
    };
  }
}
