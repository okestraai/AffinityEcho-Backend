import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsEnum } from 'class-validator';

export enum IdentityRevealStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

export class RequestIdentityRevealDto {
  @ApiProperty({ description: 'Conversation ID' })
  @IsUUID()
  conversation_id!: string;

  @ApiPropertyOptional({ description: 'Optional message with request' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({
    description: 'Connection ID (for referral connections)',
  })
  @IsOptional()
  @IsUUID()
  connection_id?: string;
}

export class RespondIdentityRevealDto {
  @ApiProperty({ description: 'Reveal ID' })
  @IsUUID()
  reveal_id!: string;

  @ApiProperty({
    enum: ['accept', 'reject', 'accepted', 'rejected'],
    description: 'Response action',
  })
  @IsEnum(['accept', 'reject', 'accepted', 'rejected'])
  action!: string;

  @ApiPropertyOptional({ description: 'Optional reason for rejection' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class GetIdentityRevealsDto {
  @ApiPropertyOptional({
    enum: IdentityRevealStatus,
    default: 'all',
    description: 'Filter by status',
  })
  @IsOptional()
  @IsEnum(['all', 'pending', 'accepted', 'rejected'])
  status?: string = 'all';
}
