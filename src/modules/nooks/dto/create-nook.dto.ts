import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsArray,
  MaxLength,
  IsOptional,
} from 'class-validator';

export enum Urgency {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum Scope {
  COMPANY = 'company',
  GLOBAL = 'global',
}

export class CreateNookDto {
  @ApiProperty({
    description: 'Nook title (max 200 characters)',
    example: 'Need advice on career transition',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    description: 'Nook description',
    example:
      'Looking for guidance on moving from engineering to product management',
  })
  @IsString()
  description!: string;

  @ApiProperty({
    description: 'Urgency level',
    enum: Urgency,
    example: Urgency.MEDIUM,
  })
  @IsEnum(Urgency)
  urgency!: Urgency;

  @ApiProperty({
    description: 'Scope of the nook',
    enum: Scope,
    example: Scope.COMPANY,
  })
  @IsEnum(Scope)
  scope!: Scope;

  @ApiProperty({
    description: 'Optional hashtags',
    example: ['career', 'transition', 'advice'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];
}
