import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString, Length } from 'class-validator';

export class AddCompanyDto {
  @ApiProperty({ example: 'Dangote Group' })
  @IsString()
  @Length(2, 120)
  name!: string;
}

export class SetCompanyActiveDto {
  @ApiProperty({
    example: false,
    description: 'false hides it from onboarding',
  })
  @IsBoolean()
  is_active!: boolean;
}
