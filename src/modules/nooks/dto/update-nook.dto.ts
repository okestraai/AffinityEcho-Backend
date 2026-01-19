import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { CreateNookDto } from './create-nook.dto';

export class UpdateNookDto extends PartialType(CreateNookDto) {
  @ApiProperty({
    description: 'Whether the nook is active',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiProperty({
    description: 'Temperature status',
    example: 'hot',
    required: false,
  })
  @IsOptional()
  @IsString()
  temperature?: string;
}
