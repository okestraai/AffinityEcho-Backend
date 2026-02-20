import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReactionDto } from '../dto/reaction.dto';
import { supabaseAdmin } from '../../../database/supabase.client';

interface MessageReactionCounts {
  heard_count?: number;
  validated_count?: number;
  helpful_count?: number;
  supportive_count?: number;
  inspired_count?: number;
  [key: string]: any;
}

@Injectable()
export class NookReactionsService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  // ── NOOK-LEVEL REACTIONS ────────────────────────────────────────────────

  async reactToNook(nookId: string, userId: string, reactionDto: ReactionDto) {
    const { reaction_type } = reactionDto;

    const validReactions = ['heard', 'validated', 'inspired'];
    if (!validReactions.includes(reaction_type)) {
      throw new BadRequestException(
        `Invalid reaction type. Valid: ${validReactions.join(', ')}`,
      );
    }

    const { data: nook, error: nookError } = await this.admin
      .from('nooks')
      .select('id')
      .eq('id', nookId)
      .single();

    if (nookError || !nook) throw new NotFoundException('Nook not found');

    // Check if already reacted
    const { data: existing } = await this.admin
      .from('nook_reactions')
      .select('id')
      .eq('nook_id', nookId)
      .eq('user_id', userId)
      .eq('reaction_type', reaction_type)
      .maybeSingle();

    if (existing) {
      throw new BadRequestException('You already reacted with this type');
    }

    const { data: reaction, error } = await this.admin
      .from('nook_reactions')
      .insert([{ nook_id: nookId, user_id: userId, reaction_type }])
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    return { success: true, data: { reaction } };
  }

  async removeNookReaction(
    nookId: string,
    userId: string,
    reactionType: string,
  ) {
    const { data: reaction, error: fetchError } = await this.admin
      .from('nook_reactions')
      .select('id')
      .eq('nook_id', nookId)
      .eq('user_id', userId)
      .eq('reaction_type', reactionType)
      .maybeSingle();

    if (fetchError || !reaction) {
      throw new NotFoundException('Reaction not found or not yours');
    }

    const { error } = await this.admin
      .from('nook_reactions')
      .delete()
      .eq('id', reaction.id);

    if (error) throw new BadRequestException(error.message);

    return { success: true, message: 'Reaction removed successfully' };
  }

  // ── MESSAGE-LEVEL REACTIONS (TOGGLE) ────────────────────────────────────

  async toggleMessageReaction(
    messageId: string,
    userId: string,
    reactionDto: ReactionDto,
  ) {
    const { reaction_type } = reactionDto;

    const validReactions = ['heard', 'validated', 'helpful', 'supportive', 'inspired'];
    if (!validReactions.includes(reaction_type)) {
      throw new BadRequestException(
        `Invalid reaction type. Valid: ${validReactions.join(', ')}`,
      );
    }

    // 1. Get message + nook
    const { data: message, error: msgErr } = await this.admin
      .from('nook_messages')
      .select('id, nook_id')
      .eq('id', messageId)
      .single();

    if (msgErr || !message) throw new NotFoundException('Message not found');

    const { data: nook, error: nookErr } = await this.admin
      .from('nooks')
      .select('id, creator_id')
      .eq('id', message.nook_id)
      .single();

    if (nookErr || !nook) throw new NotFoundException('Nook not found');

    const isCreator = nook.creator_id === userId;

    // 2. Check if reaction already exists
    const { data: existingReaction } = await this.admin
      .from('nook_message_reactions')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('reaction_type', reaction_type)
      .maybeSingle();

    // 4. Get current counts
    const { data: fullMessage, error: countErr } = await this.admin
      .from('nook_messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (countErr || !fullMessage)
      throw new NotFoundException('Message not found');

    let action: 'added' | 'removed';

    if (existingReaction) {
      // REMOVE
      const { error: delErr } = await this.admin
        .from('nook_message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .eq('reaction_type', reaction_type);

      if (delErr) throw new BadRequestException(delErr.message);

      const countField =
        `${reaction_type}_count` as keyof MessageReactionCounts;
      const current = (fullMessage as MessageReactionCounts)[countField] ?? 0;

      await this.admin
        .from('nook_messages')
        .update({ [countField]: Math.max(0, current - 1) })
        .eq('id', messageId);

      action = 'removed';
    } else {
      // ADD
      const { data: reaction, error: insErr } = await this.admin
        .from('nook_message_reactions')
        .insert([{ message_id: messageId, user_id: userId, reaction_type }])
        .select()
        .single();

      if (insErr) throw new BadRequestException(insErr.message);

      const countField =
        `${reaction_type}_count` as keyof MessageReactionCounts;
      const current = (fullMessage as MessageReactionCounts)[countField] ?? 0;

      await this.admin
        .from('nook_messages')
        .update({ [countField]: current + 1 })
        .eq('id', messageId);

      action = 'added';
    }

    return {
      success: true,
      data: {
        action,
        reaction_type,
        message_id: messageId,
      },
    };
  }
}
