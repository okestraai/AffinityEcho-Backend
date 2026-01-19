export interface NookMessage {
  id: string;
  nook_id: string;
  user_id: string;
  parent_message_id?: string;
  content: string;
  is_anonymous: boolean;
  is_removed: boolean;
  removed_reason?: string;
  is_flagged: boolean;
  flagged_count: number;
  heard_count: number;
  validated_count: number;
  helpful_count: number;
  created_at: Date;
  updated_at: Date;
}

// Add this interface for user reactions
export interface NookMessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  reaction_type: 'heard' | 'validated' | 'helpful' | 'supportive';
  created_at: Date;
}

export interface NookMessageWithUser extends NookMessage {
  user: {
    avatar: string;
    username: string;
  };
  replies?: NookMessageWithUser[];
  // Add user_reactions to include current user's reactions
  user_reactions?: NookMessageReaction[];
}

export interface MessageResponse {
  success: boolean;
  data: {
    messages: NookMessageWithUser[];
    pagination: {
      page: number;
      limit: number;
      total: number;
    };
  };
}
