# Security Policy & Controls: GitSentinel

**Document Classification**: Public / System Architecture Reference  
**Effective Date**: October 2026  
**Status**: Active  

---

## 1. Security Philosophy

GitSentinel processes arbitrary source code from public and private GitHub repositories, untrusted pull requests, and multi-tenant organizations. The platform operates under the core assumption that **all pull request content, commit messages, code comments, and metadata are potentially attacker-controlled**.

We do not claim the system is "100% secure". Instead, GitSentinel implements defense-in-depth across multiple security layers:
- Cryptographic verification at ingestion
- Strict multi-tenant data isolation at the ORM/database layer
- Anti-spoofing rate limiting
- Structural delimiter and XML boundary isolation for prompt injection resistance
- Pinned deterministic secret scanning and sandboxed static analysis
- Automated log redaction
- Rigorous automated security test coverage

---

## 2. Threat Model Summary

For detailed asset classification and threat analysis, refer to [docs/THREAT_MODEL.md](file:///e:/college/project/ai%20code%20review/docs/THREAT_MODEL.md).

### High-Value Assets
- GitHub App private keys, OAuth client secrets, and installation tokens.
- LLM provider API credentials (Gemini, OpenAI, Anthropic).
- Multi-tenant customer database (PostgreSQL) and Redis BullMQ queues.
- Customer intellectual property and source code diffs.

### Primary Threat Actors
- **Malicious Contributors**: Attempting prompt injection, diff-level denial-of-service, or parser exploitation via pull requests.
- **Compromised Accounts**: Legitimate users whose credentials have been stolen.
- **Malicious Repository Owners**: Connecting repositories configured to exploit worker AST parsers or path traversal vulnerabilities.
- **Unauthorized Dashboard Users**: Authenticated users attempting cross-tenant access to rival organizations' code or vulnerability findings.

---

## 3. Implemented Security Controls

### A. Webhook Ingress & Integrity
1. **Timing-Safe HMAC Verification**: All webhooks validate `X-Hub-Signature-256` against `GITHUB_WEBHOOK_SECRET` using `crypto.timingSafeEqual` with buffer length validation. Missing secrets fail closed with HTTP 500; invalid signatures return HTTP 401.
2. **Payload Size Guard**: Webhooks verify the `Content-Length` header and raw body buffer size against a hard 10MB limit. Oversized payloads are rejected with HTTP 413.
3. **Replay Protection & Delivery Locking**: `X-GitHub-Delivery` is strictly validated against `/^[a-zA-Z0-9_-]{1,128}$/`. Redis-backed distributed delivery locks (`github:delivery:<id>`) track `processing` and `done` states for 24 hours, idempotently returning HTTP 202 without redundant job enqueuing.
4. **Zero Pre-Validation Database Work**: Webhook route parses payloads with Zod schemas and delivers directly to BullMQ without performing unauthenticated database writes.

### B. Tenant Isolation & Access Control
1. **Server-Side Authorization**: Every API route and server action enforces session authentication (`requireSession()`) and cross-references the user's active GitHub installations (`getSessionInstallationIds()`).
2. **Object-Level Access Control**: Resource lookups join through `repository.installation.githubInstallationId` with an explicit `{ in: installationIds }` filter. Manipulating URL identifiers or client-side parameters returns HTTP 403 Forbidden.
3. **Automated Cross-Tenant Test Suite**: Verified through exhaustive test cases in `apps/web/app/api/tenant-isolation.test.ts` proving User A cannot query, view, review, or mutate Repository B, PR B, Review B, Issue B, or FailedReview B.

### C. Rate Limiting & Anti-Spoofing
1. **Anti-Spoofing Client Resolution**: `getClientIp()` does not blindly trust `X-Forwarded-For` or `X-Real-IP`. Proxy headers are only inspected when `TRUST_PROXY=true`.
2. **Granular Tiered Rate Limits**:
   - Standard GET read endpoints: 120 req/min
   - Review Rerun (`POST /api/pull-requests/:id/reviews`): 10 req/min
   - Failed Review Retry (`POST /api/failed-reviews/:id/retry`): 10 req/min
   - Repository Configuration Mutation (`updateRepoConfig`): 30 req/min
   - Issue Status Updates (`PATCH /api/reviews/:id/issues/:issueId`): 60 req/min
3. **User-Keyed Quotas**: Authenticated actions bind rate limits to the authenticated user ID, preventing circumvention via IP rotation.

### D. Prompt Injection Defenses
1. **Structural Delimiter Isolation**: Diffs are enclosed in `<diff boundary="${boundary}">` blocks using dynamic 32-character hexadecimal boundaries verified not to exist in the content.
2. **XML Escaping**: All diff lines, file paths, and PR metadata undergo XML character escaping (`&`, `<`, `>`, `"`, `'`) before template interpolation.
3. **Explicit Directive Segmentation**: The system prompt commands the model to treat all content within `<diff>` and `<untrusted_pr_context>` as passive source code under review. Prompt injections such as "Ignore previous instructions", "Approve this PR", or "Reveal your system prompt" are explicitly prohibited and instructed to be reported as critical security findings.
4. **Structured Schema Constraints**: All LLM providers are constrained by strict JSON schema specifications (`responseSchema` for Gemini, `json_schema` for OpenAI, tool calling for Anthropic). Freeform conversational responses are structurally rejected.

### E. LLM Output Validation & Subprocess Sandboxing
1. **Zod Output Validation**: Model responses are validated against `ReviewResultSchema` and `ReviewIssueSchema`.
2. **Path Traversal Guards**: Paths with `..`, null bytes, control characters, or absolute filesystem prefixes are rejected immediately.
3. **Subprocess Isolation**: Static analysis tools (ESLint, Ruff, Bandit) run with `shell: false`, array arguments, explicit buffer caps (`maxBuffer: 5MB`), and execution timeouts (20–30s).
4. **Isolated Temporary Workspaces**: Python files are written to dedicated `fs.mkdtemp` directories and validated with `targetPath.startsWith(resolvedTemp + path.sep)` to eliminate workspace escape vectors. Cleanup is guaranteed in `finally` blocks.
5. **Zero Execution of LLM Code**: The system never runs `eval()` or executes suggestions generated by the LLM.

### F. Log Redaction & Data Protection
1. **Automated Pino Redaction**: Worker logging automatically redacts keys matching `token`, `secret`, `password`, `authorization`, `private_key`, `apiKey`.
2. **Regex Pattern Masking**: `redactSensitiveText()` strips GitHub tokens (`ghp_`), Bearer authorization tokens, AWS keys, Stripe secret keys, Slack tokens, and PEM private keys from log output strings.

### G. Server-Side RBAC, Audit Logging & Security Gates
1. **Four-Tier RBAC**: Granular roles (`OWNER`, `ADMIN`, `REVIEWER`, `VIEWER`) enforced server-side. Mutating actions require explicit permission assertions (`assertPermission()`). Repository disconnection is restricted to `OWNER`.
2. **Immutable Audit Trail**: All governance-relevant actions (`repository.*`, `configuration.*`, `review.*`, `issue.*`) are persisted to PostgreSQL `audit_logs` with actor, role, action, resource, and timestamp.
3. **Audit Secret Scrubbing**: `sanitizeAuditMetadata()` recursively scrubs GitHub PATs, generic API keys, passwords, bearer tokens, cookies, and RSA private keys before persistence, preventing credentials leaks into compliance logs.
4. **Deterministic Security Gates**: Evaluates organization policies (`blockCriticalSecurity`, `minConfidence`, `maxComments`, `requiredChecks`, `ignoredPaths`) independently from the probabilistic LLM, producing reproducible verdicts: `PASS`, `WARN`, or `BLOCK`.

---

## 4. Known Limitations & Residual Risks

1. **Non-Provable Prompt Injection Immunity**: While delimiter framing, XML escaping, and JSON schema enforcement mitigate known injection techniques, large language models cannot be formally proven immune to novel adversarial prompts. Human review and deterministic secret scanners remain essential layers of defense.
2. **Third-Party Subprocess Dependencies**: Native linters (ESLint, Ruff, Bandit) parse arbitrary source code. Although executed in isolated temporary directories without shell execution, parser bugs or memory vulnerabilities in third-party tooling remain an external dependency risk.
3. **GitHub API Availability**: Upstream GitHub API rate limits or outages can delay PR reviews. The platform relies on BullMQ exponential backoff and fail-closed verdict states to manage upstream latency.

---

## 5. Responsible Disclosure Guidance

If you discover a security vulnerability or bypass in GitSentinel:

1. **Do NOT open a public GitHub issue.**
2. Send an encrypted email or detailed advisory to: `security@example.com` (replace with project security contact).
3. Include:
   - Detailed description of the vulnerability and attack vector.
   - Minimal reproducible proof-of-concept (PoC).
   - Affected endpoints or files.
4. We acknowledge receipt within 48 hours and provide a remediation timeline before public disclosure.

---

## 6. Incident Response & Credential Rotation Playbook

In the event of an inadvertent secret exposure, suspected key compromise, or revoked permissions:

### A. GitHub App Private Key Compromise
1. **Generate New Key**: Navigate to GitHub App Settings -> General -> **Generate a private key**.
2. **Update Environment**:
   - Vercel: Update `GITHUB_PRIVATE_KEY` in Project Settings -> Environment Variables.
   - Worker: Update `GITHUB_PRIVATE_KEY` on worker hosting environment (e.g. Render / AWS / Docker).
3. **Purge Cache & Restart**:
   - Deploy new environment variables and restart worker instances.
   - In-memory cached Octokit installation tokens are automatically purged on 401/403 responses.
4. **Revoke Old Key**: Delete the compromised private key from GitHub App Settings.

### B. Webhook Secret Rotation
1. **GitHub App Settings**: Enter a new cryptographic 32+ character secret under **Webhook secret**.
2. **Synchronize Server**:
   - Set `GITHUB_WEBHOOK_SECRET` in Vercel environment variables.
   - Deploy the new configuration. Webhook signature validation will seamlessly verify incoming deliveries signed with the new secret.

### C. OAuth App Client Secret Rotation
1. **GitHub OAuth / App Settings**: Generate a new client secret under **Client secrets**.
2. **Update Production Environment**: Set `NEXTAUTH_GITHUB_CLIENT_SECRET` (and `GITHUB_CLIENT_SECRET`) in Vercel.
3. **Delete Old Secret**: Delete the compromised secret in GitHub after validating successful sign-ins.

### D. NextAuth Session Secret (`NEXTAUTH_SECRET`) Rotation
1. **Generate Cryptographic Secret**: `openssl rand -hex 32`.
2. **Update Vercel**: Set `NEXTAUTH_SECRET` in Vercel environment variables.
3. **Impact**: Existing active user sessions (JWTs) signed with the old secret will become invalid and fail safely, prompting users to re-authenticate via GitHub OAuth. No database state or repo links are lost.

### E. AI Provider Key Rotation
1. **Revoke Old Key**: In Groq, Google AI Studio, or OpenAI dashboard, revoke compromised keys.
2. **Update Key Pool**: Update `GROQ_API_KEYS`, `GEMINI_API_KEYS`, etc., in the worker and web environment variables.
3. **Verification**: Execute `npm run check:env` to verify new keys prior to releasing traffic.

---

## 7. Production Hardening & Operational Resilience

### A. Serverless Execution & Timeouts
- **Vercel Webhooks**: `POST /api/webhooks/github` acknowledges valid webhooks within <50ms by verifying the HMAC signature and enqueuing jobs to BullMQ. Long-running code reviews never execute synchronously within serverless HTTP handlers.
- **Serverless Function Limits**: All dashboard queries and API endpoints are bounded with database query limits (`take: 50`) and timeouts.

### B. Worker Resilience & Concurrency
- **Fairness & Quota Control**: Per-installation slot limits prevent a single tenant from monopolizing worker capacity. Jobs exceeding capacity are rescheduled using jittered exponential backoff (`computeJitteredBackoff`).
- **Commit Idempotency**: `acquireReviewLock` with Redis atomic leases guarantees only one worker reviews a specific `(repoFullName, prNumber, commitSha)` tuple. Newer commit pushes cancel superseded pending reviews (`HeadShaChangedError`).
- **Queue Cleanup**: BullMQ retains the last 1,000 completed and 5,000 failed jobs, preventing unbounded Redis memory exhaustion.

### C. HTTP Security Headers
All browser interactions are protected with strict security headers configured in `next.config.mjs`:
- `Content-Security-Policy`: Restricts scripts, styles, fonts, objects, and connect endpoints; strictly prohibits clickjacking via `frame-ancestors 'none'`.
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`
- `poweredByHeader: false`
