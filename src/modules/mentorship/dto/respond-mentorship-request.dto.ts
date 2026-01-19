import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn, IsOptional } from 'class-validator';

export class RespondMentorshipRequestDto {
  @ApiProperty({ description: 'Response action', enum: ['accept', 'decline'] })
  @IsIn(['accept', 'decline'])
  action!: string;

  @ApiProperty({ description: 'Response message', required: false })
  @IsOptional()
  @IsString()
  message?: string;
}
