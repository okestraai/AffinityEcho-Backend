import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsObject,
} from 'class-validator';

export class CreateNotificationDto {
  @ApiProperty({ example: 'uuid-user-id' })
  @IsString()
  user_id!: string;

  @ApiProperty({ example: 'uuid-actor-id', required: false })
  @IsOptional()
  @IsString()
  actor_id?: string;

  @ApiProperty({
    example: 'mentorship_request',
    description: 'Type of notification',
    enum: [
      'follow',
      'forum_post',
      'forum_comment',
      'forum_like',
      'mentorship_request',
      'mentorship_accepted',
      'mentorship_declined',
      'nook_post',
      'nook_message',
      'referral_connection',
      'referral_comment',
      'referral_like',
      'identity_reveal',
      'identity_reveal_request',
      'message_received',
      'mention',
      'report_status_update',
      'post_reaction',
      'topic_comment',
      'nook_reply',
      'feed_like',
      'user_followed',
      'user_unfollowed',
      'followed_user_post',
    ],
  })
  @IsString()
  type!: string;

  @ApiProperty({ example: 'New Mentorship Request' })
  @IsString()
  title!: string;

  @ApiProperty({ example: 'John Doe has requested you as their mentor' })
  @IsString()
  message!: string;

  @ApiProperty({ example: '/dashboard/mentorship', required: false })
  @IsOptional()
  @IsString()
  action_url?: string;

  @ApiProperty({ example: 'uuid-reference-id', required: false })
  @IsOptional()
  @IsString()
  reference_id?: string;

  @ApiProperty({ example: 'mentorship', required: false })
  @IsOptional()
  @IsString()
  reference_type?: string;

  @ApiProperty({ example: {}, required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiProperty({ example: ['in_app', 'email'], default: ['in_app'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  delivery_method?: string[];
}
