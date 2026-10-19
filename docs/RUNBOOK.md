# GitSentinel Operational Runbook & Incident Response Guide

**Version**: 1.0.0  
**Target Audience**: Site Reliability Engineers (SRE), Platform Engineers, Security Operations (CyberOps)  
**System**: GitSentinel Distributed AI Code Review & Security Gate Platform  

---

## Architecture Topology Overview

GitSentinel operates as a distributed system composed of:
1. **Edge / Ingress**: Next.js Web App (`apps/web`) handling GitHub Webhooks, REST API, CyberOps Dashboard, and RBAC authorization.
2. **Message Broker & Cache**: Redis 7.x (`localhost:6379`) providing BullMQ job queues, delivery deduplication cache, and rate limit counters.
3. **Primary Relational Store**: PostgreSQL 16.x (`localhost:5433/ai_code_review`) managing multi-tenant installations, repositories, PRs, reviews, audit logs, and organization policies.
4. **Execution Workers**: Node.js Review Workers (`apps/worker`) running static analyzers (ESLint, Bandit, Ruff), AST context retrieval, LLM prompt orchestration, and GitHub Check Run / Review submission.
5. **Observability**: Health and Prometheus metrics server (`127.0.0.1:3001/metrics`), structured Pino JSON logging, and `AuditLog` database trail.

---

## Incident Severity Levels

| Severity | Definition | Target MTTR | Escalation |
|---|---|---|---|
| **SEV-1 (Critical)** | Entire review pipeline down; webhooks dropping; database corruption; security gate failing open. | < 15 minutes | Immediate SRE on-call + Engineering Lead page. |
| **SEV-2 (Major)** | LLM provider outage; workers degraded; review queue latency > 10 minutes; rate limit exhaustion. | < 45 minutes | On-call SRE triage. |
| **SEV-3 (Minor)** | Individual failed reviews; non-blocking static analysis tool missing; isolated RBAC misconfiguration. | < 4 hours | Standard issue ticket. |

---

## Scenario 1: Redis Outage / Network Partition

### Symptoms
- GitHub Webhook endpoint returns `500 Internal Server Error`.
- Webhook error log: `"Simulated Redis Connection Loss during enqueue"` or `"ECONNREFUSED 127.0.0.1:6379"`.
- Workers idle with BullMQ connection error: `"MaxRetriesPerRequestError"`.
- Next.js Web App reports Redis rate-limiter degradation.

### Failure Semantics & Resilience Guarantees
- **Fail-Closed on Mutations**: When Redis is down, `enqueueReviewJob` fails and the webhook returns HTTP 500. GitHub App will automatically schedule redelivery with exponential backoff (up to 24 hours). No review requests are silently dropped.
- **Fail-Open on Read Limiting**: Non-mutating read rate limiters degrade gracefully to avoid blocking legitimate user dashboard traffic when Redis is unavailable.
- **Idempotency Guarantee**: Upon Redis reconnection, GitHub redelivers previously failed deliveries; deduplication logic in database and Redis prevents duplicate job creation.

### Triage & Recovery Steps
1. **Verify Redis Container Status**:
   ```bash
   docker ps -a --filter "name=redis"
   docker logs --tail 100 gitsentinel-redis
   ```
2. **Restart Redis Service**:
   ```bash
   docker restart gitsentinel-redis
   # Or via systemd
   sudo systemctl restart redis-server
   ```
3. **Verify Redis Connectivity**:
   ```bash
   redis-cli -h 127.0.0.1 -p 6379 ping
   # Expected response: PONG
   ```
4. **Inspect BullMQ Queue Depth**:
   ```bash
   redis-cli -h 127.0.0.1 -p 6379 LLEN "bull:review-pr:wait"
   redis-cli -h 127.0.0.1 -p 6379 LLEN "bull:review-pr:active"
   ```
5. **Monitor Worker Reconnection**:
   Check worker stdout/stderr for:
   `"Worker connected to Redis. Resuming job consumption."`

---

## Scenario 2: PostgreSQL Outage / Pool Exhaustion

### Symptoms
- Web application logs `PrismaClientInitializationError` or `PrismaClientKnownRequestError` (`P2024` timed out obtaining connection).
- Review worker logs: `"isTransientPostgresError: connection pool exhausted or ECONNREFUSED"`.
- Web requests fail with HTTP 500 / 503.

### Failure Semantics & Resilience Guarantees
- **Transient Error Classification**: GitSentinel's `withRetry` classifies PostgreSQL error codes `40P01` (deadlock), `08006` (connection failure), `57P01` (admin shutdown), and `P2024` (pool timeout) as transient.
- **Exponential Backoff**: Workers automatically back off with jitter over 3 retry cycles before failing the job into `failed_review`.

### Triage & Recovery Steps
1. **Inspect PostgreSQL Health & Connections**:
   ```bash
   docker ps -a --filter "name=postgres"
   # Check active connections
   psql -h 127.0.0.1 -p 5433 -U postgres -d ai_code_review -c \
     "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
   ```
2. **Identify Blocking Queries / Deadlocks**:
   ```sql
   SELECT pid, age(clock_timestamp(), query_start), usename, query 
   FROM pg_stat_activity 
   WHERE state != 'idle' AND age(clock_timestamp(), query_start) > interval '30 seconds';
   ```
3. **Terminate Rogue Connections If Necessary**:
   ```sql
   SELECT pg_terminate_backend(pid) 
   FROM pg_stat_activity 
   WHERE state != 'idle' AND age(clock_timestamp(), query_start) > interval '2 minutes';
   ```
4. **Restart PostgreSQL Container If Unresponsive**:
   ```bash
   docker restart gitsentinel-postgres
   ```
5. **Verify Database Health**:
   ```bash
   npm run prisma:generate
   ```

---

## Scenario 3: GitHub API Outage or Rate-Limit Depletion

### Symptoms
- Review worker logs: `"GitHub API error: 403 API rate limit exceeded"` or `"502 Bad Gateway"`.
- GitHub Check Runs fail to create or update.

### Failure Semantics & Resilience Guarantees
- **Rate-Limit Awareness**: The worker monitors `x-ratelimit-remaining` on GitHub Octokit responses.
- **Graceful Check-Run Fallback**: If GitHub Check Runs API is degraded, the review pipeline logs a warning (`"Failed to create GitHub Check Run. Continuing review."`) and falls back to submitting the review comment event directly, ensuring security findings are never suppressed.
- **Transient Retry**: GitHub 429, 500, 502, 503, and `ETIMEDOUT` errors are classified as transient and retried via `withRetry`.

### Triage & Recovery Steps
1. **Check GitHub Official Status**:
   Visit `https://www.githubstatus.com` for incidents affecting Pull Requests or GitHub Apps.
2. **Inspect Current Rate Limit via App Token**:
   ```bash
   curl -H "Accept: application/vnd.github+json" \
        -H "Authorization: Bearer <APP_INSTALLATION_TOKEN>" \
        https://api.github.com/rate_limit
   ```
3. **Scale Worker Concurrency Down During GitHub Degradation**:
   In `apps/worker/src/index.ts`, reduce `concurrency` from 5 to 1:
   ```bash
   # Set environment variable
   WORKER_CONCURRENCY=1 npm run start
   ```

---

## Scenario 4: LLM Provider Outage / Degraded Performance

### Symptoms
- Worker logs: `"LLM API error: 503 Service Unavailable"`, `"429 Resource Exhausted"`, or `"529 Overloaded"`.
- Review jobs taking > 60 seconds and throwing timeouts.

### Failure Semantics & Resilience Guarantees
- **Multi-Model Escalation & Fallback**: If primary frontier model times out, the pipeline attempts secondary provider or falls back to deterministic static analysis findings.
- **Audit Logging**: Every failed review records an audit entry (`review.failed`) and writes a structured entry in `failed_review` table with complete job context and error stack.
- **No Hallucinated Approvals**: If LLM analysis fails, GitSentinel *never* emits a false `APPROVE`. The system fails closed or marks the review as `partial`, requesting human security review.

### Triage & Recovery Steps
1. **Verify LLM Provider Status**:
   - OpenAI Status: `https://status.openai.com`
   - Anthropic Status: `https://status.anthropic.com`
   - Google Cloud Vertex / Gemini Status
2. **Switch Fallback Model via Environment Variables**:
   ```bash
   LLM_PRIMARY_MODEL="gemini-1.5-pro"
   LLM_FALLBACK_MODEL="claude-3-5-sonnet-20241022"
   ```
3. **Inspect Dead-Letter Queue via CyberOps Dashboard**:
   Navigate to `http://localhost:3000/eval` or query:
   ```sql
   SELECT id, commit_sha, error_message, failed_at 
   FROM failed_reviews 
   WHERE resolved_at IS NULL 
   ORDER BY failed_at DESC LIMIT 10;
   ```

---

## Scenario 5: Rate-Limit Exhaustion (Inbound & Outbound)

### Symptoms
- Clients receive `429 Too Many Requests` on REST API.
- Dashboard review rerun button displays `"Rate limit exceeded. Please wait."`.

### Inbound Rate Limit Configurations
- **Review Reruns**: Strict 10 requests / minute per IP / session (`checkReviewRerunRateLimit`).
- **Config Mutations**: 30 requests / minute per IP / session (`checkConfigMutationRateLimit`).
- **Failed Review Retries**: 10 requests / minute (`checkFailedReviewRetryRateLimit`).
- **General API**: 120 requests / minute (`checkApiRateLimit`).

### Triage & Recovery Steps
1. **Identify Abuse / Flooding IP**:
   Check Next.js access logs for clients exceeding rate limits:
   ```bash
   grep "429" /var/log/gitsentinel/access.log | awk '{print $1}' | sort | uniq -c | sort -nr
   ```
2. **Flush Blocked Rate Limit Key If Legitimate User**:
   ```bash
   # In Redis:
   redis-cli -h 127.0.0.1 -p 6379 KEYS "rl:*"
   redis-cli -h 127.0.0.1 -p 6379 DEL "rl:rerun:user-12345"
   ```

---

## Scenario 6: Stuck Jobs & Zombie Review Recovery (Reaper)

### Symptoms
- Pull Request review status remains in `pending` or `posting` for > 10 minutes.
- Worker terminated unexpectedly (e.g. OOM killed) while processing a review.

### Automated Reaper Mechanism
- **Automatic Auto-Recovery on Rerun**: When a user or webhook triggers a rerun for a PR, GitSentinel inspects active reviews. If a review has been in `pending` or `posting` longer than 10 minutes (`STUCK_THRESHOLD_MS`), it is automatically marked as `failed`:
  `"Review timed out after 12m (auto-recovered by system)"`, recorded in `failed_review`, and a fresh job is enqueued immediately.

### Manual SQL Cleanup for Stuck Reviews
If manual intervention is required across the database:
```sql
UPDATE reviews
SET status = 'failed',
    summary = 'Review marked failed by SRE Reaper due to worker timeout',
    completed_at = NOW()
WHERE status IN ('pending', 'posting')
  AND started_at < NOW() - INTERVAL '15 minutes';
```

---

## Scenario 7: Failed Reviews & Dead-Letter Queue (DLQ) Triage

### DLQ Architecture
Every unrecoverable review failure writes a complete audit record to the `failed_reviews` table containing:
- `pull_request_id` and `commit_sha`
- `error_message` and sanitized `error_stack`
- Complete serialized `job_data` (repository IDs, PR numbers, branches)
- `job_id` tracking retry attempts
- `resolved_at` timestamp

### Step-by-Step Operator Triage
1. **List Unresolved Failures**:
   ```sql
   SELECT id, pull_request_id, commit_sha, error_message, failed_at 
   FROM failed_reviews 
   WHERE resolved_at IS NULL 
   ORDER BY id DESC;
   ```
2. **Inspect Specific Failure Details via API**:
   ```bash
   curl -s -H "Cookie: next-auth.session-token=<TOKEN>" \
        http://localhost:3000/api/failed-reviews/42 | jq .
   ```
3. **Trigger Safe Atomic Retry**:
   ```bash
   curl -X POST -H "Cookie: next-auth.session-token=<TOKEN>" \
        http://localhost:3000/api/failed-reviews/42/retry
   ```
   *Note: Endpoint guarantees idempotency via atomic database CAS update (`WHERE resolved_at IS NULL AND (job_id IS NULL OR NOT startsWith 'review-retry-')`). Competing retries receive HTTP 409 Conflict.*
4. **Mark Resolved After Manual Review**:
   ```bash
   curl -X PATCH -H "Content-Type: application/json" \
        -H "Cookie: next-auth.session-token=<TOKEN>" \
        -d '{"resolved": true}' \
        http://localhost:3000/api/failed-reviews/42
   ```

---

## Scenario 8: Database Migration Procedure

### Zero-Downtime Migration Principles
1. **Additive-First Changes**: Always add new columns as `NULL` or with safe defaults before writing application code that depends on them.
2. **No Destructive Drops**: Never drop columns or rename existing foreign keys in the same deployment phase as application updates.
3. **Backward Compatible Schemas**: Ensure both old and new worker versions can operate against the intermediate database schema.

### Execution Checklist
1. **Backup Database Before Migration**:
   ```bash
   pg_dump -h 127.0.0.1 -p 5433 -U postgres -Fc ai_code_review > /backups/db_pre_phase7_$(date +%Y%m%d_%H%M%S).dump
   ```
2. **Review Pending Migration Diffs**:
   ```bash
   npx prisma migrate diff \
     --from-schema-datamodel packages/db/prisma/schema.prisma \
     --to-schema-datasource packages/db/prisma/schema.prisma
   ```
3. **Apply Migration**:
   ```bash
   npm run prisma:generate
   npx prisma db push # Or prisma migrate deploy in production CI
   ```
4. **Validate Schema Invariants**:
   Verify that unique constraints (e.g. `(installation_id, repo_id)` and `(pull_request_id, commit_sha)`) are intact:
   ```sql
   SELECT conname, contype FROM pg_constraint WHERE conrelid = 'repositories'::regclass;
   ```

---

## Scenario 9: Rollback & Disaster Recovery Procedure

### Application Version Rollback
1. **Graceful Worker Drain**:
   Send `SIGTERM` to active workers. The worker health server immediately switches `/health` to `503 Draining`, stops accepting new BullMQ jobs, and waits up to 30 seconds for in-flight reviews to complete:
   ```bash
   kill -15 $(pgrep -f "apps/worker")
   ```
2. **Revert Application Deployment**:
   ```bash
   # Revert to previous container image tag or commit
   docker-compose -f docker-compose.prod.yml up -d --no-deps web worker
   ```
3. **Queue Health Verification**:
   Verify no jobs were orphaned during drain:
   ```bash
   redis-cli -h 127.0.0.1 -p 6379 HGETALL "bull:review-pr:stalled"
   ```

### Full Database Disaster Recovery
In case of catastrophic data corruption:
1. **Stop Application Services**:
   ```bash
   docker stop gitsentinel-web gitsentinel-worker
   ```
2. **Restore PostgreSQL Dump**:
   ```bash
   dropdb -h 127.0.0.1 -p 5433 -U postgres ai_code_review
   createdb -h 127.0.0.1 -p 5433 -U postgres ai_code_review
   pg_restore -h 127.0.0.1 -p 5433 -U postgres -d ai_code_review /backups/db_latest.dump
   ```
3. **Verify Integrity & Restart Services**:
   ```bash
   npm run test
   docker start gitsentinel-web gitsentinel-worker
   ```
