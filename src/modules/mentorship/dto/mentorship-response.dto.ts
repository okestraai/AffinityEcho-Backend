import { ApiProperty } from '@nestjs/swagger';

// Base response structure
export class BaseResponseDto<T> {
  @ApiProperty({ description: 'Indicates if the request was successful' })
  success!: boolean;

  @ApiProperty({ description: 'Response message' })
  message!: string;

  @ApiProperty({ description: 'Response data' })
  data!: T;
}

// Profile response structures
export class BasicProfileResponse {
  @ApiProperty({ description: 'Professional biography' })
  bio!: string;

  @ApiProperty({ description: 'Current job title' })
  jobTitle!: string;

  @ApiProperty({ description: 'Current location' })
  location!: string;

  @ApiProperty({ description: 'Years of professional experience' })
  yearsExperience!: number;

  @ApiProperty({ description: 'List of skills' })
  skills!: string[];

  @ApiProperty({ description: 'LinkedIn profile URL', required: false })
  linkedinUrl?: string;

  @ApiProperty({ description: 'Career level (encrypted)' })
  careerLevel!: string;

  @ApiProperty({ description: 'Current company (encrypted)' })
  company!: string;

  @ApiProperty({ description: 'Affinity/diversity tags' })
  affinityTags!: string[];
}

export class MentorProfileResponse {
  @ApiProperty({ description: 'Mentor-specific biography' })
  bio!: string;

  @ApiProperty({ description: 'Areas of expertise' })
  expertise!: string[];

  @ApiProperty({ description: 'Industries worked in' })
  industries!: string[];

  @ApiProperty({ description: 'Availability for mentoring' })
  availability!: string;

  @ApiProperty({ description: 'Average response time' })
  responseTime!: string;

  @ApiProperty({ description: 'Preferred mentoring style' })
  style!: string;

  @ApiProperty({ description: 'Languages spoken for mentoring' })
  languages!: string[];

  @ApiProperty({ description: 'Hourly rate (null if free)', nullable: true })
  hourlyRate!: number | null;

  @ApiProperty({ description: 'Willingness to mentor' })
  isWillingToMentor!: boolean;

  @ApiProperty({ description: 'Whether mentor profile is active' })
  isActive!: boolean;

  @ApiProperty({ description: 'When mentor profile was created' })
  createdAt!: string;
}

export class MenteeProfileResponse {
  @ApiProperty({ description: 'Mentee-specific biography' })
  bio!: string;

  @ApiProperty({ description: 'Mentorship goals' })
  goals!: string;

  @ApiProperty({ description: 'Personal interests' })
  interests!: string[];

  @ApiProperty({ description: 'Industries interested in' })
  industries!: string[];

  @ApiProperty({ description: 'Availability for sessions' })
  availability!: string;

  @ApiProperty({
    description: 'Urgency level',
    enum: ['low', 'medium', 'high'],
  })
  urgency!: string;

  @ApiProperty({ description: 'Topic seeking mentorship in' })
  topic!: string;

  @ApiProperty({ description: 'Preferred mentoring style' })
  style!: string;

  @ApiProperty({ description: 'Preferred languages for mentoring' })
  languages!: string[];

  @ApiProperty({ description: 'Whether mentee profile is active' })
  isActive!: boolean;

  @ApiProperty({ description: 'When mentee profile was created' })
  createdAt!: string;
}

export class ProfileStatusResponse {
  @ApiProperty({
    description: 'Mentoring role',
    enum: ['mentor', 'mentee', 'both', null],
  })
  mentoringAs!: 'mentor' | 'mentee' | 'both' | null;

  @ApiProperty({ description: 'Preferred communication method' })
  communicationMethod!: string;

  @ApiProperty({ description: 'Whether user is an active mentor' })
  isActiveMentor!: boolean;

  @ApiProperty({ description: 'Whether user is an active mentee' })
  isActiveMentee!: boolean;
}

export class ProfileStatsResponse {
  @ApiProperty({ description: 'User reputation score' })
  reputationScore!: number;

  @ApiProperty({ description: 'Number of mentorship sessions completed' })
  mentorshipSessionsCompleted!: number;

  @ApiProperty({ description: 'Total posts created' })
  totalPosts!: number;

  @ApiProperty({ description: 'Total comments made' })
  totalComments!: number;

  @ApiProperty({ description: 'Helpful votes received' })
  helpfulVotesReceived!: number;

  @ApiProperty({ description: 'Number of followers' })
  followersCount!: number;

  @ApiProperty({ description: 'Number of users following' })
  followingCount!: number;
}

export class ProfileTimestampsResponse {
  @ApiProperty({ description: 'When profile was created' })
  createdAt!: string;

  @ApiProperty({ description: 'When profile was last updated' })
  updatedAt!: string;

  @ApiProperty({ description: 'When user was last active' })
  lastActiveAt!: string;
}

export class GetProfileResponse {
  @ApiProperty({ description: 'User ID' })
  id!: string;

  @ApiProperty({ description: 'Username' })
  username!: string;

  @ApiProperty({ description: 'Email address' })
  email!: string;

  @ApiProperty({ description: 'Avatar URL', required: false })
  avatar?: string;

  @ApiProperty({ description: 'Basic profile information' })
  basicProfile!: BasicProfileResponse;

  @ApiProperty({ description: 'Mentor profile (if active)', nullable: true })
  mentorProfile!: MentorProfileResponse | null;

  @ApiProperty({ description: 'Mentee profile (if active)', nullable: true })
  menteeProfile!: MenteeProfileResponse | null;

  @ApiProperty({ description: 'Profile status information' })
  status!: ProfileStatusResponse;

  @ApiProperty({ description: 'Profile statistics' })
  stats!: ProfileStatsResponse;

  @ApiProperty({ description: 'Profile timestamps' })
  timestamps!: ProfileTimestampsResponse;
}

export class ProfileExistsResponse {
  @ApiProperty({ description: 'Whether user has any profile' })
  hasProfile!: boolean;

  @ApiProperty({ description: 'Whether user has mentor profile' })
  hasMentorProfile!: boolean;

  @ApiProperty({ description: 'Whether user has mentee profile' })
  hasMenteeProfile!: boolean;

  @ApiProperty({ description: 'Whether mentor profile is active' })
  isActiveMentor!: boolean;

  @ApiProperty({ description: 'Whether mentee profile is active' })
  isActiveMentee!: boolean;

  @ApiProperty({ description: 'Current mentoring role' })
  mentoringAs!: 'mentor' | 'mentee' | 'both' | null;
}

export class ProfileRequirementResponse {
  @ApiProperty({ description: 'Whether user has any profile' })
  hasProfile!: boolean;

  @ApiProperty({ description: 'Whether user has mentor profile' })
  hasMentorProfile!: boolean;

  @ApiProperty({ description: 'Whether user has mentee profile' })
  hasMenteeProfile!: boolean;

  @ApiProperty({ description: 'Missing shared profile fields' })
  missingSharedFields!: string[];

  @ApiProperty({ description: 'Missing mentor-specific fields' })
  missingMentorFields!: string[];

  @ApiProperty({ description: 'Missing mentee-specific fields' })
  missingMenteeFields!: string[];

  @ApiProperty({ description: 'Whether user can create mentorship request' })
  canCreateRequest!: boolean;
}

export class DeactivateProfileResponse {
  @ApiProperty({ description: 'User ID' })
  id!: string;

  @ApiProperty({ description: 'Whether mentor profile is active' })
  is_active_mentor?: boolean;

  @ApiProperty({ description: 'Whether willing to mentor' })
  is_willing_to_mentor?: boolean;

  @ApiProperty({ description: 'Whether mentee profile is active' })
  is_active_mentee?: boolean;

  @ApiProperty({ description: 'Mentoring role' })
  mentoring_as!: string;

  @ApiProperty({ description: 'When profile was updated' })
  updated_at!: string;
}

export class FeedbackResponse {
  @ApiProperty({ description: 'Feedback ID' })
  feedbackId!: string;

  @ApiProperty({ description: 'Feedback type' })
  type?: string;

  @ApiProperty({ description: 'Rating (1-5)', required: false })
  rating?: number;

  @ApiProperty({ description: 'Feedback comment' })
  comment?: string;

  @ApiProperty({ description: 'Additional metadata', required: false })
  metadata?: Record<string, any>;
}

export class ProfileActiveResponse {
  @ApiProperty({ description: 'User ID' })
  userId!: string;

  @ApiProperty({ description: 'Whether profile is active' })
  isActive!: boolean;
}
