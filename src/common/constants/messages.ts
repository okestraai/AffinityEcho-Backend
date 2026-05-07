/**
 * Centralized frontend-facing messages.
 * Pattern: brief context + actionable next step
 */

export const MSG = {
  // ─── AUTH ───────────────────────────────────────────────
  AUTH: {
    NO_TOKEN: 'Your session has expired, please sign in again',
    INVALID_TOKEN: 'Your session is no longer valid, please sign in again',
    TOKEN_EXPIRED: 'Your session has expired, please sign in again',
    AUTH_FAILED: 'Unable to verify your identity, please sign in again',
    INVALID_CREDENTIALS:
      'The email or password you entered is incorrect, please try again',
    ACCOUNT_SUSPENDED:
      'Your account has been suspended, contact support for help',
    ACCOUNT_DEACTIVATED:
      'Your account is deactivated, please reactivate to continue',
    ACCOUNT_NOT_EXISTS:
      'This account no longer exists, please create a new one',
    USER_NOT_FOUND: "We couldn't find this account, please check and try again",
    INVALID_EMAIL: 'Please enter a valid email address to continue',
    INVALID_PASSWORD: 'Please enter a valid password to continue',
    INVALID_OTP:
      'The code you entered is incorrect or expired, please request a new one',
    OTP_REQUIRED: 'Please enter the verification code sent to your email',
    REFRESH_REQUIRED: 'Please provide a refresh token to continue',
    INVALID_REFRESH: 'Your session has expired, please sign in again',
    WAIT_RATE_LIMIT: 'Please wait 30 seconds before requesting a new code',
    GOOGLE_NOT_CONFIGURED:
      'Google sign-in is temporarily unavailable, please try another method',
    UNSUPPORTED_PROVIDER: 'This sign-in method is not supported yet',
    INVALID_REDIRECT:
      'Something went wrong with the sign-in flow, please try again',
    PASSWORD_TOO_SHORT: 'Password must be at least 8 characters long',
    USERNAME_TOO_SHORT: 'Username must be at least 3 characters long',
    USERNAME_TOO_LONG: 'Username must be less than 50 characters',
    USERNAME_INVALID:
      'Username can only contain letters, numbers, and underscores',
    USERNAME_TAKEN: 'This username is already taken, please try another',
    EMAIL_TAKEN:
      'An account with this email already exists, please sign in instead',
    PASSWORD_INCORRECT: 'The current password you entered is incorrect',
    NO_FIELDS_TO_UPDATE:
      'No changes detected, please update at least one field',
    PROFILE_UPDATE_FAILED: 'Unable to save your changes, please try again',
    ONBOARDING_FAILED: 'Unable to save your onboarding data, please try again',

    // Success
    PASSWORD_RESET: 'Your password has been reset successfully',
    LOGGED_OUT: 'You have been logged out',
    OTP_SENT: 'A new verification code has been sent to your email',
    PASSWORD_CHANGED: 'Your password has been updated successfully',
    ONBOARDING_COMPLETE: 'Welcome to Affinity Echo! Your profile is all set',
  },

  // ─── USER ───────────────────────────────────────────────
  USER: {
    NOT_FOUND: 'This user could not be found',
    PROFILE_PRIVATE: 'This profile is private, follow them to see more',
    FOLLOW_TO_VIEW: 'Follow this user to see their full profile',
    AVATAR_FAILED: 'Unable to update your avatar, please try again',
    USERNAME_TAKEN: 'This username is already taken, please try another',
    USERNAME_FAILED: 'Unable to update your username, please try again',
    PROFILE_FAILED: 'Unable to load this profile, please try again',
    STATS_FAILED: 'Unable to load your stats, please try again',
    BADGES_FAILED: 'Unable to load your badges, please try again',
    ACTIVITY_FAILED: 'Unable to load activity, please try again',
    CANNOT_BLOCK_SELF: 'You cannot block yourself',
    ALREADY_BLOCKED:
      'You have already restricted this user. Go to Settings to manage your restricted list.',
    BLOCK_FAILED: 'Unable to block this user, please try again',
    BLOCK_NOT_FOUND: 'This user is not in your blocked list',
    UNBLOCK_FAILED: 'Unable to unblock this user, please try again',
    BLOCK_STATUS_FAILED: 'Unable to check block status, please try again',
    SEARCH_FAILED: 'Unable to search users, please try again',
    CONNECTABLE_FAILED:
      'Unable to load suggested connections, please try again',
    DEACTIVATE_FAILED: 'Unable to deactivate your account, please try again',
    ALREADY_DEACTIVATED: 'Your account is already deactivated',
    NOT_DEACTIVATED: 'Your account is currently active',
    REACTIVATE_FAILED: 'Unable to reactivate your account, please try again',
    DELETE_CONFIRM:
      'Please confirm that you want to permanently delete your account',
    DELETE_FAILED: 'Unable to delete your account, please try again',
    EXPORT_FAILED: 'Unable to export your data, please try again',

    // Success
    AVATAR_UPDATED: 'Your avatar has been updated',
    USERNAME_UPDATED: 'Your username has been updated',
    ACCOUNT_DEACTIVATED: 'Your account has been deactivated',
    ACCOUNT_REACTIVATED: 'Welcome back! Your account has been reactivated',
    ACCOUNT_DELETED: "Your account has been deleted. We're sorry to see you go",
    PROFILE_UPDATED: 'Your profile has been updated',
    PASSWORD_CHANGED: 'Your password has been updated',
    BLOCKED:
      "User restricted. Their content will be hidden from your feeds and they won't be able to message you.",
    UNBLOCKED:
      'User unrestricted. You can now see their content and they can message you again.',
    PRIVACY_UPDATED: 'Your privacy settings have been updated',
    NOTIFICATIONS_UPDATED: 'Your notification settings have been updated',
    PRIVACY_FAILED: 'Unable to update your privacy settings, please try again',
    NOTIFICATIONS_FAILED:
      'Unable to update your notification settings, please try again',
    PRIVACY_FETCH_FAILED:
      'Unable to load your privacy settings, please try again',
    NOTIFICATIONS_FETCH_FAILED:
      'Unable to load your notification settings, please try again',
  },

  // ─── FEEDS ──────────────────────────────────────────────
  FEED: {
    POST_NOT_FOUND: 'This post is no longer available',
    POST_FAILED: 'Unable to load this post, please try again',
    POSTS_FAILED: 'Unable to load posts, please try again',
    CREATE_FAILED: 'Unable to publish your post, please try again',
    UPDATE_FAILED: 'Unable to save your changes, please try again',
    DELETE_FAILED: 'Unable to delete this post, please try again',
    NOT_YOUR_POST: 'You can only edit your own posts',
    CANT_DELETE: 'You can only delete your own posts',
    CANT_PIN: 'You can only pin your own posts',
    PIN_FAILED: 'Unable to pin this post, please try again',
    UNPIN_FAILED: 'Unable to unpin this post, please try again',
    FEED_FAILED: 'Unable to load your feed, please try again',
    LIKE_FAILED: 'Unable to like this post, please try again',
    REACTION_FAILED: 'Unable to add your reaction, please try again',
    COMMENT_FAILED: 'Unable to post your comment, please try again',
    COMMENTS_FAILED: 'Unable to load comments, please try again',
    SHARE_EXISTS: 'You have already shared this post',
    SHARE_FAILED: 'Unable to share this post, please try again',
    UNSHARE_FAILED: 'Unable to remove your share, please try again',
    BOOKMARK_FAILED: 'Unable to bookmark this post, please try again',
    BOOKMARKS_FAILED: 'Unable to load your bookmarks, please try again',
    CONTENT_NOT_FOUND: 'This content is no longer available',

    // Success
    LIKED: 'Liked',
    UNLIKED: 'Unliked',
    REACTION_ADDED: 'Reaction added',
    REACTION_REMOVED: 'Reaction removed',
    COMMENT_ADDED: 'Comment posted',
    SHARED: 'Shared successfully',
    UNSHARED: 'Share removed',
    BOOKMARKED: 'Saved to bookmarks',
    BOOKMARK_REMOVED: 'Removed from bookmarks',
    POST_CREATED: 'Your post has been published',
    POST_UPDATED: 'Your post has been updated',
    POST_DELETED: 'Your post has been deleted',
    POST_PINNED: 'Post pinned to your profile',
    POST_UNPINNED: 'Post unpinned from your profile',
  },

  // ─── FORUM ──────────────────────────────────────────────
  FORUM: {
    NOT_FOUND: 'This forum could not be found',
    TOPIC_NOT_FOUND: 'This topic could not be found',
    COMMENT_NOT_FOUND: 'This comment could not be found',
    PARENT_NOT_FOUND: "The comment you're replying to no longer exists",
    NOT_YOUR_COMMENT: 'You can only manage your own comments',
    NOT_AUTHORIZED: "You don't have permission for this action",
    ALREADY_MEMBER: 'You are already a member of this forum',
    NOT_MEMBER: 'You need to join this forum first',
    NAME_TAKEN: 'A forum with this name already exists, please choose another',
    CREATE_FORUM_FAILED: 'Unable to create the forum, please try again',
    UPDATE_FORUM_FAILED: 'Unable to update the forum, please try again',
    DELETE_FORUM_FAILED: 'Unable to delete the forum, please try again',
    JOIN_FAILED: 'Unable to join this forum, please try again',
    LEAVE_FAILED: 'Unable to leave this forum, please try again',
    CREATE_TOPIC_FAILED: 'Unable to create your topic, please try again',
    FETCH_TOPICS_FAILED: 'Unable to load topics, please try again',
    FETCH_TOPIC_FAILED: 'Unable to load this topic, please try again',
    REACTION_FAILED: 'Unable to save your reaction, please try again',
    DELETE_TOPIC_FAILED: 'Unable to delete this topic, please try again',
    DISCUSSIONS_FAILED: 'Unable to load discussions, please try again',
    YOUR_TOPICS_FAILED: 'Unable to load your topics, please try again',
    BOOKMARKS_FAILED: 'Unable to load your bookmarked topics, please try again',
    CREATE_COMMENT_FAILED: 'Unable to post your comment, please try again',
    FETCH_COMMENTS_FAILED: 'Unable to load comments, please try again',
    FORUMS_FAILED: 'Unable to load forums, please try again',
    USER_FORUMS_FAILED: 'Unable to load your forums, please try again',
    METRICS_FAILED: 'Unable to load forum stats, please try again',
    INVALID_LINK: 'Please enter a valid URL',
    SCOPE_RESTRICTED:
      'You do not have access to post in this forum, check your company verification',

    // Success
    COMMENT_DELETED: 'Your comment has been deleted',
    FORUM_DELETED: 'Forum has been deleted',
    JOINED: 'You have joined the forum',
    LEFT: 'You have left the forum',
    BOOKMARKED: 'Topic saved to bookmarks',
    BOOKMARK_REMOVED: 'Topic removed from bookmarks',
  },

  // ─── NOOKS ──────────────────────────────────────────────
  NOOK: {
    NOT_FOUND: 'This nook could not be found',
    EXPIRED: 'This nook has expired and is no longer active',
    INACTIVE: 'This nook is not active or has been locked',
    MESSAGE_NOT_FOUND: 'This message could not be found',
    PARENT_NOT_FOUND: "The message you're replying to no longer exists",
    NOT_AUTHOR: 'You can only manage your own messages',
    EDIT_REMOVED: 'This message has been removed and cannot be edited',
    ALREADY_MEMBER: 'You are already a member of this nook',
    CREATE_FAILED: 'Unable to create the nook, please try again',
    DELETE_FAILED: 'Unable to delete this nook, please try again',
    LOCK_FAILED: 'Unable to lock this nook, please try again',
    JOIN_FAILED: 'Unable to join this nook, please try again',
    LEAVE_FAILED: 'Unable to leave this nook, please try again',
    MEMBERS_FAILED: 'Unable to load members, please try again',
    POST_FAILED: 'Unable to post your message, please try again',
    DELETE_MSG_FAILED: 'Unable to delete this message, please try again',
    EDIT_MSG_FAILED: 'Unable to edit this message, please try again',
    MESSAGES_FAILED: 'Unable to load messages, please try again',
    YOUR_NOOKS_FAILED: 'Unable to load your nooks, please try again',
    BOOKMARKS_FAILED: 'Unable to load your bookmarked nooks, please try again',
    REACTION_EXISTS: 'You have already reacted with this type',
    REACTION_NOT_FOUND: 'This reaction could not be found',
    REACTION_FAILED: 'Unable to save your reaction, please try again',
    REACTION_INVALID: 'Please select a valid reaction type',
    FLAG_FAILED: 'Unable to flag this message, please try again',
    ADMIN_REQUIRED: 'Only admins can perform this action',
    NAME_TAKEN: 'A nook with this name already exists, please choose another',

    // Success
    CREATED: 'Your nook has been created',
    DELETED: 'Nook has been deleted',
    LOCKED: 'Nook has been locked',
    JOINED: 'You have joined the nook',
    LEFT: 'You have left the nook',
    MESSAGE_POSTED: 'Message sent',
    MESSAGE_DELETED: 'Message deleted',
    MESSAGE_UPDATED: 'Message updated',
    REACTION_REMOVED: 'Reaction removed',
    BOOKMARKED: 'Nook saved to bookmarks',
    BOOKMARK_REMOVED: 'Nook removed from bookmarks',
    FLAGGED: 'Message flagged for review',
  },

  // ─── MESSAGING ──────────────────────────────────────────
  MESSAGING: {
    CONV_NOT_FOUND: 'This conversation could not be found',
    NOT_AUTHORIZED:
      'Please turn on messages to continue sending and receiving messages',
    CANNOT_MESSAGE:
      'This user has turned off messages, you cannot message them right now',
    USER_BLOCKED:
      'This user is not available for messaging. They may have restricted interactions or you may have restricted them.',
    USER_NOT_FOUND: 'This user could not be found',
    CREATE_FAILED: 'Unable to start the conversation, please try again',
    FETCH_FAILED: 'Unable to load your conversations, please try again',
    DELETE_FAILED: 'Unable to delete this conversation, please try again',
    CLEAR_FAILED: 'Unable to clear this conversation, please try again',
    CONV_EXISTS: 'You already have a conversation with this user',
    MSG_NOT_FOUND: 'This message could not be found',
    NOT_YOUR_MSG: 'You can only manage your own messages',

    // Identity Reveal
    REVEAL_SENT: 'Identity reveal request sent',
    REVEAL_ACCEPTED: 'Identity revealed successfully',
    REVEAL_REJECTED: 'Identity reveal request has been declined',
    REVEAL_CANCELLED: 'Identity reveal request has been cancelled',

    // WebSocket
    WS_CONNECTED: 'Connected. Please authenticate to continue',
    WS_AUTH_FAILED: 'Connection failed, please sign in again',
    WS_NOT_AUTH: 'Please sign in to use messaging',
  },

  // ─── MENTORSHIP ─────────────────────────────────────────
  MENTORSHIP: {
    PROFILE_NOT_FOUND: 'This mentorship profile could not be found',
    RELATIONSHIP_NOT_FOUND: 'This mentorship relationship could not be found',
    SESSION_NOT_FOUND: 'This session could not be found',
    NOT_IN_RELATIONSHIP: 'You are not part of this mentorship',
    REQUEST_FAILED: 'Unable to send your request, please try again',
    REQUESTS_FAILED: 'Unable to load requests, please try again',
    ACCEPT_FAILED: 'Unable to accept this request, please try again',
    NO_REQUEST: 'This request could not be found',
    ALREADY_REQUESTED: 'You already have a pending request with this user',
    BOOKMARK_EXISTS: 'You have already bookmarked this profile',

    // Success
    MENTOR_CREATED: 'Your mentor profile has been created',
    MENTOR_UPDATED: 'Your mentor profile has been updated',
    MENTEE_CREATED: 'Your mentee profile has been created',
    MENTEE_UPDATED: 'Your mentee profile has been updated',
    MENTOR_ACTIVATED: 'Your mentor profile is now active',
    MENTOR_DEACTIVATED: 'Your mentor profile has been deactivated',
    REQUEST_SENT: 'Your mentorship request has been sent',
    RELATIONSHIP_ACCEPTED: 'Mentorship accepted! You can now start chatting',
    RELATIONSHIP_UPDATED: 'Mentorship details updated',
    SESSION_CREATED: 'Session has been scheduled',
    SESSION_UPDATED: 'Session has been updated',
    SESSION_COMPLETED: 'Session marked as complete',
    SESSION_CANCELLED: 'Session has been cancelled',
    SESSION_RESCHEDULED: 'Session has been rescheduled',
    CHAT_STARTED: 'Mentorship chat started',
    FEEDBACK_SUBMITTED: 'Your feedback has been submitted',
    GOAL_ADDED: 'Goal has been added',
    BOOKMARK_CREATED: 'Profile saved to bookmarks',
    BOOKMARK_DELETED: 'Profile removed from bookmarks',
    BOOKMARK_UPDATED: 'Bookmark updated',
    REPORT_SUBMITTED: 'Your report has been submitted',
    NOTIFICATION_READ: 'Notification marked as read',
    MENTORS_RETRIEVED: 'Mentors loaded',
    MENTEES_RETRIEVED: 'Mentees loaded',
    PROFILE_RETRIEVED: 'Profile loaded',
    REQUIREMENTS_CHECKED: 'Requirements checked',
  },

  // ─── REFERRAL ───────────────────────────────────────────
  REFERRAL: {
    NOT_FOUND: 'This referral could not be found',
    CONNECTION_NOT_FOUND: 'This connection could not be found',
    COMMENT_NOT_FOUND: 'This comment could not be found',
    NOT_AUTHORIZED: "You don't have permission for this action",
    NOT_OPEN: 'This referral is no longer accepting connections',
    ALREADY_CONNECTED: 'You already have a connection for this referral',
    NOT_PENDING: 'This connection is no longer pending',
    NOT_RECEIVER: 'Only the referral poster can respond to connections',
    NOT_PARTICIPANT: 'You are not part of this connection',
    INVALID_NOTE_TYPE: 'You can only add notes relevant to your role',
    FETCH_FAILED: 'Unable to load referrals, please try again',
    CREATE_FAILED: 'Unable to create the referral, please try again',
    UPDATE_FAILED: 'Unable to update the referral, please try again',
    DELETE_FAILED: 'Unable to delete the referral, please try again',
    CONNECT_FAILED: 'Unable to send your connection request, please try again',
    ACCEPT_FAILED: 'Unable to accept this connection, please try again',
    REJECT_FAILED: 'Unable to decline this connection, please try again',
    PROGRESS_FAILED: 'Unable to update progress, please try again',
    NOTES_FAILED: 'Unable to save your notes, please try again',
    COMMENT_FAILED: 'Unable to post your comment, please try again',
    COMMENTS_FAILED: 'Unable to load comments, please try again',
    LIKE_FAILED: 'Unable to like this referral, please try again',
    UNLIKE_FAILED: 'Unable to unlike this referral, please try again',
    LIKES_FAILED: 'Unable to load your liked referrals, please try again',
    BOOKMARK_FAILED: 'Unable to bookmark this referral, please try again',
    UNBOOKMARK_FAILED: 'Unable to remove this bookmark, please try again',
    BOOKMARKS_FAILED: 'Unable to load your bookmarks, please try again',
    SEARCH_FAILED: 'Unable to search referrals, please try again',
    STATS_FAILED: 'Unable to load statistics, please try again',
    VIEW_FAILED: 'Unable to record your view, please try again',

    // Success
    CREATED: 'Your referral has been posted',
    UPDATED: 'Your referral has been updated',
    DELETED: 'Your referral has been deleted',
    CONNECTION_SENT: 'Connection request sent',
    CONNECTION_ACCEPTED: 'Connection accepted',
    CONNECTION_REJECTED: 'Connection declined',
    PROGRESS_UPDATED: 'Progress updated',
    NOTES_ADDED: 'Notes saved',
    COMMENT_CREATED: 'Comment posted',
    COMMENT_DELETED: 'Comment deleted',
  },

  // ─── NOTIFICATIONS ──────────────────────────────────────
  NOTIFICATION: {
    NOT_FOUND: 'This notification could not be found',
    CLEAR_FAILED: 'Unable to clear your notifications, please try again',

    // Success
    CREATED: 'Notification sent',
    RETRIEVED: 'Notifications loaded',
    READ: 'Marked as read',
    UPDATED: 'Notification updated',
    DELETED: 'Notification removed',
    CLEARED: 'All notifications cleared',
    SKIPPED: 'Notification skipped per your preferences',
    TOKEN_REGISTERED: 'Push notifications enabled',
    TOKEN_REMOVED: 'Push notifications disabled',
  },

  // ─── FOLLOW ─────────────────────────────────────────────
  FOLLOW: {
    FAILED: 'Unable to follow this user, please try again',
    UNFOLLOW_FAILED: 'Unable to unfollow this user, please try again',
    STATUS_FAILED: 'Unable to check follow status, please try again',
    LIST_FAILED: 'Unable to load the list, please try again',

    // Success
    FOLLOWED: 'You are now following this user',
    UNFOLLOWED: 'You have unfollowed this user',
    STATUS_RETRIEVED: 'Follow status loaded',
    FOLLOWING_RETRIEVED: 'Following list loaded',
    FOLLOWERS_RETRIEVED: 'Followers list loaded',
  },

  // ─── ENCRYPTION ─────────────────────────────────────────
  ENCRYPTION: {
    INVALID_DATA: 'Invalid data format, please try again',
    INVALID_SESSION: 'Your encryption session has expired, please refresh',
    SESSION_MISMATCH: 'Session verification failed, please try again',
    SESSION_EXPIRED: 'Your encryption session has expired, please refresh',
  },

  // ─── COMPANY VERIFICATION ──────────────────────────────
  COMPANY: {
    ALREADY_VERIFIED: 'Your company email is already verified',
    NO_COMPANY: 'Please add a company to your profile first',
    DOMAIN_BLOCKED: 'This email domain is not eligible for verification',
    VERIFICATION_SENT:
      'A verification email has been sent to your company email',
    VERIFICATION_RESENT: 'Verification email resent to your address',
    VERIFICATION_UPDATED:
      'Verification email updated and resent to your new address',
    FETCH_FAILED: 'Unable to load your verification status, please try again',
  },

  // ─── ADMIN ──────────────────────────────────────────────
  ADMIN: {
    ACCESS_REQUIRED: 'Admin access is required for this action',
    MODERATOR_REQUIRED: 'Moderator access is required for this action',
    SUPER_ADMIN_REQUIRED: 'Only super admins can perform this action',
    CANNOT_MODIFY_SELF: 'You cannot modify your own permissions',
    CANNOT_MODIFY_SUPER: 'Super admin permissions cannot be modified',
    NOT_ADMIN: 'This user is not an admin',
    NOT_ADMIN_OR_MOD: 'This user is not an admin or moderator',
    PERMISSION_REQUIRED:
      'You do not have the required permission for this action',
    NO_EXPORT_DATA: 'No data available for export',
    EXPORT_FAILED: 'Unable to generate the export, please try again',
    INVALID_CONTENT_TYPE: 'Invalid content type provided',
    CONTENT_NOT_FOUND: 'The requested content could not be found',
    REPORT_NOT_FOUND: 'This report could not be found',
    INVALID_STATUS: 'Invalid status provided',
    NOTIFICATION_NOT_FOUND: 'This notification could not be found',
    FORUM_NAME_TAKEN: 'A forum with this name already exists',
    NOOK_NAME_TAKEN: 'A nook with this name already exists',
  },

  // ─── HARASSMENT REPORTS ─────────────────────────────────
  REPORT: {
    CONTACT_REQUIRED: 'Please provide a contact email for confidential reports',
  },

  // ─── GENERIC ────────────────────────────────────────────
  GENERIC: {
    NOT_FOUND: 'The requested resource could not be found',
    FAILED: 'Something went wrong, please try again',
    UNAUTHORIZED: 'Please sign in to continue',
    FORBIDDEN: "You don't have permission for this action",
    RATE_LIMITED: 'Too many requests, please wait a moment and try again',
    VALIDATION_FAILED: 'Please check your input and try again',
  },
} as const;
