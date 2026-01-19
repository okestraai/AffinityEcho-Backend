export interface MentorshipRequest {
  id: string;
  requesterId: string;
  targetUserId?: string;
  topic: string;
  goals: string;
  background?: string;
  availability: string;
  communicationMethod: string;
  urgency: 'low' | 'medium' | 'high';
  requestType: 'seeking_mentor' | 'offering_mentorship';
  status:
    | 'open'
    | 'matched'
    | 'withdrawn'
    | 'expired'
    | 'pending'
    | 'accepted'
    | 'declined';
  matchedWithId?: string;
  matchedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  message?: string;

  // Populated relationships
  requester?: {
    id: string;
    username: string;
    avatar: string;
    jobTitle?: string;
    company?: string;
    bio?: string;
    location?: string;
    yearsExperience?: number;
    careerLevel?: string;
    skills?: string[];
  };
  targetUser?: {
    id: string;
    username: string;
    avatar: string;
    jobTitle?: string;
    company?: string;
    bio?: string;
    location?: string;
    yearsExperience?: number;
    careerLevel?: string;
  };
}

export interface MentorProfile {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  bio?: string;
  jobTitle?: string;
  company?: string;
  careerLevel?: string;
  location?: string;
  isWillingToMentor: boolean;
  mentorBio?: string;
  expertise: string[];
  industries: string[];
  availability?: string;
  responseTime?: string;
  mentoringStyle?: string;
  languages: string[];
  mentoringAs: 'mentor' | 'mentee' | 'both';
  menteeGoals?: string;
  menteeInterests: string[];
  yearsExperience?: number;
  reputationScore: number;
  mentorshipSessionsCompleted: number;
  totalMentees?: number;
  totalMentors?: number;
  averageRating?: number;
  matchScore?: number;
  isBookmarked?: boolean;
  isFollowing?: boolean;
  followersCount?: number;
  followingCount?: number;
  skills: string[];
  affinityTags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FollowRelationship {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: Date;
  follower?: {
    id: string;
    username: string;
    avatar: string;
    jobTitle?: string;
    company?: string;
  };
  following?: {
    id: string;
    username: string;
    avatar: string;
    jobTitle?: string;
    company?: string;
  };
}

export interface DirectMentorshipRequest {
  id: string;
  requesterId: string;
  targetUserId: string;
  requestType: 'mentor_request' | 'mentee_request';
  message: string;
  topic?: string;
  goals?: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Date;
  updatedAt: Date;

  requester?: Partial<MentorProfile>;
  targetUser?: Partial<MentorProfile>;
}
