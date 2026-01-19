import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendConnectionRequestDto {
  @ApiPropertyOptional({ example: "Hi! I'm very interested..." })
  @IsOptional()
  @IsString()
  message?: string;
}

export class UpdateConnectionProgressDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  referralSubmitted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  interviewScheduled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  offerReceived?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  outcomeNotes?: string;
}

export class AddConnectionNotesDto {
  @ApiProperty({ example: 'Very strong candidate...' })
  @IsString()
  notes!: string;

  @ApiProperty({ enum: ['sender', 'receiver'] })
  @IsEnum(['sender', 'receiver'])
  noteType!: 'sender' | 'receiver';
}
