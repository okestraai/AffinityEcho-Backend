import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsString, IsOptional } from 'class-validator';

export class BookmarkDto {
  @ApiProperty({ description: 'User ID to bookmark' })
  @IsUUID()
  bookmarkedUserId!: string;

  @ApiProperty({ description: 'Bookmark notes', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
