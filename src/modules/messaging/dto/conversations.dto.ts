import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsEnum,
  IsOptional,
  IsNumber,
  IsBoolean,
} from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({ description: 'User ID to start conversation with' })
  @IsUUID()
  other_user_id!: string;

  @ApiProperty({
    enum: ['regular', 'mentorship'],
    description: 'Type of conversation',
  })
  @IsEnum(['regular', 'mentorship'])
  context_type!: string;

  @ApiPropertyOptional({
    description: 'Context ID (e.g., mentorship_relationship_id)',
  })
  @IsOptional()
  @IsUUID()
  context_id?: string;

  @ApiPropertyOptional({ description: 'Initial message' })
  @IsOptional()
  @IsString()
  initial_message?: string;
}

export class GetConversationsDto {
  @ApiPropertyOptional({
    enum: ['all', 'regular', 'mentorship'],
    default: 'all',
    description: 'Filter by chat type',
  })
  @IsOptional()
  @IsEnum(['all', 'regular', 'mentorship'])
  chat_type?: string = 'all';

  @ApiPropertyOptional({
    default: 20,
    description: 'Number of conversations to fetch',
  })
  @IsOptional()
  @IsNumber()
  limit?: number = 20;

  @ApiPropertyOptional({ default: 0, description: 'Offset for pagination' })
  @IsOptional()
  @IsNumber()
  offset?: number = 0;

  @ApiPropertyOptional({ description: 'Search term' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class ClearConversationDto {
  @ApiProperty({ description: 'Conversation ID' })
  @IsUUID()
  conversation_id!: string;
}

export class ConversationFiltersDto {
  @ApiPropertyOptional({ description: 'Filter by unread messages only' })
  @IsOptional()
  @IsBoolean()
  unread_only?: boolean;

  @ApiPropertyOptional({ description: 'Filter by identity revealed status' })
  @IsOptional()
  @IsBoolean()
  identity_revealed?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by mentorship status',
    enum: ['active', 'pending', 'completed'],
  })
  @IsOptional()
  @IsString()
  mentorship_status?: string;
}
