export interface MentorshipBookmark {
  id: string;
  userId: string;
  bookmarkedUserId: string;
  notes?: string;
  createdAt: Date;

  // Populated relationships
  bookmarkedUser?: {
    id: string;
    username: string;
    avatar: string;
    jobTitle?: string;
    company?: string;
    mentorBio?: string;
    expertise: string[];
    industries: string[];
  };
}
