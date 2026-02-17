# AffinityEcho API

A privacy-first anonymous professional networking platform built for underrepresented communities in tech. The backend powers anonymous forums, encrypted messaging, job referrals, mentorship matching, and progressive identity revelation — all with field-level encryption and consent-based workflows.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ / TypeScript 5.x |
| Framework | NestJS 11 |
| Database | PostgreSQL (Supabase) |
| ORM | Prisma 7.4 |
| Auth | Supabase Auth + JWT (Passport) |
| Real-time | Socket.io 4.8 |
| Cache | Redis (ioredis) |
| Queue | BullMQ |
| Encryption | AES-256-GCM (field-level) |
| Email | Nodemailer (Mailjet SMTP) |
| Logging | Winston + daily rotate |
| API Docs | Swagger / OpenAPI |

## Quick Start

### Prerequisites

- Node.js >= 20
- npm >= 10
- A [Supabase](https://supabase.com) project (PostgreSQL + Auth)
- Redis instance (optional for dev, required for prod)

### Setup

```bash
# Clone and install
git clone <repo-url>
cd affinity-echo-api
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Supabase credentials, JWT secrets, etc.

# Generate Prisma client and run migrations
npm run db:generate
npm run db:migrate

# Seed development data (optional)
npm run seed

# Start development server
npm run start:dev
```

The server starts at `http://localhost:3000`. Swagger docs are at `/api/v1/docs`.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string (pooled, port 6543) | Yes |
| `DIRECT_URL` | Direct PostgreSQL connection (port 5432, for migrations) | Yes |
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous/public key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (admin) | Yes |
| `JWT_SECRET` | Access token signing secret | Yes |
| `JWT_REFRESH_SECRET` | Refresh token signing secret | Yes |
| `JWT_EMAIL_SECRET` | Email verification token secret | Yes |
| `JWT_RESET_SECRET` | Password reset token secret | Yes |
| `ENCRYPTION_KEY` | 32-byte base64 key for AES-256-GCM | Yes |
| `FRONTEND_URL` | Frontend URL for CORS / email links | Yes |
| `PORT` | Server port (default: 3000) | No |
| `NODE_ENV` | `development` / `production` | No |
| `LOG_LEVEL` | Winston log level (default: `info`) | No |
| `SMTP_HOST` | SMTP server host | Yes |
| `SMTP_PORT` | SMTP server port | Yes |
| `SMTP_USER` | SMTP username | Yes |
| `SMTP_PASS` | SMTP password | Yes |
| `FROM_EMAIL` | Sender email address | Yes |

## Project Structure

```
src/
├── main.ts                          # Bootstrap, middleware, WebSocket adapter
├── app.module.ts                    # Root module
├── common/
│   ├── config/                      # CORS config
│   ├── constants/                   # Query field selectors
│   ├── decorators/                  # @Public, @CurrentUser, @Roles
│   ├── filters/                     # Global exception filter
│   ├── guards/                      # JWT, Roles, WebSocket guards
│   ├── interceptors/                # Logging + response transform
│   ├── middlewares/                  # Rate limiting
│   ├── templates/emails/            # Email templates
│   └── utils/                       # Encryption, logging, avatar, email
├── config/                          # Bull, Redis, Supabase, Swagger config
├── database/                        # Prisma + Supabase clients
├── jobs/                            # Cron jobs
└── modules/
    ├── auth/                        # Signup, login, OTP, OAuth, password reset
    ├── user/                        # Profile, settings, blocking, reports
    ├── forum/                       # Anonymous forums, topics, comments
    ├── referral/                    # Job referrals, connections, identity reveal
    ├── mentorship/                  # Profiles, requests, sessions, discovery
    ├── messaging/                   # Real-time chat, WebSocket gateway
    ├── nooks/                       # Small group communities
    ├── notifications/               # Multi-channel notifications
    ├── feeds/                       # Social feed with engagement ranking
    └── encryption/                  # Encryption utilities
```

## Modules

### Auth
Email/password signup with OTP verification, JWT access/refresh tokens, OAuth (Google, GitHub, LinkedIn), password reset flow, onboarding, profile management.

### User
Profile CRUD, privacy level management (`anonymous` / `pseudonymous` / `public`), account deactivation/deletion, user blocking, harassment reporting.

### Forum
Anonymous discussion forums with topics, nested comments, and custom reactions (`seen`, `validated`, `inspired`, `heard`). Forum membership and content moderation.

### Referral
Job referral marketplace with encrypted company/job details. Connection requests with slot management. Progressive identity revelation via consent-based workflow.

### Mentorship
Mentor/mentee profile creation, discovery with filtering, direct requests, relationship management, session scheduling with feedback tracking, bookmarks and follows.

### Messaging
Real-time encrypted messaging via Socket.io. 1:1 conversations, typing indicators, online presence, identity reveal requests. Dedicated mentorship chat channel.

### Nooks
Small group communities (public/private). Member management, nook-specific messaging with reactions.

### Notifications
In-app and email notifications. Notification types: follows, forum activity, referral updates, mentorship events, identity reveals, system alerts. User preference management.

### Feeds
Social feed with engagement-based ranking. Ranking formula combines weighted signals (likes, comments, shares, views), time decay, and velocity bonus. Supports bookmarks and multiple sort modes.

## API

**Base URL:** `/api/v1`

| Module | Prefix | Key Endpoints |
|--------|--------|---------------|
| Auth | `/auth` | `POST /signup`, `POST /login`, `POST /refresh`, `POST /verify-otp`, `POST /forgot-password` |
| User | `/user` | `GET /profile`, `PATCH /profile`, `POST /block/:id`, `POST /report/:id` |
| Forum | `/forum` | `GET /`, `POST /`, `GET /:id/topics`, `POST /:id/topics/:tid/comments` |
| Referral | `/referrals` | `GET /`, `POST /`, `POST /:id/like`, `POST /:id/bookmark`, `GET /:id/comments` |
| Mentorship | `/mentorship` | `GET /discover`, `POST /requests`, `GET /relationships`, `POST /sessions` |
| Messaging | `/messaging` | `GET /conversations`, `POST /conversations/:id/messages`, `POST /identity-reveal` |
| Nooks | `/nooks` | `GET /`, `POST /`, `POST /:id/messages`, `POST /:id/members` |
| Notifications | `/notifications` | `GET /`, `GET /unread-count`, `PATCH /:id/read` |
| Feeds | `/feeds` | `GET /`, `POST /like/:id`, `POST /bookmark/:id` |

**Swagger Docs:** `GET /api/v1/docs`
**Health Check:** `GET /health`
**WebSocket Info:** `GET /ws-info`

### WebSocket

Connect to `/ws/socket.io` with Socket.io client. Authenticate by emitting `authenticate` with a JWT.

Key events: `send_message`, `new_message`, `typing_start`, `typing_end`, `user_online`, `user_offline`, `join_conversation`, `leave_conversation`.

## Security

- **Authentication:** Supabase Auth + JWT with access/refresh token rotation
- **Encryption:** AES-256-GCM field-level encryption for all PII (names, race, gender, career level, company, message content)
- **Headers:** Helmet.js with CSP, CORS whitelist
- **Rate Limiting:** Global throttle (300 req/min) + custom middleware (500 req/15min per IP)
- **Validation:** class-validator with whitelist, forbidNonWhitelisted, forbidUnknownValues
- **Privacy Levels:** Users control identity visibility (anonymous → pseudonymous → public)
- **Identity Revelation:** Consent-based — both parties must agree before real names are shared

## Database

PostgreSQL via Supabase with Prisma ORM. 32 tables covering user profiles, forums, referrals, mentorship, messaging, nooks, notifications, and feeds.

Key encrypted fields: `first_name_encrypted`, `last_name_encrypted`, `race_encrypted`, `gender_encrypted`, `career_level_encrypted`, `company_encrypted`, `affinity_tags_encrypted`, `content_encrypted`.

### Commands

```bash
npm run db:migrate     # Create/apply migrations (dev)
npm run db:deploy      # Apply pending migrations (prod)
npm run db:generate    # Regenerate Prisma client
npm run db:studio      # Open Prisma Studio GUI
npm run db:push        # Push schema changes (no migration)
npm run db:reset       # Reset database (destructive)
npm run seed           # Seed fake data
```

## Testing

166 unit tests across 14 test suites covering all modules.

```bash
npm test               # Run all tests
npm run test:watch     # Watch mode
npm run test:cov       # With coverage report
```

### Test Suites

| Suite | Tests | Module |
|-------|-------|--------|
| encryption.util.spec.ts | 7 | Common |
| jwt-auth.guard.spec.ts | 7 | Common |
| identity-reveal.util.spec.ts | 9 | Common |
| user.service.spec.ts | 4 | User |
| auth-core.service.spec.ts | 22 | Auth (signup, login, OTP) |
| auth-password.service.spec.ts | 15 | Auth (password, logout, profile, OAuth) |
| auth-tokens-profile.service.spec.ts | 25 | Auth (refresh, OTP, profile, password) |
| forum.service.spec.ts | 7 | Forum |
| referral.service.spec.ts | 5 | Referral |
| mentorship-relationships.service.spec.ts | 18 | Mentorship |
| conversations.service.spec.ts | 16 | Messaging |
| nook-messages.service.spec.ts | 19 | Nooks |
| notifications.service.spec.ts | 7 | Notifications |
| feeds.service.spec.ts | 12 | Feeds |

Shared test helpers are in `src/__tests__/helpers/mock-supabase.ts`.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run start:dev` | Dev server with hot reload (nodemon) |
| `npm run start:prod` | Production server (`node dist/main`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm test` | Run unit tests |
| `npm run test:cov` | Tests with coverage |
| `npm run lint` | ESLint with auto-fix |
| `npm run format` | Prettier formatting |
| `npm run db:migrate` | Prisma dev migrations |
| `npm run db:deploy` | Prisma prod migrations |
| `npm run seed` | Seed database with fake data |

## License

UNLICENSED — Private project.
