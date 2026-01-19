import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class LockNookDto {
  @ApiProperty({
    description: 'Reason for locking the nook',
    example: 'Inappropriate content',
  })
  @IsString()
  reason!: string;
}
