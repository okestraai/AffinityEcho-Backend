export interface SubjectPayload {
  type:
    | 'feed_post'
    | 'feed_comment'
    | 'forum_topic'
    | 'forum_comment'
    | 'nook'
    | 'nook_message'
    | 'referral_post'
    | 'referral_comment';
  id: string;
  authorId: string;
  authorIsAnonymous: boolean;
  content: string;
  createdAt: string;
  mentions?: string[];
  attachments?: string[];
}

export interface ParentChainItem {
  type: string;
  id: string;
  authorId: string;
  title?: string | null;
  content: string;
  createdAt: string;
}

export interface ContainerInfo {
  type: 'nook' | 'forum';
  id: string;
  title: string;
  scope?: string;
  urgency?: string;
  temperature?: string;
}

export interface AuthorSignals {
  accountAgeDays: number;
  priorFlagsAgainstAuthor: number;
  priorRemovalsAgainstAuthor: number;
  postsLast24h: number;
}

export interface EditorialPayload {
  subject: SubjectPayload;
  parentChain: ParentChainItem[];
  container?: ContainerInfo;
  authorSignals: AuthorSignals;
  policyVersion: string;
}
