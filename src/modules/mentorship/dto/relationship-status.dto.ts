import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsIn,
} from 'class-validator';

export class RelationshipStatusDto {
  @ApiProperty({
    description: 'Action to perform',
    enum: ['accept', 'decline', 'complete', 'cancel'],
  })
  @IsString()
  @IsIn(['accept', 'decline', 'complete', 'cancel'])
  action!: string;

  @ApiProperty({ description: 'Reason for action', required: false })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({
    description: 'Rating (1-5)',
    required: false,
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiProperty({ description: 'Feedback', required: false })
  @IsOptional()
  @IsString()
  feedback?: string;

  @ApiProperty({ description: 'Additional notes', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
