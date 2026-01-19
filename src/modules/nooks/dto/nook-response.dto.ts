import { ApiProperty } from '@nestjs/swagger';

export class NookResponseDto {
  @ApiProperty({ description: 'Success status' })
  success!: boolean;

  @ApiProperty({ description: 'Response data' })
  data!: any;

  @ApiProperty({ description: 'Response message', required: false })
  message?: string;

  @ApiProperty({ description: 'Pagination info', required: false })
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
