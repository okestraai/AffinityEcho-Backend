# Affinity Tags, Follow Notifications, and Matching Score Updates

## Overview

This document covers the backend changes for:
1. **Affinity groups** now returned on all profile-revealing endpoints
2. **Follow notifications** — followers get notified when a followed user creates a post
3. **Follower/following stats** on user profile
4. **Matching score** recalculated with proper 0-100 range and affinity tag matching

---

## 1. Affinity Groups on Profile Endpoints

`affinity_tags` (array of strings) is now returned on **all** endpoints that reveal user profile data. These are community group tags like `"Black Women in Tech"`, `"Latino Leaders"`, etc.

### Affected Endpoints

| Endpoint | Field Added | Notes |
|----------|-------------|-------|
| `GET /user/:userId` | `affinityTags: string[]` | Previously own-profile only, now visible to all |
| `GET /user/profile` | `affinityTags: string[]` | Own profile (unchanged) |
| `GET /mentorship/relationships` | `mentor.affinity_tags`, `mentee.affinity_tags` | Added to both mentor and mentee profiles |
| `GET /mentorship/relationships/:id` | `mentor.affinity_tags`, `mentee.affinity_tags` | Single relationship detail |
| `GET /mentorship/discover` | `affinity_tags: string[]` | Already existed, now cleaned (raw encrypted field removed) |
| `GET /mentorship/discover/suggestions` | `affinity_tags: string[]` | Already existed |
| `GET /mentorship/follow/following` | `user.affinity_tags: string[]` | Added to each followed user |
| `GET /mentorship/follow/followers` | `user.affinity_tags: string[]` | Added to each follower |

### Example: `GET /user/:userId`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "QuietLeader42",
    "display_name": "QuietLeader42",
    "avatar": "🦁",
    "bio": "Engineering manager...",
    "jobTitle": "Senior Engineer",
    "affinityTags": ["Black Women in Tech", "Working Parents"],
    "followersCount": 24,
    "followingCount": 12,
    "isFollowing": true,
    "isFollowedBy": false,
    "stats": { ... }
  }
}
```

### Example: `GET /mentorship/relationships`

```json
{
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
        "avatar": "🌟",
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

## 2. Follow Notifications

When a user creates a **non-anonymous** post, all their followers receive a notification.

### Notification Type: `followed_user_post`

- **Preference**: Controlled by `notify_on_follow` user setting
- **Delivery**: In-app (real-time via WebSocket)
- **Skipped for**: Anonymous posts

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

### Frontend: Filter notifications

```
GET /notifications?type=followed_user_post
```

---

## 3. Follower/Following Stats on User Profile

### `GET /user/:userId` — New fields

| Field | Type | Description |
|-------|------|-------------|
| `followersCount` | `number` | Total followers count |
| `followingCount` | `number` | Total following count |
| `isFollowedBy` | `boolean` | Whether this user follows the current viewer (only on other profiles) |

These are returned alongside the existing `isFollowing` field.

### Existing List Endpoints (no changes)

| Endpoint | Description |
|----------|-------------|
| `GET /mentorship/follow/followers` | List of users who follow you |
| `GET /mentorship/follow/following` | List of users you follow |
| `GET /mentorship/follow/following?type=mentors` | Filter following by mentors |
| `GET /mentorship/follow/following?type=mentees` | Filter following by mentees |
| `GET /mentorship/follow/:userId/status` | Check follow status with a specific user |
| `POST /mentorship/follow/:userId` | Follow a user |
| `DELETE /mentorship/follow/:userId` | Unfollow a user |

---

## 4. Matching Score — Recalculated

### Previous issues
- Base score was **50**, making the 0-49 range useless for the slider
- No affinity tag matching
- Pagination total didn't reflect match score filtering

### New Score Breakdown (0-100 scale)

| Factor | Max Points | Calculation |
|--------|-----------|-------------|
| **Expertise match** | 30 | +10 per matching expertise, capped at 30 |
| **Industry match** | 20 | +7 per matching industry, capped at 20 |
| **Affinity tag match** | 15 | +8 per matching tag, capped at 15 |
| **Career level compatibility** | 15 | +15 mentee→senior, +10 peer, +5 reverse |
| **Location match** | 10 | +10 for same location |
| **Activity indicators** | 10 | Reputation + experience + response time |
| **Total** | **100** | |

### Range Slider Filter

```
GET /mentorship/discover?minMatchScore=40&maxMatchScore=100
```

- `minMatchScore` (0-100): Minimum match score to include
- `maxMatchScore` (0-100): Maximum match score to include
- Pagination `total` and `totalPages` now reflect the filtered count
- Response includes `metadata.dbTotal` for the unfiltered DB count

### Example Response

```json
{
  "success": true,
  "profiles": [
    {
      "id": "uuid",
      "username": "MentorPro",
      "matchScore": 72,
      "affinity_tags": ["Black Women in Tech"],
      "career_level": "Senior (8-12 years)",
      "mentor_expertise": ["Technical Leadership", "Career Development"],
      "isBookmarked": false
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 20,
  "totalPages": 1,
  "metadata": {
    "filteredCount": 15,
    "dbTotal": 45
  }
}
```

### Sort by Match Score

```
GET /mentorship/discover?sortBy=match_score&sortOrder=desc
```

---

## Files Modified

| File | Changes |
|------|---------|
| `src/modules/notifications/dto/create-notification.dto.ts` | Added `followed_user_post` notification type |
| `src/modules/notifications/notifications.service.ts` | Added `followed_user_post` → `notify_on_follow` preference mapping |
| `src/modules/feeds/services/feed-posts.service.ts` | Injected NotificationsService, added follower notification on post creation |
| `src/modules/user/services/user-profile.service.ts` | Moved affinityTags to all profiles, added followersCount/followingCount/isFollowedBy |
| `src/modules/mentorship/services/follow.service.ts` | Added affinity_tags to followers/following responses |
| `src/modules/mentorship/services/mentorship-relationships.service.ts` | Added affinity_tags to mentor/mentee profiles in relationships |
| `src/modules/mentorship/services/mentorship-discover.service.ts` | Fixed match score (0-100), added affinity matching, fixed pagination, cleaned raw encrypted fields |
