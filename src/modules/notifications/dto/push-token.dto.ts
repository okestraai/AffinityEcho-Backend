import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, Matches } from 'class-validator';

export class RegisterPushTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxx]' })
  @IsString()
  @Matches(/^ExponentPushToken\[.+\]$/, {
    message: 'token must be a valid Expo push token (ExponentPushToken[...])',
  })
  token!: string;

  @ApiProperty({ example: 'android', enum: ['android', 'ios'] })
  @IsString()
  @IsIn(['android', 'ios'])
  platform!: 'android' | 'ios';

  @ApiProperty({ example: 'Pixel 7', required: false })
  @IsOptional()
  @IsString()
  device_name?: string;
}

export class RemovePushTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxx]' })
  @IsString()
  @Matches(/^ExponentPushToken\[.+\]$/, {
    message: 'token must be a valid Expo push token (ExponentPushToken[...])',
  })
  token!: string;
}
