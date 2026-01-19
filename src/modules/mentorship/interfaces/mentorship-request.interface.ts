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
  status: 'open' | 'matched' | 'withdrawn' | 'expired';
  matchedWithId?: string;
  matchedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;

  // Populated relationships
  requester?: {
    id: string;
    username: string;
    avatar: string;
    jobTitle?: string;
    company?: string;
  };
  targetUser?: {
    id: string;
    username: string;
    avatar: string;
    jobTitle?: string;
    company?: string;
  };
}
