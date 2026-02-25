import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { ContentType } from '../interfaces/insights.interface';

@Injectable()
export class ContentHashService {
  private admin: SupabaseClient;

  constructor(private config: ConfigService) {
    this.admin = createClient(
      this.config.get<string>('SUPABASE_URL')!,
      this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
    );
  }

  async computeHash(
    contentType: ContentType,
    contentId: string,
  ): Promise<string> {
    if (contentType === 'topic') {
      return this.computeTopicHash(contentId);
    }
    return this.computeNookHash(contentId);
  }

  private async computeTopicHash(topicId: string): Promise<string> {
    const { data: topic } = await this.admin
      .from('forum_topics')
      .select(
        'title, content, comments_count, last_activity_at, reaction_seen_count, reaction_validated_count, reaction_inspired_count, reaction_heard_count',
      )
      .eq('id', topicId)
      .single();

    if (!topic) return '';

    const totalReactions =
      (topic.reaction_seen_count || 0) +
      (topic.reaction_validated_count || 0) +
      (topic.reaction_inspired_count || 0) +
      (topic.reaction_heard_count || 0);

    const input = `${topic.title}|${topic.content}|${topic.comments_count}|${topic.last_activity_at}|${totalReactions}`;
    return createHash('md5').update(input).digest('hex');
  }

  private async computeNookHash(nookId: string): Promise<string> {
    const { data: nook } = await this.admin
      .from('nooks')
      .select(
        'title, description, messages_count, last_activity_at, temperature',
      )
      .eq('id', nookId)
      .single();

    if (!nook) return '';

    const input = `${nook.title}|${nook.description}|${nook.messages_count}|${nook.last_activity_at}|${nook.temperature}`;
    return createHash('md5').update(input).digest('hex');
  }
}
