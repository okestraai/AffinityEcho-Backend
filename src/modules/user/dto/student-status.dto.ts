import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

const THIS_YEAR = new Date().getFullYear();

export class StudentStatusDto {
  @ApiProperty({ description: 'Answer to "Still a student?"', example: true })
  @IsBoolean()
  stillStudent!: boolean;

  @ApiPropertyOptional({
    description: 'Updated year you expect to finish; null clears it',
    example: THIS_YEAR + 1,
  })
  @IsOptional()
  @IsInt()
  @Min(THIS_YEAR)
  @Max(THIS_YEAR + 8)
  expectedGradYear?: number | null;
}
