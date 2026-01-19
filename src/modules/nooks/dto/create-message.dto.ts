import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsUUID } from 'class-validator';

export class CreateMessageDto {
  @ApiProperty({
    description: 'Message content',
    example: 'I have experience with this, happy to help!',
  })
  @IsString()
  content!: string;

  @ApiProperty({
    description: 'Parent message ID for replies',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  parent_message_id?: string;

  @ApiProperty({
    description: 'Whether the message is anonymous',
    example: true,
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  is_anonymous?: boolean = true;
}
