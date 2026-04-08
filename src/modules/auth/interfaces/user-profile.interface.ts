// src/auth/interfaces/user-profile.interface.ts
export interface UserProfileResponse {
  id: string;
  username: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar: string | null;
  bio: string | null;
  job_title: string | null;
  location: string | null;
  years_experience: number | null;
  skills: string[];
  linkedin_url: string | null;
  privacy_level: 'anonymous' | 'connections_only' | 'public';
  is_willing_to_mentor: boolean;
  has_completed_onboarding: boolean;
  reputation_score: number;
  total_posts: number;
  total_comments: number;
  helpful_votes_received: number;
  mentorship_sessions_completed: number;
  successful_referrals: number;
  created_at: string;
  updated_at: string;
  last_active_at: string;
  role: string;

  // Encrypted sensitive fields (sent to frontend as-is)
  company_type: string | null;
  race_encrypted: string | null;
  gender_encrypted: string | null;
  career_level_encrypted: string | null;
  company_encrypted: string | null;
  affinity_tags_encrypted: string | null;

  // Admin permissions (only present for admin role; null for super_admin; undefined for other roles)
  permissions?: string[] | null;
}
