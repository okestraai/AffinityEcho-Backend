# Deployment Guide

This guide covers deploying the AffinityEcho API backend to production. Choose the deployment option that fits your infrastructure.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Option 1: Railway (Recommended)](#option-1-railway-recommended)
- [Option 2: Render](#option-2-render)
- [Option 3: Docker + VPS](#option-3-docker--vps)
- [Option 4: AWS (ECS / Elastic Beanstalk)](#option-4-aws-ecs--elastic-beanstalk)
- [Option 5: Fly.io](#option-5-flyio)
- [Database Migrations](#database-migrations)
- [Environment Variables](#environment-variables)
- [Health Checks](#health-checks)
- [WebSocket Configuration](#websocket-configuration)
- [Monitoring & Logging](#monitoring--logging)
- [Security Hardening](#security-hardening)
- [Rollback Strategy](#rollback-strategy)

## Prerequisites

- Node.js >= 20
- Supabase project with PostgreSQL database provisioned
- SMTP credentials (Mailjet or any SMTP provider)
- All environment variables configured (see [Environment Variables](#environment-variables))

## Pre-Deployment Checklist

```bash
# 1. Run tests
npm test

# 2. Run linter
npm run lint

# 3. Build the project
npm run build

# 4. Verify the build starts
NODE_ENV=production node dist/main.js

# 5. Run database migrations against production
npm run db:deploy

# 6. Generate Prisma client
npm run db:generate
```

Ensure the following before deploying:

- [ ] All tests pass (166/166)
- [ ] Build completes without errors
- [ ] Environment variables are set in the target platform
- [ ] Database migrations are applied (`npm run db:deploy`)
- [ ] CORS origins include your production frontend URL
- [ ] SMTP credentials are valid
- [ ] Encryption key is a 32-byte base64 string
- [ ] JWT secrets are unique, random, and at least 64 characters

---

## Option 1: Railway (Recommended)

Best for: Quick deployment, automatic HTTPS, built-in database/redis, simple scaling.

### Setup

1. Create a [Railway](https://railway.app) account and install the CLI:

   ```bash
   npm install -g @railway/cli
   railway login
   ```

2. Initialize the project:

   ```bash
   cd affinity-echo-api
   railway init
   ```

3. Add environment variables in the Railway dashboard or via CLI:

   ```bash
   railway variables set NODE_ENV=production
   railway variables set PORT=3000
   railway variables set DATABASE_URL="postgresql://..."
   railway variables set DIRECT_URL="postgresql://..."
   # ... set all other variables from .env.example
   ```

4. Configure the build and start commands in Railway dashboard:

   - **Build Command:** `npm install && npm run db:generate && npm run build`
   - **Start Command:** `npm run db:deploy && npm run start:prod`

5. Deploy:

   ```bash
   railway up
   ```

### Railway Advantages

- Automatic HTTPS with custom domains
- Built-in Redis add-on (for caching/BullMQ)
- Auto-deploy on git push
- Health check monitoring
- Easy horizontal scaling

---

## Option 2: Render

Best for: Free tier available, automatic deploys from GitHub, managed SSL.

### Setup

1. Create a [Render](https://render.com) account.

2. Create a new **Web Service** connected to your GitHub repo.

3. Configure:

   - **Runtime:** Node
   - **Build Command:** `npm install && npm run db:generate && npm run build`
   - **Start Command:** `npm run db:deploy && npm run start:prod`
   - **Health Check Path:** `/health`

4. Add all environment variables in the Render dashboard.

5. Deploy. Render auto-deploys on every push to your main branch.

### render.yaml (Infrastructure as Code)

```yaml
services:
  - type: web
    name: affinity-echo-api
    runtime: node
    plan: starter
    buildCommand: npm install && npm run db:generate && npm run build
    startCommand: npm run db:deploy && npm run start:prod
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: "3000"
      - key: DATABASE_URL
        sync: false
      - key: DIRECT_URL
        sync: false
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_ANON_KEY
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: JWT_SECRET
        generateValue: true
      - key: JWT_REFRESH_SECRET
        generateValue: true
      - key: JWT_EMAIL_SECRET
        generateValue: true
      - key: JWT_RESET_SECRET
        generateValue: true
      - key: ENCRYPTION_KEY
        sync: false
      - key: FRONTEND_URL
        sync: false
      - key: SMTP_HOST
        sync: false
      - key: SMTP_PORT
        sync: false
      - key: SMTP_USER
        sync: false
      - key: SMTP_PASS
        sync: false
      - key: FROM_EMAIL
        sync: false
```

### Render Notes

- Free tier has cold starts (~30s spin-up). Use Starter plan ($7/mo) for always-on.
- WebSocket support works on paid plans.
- Custom domains with automatic SSL.

---

## Option 3: Docker + VPS

Best for: Full control, any cloud provider (DigitalOcean, Hetzner, Linode, AWS EC2).

### Dockerfile

Create or update `docker/Dockerfile`:

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=builder /app/dist ./dist

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
```

### docker-compose.yml

Create or update `docker/docker-compose.yml`:

```yaml
services:
  api:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    ports:
      - "${PORT:-3000}:3000"
    env_file:
      - ../.env
    environment:
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  redis_data:
```

### Deploy to VPS

```bash
# On your VPS
git clone <repo-url>
cd affinity-echo-api

# Configure environment
cp .env.example .env
nano .env  # Add production values

# Build and start
docker compose -f docker/docker-compose.yml up -d --build

# Check health
curl http://localhost:3000/health

# View logs
docker compose -f docker/docker-compose.yml logs -f api
```

### Reverse Proxy (nginx)

For HTTPS and WebSocket support, add nginx in front:

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    # API
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /ws/socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

---

## Option 4: AWS (ECS / Elastic Beanstalk)

Best for: Enterprise-grade, auto-scaling, integration with other AWS services.

### ECS with Fargate

1. Push Docker image to ECR:

   ```bash
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

   docker build -t affinity-echo-api -f docker/Dockerfile .
   docker tag affinity-echo-api:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/affinity-echo-api:latest
   docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/affinity-echo-api:latest
   ```

2. Create ECS Task Definition with:
   - **Container port:** 3000
   - **Health check:** `CMD-SHELL, wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1`
   - **Memory:** 512 MB (minimum), 1024 MB (recommended)
   - **CPU:** 256 (0.25 vCPU) minimum
   - Environment variables from AWS Secrets Manager or SSM Parameter Store

3. Create an ECS Service with an ALB:
   - Target group health check: `/health`
   - Enable sticky sessions for WebSocket support
   - Configure ALB listener for WebSocket upgrade on `/ws/socket.io/*`

### Elastic Beanstalk

1. Initialize:

   ```bash
   eb init affinity-echo-api --platform "Node.js 20" --region us-east-1
   ```

2. Create environment:

   ```bash
   eb create production --envvars NODE_ENV=production,PORT=3000
   ```

3. Set environment variables:

   ```bash
   eb setenv DATABASE_URL="postgresql://..." SUPABASE_URL="https://..." ...
   ```

4. Deploy:

   ```bash
   npm run build
   eb deploy
   ```

### AWS Notes

- Use ALB (not CLB) for WebSocket support
- Store secrets in AWS Secrets Manager, not environment variables
- Consider ElastiCache for Redis
- Use CloudWatch for logs and alarms

---

## Option 5: Fly.io

Best for: Edge deployment, global distribution, simple Docker-based workflow.

### fly.toml

```toml
app = "affinity-echo-api"
primary_region = "iad"

[build]
  dockerfile = "docker/Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

  [http_service.concurrency]
    type = "connections"
    hard_limit = 250
    soft_limit = 200

[[services]]
  internal_port = 3000
  protocol = "tcp"

  [[services.ports]]
    handlers = ["http"]
    port = 80
    force_https = true

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

  [[services.tcp_checks]]
    grace_period = "10s"
    interval = "15s"
    timeout = "5s"

  [[services.http_checks]]
    grace_period = "15s"
    interval = "30s"
    method = "GET"
    path = "/health"
    protocol = "http"
    timeout = "10s"
```

### Deploy

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login and launch
fly auth login
fly launch

# Set secrets
fly secrets set DATABASE_URL="postgresql://..." \
  SUPABASE_URL="https://..." \
  JWT_SECRET="..." \
  ENCRYPTION_KEY="..."
  # ... all other variables

# Deploy
fly deploy

# Check status
fly status
fly logs
```

### Fly.io Advantages

- Global edge deployment (low latency worldwide)
- Built-in WebSocket support
- Automatic HTTPS
- Persistent volumes for logs
- Upstash Redis add-on available

---

## Database Migrations

Prisma migrations must be applied before the application starts.

### Development

```bash
# Create and apply a new migration
npm run db:migrate

# View database in browser
npm run db:studio
```

### Production

```bash
# Apply pending migrations (non-interactive, safe for CI/CD)
npm run db:deploy

# Regenerate Prisma client after schema changes
npm run db:generate
```

### Migration Tips

- Always use `DIRECT_URL` (port 5432) for migrations — it bypasses pgbouncer
- `DATABASE_URL` (port 6543) is the pooled connection for the running application
- Never run `db:reset` in production
- Test migrations against a staging database first
- Back up the database before running migrations in production

---

## Environment Variables

Create a `.env` file from `.env.example` with production values:

```bash
# App
NODE_ENV=production
PORT=3000

# Database (Supabase PostgreSQL)
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# Supabase
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# JWT (generate unique random secrets, 64+ characters each)
JWT_SECRET=<random-64-chars>
JWT_REFRESH_SECRET=<random-64-chars>
JWT_EMAIL_SECRET=<random-64-chars>
JWT_RESET_SECRET=<random-64-chars>

# Encryption (32-byte base64 key)
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
ENCRYPTION_KEY=<base64-32-byte-key>

# Frontend
FRONTEND_URL=https://yourdomain.com

# SMTP
SMTP_HOST=in-v3.mailjet.com
SMTP_PORT=587
SMTP_USER=<mailjet-api-key>
SMTP_PASS=<mailjet-secret-key>
FROM_EMAIL=noreply@yourdomain.com
```

### Generating Secrets

```bash
# JWT secrets (64 random hex characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Encryption key (32-byte base64)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## Health Checks

The API exposes a health check at `GET /health`:

```json
{
  "status": "ok",
  "timestamp": "2026-02-17T12:00:00.000Z",
  "services": {
    "http": "running",
    "websocket": "running"
  },
  "version": "1.0.0",
  "environment": "production"
}
```

Configure your platform's health check to hit this endpoint:

- **Path:** `/health`
- **Method:** GET
- **Expected status:** 200
- **Interval:** 30s
- **Timeout:** 10s
- **Unhealthy threshold:** 3 failures

---

## WebSocket Configuration

The WebSocket server runs on the same port as HTTP at path `/ws/socket.io`.

### Platform Requirements

| Platform | WebSocket Support |
| -------- | ----------------- |
| Railway | Yes (automatic) |
| Render | Paid plans only |
| Docker + nginx | Yes (with upgrade headers) |
| AWS ALB | Yes (with sticky sessions) |
| Fly.io | Yes (automatic) |

### Key Settings

- **Path:** `/ws/socket.io`
- **Transports:** `websocket`, `polling` (fallback)
- **Ping interval:** 25s
- **Ping timeout:** 60s
- **Connect timeout:** 45s

Ensure your reverse proxy/load balancer:

1. Supports HTTP upgrade headers for WebSocket
2. Has a read timeout >= 86400s (24h) for persistent connections
3. Forwards `X-Forwarded-For` and `X-Forwarded-Proto` headers

---

## Monitoring & Logging

### Built-in Logging

Winston logger with daily rotation writes to `logs/` directory:

- `logs/application-%DATE%.log` — All logs
- `logs/error-%DATE%.log` — Errors only
- Console output with colorized formatting

### Recommended Monitoring Stack

| Tool | Purpose |
| ---- | ------- |
| [Sentry](https://sentry.io) | Error tracking and alerting |
| [Datadog](https://datadoghq.com) or [New Relic](https://newrelic.com) | APM, metrics, traces |
| [Uptime Robot](https://uptimerobot.com) | Uptime monitoring (free tier) |
| [Grafana Cloud](https://grafana.com) | Dashboards and alerting |

### Key Metrics to Monitor

- Response time (P50, P95, P99)
- Error rate (5xx responses)
- WebSocket active connections
- Database connection pool utilization
- Memory and CPU usage
- Rate limit hit rate

---

## Security Hardening

### Production Checklist

- [ ] `NODE_ENV=production` is set
- [ ] All JWT secrets are unique and random (64+ characters)
- [ ] Encryption key is a fresh 32-byte random key
- [ ] CORS origins only include your production frontend URL(s)
- [ ] Supabase service role key is not exposed to the client
- [ ] SMTP credentials use a dedicated sending domain
- [ ] Database uses SSL connections (`?sslmode=require`)
- [ ] Rate limiting is configured appropriately
- [ ] Swagger docs are disabled or auth-protected in production
- [ ] Logging does not output sensitive data (PII, tokens, passwords)
- [ ] `.env` file is not committed to version control

### CORS Configuration

Update `src/common/config/cors.config.ts` with your production frontend URLs:

```typescript
origin: [
  'https://yourdomain.com',
  'https://www.yourdomain.com',
],
```

---

## Rollback Strategy

### Quick Rollback

Most platforms support instant rollback to a previous deploy:

```bash
# Railway
railway rollback

# Fly.io
fly releases
fly deploy --image registry.fly.io/affinity-echo-api:v<previous>

# Render
# Use the dashboard to roll back to a previous deploy

# Docker
docker compose -f docker/docker-compose.yml down
docker compose -f docker/docker-compose.yml up -d --build  # with previous code version
```

### Database Rollback

Prisma does not auto-rollback migrations. If a migration causes issues:

1. Fix forward — create a new migration that reverses the change
2. Or restore from a database backup (Supabase has point-in-time recovery on Pro plan)

Never manually edit the `_prisma_migrations` table in production.
