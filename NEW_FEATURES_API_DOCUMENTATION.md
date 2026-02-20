# Affinity Echo — New Features API Documentation

All endpoints require `Authorization: Bearer <token>` unless marked public.
All responses are wrapped in `{ success, data, message, timestamp }` by the global `TransformInterceptor`.

---

## Table of Contents

1. [User Search (Mention Autocomplete)](#1-user-search-mention-autocomplete)
2. [@Mentions](#2-mentions)
3. [Notification Types & Preferences](#3-notification-types--preferences)
4. [Follow Post Notifications](#4-follow-post-notifications)
5. [Nook Reply Notifications](#5-nook-reply-notifications)
6. [Affinity Tags on Profile Endpoints](#6-affinity-tags-on-profile-endpoints)
7. [Follower / Following Stats](#7-follower--following-stats)
8. [Matching Score (0-100)](#8-matching-score-0-100)
9. [Aggregated Activity](#9-aggregated-activity)
10. [Bookmarks](#10-bookmarks)
11. [Harassment Reports — Status Filter & Timeline](#11-harassment-reports--status-filter--timeline)
12. [Files Modified](#12-files-modified)

---

## 1. User Search (Mention Autocomplete)

Search users by username prefix for `@mention` autocomplete in the editor.

### `GET /user-discovery/search`

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `search` | `string` | Yes | — | Username prefix to search |
| `limit` | `number` | No | `5` | Max results to return |

**Exclusions:** self, deleted, deactivated, not-onboarded, blocked users (bidirectional).

**Response:**

```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "uuid",
        "username": "quietstorm",
        "display_name": "Anonymous User",
        "avatar_emoji": "User"
      }
    ]
  }
}
```

> `display_name` always returns `"Anonymous User"` — no identity reveal in search results.

---

## 2. @Mentions

When a user writes `@username` in a post, nook message, or forum comment, the mentioned user receives a notification.

### How It Works

1. Content text is parsed for `@username` patterns
2. Usernames are resolved to user IDs
3. Self-mentions and blocked users are filtered out
4. A record is inserted into the `mentions` table
5. A `mention` notification is sent to each valid mentioned user

### Supported Content Types

| Content Type | Where | Action URL Pattern |
|-------------|-------|-------------------|
| `post` | Feed posts | `/feed/posts/{postId}` |
| `nook_message` | Nook messages | `/nooks/{nookId}` |
| `comment` | Forum comments | `/forum/topics/{topicId}#comment-{commentId}` |

### Mention Notification Payload

```json
{
  "type": "mention",
  "title": "You were mentioned",
  "message": "QuietLeader42 mentioned you",
  "action_url": "/feed/posts/{postId}",
  "reference_id": "{contentId}",
  "reference_type": "post"
}
```

### Filter Mention Notifications

```
GET /notifications?type=mention
```

### `mentions` Table Schema

```sql
CREATE TABLE "mentions" (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "mentioner_id"      UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  "mentioned_user_id" UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  "content_type"      VARCHAR(20) NOT NULL,   -- 'post' | 'comment' | 'nook_message'
  "content_id"        UUID NOT NULL,
  "context_id"        UUID,                    -- topicId for comments, nookId for nook messages
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("mentioner_id", "mentioned_user_id", "content_type", "content_id")
);
```

---

## 3. Notification Types & Preferences

### All Notification Types

| Type | Trigger | Preference Column | Always Send? |
|------|---------|-------------------|-------------|
| `follow` | Forum follow | — | Yes |
| `forum_post` | New forum topic | — | Yes |
| `forum_comment` | Comment on topic | `notify_on_comment` | No |
| `forum_like` | Like on forum content | `notify_on_like` | No |
| `feed_like` | Like on feed post | `notify_on_like` | No |
| `post_reaction` | Reaction on post | `notify_on_like` | No |
| `topic_comment` | Comment on topic | `notify_on_comment` | No |
| `referral_connection` | Connection request | `notify_on_connection_request` | No |
| `referral_comment` | Comment on referral | — | Yes |
| `referral_like` | Like on referral | `notify_on_like` | No |
| `mentorship_request` | Mentorship request | `notify_on_connection_request` | No |
| `mentorship_accepted` | Mentorship accepted | — | Yes |
| `mentorship_declined` | Mentorship declined | — | Yes |
| `identity_reveal` | Identity revealed | — | Yes |
| `identity_reveal_request` | Reveal request | — | Yes |
| `message_received` | New DM | `notify_on_message` | No |
| `user_followed` | Someone followed you | `notify_on_follow` | No |
| `followed_user_post` | Followed user posted | `notify_on_follow` | No |
| `mention` | @mentioned in content | `notify_on_mention` | No |
| `nook_reply` | Reply to nook message | — | **Yes** |
| `report_status_update` | Report status changed | — | **Yes** |
| `nook_post` | Nook activity | — | Yes |
| `nook_message` | Nook message | — | Yes |

### Filter Notifications by Type

```
GET /notifications?type=mention
GET /notifications?type=followed_user_post
GET /notifications?type=nook_reply
GET /notifications?type=report_status_update
```

### Notification Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/notifications` | List notifications (supports `?type=` filter) |
| `GET` | `/notifications/unread-count` | Unread count |
| `GET` | `/notifications/stats` | Notification statistics |
| `GET` | `/notifications/:id` | Get single notification |
| `PATCH` | `/notifications/:id` | Update notification |
| `PATCH` | `/notifications/:id/read` | Mark as read |
| `PATCH` | `/notifications/mark-all-read` | Mark all as read |
| `DELETE` | `/notifications/:id` | Delete one |
| `DELETE` | `/notifications/read/all` | Delete all read |
| `DELETE` | `/notifications/all` | Clear all |

---

## 4. Follow Post Notifications

When a user creates a **non-anonymous** feed post, all their followers receive a `followed_user_post` notification.

### Behavior

- Triggered on `POST /feeds` (post creation)
- **Skipped** for anonymous posts (`isAnonymous: true`)
- Fire-and-forget — failures do not break post creation
- Controlled by `notify_on_follow` user preference
- Delivered in-app via WebSocket

### Notification Payload

```json
{
  "type": "followed_user_post",
  "title": "New Post",
  "message": "QuietLeader42 shared a new post",
  "action_url": "/feeds/post/{postId}",
  "reference_id": "{postId}",
  "reference_type": "feed_post"
}
```

---

## 5. Nook Reply Notifications

When a user replies to another user's message in a nook (`parent_message_id` is set), the original message author receives a `nook_reply` notification.

### Behavior

- Triggered when creating a nook message with `parent_message_id`
- Skipped if replying to own message
- Always sent (no preference toggle)

### Notification Payload

```json
{
  "type": "nook_reply",
  "title": "New Reply",
  "message": "QuietLeader42 replied to your message in a nook",
  "action_url": "/nooks/{nookId}",
  "reference_id": "{messageId}",
  "reference_type": "nook_message",
  "metadata": {
    "nook_id": "{nookId}",
    "parent_message_id": "{parentMessageId}"
  }
}
```

---

## 6. Affinity Tags on Profile Endpoints

`affinity_tags` (array of strings) are community group labels like `"Black Women in Tech"`, `"Working Parents"`, etc. These are now returned on **all** endpoints that expose user profile data.

### Endpoints Returning Affinity Tags

| Endpoint | Field Name | Notes |
|----------|-----------|-------|
| `GET /user/profile` | `affinityTags` | Own profile |
| `GET /user/:userId` | `affinityTags` | Any user's profile |
| `GET /mentorship/discover` | `affinity_tags` | Discover list |
| `GET /mentorship/discover/suggestions` | `affinity_tags` | Suggestion list |
| `GET /mentorship/relationships` | `mentor.affinity_tags`, `mentee.affinity_tags` | Both sides |
| `GET /mentorship/relationships/:id` | `mentor.affinity_tags`, `mentee.affinity_tags` | Single relationship |
| `GET /mentorship/follow/following` | `user.affinity_tags` | Each followed user |
| `GET /mentorship/follow/followers` | `user.affinity_tags` | Each follower |

### Example: `GET /user/:userId`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "QuietLeader42",
    "display_name": "QuietLeader42",
    "avatar": "U+1F981",
    "bio": "Engineering manager...",
    "jobTitle": "Senior Engineer",
    "affinityTags": ["Black Women in Tech", "Working Parents"],
    "followersCount": 24,
    "followingCount": 12,
    "isFollowing": true,
    "isFollowedBy": false,
    "stats": { "postsCreated": 15, "commentsPosted": 42, "helpfulReactions": 8, "reputationScore": 120 }
  }
}
```

### Example: `GET /mentorship/relationships`

```json
{
  "success": true,
  "data": {
    "asMentor": [
      {
        "id": "relationship-uuid",
        "status": "active",
        "mentor": {
          "id": "uuid",
          "username": "MentorUser",
          "affinity_tags": ["Latino Leaders", "First-Gen College Grads"]
        },
        "mentee": {
          "id": "uuid",
          "username": "MenteeUser",
          "affinity_tags": ["Women in Leadership"]
        }
      }
    ]
  }
}
```

### Example: `GET /mentorship/follow/followers`

```json
{
  "success": true,
  "data": {
    "followers": [
      {
        "id": "uuid",
        "username": "FollowerUser",
        "display_name": "FollowerUser",
        "avatar": "U+1F31F",
        "job_title": "Product Manager",
        "affinity_tags": ["Asian Entrepreneurs", "Working Parents"],
        "followId": "follow-uuid",
        "followedAt": "2026-02-20T10:00:00Z"
      }
    ],
    "total": 1
  }
}
```

---

## 7. Follower / Following Stats

### `GET /user/:userId` — Social Fields

| Field | Type | Description |
|-------|------|-------------|
| `followersCount` | `number` | Total number of followers |
| `followingCount` | `number` | Total number of users this user follows |
| `isFollowing` | `boolean` | Whether the current viewer follows this user |
| `isFollowedBy` | `boolean` | Whether this user follows the current viewer (omitted on own profile) |

### Follow Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/mentorship/follow/:userId` | Follow a user |
| `DELETE` | `/mentorship/follow/:userId` | Unfollow a user |
| `GET` | `/mentorship/follow/followers` | List your followers |
| `GET` | `/mentorship/follow/following` | List who you follow |
| `GET` | `/mentorship/follow/following?type=mentors` | Filter following to mentors only |
| `GET` | `/mentorship/follow/following?type=mentees` | Filter following to mentees only |
| `GET` | `/mentorship/follow/:userId/status` | Check follow status with a user |

### Follow Status Response

```json
{
  "success": true,
  "data": {
    "isFollowing": true,
    "followId": "uuid",
    "followedAt": "2026-02-20T10:00:00Z",
    "isFollowedBy": true,
    "followedByAt": "2026-02-19T08:30:00Z"
  }
}
```

### Followers/Following List Response

```json
{
  "success": true,
  "data": {
    "followers": [
      {
        "id": "uuid",
        "username": "user123",
        "display_name": "user123",
        "avatar": "U+1F60E",
        "job_title": "Software Engineer",
        "company_type": "SaaS",
        "mentoring_as": "mentor",
        "is_willing_to_mentor": true,
        "location": "San Francisco, CA",
        "years_experience": 8,
        "career_level": "Senior (8-12 years)",
        "affinity_tags": ["Black Women in Tech"],
        "followId": "follow-uuid",
        "followedAt": "2026-02-20T10:00:00Z"
      }
    ],
    "total": 1
  }
}
```

---

## 8. Matching Score (0-100)

Match scores in mentorship discovery are now calculated from a **base of 0** (previously 50), providing the full 0-100 range for the frontend slider.

### Score Breakdown

| Factor | Max Points | Calculation |
|--------|-----------|-------------|
| Expertise match | 30 | +10 per matching expertise area, capped at 30 |
| Industry match | 20 | +7 per matching industry, capped at 20 |
| Affinity tag match | 15 | +8 per matching affinity tag, capped at 15 |
| Career level compatibility | 15 | +15 mentee seeking senior mentor, +10 peer, +5 reverse |
| Location match | 10 | +10 for exact same location |
| Activity indicators | 10 | Reputation score + years experience + response time |
| **Total** | **100** | |

### Range Slider Filter

```
GET /mentorship/discover?minMatchScore=40&maxMatchScore=100
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `minMatchScore` | `number` | — | Minimum match score (0-100) |
| `maxMatchScore` | `number` | — | Maximum match score (0-100) |

### Sort by Match Score

```
GET /mentorship/discover?sortBy=match_score&sortOrder=desc
```

### Discover Response

```json
{
  "success": true,
  "profiles": [
    {
      "id": "uuid",
      "username": "MentorPro",
      "avatar": "U+1F680",
      "bio": "Passionate about tech leadership",
      "job_title": "VP Engineering",
      "location": "New York, NY",
      "years_experience": 12,
      "mentor_expertise": ["Technical Leadership", "Career Development"],
      "mentor_industries": ["Technology", "SaaS"],
      "mentor_availability": "Within 1 week",
      "mentor_response_time": "Within 24 hours",
      "career_level": "Leadership (13+ years)",
      "affinity_tags": ["Black Women in Tech"],
      "matchScore": 72,
      "isBookmarked": false
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 20,
  "totalPages": 1,
  "metadata": {
    "filteredCount": 15,
    "dbTotal": 45,
    "note": "Some results filtered by match score or privacy preferences"
  }
}
```

> `total` and `totalPages` reflect the **filtered** count when `minMatchScore` or `maxMatchScore` is used. `metadata.dbTotal` gives the unfiltered database count.

### Filter Options

```
GET /mentorship/discover/filters
```

Returns available filter values including `matchScoreRanges`:

```json
{
  "matchScoreRanges": [
    { "label": "Excellent (80-100)", "min": 80, "max": 100 },
    { "label": "Good (60-79)", "min": 60, "max": 79 },
    { "label": "Fair (40-59)", "min": 40, "max": 59 },
    { "label": "All", "min": 0, "max": 100 }
  ]
}
```

---

## 9. Aggregated Activity

### `GET /user/me/activity`

Returns combined activity (posts, forum topics, nook rooms) for the current user.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | `string` | `all` | Filter: `posts`, `topics`, `nooks`, or `all` |
| `page` | `number` | `1` | Page number |
| `limit` | `number` | `20` | Items per page |

### `GET /user/:userId/activity`

Same as above, but for any user's public activity.

### Response

```json
{
  "success": true,
  "data": [
    {
      "type": "post",
      "content_type": "post",
      "id": "uuid",
      "content_id": "uuid",
      "user_id": "uuid",
      "is_anonymous": false,
      "author": {
        "display_name": "QuietLeader42",
        "username": "QuietLeader42",
        "bio": "Engineering manager",
        "avatar": "U+1F981"
      },
      "content": {
        "text": "Just shipped a new feature...",
        "tags": ["engineering", "launch"]
      },
      "visibility": "global",
      "engagement": {
        "likes": 12,
        "comments": 3,
        "shares": 1,
        "views": 45
      },
      "isLiked": false,
      "isBookmarked": true,
      "created_at": "2026-02-20T14:30:00Z"
    },
    {
      "type": "topic",
      "content_type": "topic",
      "id": "uuid",
      "content_id": "uuid",
      "user_id": "uuid",
      "is_anonymous": false,
      "author": { "..." : "..." },
      "content": {
        "title": "How do you handle burnout?",
        "text": "I've been feeling...",
        "forum_name": "Mental Health",
        "tags": ["burnout", "wellness"]
      },
      "engagement": {
        "likes": 28,
        "comments": 7,
        "views": 150
      },
      "reaction_counts": {
        "seen": 10,
        "validated": 8,
        "inspired": 5,
        "heard": 5
      },
      "created_at": "2026-02-19T09:00:00Z"
    },
    {
      "type": "nook_message",
      "content_type": "nook_message",
      "id": "uuid",
      "content_id": "uuid",
      "user_id": "uuid",
      "is_anonymous": false,
      "author": { "..." : "..." },
      "content": {
        "title": "Late Night Engineering Chat",
        "text": "A safe space to vent about...",
        "nook_name": "Late Night Engineering Chat",
        "nook_urgency": "medium",
        "nook_scope": "company",
        "nook_temperature": "hot",
        "nook_members": 12,
        "nook_time_left": "18h 30m"
      },
      "engagement": {
        "likes": 0,
        "comments": 34
      },
      "expires_at": "2026-02-21T02:00:00Z",
      "created_at": "2026-02-20T02:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "hasMore": true
  }
}
```

---

## 10. Bookmarks

### `GET /user/me/bookmarks`

Returns all bookmarked feed content for the current user.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | `number` | `1` | Page number |
| `limit` | `number` | `20` | Items per page |

### Response

```json
{
  "success": true,
  "data": {
    "bookmarks": [
      {
        "id": "bookmark-uuid",
        "content_type": "post",
        "content_id": "post-uuid",
        "content": {
          "id": "post-uuid",
          "text": "Great article about...",
          "author": {
            "username": "user123",
            "avatar": "U+1F60E"
          },
          "engagement": {
            "likes": 15,
            "comments": 4
          }
        },
        "created_at": "2026-02-20T10:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 8,
      "hasMore": false
    }
  }
}
```

---

## 11. Harassment Reports — Status Filter & Timeline

### `GET /user/reports/harassment`

List your harassment reports with optional status filtering.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | `number` | `1` | Page number |
| `limit` | `number` | `10` | Items per page |
| `status` | `string` | — | Filter: `submitted`, `under_review`, `investigating`, `resolved`, `dismissed`, `all` |

### Response

```json
{
  "success": true,
  "data": {
    "reports": [
      {
        "id": "uuid",
        "referenceNumber": "HR-M3X7K-A2B4",
        "incidentType": "harassment",
        "description": "...",
        "date": "2026-02-18",
        "location": "Forum > General",
        "reporterType": "victim",
        "immediateRisk": false,
        "status": "under_review",
        "createdAt": "2026-02-18T15:00:00Z",
        "updatedAt": "2026-02-19T10:00:00Z"
      }
    ],
    "summary": {
      "total": 3,
      "submitted": 1,
      "under_review": 1,
      "resolved": 1
    },
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

> `summary` always shows counts for **all** statuses regardless of the `status` filter.

### `GET /user/reports/harassment/:id`

Get a single report by ID. Includes a `timeline` array.

### Response

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "referenceNumber": "HR-M3X7K-A2B4",
    "incidentType": "harassment",
    "description": "...",
    "date": "2026-02-18",
    "location": "Forum > General",
    "witnesses": "User456",
    "evidence": "screenshot.png",
    "reporterType": "victim",
    "contactEmail": "user@example.com",
    "immediateRisk": false,
    "status": "resolved",
    "createdAt": "2026-02-18T15:00:00Z",
    "updatedAt": "2026-02-19T10:00:00Z",
    "resolvedAt": "2026-02-20T12:00:00Z",
    "timeline": [
      { "event": "Report submitted", "date": "2026-02-18T15:00:00Z" },
      { "event": "Report updated", "date": "2026-02-19T10:00:00Z" },
      { "event": "Report resolved", "date": "2026-02-20T12:00:00Z" }
    ]
  }
}
```

### `GET /user/reports/harassment/reference/:referenceNumber`

Look up a report by its reference number (e.g., `HR-M3X7K-A2B4`).

---

## 12. Files Modified

### New Files

| File | Purpose |
|------|---------|
| `prisma/migrations/20260218100000_add_mentions_table/migration.sql` | Mentions table with indexes and RLS |
| `src/modules/mentions/mention.service.ts` | Parse and process @mentions |
| `src/modules/mentions/mentions.module.ts` | NestJS module for MentionService |

### Modified Files

| File | Changes |
|------|---------|
| `src/modules/messaging/services/user-discovery.service.ts` | Added `search()` method for mention autocomplete |
| `src/modules/messaging/controllers/user-discovery.controller.ts` | Added `GET /user-discovery/search` route |
| `src/modules/feeds/services/feed-posts.service.ts` | Mention processing on post creation, follower notification on post creation |
| `src/modules/feeds/feeds.module.ts` | Import MentionsModule |
| `src/modules/nooks/services/nook-messages.service.ts` | Mention processing on nook messages, nook reply notifications |
| `src/modules/nooks/nooks.module.ts` | Import MentionsModule |
| `src/modules/notifications/dto/create-notification.dto.ts` | Added types: `mention`, `report_status_update`, `post_reaction`, `topic_comment`, `nook_reply`, `followed_user_post` |
| `src/modules/notifications/notifications.service.ts` | Extended PREFERENCE_MAP with `mention`, `post_reaction`, `topic_comment`, `followed_user_post` |
| `src/modules/user/services/user-profile.service.ts` | Affinity tags visible to all profiles, added followersCount/followingCount/isFollowedBy, enhanced getUserActivity with counts and nooks |
| `src/modules/user/controllers/user.controller.ts` | Added `GET /user/me/activity`, `GET /user/me/bookmarks`, status filter on harassment reports |
| `src/modules/user/user.module.ts` | Import FeedsModule for FeedEngagementService |
| `src/modules/user/services/harassment-report.service.ts` | Status filter on getUserReports, summary counts, timeline on getReportById |
| `src/modules/mentorship/services/follow.service.ts` | Added affinity_tags to followers/following responses |
| `src/modules/mentorship/services/mentorship-relationships.service.ts` | Added affinity_tags to mentor/mentee profiles |
| `src/modules/mentorship/services/mentorship-discover.service.ts` | Match score recalculated (0-100), affinity tag matching, fixed pagination totals, cleaned encrypted fields from response |

### Database Migration

Run `npm run db:deploy` to apply the mentions table migration.
