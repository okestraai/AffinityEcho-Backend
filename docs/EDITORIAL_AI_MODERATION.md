# Editorial AI Moderation — Together.ai Integration Design

> **Status:** Design proposal
> **Scope:** Post-creation moderation of `nooks`, `nook_messages`, `forum_topics`, `forum_comments`, `feed_posts`, and `feed_comments`.
> **Provider:** [Together.ai](https://www.together.ai) (OpenAI-compatible `/v1/chat/completions`)
> **Posture:** **Post-moderation** — content is published immediately, then evaluated asynchronously. Policy violations are hidden, flagged for human review, or removed depending on severity.

---

## 1. Why this exists

AffinityEcho is anonymous-first and serves underrepresented professionals discussing sensitive workplace topics (bias, harassment, mental health, legal risk). The current safety layer is reactive only:

- `content_flags` — user-initiated reports.
- Rule-based auto-hide at **3+ unique flags** ([content-safety.service.ts](../src/modules/content-safety/content-safety.service.ts)).
- No proactive scan, no nuance, no editorial signal.

This leaves a gap: harmful content survives until enough users flag it, and benign-but-sensitive content (e.g., a venting post about a manager) cannot be distinguished from a personal attack. An **editorial AI** closes that gap by reading every new piece of content with full parent context and assigning a moderation decision within seconds of publication.

We deliberately keep this **post-moderation** (not pre-moderation) so:

1. The author's UX is never blocked by AI latency.
2. The platform never silently swallows speech without an audit trail.
3. Mistakes are reversible — every action writes to `content_moderation` with a reason.

---

## 2. Model selection — Together.ai

**Single model:** `meta-llama/Meta-Llama-3-8B-Instruct-Lite` at **$0.10 / 1M tokens** (input and output).

> **Why not Llama-3.1-8B-Instruct-Turbo?** Verified against Together.ai's current serverless catalog ([docs](https://docs.together.ai/docs/serverless-models), [pricing](https://www.together.ai/pricing) — both checked at design time): `meta-llama/Llama-3.1-8B-Instruct-Turbo` is **not** on the serverless tier today. Using it would require a **dedicated endpoint** — provisioned hourly at ~$0.20/hour per replica minimum, which is the wrong cost model for bursty post-creation traffic and would idle-burn during quiet hours. We want pay-per-token.

### Serverless options actually available (May 2026)

| Model ID | Price (per 1M tok) | Fit for editorial moderation |
|----------|--------------------|------------------------------|
| **`meta-llama/Meta-Llama-3-8B-Instruct-Lite`** | **$0.10 in / $0.10 out** | **✅ Chosen.** Llama 3 8B instruct, FP8-quantized ("Lite"). Strong instruction-following, JSON mode, well-proven. Cheapest 8B-class option on the platform. |
| `meta-llama/Llama-Guard-4-12B` | $0.20 / $0.20 | Classifier only — outputs `safe/unsafe + category codes`. Cannot produce the `allow/hide/remove/escalate` verdict with rationale we need. Kept as future fallback for vision/image moderation (Guard 4 is multimodal). |
| `meta-llama/Llama-3.3-70B-Instruct-Turbo` | $0.88 / $0.88 | Reserved as **escape hatch** — see §2.1 below. ~9× the cost of Lite, but we may invoke it manually for hard cases identified by reviewers if Lite's reverse rate stays high. |

We pick the **Lite** model. It is the cheapest serverless option that can (a) follow a multi-paragraph policy prompt, (b) reason about parent-chain context, and (c) reliably emit structured JSON.

### Why 8B-Lite is enough

The model is not being asked to write essays or solve math. It does one thing: read a JSON payload, apply a policy, emit a JSON verdict. Llama 3 8B Instruct Lite handles this reliably with `temperature=0.1` and JSON mode. Where it is genuinely uncertain — that's exactly the signal we use to route to a human (see §7). **We treat low confidence as a feature, not a bug.** The pipeline is model-agnostic — `TOGETHER_MODEL` is an env var; we can swap to the 70B Turbo or to Llama 4 variants when they hit serverless, without code changes.

### 2.1 Escape hatch — when to reach for the 70B

If post-launch metrics show Lite has high reviewer reverse rate (> 10%) on a specific category (e.g., it keeps misclassifying nuanced harassment), the cheap fix is **not** to make every request more expensive. Instead:

- Route only items in that category, OR only items where Lite returned `confidence < 0.75`, to `meta-llama/Llama-3.3-70B-Instruct-Turbo` as a second-opinion call before queuing for humans.
- That keeps the floor at $0.10/M and pays the 70B's $0.88/M only on the small fraction of borderline cases.
- This is a one-line code change inside `enforcement.service.ts`; the prompt and payload are identical between the two models.

Don't add this tier preemptively — earn it from data, per §10.

### Cost projection

Assume 50k new content items/day, average payload 1.2k input tokens, 200 output tokens.

- 50k × 1.4k tok = 70M tok/day @ $0.10 = **$7.00/day ≈ $210/mo**.

That is the entire moderation spend for the platform. With the 70B escape hatch active on ~5% of items, total ≈ $9.40/day ≈ $280/mo.

### Together.ai API — endpoint, auth, and key

| Item | Value |
|------|-------|
| **Base URL** | `https://api.together.xyz/v1` |
| **Endpoint we call** | `POST https://api.together.xyz/v1/chat/completions` |
| **Model ID** | `meta-llama/Meta-Llama-3-8B-Instruct-Lite` |
| **Tier** | Serverless (pay-per-token) — no provisioned endpoint needed |
| **Auth header** | `Authorization: Bearer <TOGETHER_API_KEY>` |
| **Content-Type** | `application/json` |
| **Schema compatibility** | OpenAI-compatible — same request/response shape as `openai-node`/`openai-python`. |

#### Where the API key comes from

Together.ai issues keys per-account. To get one:

1. Sign in at https://api.together.xyz (or https://together.ai → "API Keys" in account settings).
2. Click **Create new key**, name it `affinity-echo-editorial-prod` (or `-dev`).
3. Copy the key — it starts with `tgp_` and is shown **once**. Store it immediately in:
   - Local dev: `AffinityEcho-Backend/.env` (gitignored).
   - Staging/prod: `infrastructure/production/api.env` (the same file already holding `CF_ACCESS_*`), then redeploy the `production` stack.
4. Issue one key per environment. **Never share keys across dev/staging/prod.** Revoking a leaked dev key shouldn't take down prod.

> **Rotation policy:** rotate every 90 days, and immediately if any developer with key access leaves the team. Together.ai supports multiple active keys per account, so rotate without downtime: create new key → deploy → revoke old key.

#### Env file

```env
# .env / infrastructure/production/api.env additions
TOGETHER_API_KEY=tgp_REPLACE_ME_FROM_TOGETHER_DASHBOARD
TOGETHER_BASE_URL=https://api.together.xyz/v1
TOGETHER_MODEL=meta-llama/Meta-Llama-3-8B-Instruct-Lite
TOGETHER_ESCALATION_MODEL=meta-llama/Llama-3.3-70B-Instruct-Turbo  # optional, used only by §2.1 escape hatch
TOGETHER_ESCALATION_ENABLED=false                                  # turn on after week-2 data
TOGETHER_TIMEOUT_MS=15000
TOGETHER_MAX_RETRIES=3
MODERATION_ENABLED=true

# Enforcement thresholds (see §7)
MODERATION_AUTO_REMOVE_CONFIDENCE=0.90   # below this → human review, not instant remove
MODERATION_AUTO_HIDE_CONFIDENCE=0.75     # below this → allow but flag for review
```

> **Env hygiene reminder:** `TOGETHER_API_KEY` values must be **unquoted** in `infrastructure/production/*.env` files (same rule we already apply to `CF_ACCESS_*`). A quoted key like `TOGETHER_API_KEY="tgp_..."` is read by Docker including the literal quote characters and authentication will 401.

#### Smoke-test the key with curl

Run this from any machine to confirm the key works before wiring it into the service. Replace `$TOGETHER_API_KEY` with your actual key (or `export` it first).

```bash
curl -sS https://api.together.xyz/v1/chat/completions \
  -H "Authorization: Bearer $TOGETHER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta-llama/Meta-Llama-3-8B-Instruct-Lite",
    "messages": [
      {"role": "system", "content": "Return ONLY this JSON: {\"verdict\":\"allow\",\"confidence\":0.99,\"severity\":\"none\",\"categories\":[\"safe\"],\"rationale\":\"smoke test\",\"userFacingReason\":null}"},
      {"role": "user",   "content": "{\"subject\":{\"type\":\"feed_comment\",\"content\":\"thanks for sharing\"}}"}
    ],
    "max_tokens": 200,
    "temperature": 0.1,
    "response_format": {"type": "json_object"}
  }'
```

Expected: a `200 OK` with a `choices[0].message.content` containing the JSON verdict. A `401 Unauthorized` means the key is wrong, quoted, or revoked. A `429` means rate-limited — check the Together.ai dashboard for your tier's RPM/TPM limits.

#### Inside the service (NestJS)

The `EditorialService` reads the key once at construction time. **Never log the key.** Never include it in error messages, traces, or `raw_response` payloads.

```ts
// src/modules/content-safety/editorial/editorial.service.ts (sketch)
constructor(private config: ConfigService) {
  this.apiKey  = this.config.getOrThrow<string>('TOGETHER_API_KEY');
  this.baseUrl = this.config.get<string>('TOGETHER_BASE_URL') ?? 'https://api.together.xyz/v1';
  this.model   = this.config.get<string>('TOGETHER_MODEL')    ?? 'meta-llama/Meta-Llama-3-8B-Instruct-Lite';
  // Optional escape-hatch model used by enforcement.service.ts on low-confidence items
  this.escalationModel = this.config.get<string>('TOGETHER_ESCALATION_MODEL') ?? 'meta-llama/Llama-3.3-70B-Instruct-Turbo';
}

async judge(payload: EditorialPayload): Promise<EditorialVerdict> {
  const res = await fetch(`${this.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model: this.model,
      messages: [
        { role: 'system', content: EDITORIAL_SYSTEM_PROMPT },
        { role: 'user',   content: JSON.stringify(payload) },
      ],
      max_tokens: 400,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(this.timeoutMs),
  });

  if (!res.ok) {
    // IMPORTANT: do not include this.apiKey or req body in error logs
    throw new TogetherApiError(res.status, await res.text());
  }
  return this.parseVerdict(await res.json());
}
```

---

## 3. Where moderation hooks in

The platform has three content surfaces, each with a parent → child structure. The editorial AI runs on every newly created item.

| Surface | Parent table | Child table | Self-reply key | Hook |
|---------|--------------|-------------|----------------|------|
| Nooks | [`nooks`](../prisma/schema.prisma) | `nook_messages` | `parent_message_id` | After `NookMessagesService.create()` and `NooksService.create()` |
| Forum | `forum_topics` | `forum_comments` | `parent_comment_id` | After topic create and `CommentService` create |
| Feed | `feed_posts` (also polymorphic targets: `forum_topic`, `nook_message`) | `feed_comments` | `parent_comment_id` | After `FeedPostsService.create()` and feed-comment create |

The hook is a single line at the end of each create flow:

```ts
await this.moderationQueue.add('moderate', {
  contentType: 'feed_comment',
  contentId: created.id,
  authorId: created.user_id,
  // parent walk is rebuilt inside the worker — keep the enqueue payload tiny
});
```

We deliberately **do not** inline the LLM call. Together.ai p95 latency is 1-3s; that latency belongs in a job, not on the user's request thread.

---

## 4. Queue architecture

BullMQ is already wired up ([`src/config/bull.config.ts`](../src/config/bull.config.ts)). We add one queue:

```
moderation
  ├── moderate            (default priority, every new content item)
  ├── moderate-recheck    (low priority, re-evaluate items with new flags)
  └── moderate-context    (high priority, parent + this item — used after edits)
```

**Concurrency:** start at 4 workers. Together.ai allows generous rate limits on paid tier; the choke point is our DB writes, not their API.

**Retries:** 3 attempts, exponential backoff (1s, 5s, 30s). On terminal failure, write a `content_moderation` row with status `error` and leave the content visible — **fail open**. A silent moderation outage must never look like a silent ban.

**Idempotency:** keyed on `(content_type, content_id)`. A re-enqueue replaces the prior pending job for the same content.

---

## 5. Context-aware payload — the heart of the design

The LLM's verdict quality depends entirely on the **context** we send. A raw comment "you should quit" is benign on a forum topic about job-hunting strategy and concerning on a topic about depression. The payload **must** include the parent chain.

### Context-walk rules

For every content item, we walk **up** to the root and serialize the chain. Direction is always child → parent.

| Item type | Walk |
|-----------|------|
| `nook` (root post) | self only — it has no parent |
| `nook_message` | self → `nook` |
| `nook_message` (reply) | self → `parent_message` (`nook_messages.parent_message_id`) → `nook` |
| `forum_topic` (root) | self only |
| `forum_comment` | self → `forum_topic` |
| `forum_comment` (reply) | self → `parent_comment` (`forum_comments.parent_comment_id`) → `forum_topic` |
| `feed_post` (root) | self only |
| `feed_comment` | self → polymorphic parent (`feed_post` \| `forum_topic` \| `nook_message`) via `(content_type, content_id)` |
| `feed_comment` (reply) | self → `parent_comment` → polymorphic parent |

We **never** descend into sibling comments. Siblings are noise for editorial review — we are judging this specific item, not the whole thread.

### Truncation

- Parent post: first 1,500 chars of `content` (titles are always full).
- Parent comment: first 800 chars.
- Subject (the item being moderated): **full content, no truncation**. Truncating the thing we're judging defeats the purpose.

### Payload schema

```jsonc
{
  "subject": {
    "type": "feed_comment",       // nook | nook_message | forum_topic | forum_comment | feed_post | feed_comment
    "id": "uuid",
    "authorId": "uuid",
    "authorIsAnonymous": true,
    "content": "<full text of the item being moderated>",
    "createdAt": "2026-05-11T14:02:11Z",
    "mentions": ["uuid-of-mentioned-user"],
    "attachments": []             // future: image/url moderation
  },
  "parentChain": [
    // Ordered nearest → root. Empty array for root posts.
    {
      "type": "feed_comment",
      "id": "uuid",
      "authorId": "uuid",
      "content": "<truncated 800-char parent comment>",
      "createdAt": "2026-05-11T13:58:02Z"
    },
    {
      "type": "feed_post",
      "id": "uuid",
      "authorId": "uuid",
      "title": null,              // feed_posts have no title; topics do
      "content": "<truncated 1500-char parent post>",
      "tags": [],
      "visibility": "public",
      "createdAt": "2026-05-11T13:45:09Z"
    }
  ],
  "container": {
    // The room/forum the content lives in. Optional; only present for nook_message/forum items.
    "type": "nook",
    "id": "uuid",
    "title": "Salary negotiation stories",
    "scope": "global",            // global | company
    "urgency": "medium",          // nooks only
    "temperature": "warm"         // nooks only
  },
  "authorSignals": {
    // Lightweight reputation features — no PII, no usernames.
    "accountAgeDays": 142,
    "priorFlagsAgainstAuthor": 0,
    "priorRemovalsAgainstAuthor": 0,
    "postsLast24h": 3
  },
  "policyVersion": "2026-05-11.v1"
}
```

### Worked example — nested reply

Author posts in a nook called "Performance review prep" (the container). They reply to another user's comment with: *"That sounds like retaliation, you should document everything before HR sees it."*

The serialized payload for that **single comment** would be:

```jsonc
{
  "subject": {
    "type": "nook_message",
    "id": "msg-789",
    "content": "That sounds like retaliation, you should document everything before HR sees it.",
    ...
  },
  "parentChain": [
    {
      "type": "nook_message",
      "id": "msg-456",
      "content": "My manager started giving me bad reviews two weeks after I filed the complaint."
    }
  ],
  "container": {
    "type": "nook",
    "id": "nook-123",
    "title": "Performance review prep",
    "scope": "global"
  },
  ...
}
```

Without the parent chain, the new comment looks like loose legal advice. **With** the parent chain, the editorial AI correctly reads it as a supportive response to suspected workplace retaliation and returns `verdict: allow, category: supportive_legal_guidance`. Context determines the verdict.

---

## 6. LLM contract

A single call per item, to `meta-llama/Meta-Llama-3-8B-Instruct-Lite`.

### System prompt

Stored in [`src/modules/content-safety/editorial/editorial-prompts.ts`](../src/modules/content-safety/editorial/editorial-prompts.ts) (to be created).

```
You are the Editorial AI for AffinityEcho, an anonymous-first professional networking platform
serving underrepresented professionals. Your job is post-publication moderation: read the item
being judged in the context of its parent chain and container, then return a structured verdict.

POLICY PRIORITIES (highest → lowest)
1. User safety — credible self-harm, threats, doxing, sexual content involving minors → REMOVE.
2. Targeted harassment — directed slurs, hate speech, sustained pile-ons → REMOVE or HIDE.
3. Misinformation in safety-critical domains (medical, legal, mental health crisis) → HIDE for review.
4. Workplace venting, frustration, criticism of named non-public individuals → ALLOW unless it
   escalates into doxing or threats. Underrepresented professionals must be able to describe their
   experiences candidly, including naming patterns of bias.
5. Anonymous attribution of misconduct to named companies/managers → ALLOW; the platform's purpose
   is precisely to enable this kind of speech. Flag only if it crosses into actionable defamation
   (specific false claims of crime, fabricated quotes).

NEVER REMOVE for:
- Strong negative emotions about workplaces or named non-public individuals.
- Discussion of bias, harassment, microaggressions even when graphic.
- Legal/HR strategy advice between users.
- Anonymous accounts of trauma, including detailed accounts.

CONTEXT RULES
- The parentChain tells you what the item is responding to. A comment that says "you should
  document this" is supportive in the context of a harassment story and concerning in a stalking
  context. Use the chain.
- The container.scope=="company" means the audience is the author's coworkers. Treat naming
  individuals more cautiously.
- authorSignals are weak priors only. Do not punish low-reputation accounts; do not exempt
  high-reputation accounts.

CONFIDENCE — be honest. The system uses your confidence to decide whether to act instantly or
route to a human. Penalising your own uncertainty is the right behavior:
- 0.90+   only when the violation (or non-violation) is unambiguous to a fluent English reader
- 0.75-0.89  clear lean, but you can imagine a reasonable disagreement
- 0.60-0.74  genuinely uncertain — pick your best verdict but trust the system to route to human
- <0.60   you cannot decide; emit verdict="escalate" with confidence reflecting your uncertainty

OUTPUT — return ONLY this JSON, no prose:

{
  "verdict": "allow" | "hide" | "remove" | "escalate",
  "confidence": 0.0-1.0,
  "severity": "none" | "low" | "medium" | "high" | "critical",
  "categories": ["string", ...],           // from the taxonomy below
  "rationale": "<= 240 chars, plain English, no quoting >12 verbatim words from subject",
  "userFacingReason": "<= 140 chars, what the author would see if hidden/removed, or null"
}

VERDICTS (advisory — the platform's enforcement rules in §7 may override based on confidence)
- allow:    no policy concern detected.
- hide:     concerning enough to remove from feeds.
- remove:   clear, severe policy violation.
- escalate: you cannot decide — route to a human.

SEVERITY (use independent of verdict — it's the *if-true* impact)
- none:     no concern.
- low:      borderline rudeness, mild spam.
- medium:   harassment, misinformation in non-critical domain.
- high:     hate speech, doxing, severe harassment, defamation risk.
- critical: credible threats, CSAM, active self-harm/suicidal ideation, mass-casualty content.

TAXONOMY (use these exact strings)
- safe, supportive, venting, criticism, advice
- spam, off_topic
- harassment, hate_speech, threat, self_harm, sexual, doxing, misinformation
- legal_risk, crisis_signal, names_individual
```

### Request

```jsonc
POST https://api.together.xyz/v1/chat/completions
Authorization: Bearer $TOGETHER_API_KEY
{
  "model": "meta-llama/Meta-Llama-3-8B-Instruct-Lite",
  "messages": [
    { "role": "system", "content": "<editorial system prompt above>" },
    { "role": "user",   "content": "<JSON.stringify(payload from §5)>" }
  ],
  "max_tokens": 400,
  "temperature": 0.1,
  "response_format": { "type": "json_object" }
}
```

### Expected output

```jsonc
{
  "verdict": "allow",
  "confidence": 0.88,
  "severity": "low",
  "categories": ["supportive", "advice"],
  "rationale": "Comment offers documentation strategy in response to a story consistent with workplace retaliation. Supportive peer advice; no policy violation.",
  "userFacingReason": null
}
```

---

## 7. Enforcement pathway — instant vs. human review

The model emits a *suggestion*. The **platform** decides whether to act on it instantly or route it to a human. This split is the entire safety design: the cheap model is fast and good enough most of the time, and the human queue catches everything it isn't.

### The two-axis decision matrix

For each verdict, we combine the model's `confidence` with its `severity` (and the `categories` for hard-policy carve-outs).

| Model verdict | Model severity | Model confidence | **Platform action** | Notes |
|---------------|---------------|-----------------|---------------------|-------|
| `allow` | `none` / `low` | ≥ 0.75 | **Instant: publish, done.** | No DB write to content_moderation needed beyond an `allowed` audit row (cheap upsert). |
| `allow` | `medium` / `high` / `critical` | any | **Allow + queue for human review.** | Model thinks it's fine but flagged a risky category. Don't second-guess by hiding, but log for a human. |
| `allow` | any | < 0.75 | **Allow + queue for human review.** | Low-confidence allow = uncertainty; humans audit. |
| `hide` | `low` / `medium` | ≥ 0.75 | **Instant hide + queue for human review.** | Hidden from feeds, visible to author with a "your post is being reviewed" notice. |
| `hide` | `high` / `critical` | ≥ 0.75 | **Instant hide + priority human review (≤ 1h SLA).** | |
| `hide` | any | < 0.75 | **Allow + queue for human review.** | We do not hide on low confidence. False hides damage trust on an anonymous-speech platform. |
| `remove` | `low` / `medium` | any | **Downgrade to hide + queue for human review.** | We never instant-remove for low/medium severity. Removal is final; mistakes are costly. |
| `remove` | `high` | ≥ 0.90 **and** category ∈ instant-remove list (below) | **Instant remove + audit.** | |
| `remove` | `high` | < 0.90, or category not in instant-remove list | **Hide + priority human review.** | |
| `remove` | `critical` | ≥ 0.85 **and** category ∈ instant-remove list | **Instant remove + admin alert + safety hooks (see below).** | |
| `remove` | `critical` | < 0.85 | **Hide + admin pager alert (≤ 15min SLA).** | |
| `escalate` | any | any | **Allow + queue for human review.** | Model itself opted out. Trust that signal. |

#### The "instant-remove list"

These are the **only** categories where the platform will remove content without a human ever looking at it. They're picked because (a) the cost of a false negative is severe, (b) the categories are well-defined enough for an 8B model to recognize at ≥0.90 confidence, and (c) they have minimal overlap with the kinds of speech we want to protect.

- `sexual` **and** any indicator the subject is a minor → **instant remove + immediate admin alert + legal-hold workflow** (NCMEC reporting obligations live downstream).
- `threat` with a named target and explicit harm language.
- `doxing` — sharing of someone's home address, phone number, real name + employer when the post explicitly seeks to harm or expose.
- `spam` with `severity=high` (obvious commercial spam, link farms, scams).

**Everything else** — harassment, hate speech, misinformation, legal-risk content, off-topic, venting that crossed a line — goes through the hide-then-human path. The 8B model is not allowed to permanently remove that kind of content on its own.

#### Hard overrides (regardless of model output)

A handful of conditions bypass the matrix entirely:

| Condition | Action |
|-----------|--------|
| Category `crisis_signal` or `self_harm` with severity ≥ `medium` | **Always queue for human review at priority `urgent`. Trigger safety-resources DM to author.** Never auto-remove — removing a cry for help is harmful. |
| Author is a verified admin / moderator | Skip moderation entirely. Audit log only. |
| Container is a nook expiring in < 1 hour | Skip moderation. Content will be gone before review matters. |
| Model returns invalid JSON or call fails after retries | Allow + queue for human review with `system_error` flag. **Never** auto-hide on system failure. |
| Subject has already been hidden/removed by user-flag rules (the 3-flag auto-hide) | Skip — already actioned. |

### Human review queue

A new table `moderation_review_queue` holds items pending review:

```sql
CREATE TABLE moderation_review_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type    text NOT NULL,
  content_id      uuid NOT NULL,
  priority        text NOT NULL CHECK (priority IN ('urgent','high','normal','low')),
  reason          text NOT NULL,              -- e.g. 'low_confidence_hide', 'crisis_signal'
  ai_verdict      jsonb NOT NULL,             -- full LLM response for the reviewer to see
  ai_payload      jsonb NOT NULL,             -- §5 payload incl. parentChain — reviewers need context too
  current_state   text NOT NULL,              -- 'visible' | 'hidden' (matches what the platform did)
  status          text NOT NULL DEFAULT 'pending',  -- pending | claimed | resolved
  claimed_by      uuid,
  resolved_by     uuid,
  resolution      text,                       -- 'confirm' | 'reverse' | 'modify'
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (content_type, content_id)
);
CREATE INDEX ON moderation_review_queue (status, priority, created_at);
```

**Priority SLAs** (proposed, tune from week-2 data):

| Priority | Trigger | Target review time |
|----------|---------|---------------------|
| `urgent` | crisis_signal, critical severity, admin pager alert | ≤ 15 min |
| `high` | hide on high-severity content | ≤ 1 hour |
| `normal` | hide on low/medium severity, low-confidence verdicts | ≤ 24 hours |
| `low` | allow + medium-severity audit, low-confidence allow | best-effort, batched daily |

### Decision pipeline

```
┌──────────────────┐
│ Content created  │
└─────────┬────────┘
          │
          ▼
┌──────────────────────────┐
│ Hard-override check      │
│  - admin? expiring nook? │──── skip ────► record + done
│  - already actioned?     │
└─────────┬────────────────┘
          │
          ▼
┌──────────────────────────┐
│ Build context payload    │
│  (subject + parentChain  │
│   + container + signals) │
└─────────┬────────────────┘
          │
          ▼
┌──────────────────────────┐
│ Call Llama 3 8B Lite     │
└─────────┬────────────────┘
          │
          ▼
┌──────────────────────────┐
│ Crisis / hard-override   │── crisis ───► allow + URGENT review + safety DM
│ post-LLM checks          │── invalid ──► allow + review (system_error)
└─────────┬────────────────┘
          │
          ▼
┌────────────────────────────────────────────────┐
│ Apply enforcement matrix (verdict × severity   │
│   × confidence × category):                    │
│                                                │
│  ┌──────────────────────┐  ┌────────────────┐  │
│  │  INSTANT ENFORCEMENT │  │  HUMAN REVIEW  │  │
│  │  - allow (high-conf, │  │  - low conf    │  │
│  │     low sev)         │  │  - hide        │  │
│  │  - hide (high-conf,  │  │  - downgraded  │  │
│  │     low/med sev)     │  │     remove     │  │
│  │  - remove (high-conf,│  │  - crisis      │  │
│  │     high/crit sev,   │  │  - escalate    │  │
│  │     allow-list cat)  │  │                │  │
│  └──────────────────────┘  └────────────────┘  │
└────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────┐
│ Writes:                  │
│  - content_moderation    │  (always — full audit)
│  - is_hidden/is_removed  │  (if instant action)
│  - moderation_review_    │  (if review needed)
│      queue               │
│  - notifications         │  (if user-facing notice)
└──────────────────────────┘
```

### Writes

Every job writes exactly one row to `content_moderation`:

```sql
INSERT INTO content_moderation
  (content_type, content_id, moderation_status, moderation_reason,
   moderated_by, model_version, raw_response, moderated_at)
VALUES
  ($1, $2, $3, $4, 'ai:editorial', $5, $6, NOW());
```

- `moderation_status` is the **platform's** decision (`allowed`, `hidden`, `removed`, `pending_review`), not the model's raw verdict. The raw verdict is in `raw_response`.
- `moderated_by = 'ai:editorial'` so the human dashboard can distinguish AI vs human decisions and so reversals can be attributed.
- `model_version` = `"llama-3-8b-instruct-lite"` + `policyVersion`. This is the audit trail when we update prompts or swap models via `TOGETHER_MODEL`.
- `raw_response` stores the JSON returned by the LLM. Keep it forever — future eval/regression work depends on it.

For `hidden`/`removed`, we additionally update the source table's `is_hidden` / `is_removed` flags so existing read paths keep working unchanged.

For anything routed to humans, we insert into `moderation_review_queue` in the same transaction. A reviewer's resolution writes back to `content_moderation` with `moderated_by = 'human:<userId>'`.

---

## 8. Failure modes and safety rails

| Failure | Behavior |
|---------|----------|
| Together.ai timeout | Retry per BullMQ policy (3 attempts, exp. backoff). After 3 retries: leave content visible, insert into `moderation_review_queue` with reason `system_error`, priority `normal`. |
| LLM returns invalid JSON | Same as timeout: allow + queue for human. Better to inconvenience a reviewer than to hide content based on garbage output. |
| Confidence < 0.90 on a `remove` verdict | Downgrade to `hide` + human review. Removal is irreversible from the user's perspective; the bar must be high. |
| Confidence < 0.75 on a `hide` verdict | Downgrade to `allow` + human review. False hides on an anonymous-speech platform damage trust more than missed catches (which user flags will surface). |
| Model flags `crisis_signal` | Never auto-hide. Always allow + urgent human + trigger safety-resources DM. |
| Author is a verified moderator/admin | Skip moderation entirely (with audit log). |
| Content is < 12 chars and contains no URLs/mentions | Skip the LLM call; mark as `allowed` automatically. Saves ~30% of API cost on trivial replies. |
| Together.ai API key missing at boot | Log warning, set platform alert, treat every job as "system_error → allow + queue". **Never crash the queue.** |
| Reviewer reverses an AI decision | Write the reversal to `content_moderation`, restore source-table flags, and append the example to a `moderation_disagreements` table for future prompt tuning. |

### Privacy posture

- The payload contains user IDs but never usernames, emails, or DM contents.
- We **never** send DM (`messages` module) content through this pipeline. It is end-to-end encrypted and out of scope.
- Anonymous authors stay anonymous to the LLM — we pass `authorIsAnonymous: true` and omit identifiers from the model-visible text. (User IDs are only in JSON structure for our own correlation; the model is instructed to ignore them.)

---

## 9. Files to add / modify

```
src/modules/content-safety/
├── editorial/
│   ├── editorial.module.ts            (new)
│   ├── editorial.service.ts           (new — Together.ai client, single call)
│   ├── editorial.processor.ts         (new — BullMQ worker)
│   ├── context-builder.service.ts     (new — walks parentChain, loads container, signals)
│   ├── enforcement.service.ts         (new — applies §7 matrix: verdict × severity × confidence)
│   ├── editorial-prompts.ts           (new — system prompt + policy version constant)
│   └── dto/
│       ├── editorial-payload.dto.ts   (new — TypeScript types for §5 payload)
│       └── editorial-verdict.dto.ts   (new — TypeScript types for §6 response)
├── content-safety.module.ts           (modify — import EditorialModule)
└── content-safety.service.ts          (unchanged — keeps user flag logic)

src/modules/admin/
├── controllers/moderation-review.controller.ts  (new — endpoints for the review queue)
└── services/moderation-review.service.ts        (new — claim / resolve queue items)

src/modules/feeds/services/feed-posts.service.ts        (modify — enqueue moderation after create)
src/modules/feeds/services/feed-comments.service.ts     (modify — enqueue moderation after create)
src/modules/forum/services/topic.service.ts             (modify — enqueue moderation)
src/modules/forum/services/comment.service.ts           (modify — enqueue moderation)
src/modules/nooks/services/nooks.service.ts             (modify — enqueue moderation)
src/modules/nooks/services/nook-messages.service.ts     (modify — enqueue moderation)

src/config/configuration.ts                             (modify — TOGETHER_* env vars + thresholds)
prisma/schema.prisma                                    (modify — content_moderation cols + moderation_review_queue table)
prisma/migrations/<timestamp>_moderation_review_queue/  (new — DDL from §7)
```

---

## 10. Rollout plan

1. **Shadow mode (week 1):** worker runs end-to-end and writes `content_moderation` rows, but the enforcement matrix in §7 is bypassed — every decision becomes `pending_review`. Compare AI verdicts against existing user flags and human reviewers' resolutions. **Goal:** measure model confidence calibration before any auto-action.
2. **Allow-only enforcement (week 2):** turn on the instant `allow` paths only. AI's `hide`/`remove` suggestions still route to humans. **Goal:** verify the 70-80% of clearly-safe content can be auto-approved without false-negative complaints.
3. **Add instant hide (week 3):** enable instant `hide` for ≥0.75 confidence on low/medium severity. Humans still confirm/reverse within SLA. Watch the reverse rate — if reviewers reverse > 10% of AI hides, lower the confidence threshold and re-shadow.
4. **Add instant remove (week 4+):** enable the narrow instant-remove list from §7 (CSAM, doxing, named threats, high-severity spam) only after reverse rate on hides is < 5%. Everything else stays on the hide-then-human path indefinitely.
5. **Quarterly:** re-evaluate model. The prompt and pipeline are model-agnostic — swap by changing one env var (`TOGETHER_MODEL`) when a cheaper/stronger Together.ai option lands.

The principle: **earn each layer of automation by proving the previous one.** Reverse rate is the gate.

---

## 11. Open questions for the team

- **Appeals.** Do authors get a "request review" button on `hide`/`remove` actions? Recommend yes, routed into `moderation_review_queue` at `normal` priority with `reason='user_appeal'`.
- **Mentor/mentorship DMs.** Are these encrypted like 1:1 DMs, or are they moderatable? If moderatable, add them to scope.
- **Nook expiry interaction.** Nooks expire in 1–24h. The pipeline already skips moderation for nooks expiring in < 1h; should the same apply to nook_messages in expiring nooks? Probably yes — saves API spend on already-dead content.
- **Image attachments.** Out of scope for v1 (text-only model). When we ship images, the natural step up is a vision-capable Together.ai model swapped in via env var; the prompt and enforcement matrix don't change.
- **Reviewer staffing.** Instant-enforcement coverage and human-review SLAs are coupled. If we cannot staff `urgent ≤ 15min`, we should tighten the crisis-signal definition to reduce false alarms before launch.
