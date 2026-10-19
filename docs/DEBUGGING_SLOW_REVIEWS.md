# SRE Runbook: Debugging Slow (90s+) and Stuck Code Reviews

**Version**: 1.0.0  
**Target Audience**: Platform Engineers, SREs, DevOps, CyberOps  
**System**: GitSentinel Distributed AI Code Review & Security Gate Platform  

---

## 1. Executive Summary & SLA Budgets

Under normal operational conditions, GitSentinel completes end-to-end pull request reviews within **15 to 45 seconds**.

A review is classified as:
- **Degraded / Slow**: Runtime exceeds **60 seconds**.
- **SLA Breach / Stalled**: Runtime reaches or exceeds **90 seconds**.
- **Stale / Abandoned**: Review remains in `pending`, `processing`, or `posting` state for **> 180 seconds** without heartbeat, or worker lease expires.

When a review takes 90 seconds or gets stuck, this runbook guides you through isolating the culprit stage in the **11-stage review lifecycle**, identifying root causes, and executing safe remediation without risking branch protection security.

---

## 2. The 11-Stage Review Lifecycle Latency Budget

Every review transitions sequentially through 11 instrumented stages:

```
[GitHub Webhook Ingress]
       │
       ▼
1. github_webhook (<50ms)
       │
       ▼
2. webhook_validation (<100ms)
       │
       ▼
3. queue_enqueue (<50ms)
       │
       ▼
[Redis BullMQ Buffer]
       │
       ▼
4. worker_start (<500ms under normal queue load)
       │
       ▼
5. repository_fetch (500ms - 2s)
       │
       ▼
6. diff_generation (1s - 5s)
       │
       ▼
7. static_analysis (3s - 10s)
       │
       ▼
8. llm_analysis (10s - 35s)
       │
       ▼
9. finding_validation (500ms - 2s)
       │
       ▼
10. persistence (500ms - 2s)
       │
       ▼
11. review_completion (1s - 3s)
       │
       ▼
[GitHub PR Comments & Check Run Complete]
```

### Stage Budget Breakdown Table

| # | Stage | Typical Latency | 90s Warning Threshold | Primary Subsystem |
|---|---|---|---|---|
| 1 | `github_webhook` | 10ms - 50ms | > 200ms | Next.js API route ingress |
| 2 | `webhook_validation` | 20ms - 100ms | > 500ms | HMAC crypto & Zod validation |
| 3 | `queue_enqueue` | 15ms - 50ms | > 500ms | Redis BullMQ enqueue |
| 4 | `worker_start` | 50ms - 500ms | > 15s | BullMQ wait & Redis fairness lease |
| 5 | `repository_fetch` | 300ms - 1.5s | > 5s | PostgreSQL repo query & config load |
| 6 | `diff_generation` | 1s - 4s | > 10s | GitHub Octokit Diff API & chunker |
| 7 | `static_analysis` | 2s - 8s | > 15s | ESLint, Bandit, Ruff sub-processes |
| 8 | `llm_analysis` | 10s - 30s | > 45s | LLM provider API & token budgeting |
| 9 | `finding_validation` | 200ms - 1s | > 5s | CWE normalization, calibration, risk |
| 10 | `persistence` | 300ms - 1.5s | > 5s | PostgreSQL `$transaction` & ReviewIssues |
| 11 | `review_completion` | 800ms - 3s | > 8s | GitHub Check Run finish & Redis trace |

---

## 3. Five-Step Diagnostic Workflow

```
[Alert: Review > 90s / Stuck]
             │
             ▼
[Step 1: Check Operational Dashboard (/logs)]
             │
             ▼
[Step 2: Grab Correlation ID / Delivery ID]
             │
             ▼
[Step 3: Inspect 11-Stage Waterfall Drawer]
             │
             ▼
[Step 4: Query Structured Worker Logs]
             │
             ▼
[Step 5: Apply Stage-Specific Remediation]
```

### Step 1: Open the Operational Health Dashboard
Navigate to `/logs` in the web application (or run `curl http://localhost:3000/api/observability`).
1. Check the **Stuck Reviews Watchdog** banner at the top of the dashboard.
2. Check the **Worker Fleet** health card:
   - Is Worker status `Healthy` (`online`) or `Probing` / `Offline`?
   - Is Worker port `:3001` responding with `200 OK`?
3. Check the **BullMQ Queue Depth**:
   - If `waiting` > 20, jobs are queuing faster than worker concurrency can process them.
   - If `active` equals total worker concurrency (default 5), all worker slots are saturated.

### Step 2: Obtain the Correlation ID
GitSentinel tags every webhook delivery and job with a correlation ID:
- In GitHub: The `X-GitHub-Delivery` header UUID (e.g., `d4b8e210-91a5-4e3b-b72e-345091a10052`).
- On `/logs`: Look at the **Recent Review Lifecycle Traces** table or the **Stuck Reviews Alert**. Click the copy icon next to `correlationId`.
- In GitHub Check Run: The Check Run details URL or annotations link.

### Step 3: Inspect the 11-Stage Waterfall
Click on the stalled review in the **Recent Review Lifecycle Traces** table on `/logs` to expand the drilldown:
- Look for the stage highlighted in **Amber** (`in_progress`) or **Red** (`failed`).
- Determine where the majority of the elapsed time was spent:
  - If time is in `worker_start`: Queue backlog or Redis lease starvation.
  - If time is in `diff_generation`: Oversized PR or GitHub API diff rate limiting.
  - If time is in `static_analysis`: A linter process (ESLint/Bandit/Ruff) is hanging.
  - If time is in `llm_analysis`: LLM provider upstream timeout or token exhaustion.
  - If time is in `persistence`: PostgreSQL database lock contention.

### Step 4: Query Structured Logs Using Correlation ID
Worker and Web apps emit strictly sanitized structured JSON logs. Grep worker stdout or systemd journal for the correlation ID:

```bash
# Filter all lifecycle events for this specific review
grep '"correlation_id":"d4b8e210-91a5-4e3b-b72e-345091a10052"' /var/log/gitsentinel/worker.log | jq .

# Or view stage transitions specifically:
grep '"correlation_id":"d4b8e210-91a5-4e3b-b72e-345091a10052"' /var/log/gitsentinel/worker.log \
  | grep '"event":"stage_transition"' \
  | jq '{stage: .stage, status: .status, duration_ms: .duration_ms, error_category: .error_category}'
```

*(Note: Logs are pre-sanitized. Sensitive OAuth tokens, GitHub app private keys, and raw repository file contents are stripped by `@ai-reviewer/shared/observability` and `apps/worker/src/logger.ts`.)*

### Step 5: Classify Error Category
Check the `error_category` field emitted in logs or dashboard:
- `auth_error`: GitHub installation token expired or invalid GitHub App credentials.
- `rate_limit`: GitHub Secondary Rate Limit (HTTP 403/429) or LLM Provider rate limit.
- `timeout`: Static analyzer exceeded 15s subprocess timeout or LLM request exceeded 45s.
- `llm_error`: Model returned 500, invalid JSON, or exceeded token window.
- `stale_commit`: Head SHA changed while review was executing; superseded by newer push.
- `db_error`: PostgreSQL connection pool exhaustion or transaction deadlock.
- `validation_error`: Invalid YAML configuration (`.aireview.yml`) or malformed payload.

---

## 4. Root Causes & Stage-Specific Remediation

---

### Scenario A: Review Stuck in `worker_start` (Queue Wait > 30s)

#### Symptoms
- BullMQ queue `waiting` count is climbing.
- `worker_start` stage has not transitioned to `repository_fetch`.
- GitHub Check Run remains in `"Queued"` status.

#### Diagnosis
1. Check running worker processes:
   ```bash
   ps aux | grep "apps/worker"
   # Verify worker container is alive
   docker ps --filter "name=worker"
   ```
2. Check Redis fairness leases for the repository:
   ```bash
   redis-cli KEYS "fairness:lease:*"
   ```
3. Check worker concurrency utilization:
   ```bash
   curl -s http://127.0.0.1:3001/metrics | jq .queue_depth
   ```

#### Remediation
- **If Worker Crashed**: Restart the worker container or service:
  ```bash
  docker restart gitsentinel-worker
  ```
- **If Concurrency Saturated**: Scale worker instances horizontally or increase `WORKER_CONCURRENCY` in `.env`:
  ```bash
  # docker-compose scale
  docker compose up -d --scale worker=3
  ```
- **If Stale Lease is Blocking**: The fairness lease auto-expires after 5 minutes. To manually release immediately:
  ```bash
  redis-cli DEL "fairness:lease:<installationId>:<repoId>"
  ```

---

### Scenario B: Review Stuck in `diff_generation` (> 15s)

#### Symptoms
- `diff_generation` duration exceeds 15 seconds.
- Review either hangs or fails with `HttpError: Request failed with status code 403/429` (Secondary Rate Limit) or times out fetching oversized diffs.

#### Diagnosis
1. Inspect the PR size in GitHub: Does the PR modify lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) or minified assets (`*.bundle.js`, `*.min.css`)?
2. Check if GitHub Diff API timed out or truncated:
   ```bash
   grep '"stage":"diff_generation"' worker.log | jq .
   ```

#### Remediation
- GitSentinel automatically filters `.lock`, `.min.js`, and `.svg` files, and caps diffs at 1,500 changed lines.
- If an unhandled massive binary or generated asset is included, add an ignore rule in the repo's `.aireview.yml`:
  ```yaml
  ignore_patterns:
    - "dist/**"
    - "vendor/**"
    - "*.pb.go"
  ```
- If GitHub returned HTTP 429/403 Secondary Rate Limit, workers back off exponentially. Wait 60 seconds before triggering retry.

---

### Scenario C: Review Stuck in `static_analysis` (> 20s)

#### Symptoms
- `static_analysis` duration exceeds 20 seconds.
- Subprocesses (ESLint, Bandit, Ruff) are spinning CPU.

#### Diagnosis
1. Check running node or python processes spawned by workers:
   ```bash
   ps aux | grep -E "eslint|bandit|ruff"
   ```
2. Verify process execution limits: Every analyzer is executed via `execFile` with an explicit `timeout: 15_000` ms. If a tool hangs, the child process is terminated with `SIGTERM` and fallback static analysis results are returned.

#### Remediation
- If a custom ESLint plugin has an infinite loop or recursive AST walk, disable that rule in the repository's `.eslintrc.json`.
- The worker will continue gracefully even if one tool fails; check `metadata.tools_run` in the stage timing record to see which tool completed.

---

### Scenario D: Review Stuck in `llm_analysis` (> 45s)

#### Symptoms
- `llm_analysis` duration exceeds 45s or logs show LLM retry attempts.
- Error category indicates `llm_error` or `rate_limit`.

#### Diagnosis
1. Check LLM provider latency and failures on `/logs` dashboard:
   - Check `LLM p50 / p95` latency card.
   - Check `LLM Failures Total`.
2. Inspect worker logs for upstream HTTP error codes:
   ```bash
   grep '"stage":"llm_analysis"' worker.log | grep -E "429|500|503|ETIMEDOUT"
   ```

#### Remediation
- **If LLM Provider 429 Rate Limit**: The review worker utilizes exponential jitter backoff (up to 3 attempts). Check token quotas in your AI provider console (OpenAI / Gemini / Anthropic).
- **If Model Context Length Exceeded**: Review chunking automatically fragments diffs exceeding the model budget. Check if an oversized chunk was sent.
- **Fail-Closed Guarantee**: If all 3 LLM attempts fail, the review transitions to `failed` and records the issue in the `FailedReview` quarantine table. Branch protection remains locked (`REQUEST_CHANGES` / pending failure) to prevent unreviewed code from merging.

---

### Scenario E: Review Stuck in `persistence` or Distributed Lock Contention

#### Symptoms
- Review status in PostgreSQL remains `processing` or `posting` indefinitely.
- Worker logs show `Waiting for review lock` or PostgreSQL `Query read timeout`.

#### Diagnosis
1. Check database locks in PostgreSQL:
   ```sql
   SELECT pid, age(clock_timestamp(), query_start), usename, query, state
   FROM pg_stat_activity
   WHERE query != '<IDLE>' AND query NOT LIKE '%pg_stat_activity%'
   ORDER BY query_start ASC;
   ```
2. Check Redis review lock:
   ```bash
   redis-cli GET "review:lock:<repoId>:<prNumber>"
   ```
   *The review lock has a 180-second TTL to prevent split-brain dual review runs on the same PR.*

#### Remediation
- If a worker process was killed abruptly (e.g., OOMKilled by Linux kernel) while holding the lock:
  1. The Redis lock will automatically expire after 180 seconds.
  2. The background **Stale Job Reaper** (`apps/worker/src/review/reaper.ts`) runs every **60 seconds**. It queries reviews stuck in `pending`, `processing`, or `posting` older than 180s, marks them `failed`, reclaims the lock, and sets the Check Run to failed.
  3. To force-release immediately:
     ```bash
     redis-cli DEL "review:lock:<repoId>:<prNumber>"
     ```
  4. Once released, click **"1-Click Retry Review"** on `/logs` to re-enqueue.

---

## 5. Automated Watchdogs: The Stale Job Reaper

GitSentinel features an autonomous background watchdog:
- **Location**: [`apps/worker/src/review/reaper.ts`](file:///e:/college/project/ai%20code%20review/apps/worker/src/review/reaper.ts)
- **Schedule**: Executes every 60 seconds (`reaperInterval`).
- **Threshold**: Reaps any review with `status IN ('pending', 'processing', 'posting')` and `startedAt < NOW() - 180 seconds`.

### Reaper Actions Taken:
1. Updates `Review` status to `failed` with error message `"Review timed out (stale job reaper)"`.
2. Categorizes error as `timeout`.
3. Records metrics: `metrics.recordStaleJobDetected()` and `metrics.recordStaleJobReaped()`.
4. Deletes orphaned Redis locks (`review:lock:*`).
5. Marks GitHub Check Run as `completed` with conclusion `failure` (Fail Closed).
6. Creates a `FailedReview` record in the database for SRE visibility on the `/logs` DLQ.

---

## 6. SRE Incident Verification Commands

Keep these commands handy during incident triage:

```bash
# 1. Live Worker Health & Prometheus Metrics Probe
curl -s http://127.0.0.1:3001/metrics | jq '{
  worker_health: .worker_health,
  queue_depth: .queue_depth,
  stale_jobs: .stale_jobs,
  stage_latencies: .stage_latencies
}'

# 2. Redis BullMQ Queue Status
redis-cli -c -p 6379 eval "
return {
  redis.call('LLEN', 'bull:pr-review-queue:wait'),
  redis.call('LLEN', 'bull:pr-review-queue:active'),
  redis.call('ZCARD', 'bull:pr-review-queue:delayed'),
  redis.call('ZCARD', 'bull:pr-review-queue:failed')
}" 0

# 3. PostgreSQL Query for Stale Reviews (> 90 seconds)
psql -h localhost -p 5433 -U postgres -d ai_code_review -c "
SELECT id, pull_request_id, commit_sha, status, stage, 
       ROUND(EXTRACT(EPOCH FROM (NOW() - started_at))) AS elapsed_seconds
FROM reviews
WHERE status IN ('pending', 'processing', 'posting')
  AND started_at < NOW() - INTERVAL '90 seconds'
ORDER BY started_at ASC;
"

# 4. Trigger Manual Review Re-enqueue via Web API
curl -X POST http://localhost:3000/api/failed-reviews/<ID>/retry \
  -H "Cookie: next-auth.session-token=<TOKEN>"
```

---

## 7. Security & Redaction Assurance

When debugging production issues:
- **Zero Sensitive Data Exposure**:
  - OAuth tokens, installation tokens, and API keys are redacted as `[REDACTED_OAUTH_TOKEN]` and `[REDACTED_API_KEY]`.
  - Repository source code lines, diff bodies, patches, and AST snippets are strictly excluded from structured logs and traces.
  - Traces capture only metadata counts (`files_count`, `lines_count`, `chunks_count`, `tools_run`, `issues_count`) and identifiers (`jobId`, `reviewId`, `repoId`, `commitSha`, `correlationId`).
- Engineers may safely export and share telemetry payloads from `/api/observability` and worker logs with external logging systems (Datadog, Grafana Loki, CloudWatch) without violating SOC2 or GDPR constraints.
