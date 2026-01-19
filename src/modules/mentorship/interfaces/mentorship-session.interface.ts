export interface MentorshipSession {
  id: string;
  relationshipId: string;
  scheduledAt: Date;
  durationMinutes: number;
  meetingUrl?: string;
  agenda?: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  mentorNotes?: string;
  menteeNotes?: string;
  sessionNotes?: string;
  mentorFeedback?: string;
  menteeFeedback?: string;
  mentorRating?: number;
  menteeRating?: number;
  createdAt: Date;
  updatedAt: Date;

  // Populated relationships
  relationship?: {
    id: string;
    mentorId: string;
    menteeId: string;
    mentor?: {
      id: string;
      username: string;
      avatar: string;
    };
    mentee?: {
      id: string;
      username: string;
      avatar: string;
    };
  };
}
