export interface Nook {
  id: string;
  title: string;
  description: string;
  urgency: 'low' | 'medium' | 'high';
  scope: 'company' | 'global';
  temperature: 'hot' | 'warm' | 'cool';
  hashtags: string[];
  members_count: number;
  messages_count: number;
  views_count: number;
  is_active: boolean;
  is_locked: boolean;
  last_activity_at: Date;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
  creator_id: string;
}

export interface NookWithTimeLeft extends Omit<Nook, 'expires_at'> {
  timeLeft: string;
}

export interface NookResponse {
  success: boolean;
  data: {
    nook: NookWithTimeLeft;
    isMember: boolean;
    isCreator: boolean;
  };
}

export interface NookListResponse {
  success: boolean;
  data: {
    nooks: NookWithTimeLeft[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}
