import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsEnum,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsNotEmpty,
} from 'class-validator';

export enum ChatType {
  ALL = 'all', // Add this
  REGULAR = 'regular',
  MENTORSHIP = 'mentorship',
}

export enum ContentType {
  TEXT = 'text',
  FILE = 'file',
}

export class SendMessageDto {
  @ApiProperty({ description: 'Conversation ID' })
  @IsUUID()
  conversation_id!: string;

  @ApiProperty({ description: 'Encrypted message content' })
  @IsString()
  content_encrypted!: string;

  @ApiProperty({ enum: ContentType, default: ContentType.TEXT })
  @IsEnum(ContentType)
  content_type: ContentType = ContentType.TEXT;

  @ApiPropertyOptional({ description: 'File URL if content_type is file' })
  @IsOptional()
  @IsString()
  file_url?: string;

  @ApiPropertyOptional({ description: 'File name' })
  @IsOptional()
  @IsString()
  file_name?: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  @IsOptional()
  @IsNumber()
  file_size?: number;

  @ApiPropertyOptional({ description: 'File type' })
  @IsOptional()
  @IsString()
  file_type?: string;

  @ApiPropertyOptional({ description: 'Message ID to reply to' })
  @IsOptional()
  @IsUUID()
  reply_to?: string;

  @ApiProperty({ enum: ChatType, description: 'Type of chat' })
  @IsEnum(ChatType)
  chat_type!: ChatType;
}

export class MarkAsReadDto {
  @ApiProperty({ description: 'Message ID' })
  @IsUUID()
  message_id!: string;

  @ApiProperty({ description: 'Conversation ID' })
  @IsUUID()
  conversation_id!: string;
}

export class TypingIndicatorDto {
  @ApiProperty({ description: 'Conversation ID' })
  @IsUUID()
  conversation_id!: string;

  @ApiProperty({ description: 'Whether user is typing' })
  @IsBoolean()
  is_typing!: boolean;
}

export class GetMessagesDto {
  @ApiProperty({ description: 'Conversation ID' })
  @IsUUID()
  conversation_id!: string;

  @ApiPropertyOptional({
    default: 50,
    description: 'Number of messages to fetch',
  })
  @IsOptional()
  @IsNumber()
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Get messages before this message ID' })
  @IsOptional()
  @IsUUID()
  before?: string;
}

export class TypingStatusDto {
  @ApiProperty({
    description: 'Conversation ID',
    example: 'uuid',
  })
  @IsNotEmpty()
  @IsString()
  conversation_id!: string;

  @ApiProperty({
    description: 'Whether the user is typing',
    example: true,
  })
  @IsNotEmpty()
  @IsBoolean()
  is_typing!: boolean;
}
