import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  username?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  job_title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  linkedin_url?: string;
}

export class UpdateAvatarDto {
  @ApiProperty({ description: 'Avatar emoji or image URL' })
  @IsString()
  avatar!: string;
}

export class UpdateUsernameDto {
  @ApiProperty({ description: 'New username' })
  @IsString()
  @MaxLength(50)
  username!: string;
}

export class UpdatePrivacySettingsDto {
  @ApiProperty({
    description: 'Who can view your profile (public | connections | private)',
    required: false,
    example: 'public',
  })
  @IsOptional()
  @IsString()
  profileVisibility?: 'public' | 'connections' | 'private';

  @ApiProperty({
    description: 'Show email address on profile',
    required: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  showEmail?: boolean;

  @ApiProperty({
    description: 'Show company on profile',
    required: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  showCompany?: boolean;

  @ApiProperty({
    description: 'Show location on profile',
    required: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  showLocation?: boolean;

  @ApiProperty({
    description: 'Who can send you messages (everyone | connections | no_one)',
    required: false,
    example: 'everyone',
  })
  @IsOptional()
  @IsString()
  allowMessagesFrom?: 'everyone' | 'connections' | 'no_one';

  @ApiProperty({
    description: 'Show your activity feed on profile',
    required: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  showActivity?: boolean;

  @ApiProperty({
    description: 'Show your connections/followers on profile',
    required: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  showConnections?: boolean;
}

export class UpdateNotificationSettingsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  pushNotifications?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  notifyOnComment?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  notifyOnLike?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  notifyOnFollow?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  notifyOnMention?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  notifyOnMessage?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  notifyOnConnectionRequest?: boolean;

  @ApiProperty({
    description: 'Digest frequency (daily | weekly | never)',
    required: false,
  })
  @IsOptional()
  @IsString()
  digestFrequency?: 'daily' | 'weekly' | 'never';
}

export class DeactivateAccountDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class DeleteAccountDto {
  @ApiProperty({ description: 'Confirmation to delete account' })
  @IsBoolean()
  confirmDeletion!: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class BlockUserDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReactivateAccountDto {
  @ApiProperty({
    description: 'Confirmation to reactivate account',
    example: true,
  })
  @IsBoolean()
  confirmReactivation!: boolean;
}

export class CreateHarassmentReportDto {
  @ApiProperty({
    description:
      'Type of incident (verbal | written | physical | sexual | discriminatory | cyber | retaliation | other)',
    example: 'verbal',
  })
  @IsString()
  incidentType!: string;

  @ApiProperty({
    description: 'Detailed description of the incident',
    example: 'Description of what happened...',
  })
  @IsString()
  @MaxLength(5000)
  description!: string;

  @ApiPropertyOptional({
    description: 'Date of the incident',
    example: '2024-01-15',
  })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({
    description: 'Location where incident occurred',
    example: 'Online - Chat platform',
  })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({
    description: 'List of witnesses',
    example: 'John Doe, Jane Smith',
  })
  @IsOptional()
  @IsString()
  witnesses?: string;

  @ApiPropertyOptional({
    description: 'Any evidence or supporting documentation',
    example: 'Screenshot URLs or descriptions',
  })
  @IsOptional()
  @IsString()
  evidence?: string;

  @ApiProperty({
    description: 'How the report is submitted (anonymous | confidential)',
    example: 'confidential',
    enum: ['anonymous', 'confidential'],
  })
  @IsIn(['anonymous', 'confidential'])
  reporterType!: 'anonymous' | 'confidential';

  @ApiPropertyOptional({
    description:
      'Contact email for follow-up (required when reporterType is confidential)',
  })
  @ValidateIf(
    (o: CreateHarassmentReportDto) => o.reporterType === 'confidential',
  )
  @IsNotEmpty({ message: 'contactEmail is required for confidential reports' })
  @IsEmail()
  contactEmail?: string;

  @ApiProperty({
    description: 'Whether there is immediate risk to safety',
    example: false,
  })
  @IsBoolean()
  immediateRisk!: boolean;

  @ApiPropertyOptional({
    description: 'ID of the user being reported (optional)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsString()
  reportedUserId?: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password' })
  @IsString()
  currentPassword!: string;

  @ApiProperty({ description: 'New password (min 8 characters)' })
  @IsString()
  newPassword!: string;
}

export class ExportDataDto {
  @ApiProperty({
    description:
      'Category of data to export (all | profile | posts | comments | connections | activity)',
    example: 'all',
  })
  @IsString()
  category!:
    | 'all'
    | 'profile'
    | 'posts'
    | 'comments'
    | 'connections'
    | 'activity';
}
