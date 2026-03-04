# Admin System Design — Affinity Platform

> **Status**: Design Document — Ready for Implementation
> **Scope**: Backend API + Frontend UI specification
> **Approach**: Simple, practical, covering all critical admin needs

---

## Table of Contents

1. [Database Changes Required](#1-database-changes-required)
2. [Admin Role & Authentication](#2-admin-role--authentication)
3. [Dashboard Overview](#3-dashboard-overview)
4. [User Management](#4-user-management)
5. [Report & Harassment Tracking](#5-report--harassment-tracking)
6. [Content Moderation](#6-content-moderation)
7. [Forum Management](#7-forum-management)
8. [Nook Management](#8-nook-management)
9. [Notification Broadcasts](#9-notification-broadcasts)
10. [System Audit Logs](#10-system-audit-logs)
11. [Frontend UI Specification](#11-frontend-ui-specification)
12. [Frontend Flow Guide](#12-frontend-flow-guide)

---

## 1. Database Changes Required

These SQL migrations must run BEFORE any admin API is built.

### 1.1 Add `role` column to `user_profiles`

```sql
ALTER TABLE user_profiles
ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
CHECK (role IN ('user', 'moderator', 'admin', 'super_admin'));
```

> **Roles Hierarchy:**
> - `user` — Regular platform user (default)
> - `moderator` — Can manage forum/nook content, resolve basic reports
> - `admin` — Full user management, report resolution, forum creation
> - `super_admin` — Can promote/demote other admins

### 1.2 Create `admin_logs` audit table

```sql
CREATE TABLE admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES user_profiles(id),
  action TEXT NOT NULL,               -- e.g. 'suspend_user', 'resolve_report'
  target_type TEXT NOT NULL,          -- 'user' | 'post' | 'topic' | 'comment' | 'forum' | 'nook' | 'report'
  target_id TEXT NOT NULL,            -- ID of the affected entity
  reason TEXT,                        -- Admin-supplied reason
  metadata JSONB DEFAULT '{}',        -- Extra context (before/after state, etc.)
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 1.3 Add moderation fields to content tables

```sql
-- Forum Topics
ALTER TABLE forum_topics
ADD COLUMN is_hidden BOOLEAN DEFAULT false,
ADD COLUMN hidden_by UUID REFERENCES user_profiles(id),
ADD COLUMN hidden_at TIMESTAMPTZ,
ADD COLUMN hidden_reason TEXT;

-- Forum Comments
ALTER TABLE forum_comments
ADD COLUMN is_hidden BOOLEAN DEFAULT false,
ADD COLUMN hidden_by UUID REFERENCES user_profiles(id),
ADD COLUMN hidden_at TIMESTAMPTZ,
ADD COLUMN hidden_reason TEXT;

-- Feed Posts
ALTER TABLE feed_posts
ADD COLUMN is_hidden BOOLEAN DEFAULT false,
ADD COLUMN hidden_by UUID REFERENCES user_profiles(id),
ADD COLUMN hidden_at TIMESTAMPTZ,
ADD COLUMN hidden_reason TEXT;

-- Nook Messages
ALTER TABLE nook_messages
ADD COLUMN is_hidden BOOLEAN DEFAULT false,
ADD COLUMN hidden_by UUID REFERENCES user_profiles(id),
ADD COLUMN hidden_at TIMESTAMPTZ;
```

### 1.4 Add admin fields to `harassment_reports`

```sql
ALTER TABLE harassment_reports
ADD COLUMN admin_notes TEXT,
ADD COLUMN assigned_to UUID REFERENCES user_profiles(id),
ADD COLUMN resolution_action TEXT,    -- 'warned' | 'suspended' | 'banned' | 'dismissed'
ADD COLUMN resolved_by UUID REFERENCES user_profiles(id);
```

### 1.5 Add `is_suspended` to `user_profiles`

```sql
ALTER TABLE user_profiles
ADD COLUMN is_suspended BOOLEAN DEFAULT false,
ADD COLUMN suspended_at TIMESTAMPTZ,
ADD COLUMN suspension_reason TEXT,
ADD COLUMN suspension_expires_at TIMESTAMPTZ;   -- NULL = permanent
```

---

## 2. Admin Role & Authentication

### How It Works

- The JWT token already carries the `user_id`
- On the backend, the `JwtStrategy` will be updated to also fetch `role` from `user_profiles`
- An `AdminGuard` will validate `role IN ('admin', 'super_admin')`
- A `ModeratorGuard` will validate `role IN ('moderator', 'admin', 'super_admin')`

### Guard Logic (Backend)

```
AdminGuard     → allows: admin, super_admin
ModeratorGuard → allows: moderator, admin, super_admin
SuperAdminGuard → allows: super_admin only
```

All admin routes will be under `/admin/...` prefix and protected by `AdminGuard` or `ModeratorGuard`.

---

## 3. Dashboard Overview

### Endpoint

```
GET /admin/dashboard
```

**Response:**

```json
{
  "success": true,
  "data": {
    "users": {
      "total": 4820,
      "active_today": 312,
      "new_this_week": 87,
      "suspended": 14,
      "deactivated": 38,
      "deleted": 22
    },
    "reports": {
      "total": 143,
      "pending": 12,
      "under_review": 8,
      "resolved_this_week": 31,
      "high_priority": 3
    },
    "content": {
      "feed_posts_today": 204,
      "forum_topics_today": 45,
      "nook_messages_today": 1893,
      "hidden_content_total": 17
    },
    "forums": {
      "total": 22,
      "global": 14,
      "company_based": 8
    },
    "mentorship": {
      "active_sessions": 67,
      "pending_requests": 89,
      "completed_this_month": 142
    },
    "chart": {
      "user_signups_7d": [12, 8, 15, 22, 19, 7, 4],
      "reports_7d": [3, 1, 5, 2, 0, 4, 2],
      "labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    }
  }
}
```

---

## 4. User Management

### 4.1 List All Users

```
GET /admin/users?page=1&limit=20&search=john&role=user&status=active&sortBy=created_at&sortOrder=desc
```

**Query Params:**

| Param | Type | Options |
|-------|------|---------|
| `page` | number | default: 1 |
| `limit` | number | default: 20, max: 100 |
| `search` | string | searches username |
| `role` | string | `user` \| `moderator` \| `admin` |
| `status` | string | `active` \| `suspended` \| `deactivated` \| `deleted` |
| `sortBy` | string | `created_at` \| `last_active_at` \| `username` |
| `sortOrder` | string | `asc` \| `desc` |

**Response:**

```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "uuid",
        "username": "johndoe",
        "email": "john@example.com",
        "role": "user",
        "avatar": "url",
        "job_title": "Software Engineer",
        "is_suspended": false,
        "is_deactivated": false,
        "is_deleted": false,
        "has_completed_onboarding": true,
        "created_at": "2024-01-15T10:00:00Z",
        "last_active_at": "2024-03-10T09:22:00Z",
        "total_posts": 12,
        "total_comments": 45,
        "reports_against": 2
      }
    ],
    "total": 4820,
    "page": 1,
    "totalPages": 242
  }
}
```

### 4.2 Get Single User Detail

```
GET /admin/users/:userId
```

**Response includes:** full profile + report history against this user + recent content + suspension history

```json
{
  "success": true,
  "data": {
    "profile": { "...all user fields..." },
    "stats": {
      "total_posts": 12,
      "total_forum_topics": 8,
      "total_nook_messages": 203,
      "reports_filed_by_user": 3,
      "reports_filed_against_user": 2,
      "mentorship_sessions": 5
    },
    "recent_reports_against": [
      { "id": "...", "incident_type": "harassment", "status": "resolved", "created_at": "..." }
    ],
    "suspension_history": [
      { "reason": "Harassment violation", "suspended_at": "...", "expires_at": "..." }
    ]
  }
}
```

### 4.3 Suspend User

```
POST /admin/users/:userId/suspend
Body: { "reason": "Repeated harassment violations", "expires_at": "2024-04-10T00:00:00Z" }
```

- Sets `is_suspended: true`, `suspension_reason`, `suspended_at`, `suspension_expires_at`
- Logs to `admin_logs`
- Sends in-app notification to user: "Your account has been suspended"

**Response:**

```json
{ "success": true, "message": "User suspended successfully", "data": { "expires_at": "2024-04-10T00:00:00Z" } }
```

### 4.4 Lift Suspension

```
POST /admin/users/:userId/unsuspend
Body: { "reason": "Appeal approved" }
```

### 4.5 Change User Role

```
PATCH /admin/users/:userId/role
Body: { "role": "moderator" }
```

- Only `super_admin` can promote to `admin`
- Any `admin` can assign/remove `moderator`

### 4.6 Delete User (Hard / Soft)

```
DELETE /admin/users/:userId
Body: { "reason": "Severe violation of ToS", "type": "soft" }
```

- `type: "soft"` → sets `is_deleted: true`, anonymizes data (already implemented in user-account.service.ts)
- `type: "hard"` → (future, not recommended; soft delete is sufficient)

### 4.7 Force Logout User

```
POST /admin/users/:userId/force-logout
```

- Invalidates all active sessions (implementation: add a `session_invalidated_at` field; JWT strategy checks this against token `iat`)

---

## 5. Report & Harassment Tracking

### 5.1 List All Reports (Admin View)

```
GET /admin/reports?page=1&limit=20&status=pending&type=harassment&priority=high&assignedTo=me
```

**Query Params:**

| Param | Type | Options |
|-------|------|---------|
| `status` | string | `submitted` \| `under_review` \| `resolved` \| `declined` |
| `type` | string | `harassment` \| `discrimination` \| `abuse` \| etc. |
| `priority` | string | `high` (immediate_risk=true) \| `normal` |
| `assignedTo` | string | `me` \| `unassigned` \| `{adminId}` |
| `sortBy` | string | `created_at` \| `updated_at` |

**Response:**

```json
{
  "success": true,
  "data": {
    "reports": [
      {
        "id": "uuid",
        "reference_number": "HR-1709123456-ABC1",
        "incident_type": "harassment",
        "status": "submitted",
        "immediate_risk": true,
        "reporter": { "id": "...", "username": "..." },
        "assigned_to": null,
        "description_preview": "I was repeatedly messaged by...",
        "created_at": "2024-03-01T10:00:00Z"
      }
    ],
    "summary": {
      "submitted": 12,
      "under_review": 8,
      "resolved": 103,
      "declined": 20
    },
    "total": 143,
    "page": 1,
    "totalPages": 8
  }
}
```

### 5.2 Get Single Report Detail

```
GET /admin/reports/:reportId
```

**Response includes:** full report + reporter profile + admin notes + timeline + evidence

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "reference_number": "HR-...",
    "incident_type": "harassment",
    "description": "Full description...",
    "date": "2024-02-28T00:00:00Z",
    "location": "Nook: Design Circle",
    "witnesses": ["@user1", "@user2"],
    "evidence": ["screenshot1.jpg"],
    "reporter_type": "direct target",
    "contact_email": "reporter@email.com",
    "immediate_risk": true,
    "status": "under_review",
    "admin_notes": "Reviewed messages. Pattern confirmed.",
    "assigned_to": { "id": "...", "username": "admin_jane" },
    "resolution_action": null,
    "reporter": { "id": "...", "username": "...", "avatar": "..." },
    "timeline": [
      { "event": "submitted", "at": "2024-03-01T10:00:00Z" },
      { "event": "under_review", "at": "2024-03-01T14:30:00Z", "by": "admin_jane" }
    ],
    "created_at": "2024-03-01T10:00:00Z",
    "updated_at": "2024-03-01T14:30:00Z"
  }
}
```

### 5.3 Update Report Status

```
PATCH /admin/reports/:reportId/status
Body: {
  "status": "resolved",
  "admin_notes": "Verified report. User warned.",
  "resolution_action": "warned"
}
```

**`resolution_action` options:** `warned` | `suspended` | `banned` | `dismissed`

### 5.4 Assign Report to Admin

```
PATCH /admin/reports/:reportId/assign
Body: { "admin_id": "uuid-of-admin" }
```

> Sends notification to the assigned admin.

### 5.5 Add Admin Notes

```
PATCH /admin/reports/:reportId/notes
Body: { "admin_notes": "Reviewed content. Escalating." }
```

---

## 6. Content Moderation

### 6.1 List Flagged/All Content

```
GET /admin/moderation/content?type=feed_post&page=1&limit=20&status=hidden
```

**`type` options:** `feed_post` | `forum_topic` | `forum_comment` | `nook_message`

**Response:**

```json
{
  "success": true,
  "data": {
    "content": [
      {
        "id": "uuid",
        "type": "feed_post",
        "content_preview": "First 200 chars of content...",
        "author": { "id": "...", "username": "..." },
        "is_hidden": false,
        "reports_count": 2,
        "created_at": "..."
      }
    ],
    "total": 48,
    "page": 1
  }
}
```

### 6.2 Hide Content

```
POST /admin/moderation/hide
Body: {
  "content_type": "forum_topic",
  "content_id": "uuid",
  "reason": "Violates community guidelines"
}
```

- Sets `is_hidden: true`, `hidden_by`, `hidden_at`, `hidden_reason` on the relevant table
- Logs to `admin_logs`
- Content will no longer appear in public queries

### 6.3 Unhide Content

```
POST /admin/moderation/unhide
Body: {
  "content_type": "forum_topic",
  "content_id": "uuid"
}
```

### 6.4 Pin / Unpin Forum Topic

```
PATCH /admin/moderation/topics/:topicId/pin
Body: { "is_pinned": true }
```

### 6.5 Lock / Unlock Forum Topic

```
PATCH /admin/moderation/topics/:topicId/lock
Body: { "is_locked": true }
```

> Locked topics: users can read but cannot add new comments.

### 6.6 Delete Content

```
DELETE /admin/moderation/content
Body: {
  "content_type": "forum_comment",
  "content_id": "uuid",
  "reason": "Hate speech"
}
```

- Hard-deletes the content record
- Logs the action to `admin_logs`

---

## 7. Forum Management

### 7.1 Create Forum (Global or Company-Based)

```
POST /admin/forums
Body: {
  "name": "Design Thinking Hub",
  "description": "A space for designers across all levels",
  "icon": "🎨",
  "category": "Design",
  "is_global": true,
  "company_id": null,
  "company_name": null,
  "rules": [
    "Be respectful",
    "No self-promotion without permission",
    "Stay on topic"
  ],
  "moderator_ids": ["uuid1", "uuid2"]
}
```

**For company-based forum:**

```json
{
  "name": "Acme Corp Internal",
  "is_global": false,
  "company_id": "acme-corp",
  "company_name": "Acme Corporation",
  "rules": ["Confidential — internal only"]
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Design Thinking Hub",
    "is_global": true,
    "created_at": "2024-03-10T12:00:00Z"
  }
}
```

### 7.2 Update Forum

```
PATCH /admin/forums/:forumId
Body: { "name": "...", "description": "...", "rules": [...], "moderator_ids": [...] }
```

### 7.3 Delete Forum

```
DELETE /admin/forums/:forumId
Body: { "reason": "Low activity, merged into General" }
```

> Topics inside the forum will be soft-deleted or reassigned.

### 7.4 List All Forums (Admin View)

```
GET /admin/forums?page=1&limit=20&type=global
```

**`type`:** `global` | `company`

**Response includes:** `name`, `is_global`, `company_name`, `member_count`, `topic_count`, `moderators`, `created_at`

### 7.5 Assign Forum Moderators

```
POST /admin/forums/:forumId/moderators
Body: { "moderator_ids": ["uuid1", "uuid2"] }
```

### 7.6 Remove Forum Moderator

```
DELETE /admin/forums/:forumId/moderators/:userId
```

---

## 8. Nook Management

### 8.1 List All Nooks

```
GET /admin/nooks?page=1&limit=20&search=design
```

**Response:** `name`, `creator`, `member_count`, `message_count`, `created_at`, `expires_at`

### 8.2 Delete Nook

```
DELETE /admin/nooks/:nookId
Body: { "reason": "Inappropriate content" }
```

### 8.3 Remove User from Nook

```
DELETE /admin/nooks/:nookId/members/:userId
Body: { "reason": "Violated nook rules" }
```

---

## 9. Notification Broadcasts

### 9.1 Send System-Wide Notification

```
POST /admin/notifications/broadcast
Body: {
  "title": "Platform Maintenance",
  "message": "The platform will be down for 30 minutes on March 15 at 2AM UTC",
  "action_url": "/announcements/maintenance-march-15",
  "target": "all"
}
```

**`target` options:**

| Value | Description |
|-------|-------------|
| `all` | All active users |
| `mentors` | Users where `is_willing_to_mentor: true` |
| `mentees` | Users where `mentoring_as: 'mentee'` |
| `role:moderator` | All moderators |

### 9.2 Send Notification to Specific User

```
POST /admin/notifications/user/:userId
Body: {
  "title": "Account Warning",
  "message": "Your recent activity has been reviewed. Please read our community guidelines.",
  "action_url": "/community-guidelines"
}
```

---

## 10. System Audit Logs

### 10.1 List Admin Logs

```
GET /admin/logs?page=1&limit=50&adminId=uuid&action=suspend_user&targetType=user&from=2024-03-01&to=2024-03-10
```

**Query Params:**

| Param | Description |
|-------|-------------|
| `adminId` | Filter by which admin performed action |
| `action` | Filter by action type |
| `targetType` | `user` \| `post` \| `topic` \| `comment` \| `forum` \| `nook` \| `report` |
| `from` / `to` | Date range filter |

**Response:**

```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "uuid",
        "admin": { "id": "...", "username": "admin_jane" },
        "action": "suspend_user",
        "target_type": "user",
        "target_id": "user-uuid",
        "reason": "Repeated harassment violations",
        "metadata": { "duration": "7 days", "expires_at": "2024-03-17" },
        "created_at": "2024-03-10T08:00:00Z"
      }
    ],
    "total": 320,
    "page": 1
  }
}
```

---

## 11. Frontend UI Specification

### Pages Required

#### 11.1 Admin Layout

```
/admin                   → Dashboard Overview
/admin/users             → User Management
/admin/users/:id         → User Detail
/admin/reports           → Harassment Reports
/admin/reports/:id       → Report Detail
/admin/moderation        → Content Moderation
/admin/forums            → Forum Management
/admin/forums/new        → Create Forum
/admin/forums/:id        → Edit Forum
/admin/nooks             → Nook Management
/admin/notifications     → Broadcast Notifications
/admin/logs              → Audit Logs
```

**Layout Components:**
- Fixed left sidebar with navigation (collapsible)
- Top bar with: Admin name + role badge + notification bell
- Breadcrumb trail on every page

---

#### 11.2 Dashboard Page (`/admin`)

**Widgets (cards in a grid):**

| Widget | Data |
|--------|------|
| Total Users | Count + trend arrow |
| New Users (7d) | Count + sparkline |
| Open Reports | Count (pending + under review) |
| High Priority Reports | Count in red badge |
| Content Hidden | Count |
| Active Mentorship Sessions | Count |

**Charts:**
- Line chart: User Signups (last 7 days)
- Bar chart: Reports submitted (last 7 days)

**Quick Actions bar:**
- "View Pending Reports" button
- "Create Forum" button
- "Broadcast Notification" button

---

#### 11.3 User Management Page (`/admin/users`)

**Layout:** Table view + filter bar

**Table Columns:**
- Avatar + Username (clickable → User Detail)
- Email
- Role badge (`user` / `moderator` / `admin`)
- Status badge (`active` / `suspended` / `deactivated` / `deleted`)
- Joined date
- Last active
- Reports against (count badge, red if > 0)
- Actions menu (⋮): Suspend / Unsuspend / Change Role / View Profile / Delete

**Filter Bar:**
- Search input (username)
- Role dropdown
- Status dropdown
- Sort by dropdown

**Pagination:** at the bottom

---

#### 11.4 User Detail Page (`/admin/users/:id`)

**Sections:**

1. **Profile Card** — Avatar, username, email, role badge, status, joined date, last active
2. **Stats Row** — Posts / Comments / Reports Against / Sessions
3. **Account Actions panel** (right sidebar):
   - Suspend (opens modal with reason + expiry date picker)
   - Lift Suspension
   - Change Role (dropdown)
   - Delete Account (with confirmation modal)
   - Send Notification (opens compose modal)
4. **Reports Against tab** — table of all harassment reports about this user
5. **Suspension History tab** — past suspension records

---

#### 11.5 Reports Page (`/admin/reports`)

**Layout:** Split view — list on left, detail panel on right (or full-page detail on mobile)

**List Panel:**
- Filter bar: Status tabs (All / Pending / Under Review / Resolved / Declined) + Priority toggle (High first) + Assigned to me toggle
- Each row: Reference number, incident type badge, reporter username, date, status badge, priority indicator (🔴 if immediate_risk)

**Detail Panel (selected report):**
- Reference number + created date
- Reporter info card
- Incident type + full description
- Evidence preview (thumbnails / file list)
- Witnesses listed
- **Admin Actions section:**
  - Assign to admin dropdown
  - Status update dropdown (submitted → under review → resolved / declined)
  - Resolution action dropdown (warned / suspended / banned / dismissed)
  - Admin notes textarea (auto-saved)
  - "Save & Update Status" button
- Timeline widget at bottom

---

#### 11.6 Content Moderation Page (`/admin/moderation`)

**Layout:** Filter tabs + content cards

**Filter Tabs:** Feed Posts | Forum Topics | Forum Comments | Nook Messages

**Content Cards (per item):**
- Author avatar + username
- Content preview (first 200 chars)
- Date
- Reports count badge (if any)
- Status badge: Visible / Hidden
- Actions: Hide / Unhide / Delete / Pin (topics only) / Lock (topics only)

**Hide Modal:** reason text input + confirm button

---

#### 11.7 Forum Management Page (`/admin/forums`)

**Layout:** Table + Create button

**Table Columns:**
- Forum name + icon
- Type badge (Global / Company)
- Company name (if company-based)
- Category
- Members count
- Topics count
- Moderators (avatars, max 3 shown + "+N more")
- Created date
- Actions: Edit / Delete

**Create/Edit Forum Modal or Page:**
- Name input
- Description textarea
- Icon emoji picker
- Category input
- Type toggle: Global / Company-based
  - If company: Company ID + Company Name inputs
- Rules list (add/remove rule inputs)
- Moderators multi-select (search users by username)

---

#### 11.8 Broadcast Notification Page (`/admin/notifications`)

**Layout:** Simple form

**Fields:**
- Title input
- Message textarea
- Action URL input (optional)
- Target audience:
  - [ ] All Users
  - [ ] Mentors only
  - [ ] Mentees only
  - [ ] Moderators only
- Preview card (shows how notification will look in-app)
- Send button + confirmation dialog

---

#### 11.9 Audit Logs Page (`/admin/logs`)

**Layout:** Table + filter bar

**Filter Bar:**
- Date range picker (from / to)
- Action type dropdown
- Admin username search
- Target type dropdown

**Table Columns:**
- Admin (avatar + username)
- Action (formatted: "Suspended user johndoe")
- Target type badge
- Target ID (clickable if applicable)
- Reason
- Date + time

---

## 12. Frontend Flow Guide

### Flow A: Handling a Harassment Report (End-to-End)

```
1. Admin logs into platform (same login as users, JWT checked for role)
2. Admin sees Dashboard → red badge "3 High Priority Reports"
3. Admin clicks "View Pending Reports" → Reports Page
4. Clicks high priority report (🔴 icon) → Detail panel opens
5. Reads description + evidence
6. Clicks "Assign to Me" → their name appears in assigned field
7. Changes status to "Under Review" → saves
8. Opens user detail of the reported person (link in report)
9. Reviews their report history
10. Decides to suspend → clicks "Suspend" on User Detail
    → Modal: reason = "Harassment confirmed", expiry = 7 days → Confirm
11. Back on report → sets status = "Resolved", action = "Suspended"
12. Adds admin note: "Reviewed evidence. 7-day suspension applied."
13. Clicks "Save & Update Status"
14. Reporter sees their report status change to "Resolved" in-app
```

### Flow B: Creating a Forum

```
1. Admin navigates to Forum Management
2. Clicks "Create Forum"
3. Fills: Name, description, icon, category
4. Toggle: "Global" selected
5. Adds forum rules (click + Add Rule for each)
6. Types username in moderator search → selects 2 users
7. Clicks Create → Forum appears in list immediately
8. Users can now discover the forum in the Forum section
```

### Flow C: Moderating Content

```
1. Admin gets complaint about inappropriate post
2. Navigates to Moderation → Feed Posts tab
3. Finds post by searching author username
4. Clicks "Hide" → enters reason → Confirms
5. Post is removed from all public feeds immediately
6. Admin can "Unhide" if it was a mistake
7. Action is logged in Audit Logs
```

### Flow D: Promoting a Moderator

```
1. Admin goes to User Management
2. Searches for trusted user "sarah_mod"
3. Opens Actions menu → Change Role → selects "moderator"
4. Confirms → sarah_mod now has moderator badge
5. Moderator can: hide content, pin/lock topics, manage reports
6. Moderator CANNOT: suspend users, create forums, broadcast notifications
```

---

## API Summary Table

| Endpoint | Method | Guard | Description |
|----------|--------|-------|-------------|
| `/admin/dashboard` | GET | Admin | Overview stats + charts |
| `/admin/users` | GET | Admin | List all users |
| `/admin/users/:id` | GET | Admin | User detail |
| `/admin/users/:id/suspend` | POST | Admin | Suspend user |
| `/admin/users/:id/unsuspend` | POST | Admin | Lift suspension |
| `/admin/users/:id/role` | PATCH | Admin | Change role |
| `/admin/users/:id/force-logout` | POST | Admin | Invalidate sessions |
| `/admin/users/:id` | DELETE | Admin | Delete user |
| `/admin/reports` | GET | Moderator | List all reports |
| `/admin/reports/:id` | GET | Moderator | Report detail |
| `/admin/reports/:id/status` | PATCH | Moderator | Update report status |
| `/admin/reports/:id/assign` | PATCH | Moderator | Assign to admin |
| `/admin/reports/:id/notes` | PATCH | Moderator | Add admin notes |
| `/admin/moderation/content` | GET | Moderator | List all content |
| `/admin/moderation/hide` | POST | Moderator | Hide content |
| `/admin/moderation/unhide` | POST | Moderator | Unhide content |
| `/admin/moderation/topics/:id/pin` | PATCH | Moderator | Pin/unpin topic |
| `/admin/moderation/topics/:id/lock` | PATCH | Moderator | Lock/unlock topic |
| `/admin/moderation/content` | DELETE | Admin | Delete content |
| `/admin/forums` | GET | Admin | List all forums |
| `/admin/forums` | POST | Admin | Create forum |
| `/admin/forums/:id` | PATCH | Admin | Update forum |
| `/admin/forums/:id` | DELETE | Admin | Delete forum |
| `/admin/forums/:id/moderators` | POST | Admin | Add moderators |
| `/admin/forums/:id/moderators/:userId` | DELETE | Admin | Remove moderator |
| `/admin/nooks` | GET | Admin | List all nooks |
| `/admin/nooks/:id` | DELETE | Admin | Delete nook |
| `/admin/nooks/:id/members/:userId` | DELETE | Admin | Remove nook member |
| `/admin/notifications/broadcast` | POST | Admin | Broadcast notification |
| `/admin/notifications/user/:userId` | POST | Admin | Notify specific user |
| `/admin/logs` | GET | Admin | Audit log list |

**Total: 30 endpoints**

---

## Implementation Order (Recommended)

1. **Phase 1 — Foundation** (must-have first)
   - Run DB migrations (role column, admin_logs, moderation fields)
   - Update JWT strategy to include role
   - Create AdminGuard + ModeratorGuard
   - Create AdminModule + AdminController skeleton

2. **Phase 2 — Dashboard + User Management**
   - Dashboard stats endpoint
   - User list/detail/suspend/delete endpoints

3. **Phase 3 — Reports**
   - Admin report list/detail/update endpoints

4. **Phase 4 — Content Moderation**
   - Hide/unhide/delete content across all types

5. **Phase 5 — Forums**
   - Admin forum CRUD + moderator assignment

6. **Phase 6 — Extras**
   - Broadcast notifications
   - Audit logs
   - Nook management

---

> **Frontend Note:** All admin routes should be behind a client-side role check too. If `currentUser.role` is not `admin` or `super_admin`, redirect to `/` immediately. The backend still enforces it — the frontend guard is just for UX.
