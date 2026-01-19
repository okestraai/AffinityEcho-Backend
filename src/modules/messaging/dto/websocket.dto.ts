import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WebSocketEventDto {
  @ApiProperty({ description: 'Event type' })
  event!: string;

  @ApiPropertyOptional({ description: 'Event payload' })
  payload?: any;

  @ApiPropertyOptional({ description: 'Event timestamp' })
  timestamp?: Date;
}

export class WebSocketMessageDto {
  @ApiProperty({ description: 'Message ID' })
  id!: string;

  @ApiProperty({ description: 'Conversation ID' })
  conversation_id!: string;

  @ApiProperty({ description: 'Sender ID' })
  sender_id!: string;

  @ApiProperty({ description: 'Encrypted content' })
  content_encrypted!: string;

  @ApiProperty({ enum: ['text', 'file'] })
  content_type!: string;

  @ApiProperty({ description: 'Sent timestamp' })
  sent_at!: Date;

  @ApiPropertyOptional({ description: 'Sender info' })
  sender_info?: any;
}
