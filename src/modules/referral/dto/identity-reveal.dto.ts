import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RequestIdentityRevealDto {
  @ApiPropertyOptional({ example: "I'd like to continue our conversation..." })
  @IsOptional()
  @IsString()
  message?: string;
}
