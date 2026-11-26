import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ATTENDANCE, Attendance, EVENT_MODES, EventMode } from '../events.constants';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const https = { protocols: ['https'], require_protocol: true };

export class CreateEventDto {
  @ApiProperty({ example: 'Career night for new graduates' })
  @Transform(trim)
  @IsString()
  @Length(3, 120)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ enum: EVENT_MODES })
  @IsIn(EVENT_MODES)
  mode!: EventMode;

  @ApiProperty({ example: '2026-12-10T18:00:00+01:00' })
  @IsISO8601({ strict: true })
  startsAt!: string;

  @ApiProperty({ example: '2026-12-10T20:00:00+01:00' })
  @IsISO8601({ strict: true })
  endsAt!: string;

  @ApiProperty({ example: 'Africa/Lagos', description: 'IANA time zone of the event' })
  @IsString()
  @MaxLength(64)
  timeZone!: string;

  @ApiPropertyOptional({ description: 'Physical and hybrid events' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 160)
  venueName?: string;

  @ApiPropertyOptional({ description: 'Shown only to guests' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(3, 300)
  venueAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  venueCity?: string;

  @ApiPropertyOptional({ description: 'Shown only to guests' })
  @IsOptional()
  @IsUrl(https)
  @MaxLength(500)
  mapUrl?: string;

  @ApiPropertyOptional({ description: 'Virtual and hybrid events; shown only to guests' })
  @IsOptional()
  @IsUrl(https)
  @MaxLength(500)
  joinUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  capacityInPerson?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  capacityOnline?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601({ strict: true })
  registrationClosesAt?: string;

  @ApiProperty({ example: 'Lagos Tech Women' })
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  organiserName!: string;

  @ApiPropertyOptional({ description: 'Needed the first time a member hosts' })
  @IsOptional()
  @IsBoolean()
  acceptPolicy?: boolean;
}

export class UpdateEventDto extends PartialType(CreateEventDto) {}

export class RegisterDto {
  @ApiProperty({ enum: ATTENDANCE })
  @IsIn(ATTENDANCE)
  attendance!: Attendance;

  @ApiPropertyOptional({ description: 'Share your email with the host. Off by default.' })
  @IsOptional()
  @IsBoolean()
  shareEmail?: boolean;

  @ApiPropertyOptional({ description: 'Needed when your profile has no name yet' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({ description: 'Where the guest came from', example: 'link' })
  @IsOptional()
  @IsIn(['link', 'app', 'share'])
  source?: string;
}

export class RegistrationSharingDto {
  @ApiProperty()
  @IsBoolean()
  shareEmail!: boolean;
}

export class CheckInDto {
  @ApiPropertyOptional({ description: 'The code on the guest’s QR or email' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Length(4, 12)
  code?: string;

  @ApiPropertyOptional({ description: 'Check in by name from the guest list' })
  @IsOptional()
  @IsString()
  registrationId?: string;
}

export class ReportEventDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class RemoveEventDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Length(3, 500)
  reason!: string;
}
