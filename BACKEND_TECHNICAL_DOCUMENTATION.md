# Affinity Echo - Backend Technical Documentation

## Table of Contents

1. [Purpose and Scope](#1-purpose-and-scope)
2. [Requirements Analysis](#2-requirements-analysis)
3. [Technology Stack](#3-technology-stack)
4. [Architecture](#4-architecture)
5. [Project Structure](#5-project-structure)
6. [Database Design](#6-database-design)
7. [Module Breakdown](#7-module-breakdown)
8. [Security](#8-security)
9. [Real-Time Communication](#9-real-time-communication)
10. [Testing](#10-testing)
11. [Deployment](#11-deployment)
12. [Feature Specifications](#12-feature-specifications)
13. [Future Roadmap](#13-future-roadmap)

---

## 1. Purpose and Scope

### 1.1 Project Overview

Affinity Echo is an anonymous-first professional networking platform for underrepresented communities in tech. It features forums, mentorship matching, job referrals, secure messaging, and progressive identity revelation — all built with field-level encryption and consent-based workflows.

### 1.2 Core Objectives

- Provide safe, anonymous professional networking
- Enable progressive identity revelation (anonymous → pseudonymous → public)
- Facilitate job referrals and mentorship connections
- Ensure privacy-first security with AES-256-GCM field-level encryption
- Support real-time messaging with Socket.io

### 1.3 Scope

**Implemented (v1):**
- User management, authentication, and onboarding
- Anonymous forum discussions with custom reactions
- Job referral marketplace with identity revelation
- Mentorship matching, requests, sessions, and discovery
- Real-time encrypted 1:1 messaging
- Nooks (24-hour anonymous safe spaces)
- Social feed with engagement-based ranking
- Multi-channel notification system
- User blocking and harassment reporting

**Out of Scope (v2+):**
- Video conferencing
- Payment processing
- Mobile applications
- AI content moderation pipeline
- Advanced analytics dashboard

---

## 2. Requirements Analysis

### 2.1 Functional Requirements

#### User Management
- Email/password registration with OTP verification
- OAuth sign-in (Google, GitHub, LinkedIn)
- Multi-step onboarding flow with encrypted demographics
- Privacy level management (anonymous / pseudonymous / public)
- Profile deactivation and soft deletion
- User blocking and harassment reporting

#### Forum System
- Anonymous topic creation within forum communities
- Nested comment threads
- Custom reaction system (seen, validated, inspired, heard)
- Forum membership and moderation (pin, lock, remove)
- Scoped forums (global, company, affinity)

#### Referral System
- Referral post creation (requests and offers) with encrypted fields
- Connection request management with slot tracking
- Progressive identity revelation via consent workflow
- Engagement metrics (likes, bookmarks, comments, views)

#### Mentorship
- Mentor/mentee profile creation with detailed preferences
- Discovery with filtering (expertise, industry, location, career level)
- Direct and general mentorship requests
- Relationship lifecycle management (pending → active → completed)
- Session scheduling with feedback and ratings
- Bookmarks and follow system

#### Messaging
- Real-time encrypted 1:1 messaging via Socket.io
- Typing indicators and online presence
- Identity reveal requests within conversations
- Mentorship-specific chat channels
- Conversation history with read receipts

#### Nooks
- 24-hour anonymous safe spaces with auto-expiry
- Temperature tracking (hot/warm/cool based on activity)
- Threaded messaging with reactions
- Public/company-scoped visibility

#### Feeds
- Unified social timeline aggregating posts, topics, and nook messages
- Engagement-based ranking (weighted signals + time decay + velocity bonus)
- Polymorphic likes, comments, shares, views, and bookmarks

#### Notifications
- In-app and email notifications
- Types: follows, forum activity, referral updates, mentorship events, identity reveals, system alerts
- User preference management (per-type toggle, digest frequency)

### 2.2 Non-Functional Requirements

#### Performance
- API response time < 200ms for 95th percentile
- Real-time messaging latency < 100ms
- Global rate limiting: 300 req/min per user
- Messaging rate limiting: 50 req/10s

#### Security
- AES-256-GCM field-level encryption for all PII
- JWT access/refresh token rotation
- Helmet.js security headers with CSP
- class-validator input validation with whitelist enforcement
- CORS whitelist for frontend origins

#### Reliability
- Health check endpoint for uptime monitoring
- Winston structured logging with daily rotation
- Global exception filter for consistent error responses
- Graceful WebSocket reconnection handling

---

## 3. Technology Stack

### 3.1 Core Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 20+ |
| Language | TypeScript | 5.7 |
| Framework | NestJS | 11 |
| Database | PostgreSQL | via Supabase |
| ORM | Prisma | 7.4 |
| Auth Provider | Supabase Auth | 2.x |
| Real-time | Socket.io | 4.8 |
| Cache/Queue | Redis (ioredis) | 5.8 |
| Job Queue | BullMQ | 5.x |
| Encryption | Node.js crypto | AES-256-GCM |
| Email | Nodemailer | 7.x |
| Logging | Winston | 3.x |
| API Docs | Swagger / OpenAPI | via @nestjs/swagger 11 |

### 3.2 Key Dependencies

**Framework & Platform:**
- `@nestjs/core` / `@nestjs/common` — NestJS framework
- `@nestjs/platform-express` — Express HTTP adapter
- `@nestjs/config` — Environment configuration
- `@nestjs/throttler` — Rate limiting

**Authentication:**
- `@nestjs/jwt` / `@nestjs/passport` — JWT strategy
- `passport` / `passport-jwt` — Passport authentication
- `jsonwebtoken` — Token signing/verification
- `@supabase/supabase-js` — Supabase client (auth + admin)

**Database:**
- `@prisma/client` / `@prisma/adapter-pg` — Prisma ORM with PostgreSQL adapter
- `pg` / `postgres` — PostgreSQL drivers

**Real-time:**
- `socket.io` / `@nestjs/websockets` / `@nestjs/platform-socket.io` — WebSocket gateway
- `@socket.io/redis-adapter` — Redis-backed Socket.io scaling

**Validation & Transformation:**
- `class-validator` / `class-transformer` — DTO validation

**Security:**
- `helmet` — HTTP security headers
- `express-rate-limit` — Rate limiting middleware
- `crypto-js` — Encryption utilities

**Email:**
- `nodemailer` — SMTP email delivery
- `ejs` / `handlebars` — Email templates

**Logging & Monitoring:**
- `winston` / `winston-daily-rotate-file` — Structured logging
- `morgan` — HTTP request logging

**Queue:**
- `bullmq` / `ioredis` — Job queue with Redis

**Development:**
- `jest` 30 / `ts-jest` — Testing framework
- `@nestjs/testing` — NestJS test utilities
- `supertest` — HTTP assertion testing
- `eslint` / `prettier` — Code quality
- `nodemon` — Development hot reload

### 3.3 Library Justification

**NestJS 11:** Modular architecture with dependency injection, decorators, guards, and interceptors — ideal for a feature-rich monolith with clean module boundaries.

**Prisma 7.4:** Type-safe database access with schema-driven migrations, introspection, and a visual studio GUI. Selected over TypeORM for better TypeScript integration and migration tooling.

**Supabase:** Managed PostgreSQL with built-in authentication, row-level security policies, and real-time subscriptions. The `supabaseAdmin` client is used for service-role operations bypassing RLS.

**Socket.io 4.8:** Reliable WebSocket communication with automatic fallback to polling, room management, and Redis adapter for horizontal scaling.

**BullMQ:** Redis-based job queue for background processing (email delivery, notifications) with retry mechanisms and progress tracking.

---

## 4. Architecture

### 4.1 Architectural Pattern

Affinity Echo uses a **modular monolith** architecture — a single NestJS application with 10 feature modules, each encapsulating its own controllers, services, guards, and DTOs. Modules communicate via direct service injection rather than inter-process messaging.

```
┌─────────────────────────────────────────────────────────────┐
│                    NestJS Application                        │
│                                                             │
│  ┌─────────┐ ┌──────┐ ┌─────────┐ ┌──────────┐ ┌────────┐ │
│  │  Auth   │ │ User │ │  Forum  │ │ Referral │ │ Mentor │ │
│  └─────────┘ └──────┘ └─────────┘ └──────────┘ └────────┘ │
│  ┌──────────┐ ┌───────┐ ┌───────────────┐ ┌──────┐        │
│  │ Messaging│ │ Nooks │ │ Notifications │ │Feeds │        │
│  └──────────┘ └───────┘ └───────────────┘ └──────┘        │
│  ┌────────────┐                                            │
│  │ Encryption │                                            │
│  └────────────┘                                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Common Layer                            │   │
│  │  Guards · Decorators · Filters · Interceptors · Utils│   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │              │                │
    ┌────▼────┐   ┌─────▼─────┐   ┌─────▼─────┐
    │Supabase │   │   Redis   │   │  Socket.io│
    │ (PG+Auth)│   │(Cache/Queue)│   │ (WebSocket)│
    └─────────┘   └───────────┘   └───────────┘
```

### 4.2 Request Pipeline

```
Client Request
    │
    ▼
Helmet (Security Headers)
    │
    ▼
CORS Middleware
    │
    ▼
Rate Limit Middleware (500 req/15min per IP)
    │
    ▼
Global Throttle Guard (300 req/min per user)
    │
    ▼
ValidationPipe (whitelist, transform, forbidNonWhitelisted)
    │
    ▼
JWT Auth Guard (Bearer token validation)
    │
    ▼
Resource Guards (ownership, membership, participant)
    │
    ▼
Controller → Service → Supabase Admin Client
    │
    ▼
Logging Interceptor (request/response timing)
    │
    ▼
Transform Interceptor (wrap in {success, data, message})
    │
    ▼
Global Exception Filter (consistent error format)
```

### 4.3 API Versioning

All endpoints are prefixed with `/api/v1`. URI-based versioning is enabled via NestJS `VersioningType.URI`.

### 4.4 Data Access Pattern

Services use the **Supabase Admin Client** (service-role key) to interact with PostgreSQL. The client is initialized per-service via `supabaseAdmin(configService)` and bypasses row-level security for server-side operations. Prisma is used for schema management and migrations but not as the primary query engine at runtime.

```typescript
// Typical service constructor pattern
@Injectable()
export class SomeService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async getData() {
    const { data, error } = await this.admin
      .from('table_name')
      .select('*')
      .eq('field', value);
  }
}
```

---

## 5. Project Structure

### 5.1 Directory Layout

```
affinity-echo-api/
├── prisma/
│   ├── schema.prisma              # Database schema (33 models)
│   └── migrations/                # 12 migration files
├── docker/
│   ├── Dockerfile                 # Multi-stage production build
│   └── docker-compose.yml         # API + Redis services
├── src/
│   ├── main.ts                    # Bootstrap, middleware, WebSocket adapter
│   ├── app.module.ts              # Root module (imports all feature modules)
│   ├── app.controller.ts          # Root API controller
│   ├── app.service.ts             # Root service
│   │
│   ├── common/
│   │   ├── config/
│   │   │   └── cors.config.ts     # CORS origin whitelist
│   │   ├── constants/
│   │   │   └── select-fields.ts   # Reusable Prisma select definitions
│   │   ├── decorators/
│   │   │   ├── api-response.decorator.ts
│   │   │   ├── current-user.decorator.ts
│   │   │   ├── public.decorator.ts
│   │   │   └── roles.decorator.ts
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts
│   │   │   ├── roles.guard.ts
│   │   │   └── ws-jwt.guard.ts
│   │   ├── interceptors/
│   │   │   ├── logger.interceptor.ts
│   │   │   └── transform.interceptor.ts
│   │   ├── middlewares/
│   │   │   └── rate-limit.middleware.ts
│   │   ├── templates/emails/
│   │   │   ├── otp.ejs
│   │   │   ├── password-reset-otp.ejs
│   │   │   ├── reset-password.ejs
│   │   │   └── welcome.ejs
│   │   └── utils/
│   │       ├── encryption.util.ts
│   │       ├── identity-reveal.util.ts
│   │       ├── logger.util.ts
│   │       ├── avatar-generator.util.ts
│   │       └── email/
│   │           └── email.service.ts
│   │
│   ├── config/
│   │   ├── configuration.ts       # Environment config loader
│   │   ├── bull.config.ts         # BullMQ queue config
│   │   └── redis.config.ts        # Redis connection config
│   │
│   ├── database/
│   │   ├── db.ts                  # Postgres client (postgres.js)
│   │   └── supabase.client.ts     # Supabase admin + service role clients
│   │
│   ├── jobs/
│   │   └── nook-cron.jobs.ts      # Cron: expire nooks, update temperatures
│   │
│   └── modules/
│       ├── auth/                  # Authentication & onboarding
│       ├── user/                  # Profile, settings, blocking, reports
│       ├── forum/                 # Forums, topics, comments, reactions
│       ├── referral/              # Job referrals, connections, identity reveal
│       ├── mentorship/            # Discovery, requests, relationships, sessions
│       ├── messaging/             # Real-time chat, WebSocket gateway
│       ├── nooks/                 # 24-hour anonymous safe spaces
│       ├── notifications/         # Multi-channel notifications
│       ├── feeds/                 # Social feed with ranking
│       ├── encryption/            # Encryption endpoints
│       └── moderation/            # Content moderation (lightweight)
│
├── .env.example                   # Environment variable template
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # TypeScript configuration
├── nodemon.json                   # Dev watch config
├── README.md                      # Project overview
├── DEPLOYMENT.md                  # Deployment guide (5 options)
└── BACKEND_TECHNICAL_DOCUMENTATION.md
```

### 5.2 Module Structure Convention

Each feature module follows a consistent structure:

```
modules/<feature>/
├── <feature>.module.ts            # NestJS module definition
├── <feature>.controller.ts        # REST endpoints
├── services/
│   ├── <feature>.service.ts       # Business logic
│   └── <feature>.service.spec.ts  # Unit tests
├── guards/                        # Resource-specific access control
├── dto/                           # Request/response validation
└── interfaces/                    # TypeScript interfaces
```

---

## 6. Database Design

### 6.1 Overview

The database is PostgreSQL managed by Supabase. Schema is defined in Prisma (`prisma/schema.prisma`) with 33 models across 12 migrations. All PII fields use application-level AES-256-GCM encryption.

### 6.2 Table Schema

#### User & Profile (1 table)

**user_profiles** — Core user table with 80+ columns covering profile, mentor/mentee fields, privacy, notifications, account management, and statistics.

```sql
-- Key columns (simplified)
id                       UUID PRIMARY KEY
username                 VARCHAR(50) UNIQUE
email                    VARCHAR(254)
avatar                   TEXT DEFAULT 'User'

-- Encrypted PII
first_name_encrypted     TEXT
last_name_encrypted      TEXT
race_encrypted           TEXT
gender_encrypted         TEXT
career_level_encrypted   TEXT
company_encrypted        TEXT
affinity_tags_encrypted  TEXT

-- Mentor fields
mentor_bio, mentor_expertise[], mentor_industries[], mentor_availability,
mentor_response_time, mentor_style, mentor_languages[], mentor_hourly_rate,
is_active_mentor, mentor_profile_created_at

-- Mentee fields
mentee_bio, mentee_goals, mentee_interests[], mentee_industries[],
mentee_availability, mentee_urgency, mentee_topic, mentee_languages[],
is_active_mentee, mentee_profile_created_at

-- Privacy settings
privacy_level            VARCHAR(20) DEFAULT 'anonymous'
profile_visibility       VARCHAR(20) DEFAULT 'public'
allow_messages_from      VARCHAR(20) DEFAULT 'everyone'

-- Account management
is_deactivated, deactivated_at, deactivation_reason
is_deleted, deleted_at, deletion_reason

-- Statistics
reputation_score, total_posts, total_comments,
helpful_votes_received, mentorship_sessions_completed, successful_referrals
```

#### Forum (6 tables)

| Table | Purpose |
|-------|---------|
| `forums` | Forum communities with name, description, category, rules, moderators |
| `forum_members` | Membership tracking (user_id + forum_id, unique) |
| `forum_topics` | Discussion topics with scope, anonymity, tags, reaction counts |
| `forum_comments` | Nested comments with parent_comment_id, moderation flags |
| `topic_reactions` | Reactions on topics (seen, validated, inspired, heard) |
| `comment_reactions` | Reactions on comments |

#### Referral (6 tables)

| Table | Purpose |
|-------|---------|
| `referral_posts` | Job referral/offer posts with encrypted title, company, description |
| `referral_connections` | Connection requests between users with outcome tracking |
| `referral_likes` | Post engagement (user_id + post_id, unique) |
| `referral_bookmarks` | Saved referrals |
| `referral_comments` | Comments on referral posts |
| `identity_reveals` | Consent-based identity revelation requests |

#### Mentorship (5 tables)

| Table | Purpose |
|-------|---------|
| `mentorship_relationships` | Mentor-mentee pairings with status lifecycle, match score, ratings |
| `mentorship_sessions` | Scheduled sessions with agenda, notes, feedback, ratings |
| `mentorship_requests` | General mentorship requests (seeking/offering) |
| `mentorship_direct_requests` | Direct user-to-user mentorship requests |
| `mentorship_bookmarks` | Saved mentor/mentee profiles |

#### Messaging (2 tables)

| Table | Purpose |
|-------|---------|
| `conversations` | 1:1 chat threads with context type, identity reveal tracking |
| `messages` | Individual messages with encrypted content, read/delivery status |

#### Nooks (5 tables)

| Table | Purpose |
|-------|---------|
| `nooks` | 24-hour anonymous safe spaces with temperature, auto-expiry |
| `nook_members` | Membership with anonymous option, notification preferences |
| `nook_messages` | Threaded messages with moderation flags, reaction counts |
| `nook_reactions` | Reactions on nooks |
| `nook_message_reactions` | Reactions on individual nook messages |

#### Feeds (6 tables)

| Table | Purpose |
|-------|---------|
| `feed_posts` | Standalone timeline posts with visibility, engagement counters |
| `feed_likes` | Polymorphic likes (content_type: post/topic/nook_message) |
| `feed_comments` | Polymorphic threaded comments |
| `feed_shares` | Share tracking with optional message |
| `feed_views` | View tracking |
| `feed_bookmarks` | Saved content |

#### Social & Safety (3 tables)

| Table | Purpose |
|-------|---------|
| `user_follows` | Follow relationships (follower_id + following_id) |
| `user_blocks` | Block relationships with reason |
| `harassment_reports` | Safety incident reports with status tracking |

#### Notifications (1 table)

| Table | Purpose |
|-------|---------|
| `notifications` | Polymorphic notifications with type, delivery method, read/action status |

### 6.3 Entity Relationships

```
user_profiles (1) ──── (N) referral_posts
user_profiles (1) ──── (N) referral_connections (sender / receiver)
user_profiles (1) ──── (N) forum_topics
user_profiles (1) ──── (N) forum_comments
user_profiles (1) ──── (N) mentorship_relationships (mentor / mentee)
user_profiles (1) ──── (N) mentorship_requests
user_profiles (1) ──── (N) mentorship_direct_requests (requester / target)
user_profiles (1) ──── (N) conversations (user1 / user2)
user_profiles (1) ──── (N) messages
user_profiles (1) ──── (N) notifications (user / actor)
user_profiles (1) ──── (N) user_follows (follower / following)
user_profiles (1) ──── (N) user_blocks (blocker / blocked)
user_profiles (1) ──── (N) nooks (creator)
user_profiles (1) ──── (N) nook_members
user_profiles (1) ──── (N) feed_posts / feed_likes / feed_comments / feed_shares / feed_views / feed_bookmarks
user_profiles (1) ──── (N) harassment_reports

referral_posts (1) ──── (N) referral_connections
referral_connections (1) ──── (N) identity_reveals

forums (1) ──── (N) forum_topics
forums (1) ──── (N) forum_members
forum_topics (1) ──── (N) forum_comments
forum_topics (1) ──── (N) topic_reactions
forum_comments (1) ──── (N) comment_reactions
forum_comments (1) ──── (N) forum_comments (replies)

mentorship_relationships (1) ──── (N) mentorship_sessions

nooks (1) ──── (N) nook_members
nooks (1) ──── (N) nook_messages
nooks (1) ──── (N) nook_reactions
nook_messages (1) ──── (N) nook_message_reactions
nook_messages (1) ──── (N) nook_messages (replies)

conversations (1) ──── (N) messages
```

### 6.4 Encrypted Fields

All PII and sensitive data is encrypted at the application layer using AES-256-GCM before storage:

| Table | Encrypted Columns |
|-------|------------------|
| `user_profiles` | first_name, last_name, race, gender, career_level, company, affinity_tags |
| `referral_posts` | title, company, job_title, description |
| `referral_connections` | message, sender_notes, receiver_notes |
| `identity_reveals` | requester_message |
| `mentorship_relationships` | request_goals, request_background, mentee_goals, mentor_feedback, mentee_feedback |
| `mentorship_sessions` | agenda, mentor_notes, mentee_notes, session_notes |
| `mentorship_requests` | goals, background |
| `messages` | content |

### 6.5 Migrations

12 migration files covering the schema evolution (December 2025 – February 2026):

1. Initial schema creation
2. Schema alignment and column additions
3. RPC functions for Supabase
4. Performance indexes
5. Row-level security (RLS) policies
6. Encrypted column fixes
7. Default forum seeding
8. UUID and timestamp defaults
9. Supabase-specific optimizations

---

## 7. Module Breakdown

### 7.1 Auth Module

**Path:** `src/modules/auth/`

**Responsibilities:** User registration, login, OTP verification, OAuth, password reset, token management, onboarding.

**Components:**
- `auth.controller.ts` — REST endpoints
- `auth.service.ts` — Core authentication logic
- `onboarding.service.ts` — Multi-step onboarding
- `jwt.strategy.ts` — Passport JWT strategy
- `jwt-auth.guard.ts` — Authentication guard

**DTOs:** signup, login, otp, forgot-password, reset-password, verify-email, onboarding, update-profile, password, auth-response

**Key Flows:**
```
Registration:  POST /auth/signup → OTP email → POST /auth/verify-otp → onboarding
Login:         POST /auth/login → access_token + refresh_token
Token Refresh: POST /auth/refresh → new access_token + rotated refresh_token
Password Reset:POST /auth/forgot-password → OTP email → POST /auth/reset-password
OAuth:         POST /auth/oauth/:provider → Supabase OAuth → tokens
```

### 7.2 User Module

**Path:** `src/modules/user/`

**Responsibilities:** Profile management, privacy settings, account lifecycle, blocking, harassment reporting.

**Components:**
- `user.controller.ts` — REST endpoints
- `user.service.ts` — Core user operations
- `user-profile.service.ts` — Profile CRUD
- `user-settings.service.ts` — Preferences management
- `user-account.service.ts` — Deactivation/deletion
- `user-blocking.service.ts` — Block/unblock users
- `user-resources.service.ts` — User resource queries
- `harassment-report.service.ts` — Safety incident reporting

**Privacy Levels:**
```
anonymous     → Username only (default for new users)
pseudonymous  → Username + selective profile fields
public        → Full profile with real name visible
```

### 7.3 Forum Module

**Path:** `src/modules/forum/`

**Responsibilities:** Forum communities, topic discussions, nested comments, custom reactions, moderation.

**Components:**
- `forum.controller.ts` — REST endpoints
- `forum.service.ts` — Forum CRUD and membership
- `topic.service.ts` — Topic creation and listing
- `comment.service.ts` — Nested comments
- `jwt-auth.guard.ts` — Forum-specific auth

**DTOs:** create-forum, update-forum, create-topic, create-comment, comment-reaction, topic-reaction, forum-filters

**Reaction Types:** `seen`, `validated`, `inspired`, `heard`

### 7.4 Referral Module

**Path:** `src/modules/referral/`

**Responsibilities:** Job referral marketplace, connection requests, engagement, identity revelation.

**Components:**
- `referral.controller.ts` — REST endpoints
- `referral.service.ts` — Post CRUD with encryption
- `referral-likes.service.ts` — Like/unlike
- `referral-bookmarks.service.ts` — Bookmark management
- `referral-comments.service.ts` — Comments
- `referral-connections.service.ts` — Connection request matching
- `identity-reveal.service.ts` — Consent-based identity revelation
- `referral-owner.guard.ts` — Post ownership validation

**Identity Revelation Flow:**
```
1. User A sends reveal request to User B
2. User B reviews and accepts/declines
3. On mutual acceptance: encrypted real names become visible
4. Connection status updated with identity_revealed flag
```

### 7.5 Mentorship Module

**Path:** `src/modules/mentorship/`

**Responsibilities:** Mentor/mentee profiles, discovery, matching, requests, relationships, sessions, bookmarks, follows.

**Controllers (9):**
- `mentorship-profile.controller.ts` — Profile endpoints
- `mentorship-discover.controller.ts` — Discovery with filters
- `mentorship-requests.controller.ts` — General requests
- `mentorship-relationships.controller.ts` — Relationship lifecycle
- `mentorship-sessions.controller.ts` — Session scheduling
- `mentorship-bookmarks.controller.ts` — Bookmark mentors
- `mentorship-misc.controller.ts` — Miscellaneous endpoints
- `follow.controller.ts` — Follow mechanics
- `user-follow.controller.ts` — User follow endpoints

**Services (8):**
- `mentorship-profile.service.ts` — Profile CRUD
- `mentorship-discover.service.ts` — Discovery with match scoring
- `mentorship-requests.service.ts` — Request management
- `mentorship-relationships.service.ts` — Relationship lifecycle
- `mentorship-sessions.service.ts` — Session scheduling
- `mentorship-bookmarks.service.ts` — Bookmark management
- `follow.service.ts` — Follow/unfollow with identity reveal

**Guards:** mentor-active, mentor-relationship, mentorship-owner

**Match Scoring Algorithm:**
```
Base score: 50
+ Matching expertise:    15 points per match
+ Matching industries:   10 points per match
+ Same location:         20 points
+ Career level gap:      15 points (mentee → more senior mentor)
+ Response time:         5-15 points (faster = higher)
Cap: 100
```

### 7.6 Messaging Module

**Path:** `src/modules/messaging/`

**Responsibilities:** Real-time encrypted messaging, conversations, identity reveals, mentorship chat.

**Controllers (5):**
- `messaging.controller.ts` — Core messaging
- `conversations.controller.ts` — Conversation endpoints
- `identity-reveal.controller.ts` — Anonymous identity reveal
- `mentorship-chat.controller.ts` — Mentorship-specific chat
- `user-discovery.controller.ts` — User discovery for chat

**Services (6):**
- `messaging.service.ts` — Message sending with encryption
- `conversations.service.ts` — Conversation CRUD
- `identity-reveal.service.ts` — Reveal request management
- `mentorship-chat.service.ts` — Mentorship chat channels
- `user-discovery.service.ts` — User search for new conversations
- `websocket.gateway.ts` — Socket.io WebSocket gateway

**Guards:** chat-participant (conversation membership), mentorship-chat (mentorship access)

### 7.7 Nooks Module

**Path:** `src/modules/nooks/`

**Responsibilities:** 24-hour anonymous safe spaces, member management, threaded messaging, reactions.

**Controllers (4):**
- `nooks.controller.ts` — Nook CRUD
- `nook-messages.controller.ts` — Message endpoints
- `nook-members.controller.ts` — Member management
- `nook-reactions.controller.ts` — Reaction endpoints

**Services (4):**
- `nooks.service.ts` — Nook creation/management
- `nook-messages.service.ts` — Message handling
- `nook-members.service.ts` — Member operations
- `nook-reactions.service.ts` — Reaction handling

**Guards:** nook-active, nook-creator, nook-member

**Temperature System:**
```
hot  → High activity (many recent messages)
warm → Moderate activity
cool → Low activity (default)
```

**Cron Jobs** (`src/jobs/nook-cron.jobs.ts`):
- Every 5 minutes: Delete expired nooks (past 24-hour window)
- Every 15 minutes: Recalculate nook temperature scores based on recent activity

### 7.8 Notifications Module

**Path:** `src/modules/notifications/`

**Responsibilities:** Notification creation, delivery, preference management, unread counts.

**Components:**
- `notifications.controller.ts` — REST endpoints
- `notifications.service.ts` — Notification CRUD and delivery

**DTOs:** create-notification, update-notification, query-notification

**Notification Types:**
`follow`, `forum_post`, `forum_comment`, `referral_post`, `referral_connection`, `mentorship_request`, `mentorship_accepted`, `identity_reveal`, `user_followed`, `system`

**Delivery Methods:** `in_app`, `email`

### 7.9 Feeds Module

**Path:** `src/modules/feeds/`

**Responsibilities:** Unified timeline, engagement tracking, feed ranking, bookmarks.

**Components:**
- `feeds.controller.ts` — REST endpoints
- `feeds.service.ts` — Feed aggregation and queries
- `feed-posts.service.ts` — Post CRUD
- `feed-engagement.service.ts` — Likes, comments, shares
- `feed-ranking.service.ts` — Ranking algorithm

**DTOs:** create-post, create-comment, query-feed, share-feed-item

**Ranking Formula:**
```
engagementScore = (likes × 3) + (comments × 5) + (shares × 8) + (views × 0.1)
ageInHours = (now - created_at) / 3600000
timeDecay = 1 / (1 + ageInHours / 24)
velocityBonus = recentEngagement > threshold ? 1.2 : 1.0

rankScore = engagementScore × timeDecay × velocityBonus
```

### 7.10 Encryption Module

**Path:** `src/modules/encryption/`

**Responsibilities:** Expose encryption/decryption as REST endpoints for admin or testing use.

**Components:**
- `encryption.controller.ts` — Encrypt/decrypt endpoints
- `encryption.util.ts` — AES-256-GCM implementation
- `identity-reveal.util.ts` — Real name decryption for revealed identities

---

## 8. Security

### 8.1 Authentication

- **Provider:** Supabase Auth for user registration/login
- **Tokens:** JWT access tokens (short-lived) + refresh tokens (rotated on use)
- **Strategy:** Passport JWT strategy validates Bearer tokens from `Authorization` header
- **Guards:** `JwtAuthGuard` (global), `@Public()` decorator to opt-out specific endpoints

```typescript
// JWT Strategy extracts user from Supabase
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    return { id: payload.sub, email: payload.email };
  }
}
```

### 8.2 Field-Level Encryption

All PII is encrypted using AES-256-GCM before storage:

```typescript
// EncryptionUtil (src/common/utils/encryption.util.ts)
- encrypt(plaintext: string): string    // Returns iv:ciphertext:authTag (base64)
- decrypt(encrypted: string): string    // Parses and decrypts
- Key: 32-byte base64 string from ENCRYPTION_KEY env var
- Algorithm: AES-256-GCM with random IV per encryption
- Authenticated: GCM auth tag prevents tampering
```

### 8.3 Identity Revelation

Progressive identity revelation is consent-based:

```typescript
// IdentityRevealUtil (src/common/utils/identity-reveal.util.ts)
- getRevealedUserIds(viewerId, otherUserIds): Set<string>
- decryptRealName(firstNameEncrypted, lastNameEncrypted): string | null
```

Rules:
1. Users always see their own real name
2. Other users see real names only after mutual consent via `identity_reveals` table
3. Encrypted name fields are never sent to the client — only `display_name` (username or real name)

### 8.4 HTTP Security

```typescript
// Helmet configuration
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'ws://localhost:3000', 'wss://*'],
    },
  },
  crossOriginEmbedderPolicy: false,
});
```

### 8.5 Rate Limiting

Two layers of rate limiting:

1. **Global Throttle Guard** (NestJS ThrottlerModule):
   - Default: 300 requests per minute
   - Messaging: 50 requests per 10 seconds

2. **IP-based Middleware** (express-rate-limit):
   - 500 requests per 15-minute window per IP

### 8.6 Input Validation

```typescript
// Global ValidationPipe
new ValidationPipe({
  whitelist: true,              // Strip unknown properties
  transform: true,              // Auto-transform types
  forbidNonWhitelisted: true,  // Reject unknown properties
  forbidUnknownValues: true,   // Reject unknown enum values
});
```

All DTOs use `class-validator` decorators (`@IsString()`, `@IsUUID()`, `@MinLength()`, `@IsOptional()`, etc.) for strict input validation.

### 8.7 Resource Authorization Guards

| Guard | Module | Purpose |
|-------|--------|---------|
| `JwtAuthGuard` | Common | Bearer token validation |
| `RolesGuard` | Common | Role-based access control |
| `WsJwtGuard` | Common | WebSocket JWT validation |
| `ChatParticipantGuard` | Messaging | Verify user is in conversation |
| `MentorshipChatGuard` | Messaging | Mentorship chat access |
| `ReferralOwnerGuard` | Referral | Post ownership validation |
| `MentorActiveGuard` | Mentorship | Verify active mentor status |
| `MentorRelationshipGuard` | Mentorship | Verify relationship participant |
| `MentorshipOwnerGuard` | Mentorship | Request/session ownership |
| `NookActiveGuard` | Nooks | Verify nook is not expired |
| `NookCreatorGuard` | Nooks | Creator-only operations |
| `NookMemberGuard` | Nooks | Member-only operations |

---

## 9. Real-Time Communication

### 9.1 WebSocket Architecture

Socket.io gateway at `/ws/socket.io` with custom `WebSocketAdapter`:

```typescript
// Transport configuration
{
  path: '/ws/socket.io',
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  allowEIO3: true,   // Support older clients
  cors: { /* same as HTTP CORS */ },
}
```

### 9.2 Authentication Flow

```
1. Client connects to /ws/socket.io
2. Client emits 'authenticate' with JWT token
3. Server validates token via WsJwtGuard
4. On success: client joins user-specific room
5. Client can now join/leave conversation rooms
```

### 9.3 Events

| Event | Direction | Purpose |
|-------|-----------|---------|
| `authenticate` | Client → Server | JWT authentication |
| `connected` | Server → Client | Auth confirmation |
| `send_message` | Client → Server | Send a message |
| `new_message` | Server → Client | Receive a message |
| `typing_start` | Client → Server | Typing indicator on |
| `typing_end` | Client → Server | Typing indicator off |
| `join_conversation` | Client → Server | Join conversation room |
| `leave_conversation` | Client → Server | Leave conversation room |
| `user_online` | Server → Client | Presence notification |
| `user_offline` | Server → Client | Presence notification |
| `online_users` | Server → Client | List of online users |
| `ping` / `pong` | Bidirectional | Keepalive |

### 9.4 Scaling

Socket.io Redis adapter (`@socket.io/redis-adapter`) is configured for horizontal scaling across multiple server instances.

---

## 10. Testing

### 10.1 Overview

166 unit tests across 14 test suites covering all modules. Tests use Jest 30 with ts-jest for TypeScript compilation.

### 10.2 Test Suites

| Suite | Tests | Location |
|-------|-------|----------|
| encryption.util.spec.ts | 7 | `src/common/utils/` |
| jwt-auth.guard.spec.ts | 7 | `src/common/guards/` |
| identity-reveal.util.spec.ts | 9 | `src/common/utils/` |
| user.service.spec.ts | 4 | `src/modules/user/services/` |
| auth-core.service.spec.ts | 22 | `src/modules/auth/services/` |
| auth-password.service.spec.ts | 15 | `src/modules/auth/services/` |
| auth-tokens-profile.service.spec.ts | 25 | `src/modules/auth/services/` |
| forum.service.spec.ts | 7 | `src/modules/forum/services/` |
| referral.service.spec.ts | 5 | `src/modules/referral/services/` |
| mentorship-relationships.service.spec.ts | 18 | `src/modules/mentorship/services/` |
| conversations.service.spec.ts | 16 | `src/modules/messaging/services/` |
| nook-messages.service.spec.ts | 19 | `src/modules/nooks/services/` |
| notifications.service.spec.ts | 7 | `src/modules/notifications/` |
| feeds.service.spec.ts | 12 | `src/modules/feeds/services/` |

### 10.3 Test Strategy

**Unit Tests (current):**
- Service-layer business logic
- Guard authentication/authorization logic
- Encryption/decryption utilities
- Identity reveal logic
- Mock Supabase client for isolated testing

**Test Helpers:**
- `src/__tests__/helpers/mock-supabase.ts` — Shared Supabase mock factory

**Jest Configuration:**
```json
{
  "testRegex": ".*\\.spec\\.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "testEnvironment": "node",
  "moduleNameMapper": { "^@/(.*)$": "<rootDir>/src/$1" }
}
```

### 10.4 Running Tests

```bash
npm test               # Run all tests
npm run test:watch     # Watch mode
npm run test:cov       # With coverage report
npm run test:debug     # Debug mode with inspector
```

---

## 11. Deployment

### 11.1 Docker

**Multi-stage Dockerfile** (`docker/Dockerfile`):
- **Builder stage:** Node 20 Alpine, installs dependencies, compiles TypeScript, generates Prisma client
- **Production stage:** Minimal Alpine image, non-root user (`appuser:1001`), health check
- **Startup:** `npx prisma migrate deploy && node dist/main.js`
- **Health check:** `wget --spider http://localhost:3000/health`

**Docker Compose** (`docker/docker-compose.yml`):
- API service built from Dockerfile
- Redis 7 Alpine with health check and persistent volume
- Environment variables from `.env` file

### 11.2 Deployment Options

Five deployment options are documented in `DEPLOYMENT.md`:

1. **Railway** (Recommended) — Git-push deployment, auto SSL
2. **Render** — Free tier available, `render.yaml` config
3. **Docker + VPS** — Full control with Dockerfile, docker-compose, nginx
4. **AWS** — ECS Fargate or Elastic Beanstalk
5. **Fly.io** — Edge deployment with `fly.toml`

### 11.3 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string (pooled) | Yes |
| `DIRECT_URL` | Direct PostgreSQL connection (migrations) | Yes |
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes |
| `JWT_SECRET` | Access token signing secret | Yes |
| `JWT_REFRESH_SECRET` | Refresh token secret | Yes |
| `JWT_EMAIL_SECRET` | Email verification token secret | Yes |
| `JWT_RESET_SECRET` | Password reset token secret | Yes |
| `ENCRYPTION_KEY` | 32-byte base64 key for AES-256-GCM | Yes |
| `FRONTEND_URL` | Frontend URL for CORS and email links | Yes |
| `SMTP_HOST` | SMTP server host | Yes |
| `SMTP_PORT` | SMTP server port | Yes |
| `SMTP_USER` | SMTP username | Yes |
| `SMTP_PASS` | SMTP password | Yes |
| `FROM_EMAIL` | Sender email address | Yes |
| `PORT` | Server port (default: 3000) | No |
| `NODE_ENV` | Environment (development/production) | No |
| `LOG_LEVEL` | Winston log level (default: info) | No |

### 11.4 Health Checks

- **HTTP:** `GET /health` — Returns status, version, service states
- **Docker:** `wget --spider http://localhost:3000/health` every 30s
- **WebSocket:** `GET /ws-info` — Returns WebSocket configuration and event list

### 11.5 Scripts

| Script | Description |
|--------|-------------|
| `npm run start:dev` | Development server with hot reload (nodemon) |
| `npm run start:prod` | Production server (`node dist/main`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm test` | Run all unit tests |
| `npm run test:cov` | Tests with coverage report |
| `npm run lint` | ESLint with auto-fix |
| `npm run format` | Prettier formatting |
| `npm run db:migrate` | Create and apply migrations (dev) |
| `npm run db:deploy` | Apply pending migrations (prod) |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run db:push` | Push schema changes (no migration) |
| `npm run db:reset` | Reset database (destructive) |
| `npm run seed` | Seed fake data |

---

## 12. Feature Specifications

### 12.1 Avatar Generation

Deterministic, privacy-preserving default avatars for anonymous profiles:
- Server-side seed derived from `user_id` → emoji + palette descriptor
- No PII embedded in generated avatars
- Image uploads disabled by default (requires moderation pipeline)

### 12.2 Identity Revelation Workflow

Progressive, multi-stage identity reveal:

```
Stage 1: Anonymous (username only)
    │
    ▼  User sends reveal request
Stage 2: Pending (request + optional message)
    │
    ▼  Other user accepts
Stage 3: Revealed (real names visible to both parties)
```

- Owned by the identity reveal utility (`IdentityRevealUtil`)
- Audit trail via `identity_reveals` table with timestamps
- Revocation not yet implemented (v2)

### 12.3 Content Moderation (Planned)

Architecture designed for future AI moderation pipeline:

```
User submits content → AI pre-moderation
  score < 0.3  → Auto-approve
  0.3–0.7      → Hold for human review
  score ≥ 0.7  → Auto-hide + notify user
```

Current implementation: Manual moderation via `is_removed`, `removed_reason`, `is_flagged` fields on forum comments, nook messages, and messages.

### 12.4 Encryption Standards

- **Algorithm:** AES-256-GCM (AEAD — authenticated encryption with associated data)
- **Key size:** 256-bit (32 bytes), stored as 44-character base64 string
- **IV:** Random 16-byte IV generated per encryption operation
- **Output format:** `iv:ciphertext:authTag` (all base64-encoded)
- **Key management:** Single application key via `ENCRYPTION_KEY` environment variable
- **Future:** KMS integration (AWS/GCP/Azure) for key rotation

### 12.5 Feed Ranking Algorithm

The feeds module uses a weighted engagement scoring system:

```
Engagement weights:
  likes     × 3
  comments  × 5
  shares    × 8
  views     × 0.1

Time decay: 1 / (1 + ageInHours / 24)
  → Content loses ~50% score after 24 hours

Velocity bonus: 1.2× multiplier for content with rapid recent engagement

Final score = engagementScore × timeDecay × velocityBonus
```

Sort modes: `trending` (rank score), `recent` (created_at), `popular` (likes_count)

---

## 13. Future Roadmap

### Phase 1: Production Hardening
- Install and configure `@nestjs/schedule` for cron jobs
- Add integration tests for critical API paths
- Set up CI/CD pipeline (GitHub Actions)
- Database read replicas for scaling
- Redis caching for hot queries

### Phase 2: Enhanced Features
- AI content moderation pipeline (distilbert model)
- Video call integration for mentorship sessions
- Advanced analytics dashboard
- Push notifications (FCM/APNs)
- Full-text search with Typesense or Elasticsearch

### Phase 3: Scale & Mobile
- Mobile applications (React Native)
- Payment processing for premium features
- Horizontal scaling with Kubernetes
- CDN integration for static assets
- SOC 2 compliance audit
