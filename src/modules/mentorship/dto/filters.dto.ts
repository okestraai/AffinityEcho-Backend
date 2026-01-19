import { ApiProperty } from '@nestjs/swagger';

export class FiltersResponseDto {
  @ApiProperty({ description: 'Available career levels', type: [String] })
  careerLevels!: string[];

  @ApiProperty({ description: 'Available expertise areas', type: [String] })
  expertiseAreas!: string[];

  @ApiProperty({ description: 'Available industries', type: [String] })
  industries!: string[];

  @ApiProperty({ description: 'Available affinity tags', type: [String] })
  affinityTags!: string[];

  @ApiProperty({ description: 'Availability options', type: [String] })
  availabilityOptions!: string[];

  @ApiProperty({ description: 'Communication methods', type: [String] })
  communicationMethods!: string[];

  @ApiProperty({ description: 'Mentorship styles', type: [String] })
  mentorshipStyles!: string[];
}
