import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, IsUUID } from 'class-validator';

export class CreateRequestNotificationDto {
  @ApiProperty({
    description: 'Target user ID',
  })
  @IsUUID()
  targetUserId!: string;

  @ApiProperty({ description: 'Message to accompany the request' })
  @IsString()
  message!: string;

  @ApiProperty({
    description: 'Request type hint',
    enum: ['mentorship', 'connection', 'general'],
    required: false,
  })
  @IsOptional()
  @IsIn(['mentorship', 'connection', 'general'])
  type?: string;
}
