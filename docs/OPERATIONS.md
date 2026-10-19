# GitSentinel Enterprise — Operations & Reliability Runbook

This document defines the operational architecture, failure modes, retry policies, watchdog thresholds, indexing rationale, and degraded-mode matrices implemented in **Phase 3: Production Reliability & Hardening**.

---

## 1. System Architecture Overview

```
                                      +---------------------------------------------+
                                      |              GitHub Cloud / App             |
                                      +---------------------------------------------+
                                            | Webhook Deliveries         ^ Octokit Comments
                                            v (HMAC SHA-256)             | & Review Verdicts
+-------------------------------------------------------------+          |
|                     Next.js Web / API Server                |          |
|                                                             |          |
| - Webhook Ingestion & Delivery Deduplication               |          |
| - Authenticated Dashboard & Cursor-Paginated REST Endpoints |          |
| - Rate Limiting & Graceful Degraded-Mode Router             |          |
+-------------------------------------------------------------+          |
         | Enqueue ReviewJobData                  | SQL / Prisma Queries |
         v                                        v                      |
+---------------------------------+   +------------------------------------+
|          Redis 7 (BullMQ)       |   |        PostgreSQL 16 DB            |
|                                 |   |                                    |
| - pr-review-queue               |   | - installations, repositories      |
| - delivery-dedupe keys (TTL)    |   | - pull_requests, reviews           |
| - fairness:leases (Sorted Set)  |   | - review_issues, failed_reviews    |
| - review-lock:* (TTL 5m)        |   | - webhook_deliveries               |
| - ratelimit:* counters          |   | (Composite B-Tree Indexes)         |
+---------------------------------+   +------------------------------------+
         | Pop Job                                ^ Read / Write Transactions
         v                                        |
+-------------------------------------------------------------+
|                     Autonomous Worker Daemon                |
|                                                             |
| - Installation Fairness & Anti-Starvation Leases            |
| - Distributed Idempotency Locks                             |
| - Pre-Flight Stale Commit Head-SHA Verification             |
| - Static Analysis & Multi-Chunk LLM Inference               |
| - Transient Retries with Full Jitter Backoff                |
| - Background Watchdog & Stuck Job Recovery                  |
| - Observability Prometheus/JSON Metrics Server (:3001)      |
+-------------------------------------------------------------+
```

---

## 2. Redis Failure & Degraded-Mode Behavior Matrix

The platform strictly differentiates between **critical state mutations** (which must fail safely / fail closed) and **non-critical cached queries** (which degrade gracefully / fail open).

| Component / Endpoint | Redis Available | Redis Unavailable / Timeout | Behavior Rationale | HTTP Status / Header |
| :--- | :--- | :--- | :--- | :--- |
| **`GET /api/repositories`** | Rate limited via Redis key `ratelimit:ip:*` | **Degrades Gracefully (Fail Open)** | Read query served directly from PostgreSQL; Redis outage does not block dashboard browsing. | `200 OK`<br>`X-Degraded-Mode: redis-unavailable` |
| **`GET /api/pull-requests`** | Rate limited via Redis key `ratelimit:ip:*` | **Degrades Gracefully (Fail Open)** | Read queries continue uninterrupted. | `200 OK`<br>`X-Degraded-Mode: redis-unavailable` |
| **`GET /api/failed-reviews`** | Rate limited via Redis key `ratelimit:ip:*` | **Degrades Gracefully (Fail Open)** | Operators can still inspect failed reviews and view audit history. | `200 OK`<br>`X-Degraded-Mode: redis-unavailable` |
| **`POST /api/webhooks/github`** | Enqueues job to BullMQ `reviewQueue` | **Fails Safely (Fail Closed)** | Cannot enqueue job without queue storage. Returning 500/503 forces GitHub to automatically redeliver the event later with exponential backoff. | `500 Internal Server Error` or `503 Service Unavailable` |
| **`POST /api/pull-requests/:id/reviews` (Rerun)** | Enqueues review job to BullMQ | **Fails Safely (Fail Closed)** | Review creation is aborted before queue failure; no ghost pending reviews left in DB. | `503 Service Unavailable` |
| **`POST /api/failed-reviews/:id/retry`** | Enqueues retry job to BullMQ | **Fails Safely (Fail Closed)** | Atomic DB update is rolled back if queue enqueue fails. | `503 Service Unavailable` |
| **Repository Config Cache** | Read/write from Redis `repo:config:*` | **Graceful Cache-Bypass** | Worker and Web fall back directly to PostgreSQL repository `config` column with zero downtime. | Logged as `warn`; non-fatal |
| **Worker Distributed Locking** | Redis `SET ... NX EX` | **Worker Halts Safely** | Worker rejects execution without locks to prevent duplicate concurrent reviews or split-brain reviews. | BullMQ stalls and retries when Redis reconnects |

---

## 3. Database Indexing & Pagination Strategy

### Cursor-Based Pagination Invariants
- **Page Size Contract**: Default `25`, strict maximum `100`. Out-of-range requests are automatically clamped.
- **Deterministic Ordering**: All queries sort on `[..., id: 'desc']` or `createdAt: 'desc'` with unique tie-breakers. Offset pagination (`SKIP N`) is strictly prohibited on unbounded tables.
- **Deep Relation Pruning**: Endpoints like `/api/pull-requests` never load full review issue trees (`include: { issues: true }` removed). Lightweight aggregate counts (`_count: { select: { reviews: true } }`) are used instead.

### Index Rationale Matrix

| Table | Index Name | Indexed Fields | Purpose & Justification |
| :--- | :--- | :--- | :--- |
| `repositories` | `idx_repositories_installation_id` | `[installationId, id(sort: Desc)]` | Optimizes multi-tenant repository filtering and cursor pagination within a GitHub installation. |
| `repositories` | `idx_repositories_created_at` | `[createdAt]` | Supports global sorting for newly registered repositories across installations. |
| `pull_requests` | `idx_pull_requests_repo_id` | `[repositoryId, id(sort: Desc)]` | Fast cursor pagination of PRs belonging to a repository without full table scans. |
| `pull_requests` | `idx_pull_requests_repo_state_id` | `[repositoryId, state, id(sort: Desc)]` | Filters open vs closed/merged PRs within a repository with deterministic pagination. |
| `pull_requests` | `idx_pull_requests_head_sha` | `[headSha]` | Accelerates pre-flight HEAD verification and deduplication lookups by commit SHA. |
| `reviews` | `idx_reviews_pr_id` | `[pullRequestId, id(sort: Desc)]` | Optimizes history fetching of previous reviews on a pull request. |
| `reviews` | `idx_reviews_status_started_at` | `[status, startedAt]` | **Watchdog optimization**: Powers the stuck-job reaper (`WHERE status IN ('pending', 'processing', 'posting') AND startedAt < cutoff`). Prevents full table scan every 60s. |
| `reviews` | `idx_reviews_commit_sha` | `[commitSha]` | Fast lookup of existing review verdicts by git commit SHA. |
| `review_issues` | `idx_issues_review_id` | `[reviewId, id]` | Powers cursor pagination for issues belonging to a review. |
| `review_issues` | `idx_issues_review_fingerprint` | `[reviewId, fingerprint]` | Deduplicates findings and matches issues across incremental re-reviews on subsequent commits. |
| `failed_reviews` | `idx_failed_reviews_resolved_failed_at` | `[resolvedAt, failedAt(sort: Desc)]` | Powers unresolved Dead Letter Queue dashboard view (`WHERE resolvedAt IS NULL ORDER BY failedAt DESC`). |
| `failed_reviews` | `idx_failed_reviews_commit_sha` | `[commitSha]` | Correlates failed jobs with specific git commits. |
| `failed_reviews` | `idx_failed_reviews_job_id` | `[jobId]` | Idempotency lookup when mapping failed BullMQ jobs to DB records. |
| `webhook_deliveries` | `idx_webhook_deliveries_delivery_id` | `[deliveryId]` | Deduplication index for incoming `X-GitHub-Delivery` GUIDs. |
| `webhook_deliveries` | `idx_webhook_deliveries_installation_received` | `[installationId, receivedAt(sort: Desc)]` | Fast audit retrieval of tenant webhook delivery logs. |

---

## 4. Idempotency & Distributed Locking Architecture

```
Incoming Request
      |
      v
[1. Webhook Deduplication]  ---> Key: "webhook:delivery:{deliveryId}"
      |                         - State 1: "processing" (TTL: 30s)
      |                         - State 2: "done" (TTL: 24h)
      |                         - Duplicate deliveries return 202 Accepted immediately.
      v
[2. Enqueue Job]            ---> Deterministic Job ID: "review-{repoId}-{prNumber}-{sha10}"
      |                         - BullMQ drops duplicates automatically if already waiting.
      v
[3. Distributed Worker Lock]---> Key: "review-lock:{repoFullName}:{prNumber}:{commitSha}"
      |                         - Acquired via `SET ... NX EX 300` (5 minutes)
      |                         - Heartbeat interval renews lease every 100s while active.
      |                         - If locked by another worker, job skips or yields cleanly.
      v
[4. Database Upsert]        ---> Unique constraint on `reviews(pullRequestId, commitSha)`
                                - Prevents duplicate reviews for the same commit in PostgreSQL.
```

### Dead Letter & Retry Idempotency
- When two operators click "Retry" simultaneously on a failed review:
  - **Atomic Conditional Query**: `UPDATE failed_reviews SET resolvedAt = NOW() WHERE id = :id AND resolvedAt IS NULL`.
  - Exactly **one** request receives `count === 1` and enqueues the BullMQ job.
  - The colliding request receives `count === 0` and is immediately rejected with `409 Conflict` ("This review is already being retried or has been resolved").

---

## 5. Stale Commit Protection Strategy

When a developer pushes a new commit ($B$) while a review on commit $A$ is in-flight:
1. Review pipeline executes static analysis and LLM inference for commit $A$.
2. **Immediate Pre-Posting Gate**: Right before calling `postReviewToGitHub()`, the worker queries GitHub's API:
   ```ts
   const prDetails = await octokit.rest.pulls.get({ owner, repo, pull_number });
   const currentHeadSha = prDetails.data.head.sha;
   ```
3. If `currentHeadSha !== jobData.commitSha`:
   - Posting is **immediately aborted**.
   - Review record is marked `status: 'superseded'`.
   - `HeadShaChangedError` is thrown, aborting review publishing.
   - Zero stale inline comments or reviews are posted against the PR.
   - The outer handler recognizes the commit change and does not mark the review as a system error.

---

## 6. Controlled Retries & Error Classification

The system applies exponential backoff with full jitter to transient errors and **fails fast** on deterministic errors:

$$\text{delay} = \min(\text{baseMs} \times 2^{\text{attempt}} + \text{jitter},\; \text{maxMs}), \quad \text{jitter} \in [0, \text{baseMs})$$

### Error Classification Policy

| Failure Domain | Transient (Will Retry) | Deterministic (Fail Immediately) |
| :--- | :--- | :--- |
| **GitHub API** | `429 Too Many Requests`<br>`500 Internal Server Error`<br>`502 Bad Gateway`<br>`503 Service Unavailable`<br>`504 Gateway Timeout`<br>`ECONNRESET`, `ETIMEDOUT` | `401 Unauthorized`<br>`403 Forbidden` (non-rate-limit)<br>`404 Not Found`<br>`422 Unprocessable Entity` (e.g. invalid git ref) |
| **LLM Provider** | `429 Rate Limit Exceeded`<br>`500 Internal Server Error`<br>`503 Model Overloaded`<br>`ETIMEDOUT`, Network Reset | `400 Bad Request`<br>`401 Invalid API Key`<br>`403 Permission Denied`<br>Irrecoverable JSON schema corruption after parse retry |
| **PostgreSQL** | Connection timeout (`ETIMEDOUT`)<br>`40001` (Serialization failure / Deadlock victim) | Foreign key violations (`23503`)<br>Unique constraint violations (`23505`)<br>Syntax or type errors |
| **Redis** | `ECONNREFUSED` during transient network drop<br>`NR_CLOSED` Connection closed | Invalid command syntax<br>OOM command rejected (`OOM command not allowed`) |

---

## 7. Stuck Job Recovery & Watchdog Thresholds

The background watchdog runs every **60 seconds** in the worker process and safely reclaims stranded jobs:

| Status | Watchdog Timeout Threshold | Recovery Action Taken |
| :--- | :--- | :--- |
| `pending` | **10 minutes** | Marked as `failed` with summary: *"Review processing timed out while pending. Exceeded threshold."* Creates record in `failed_reviews`. |
| `processing` | **10 minutes** | Worker crash or OOM assumed. Marked as `failed`. Distributed Redis lock `review-lock:*` is forcibly deleted. Creates record in `failed_reviews`. |
| `posting` | **5 minutes** | Network partition to GitHub assumed. Marked as `failed`. Creates record in `failed_reviews`. Releases Redis locks. |

---

## 8. Worker Fairness & Tenant Concurrency

To prevent high-volume tenants (Tenant A submitting 100 PRs) from starving low-volume tenants (Tenant B submitting 1 PR):
- Active slots are tracked in Redis Sorted Set: `fairness:leases`.
- Each member is `{installationId}:{jobId}`, scored by lease expiry timestamp.
- **Tenant Concurrency Cap**: Default **2 concurrent jobs per installation** (`INSTALLATION_CONCURRENCY_LIMIT`).
- When Tenant A is at capacity:
  - Any subsequent Tenant A job yields its slot and delays with jittered exponential backoff:
    $$\text{delay} = \min(500 \times 2^{\text{attempt}} + \text{jitter},\; 30000)$$
  - Tenant B's job arrives, acquires an open slot immediately, and completes **before** Tenant A's queued backlog.
- **Lease Heartbeat**: Active jobs renew their sorted set score at $1/3$ of the lock duration (every 100s). Expired leases are automatically reaped by `reapExpiredLeases()`.

---

## 9. Structured Observability & Metrics

Metrics are exported on `http://127.0.0.1:3001/metrics` in structured JSON format.

```json
{
  "queue_depth": {
    "waiting": 0,
    "active": 0,
    "delayed": 0,
    "failed": 0,
    "completed": 100
  },
  "queue_wait_ms": {
    "count": 100,
    "avg": 412,
    "p50": 405,
    "p95": 825,
    "last": 210
  },
  "job_duration_ms": {
    "count": 100,
    "avg": 81,
    "p50": 84,
    "p95": 106,
    "last": 76
  },
  "review_duration_ms": {
    "count": 100,
    "avg": 81,
    "p50": 84,
    "p95": 106,
    "last": 76
  },
  "llm_latency_ms": {
    "count": 100,
    "avg": 145,
    "p50": 140,
    "p95": 195,
    "last": 138
  },
  "llm_failures_total": 0,
  "github_failures_total": 0,
  "retries_total": 0,
  "tokens_consumed_total": 248500,
  "token_usage": {
    "prompt": 198000,
    "completion": 50500,
    "total": 248500
  },
  "estimated_cost_usd": 0.060000,
  "dropped_invalid_issues_total": 0,
  "webhook_counts": {
    "received": 100,
    "failures": 0
  },
  "per_installation": {
    "980001": { "started": 20, "completed": 20, "failed": 0 },
    "980002": { "started": 20, "completed": 20, "failed": 0 },
    "980003": { "started": 20, "completed": 20, "failed": 0 },
    "980004": { "started": 20, "completed": 20, "failed": 0 },
    "980005": { "started": 20, "completed": 20, "failed": 0 }
  }
}
```

---

## 10. Operational Incident Runbook

### Incident 1: Worker Process Crashed
1. **Diagnosis**: Check worker process logs: `Get-Content apps/worker.log -Tail 100`.
2. **Impact**: In-flight jobs stall in BullMQ. Reviews in DB remain in `processing` status.
3. **Recovery**:
   - Restart the worker process: `npm run dev:worker` or restart systemd / container.
   - Worker automatically runs `reapStaleReviews(thresholds, redis)` at startup.
   - Stuck reviews older than 10 minutes are transitioned to `failed`, recorded in `failed_reviews`, and distributed locks are released.
   - Operators can navigate to `/failed-reviews` on the web dashboard and click "Retry" on affected reviews.

### Incident 2: Redis Connection Outage
1. **Diagnosis**: Web logs output `Redis connection timed out after 2000ms`. Worker logs output `Redis Connection Error`.
2. **Impact**:
   - Webhook deliveries fail closed (HTTP 500/503), notifying GitHub to redeliver.
   - Review reruns and failed-review retries fail closed with HTTP 503.
   - Dashboard reads (repositories, PRs, issues, logs) **remain fully operational** in degraded mode.
3. **Recovery**:
   - Restart Redis: `docker restart redis` or verify Redis service.
   - Once Redis accepts connections, `ensureRedisReady()` automatically re-establishes connections without requiring web server restarts.
   - GitHub webhook redeliveries will resume and queue naturally.

### Incident 3: High LLM Rate Limiting (HTTP 429)
1. **Diagnosis**: `/metrics` shows rising `llm_latency_ms` and worker logs show `LLM rate limit encountered; retrying with backoff`.
2. **Mitigation**:
   - Check per-installation token consumption in `/metrics`.
   - Lower `INSTALLATION_CONCURRENCY_LIMIT` in `.env` (e.g. from `2` to `1`) to space out concurrent requests.
   - Switch active provider via `LLM_PROVIDER=gemini` or `LLM_PROVIDER=openai`.
