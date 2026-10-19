# Phase 6 Implementation Report: Production-Grade Code Review Engine

**Phase**: Phase 6 (Context Retrieval, Evidence-Backed Grounding, Controlled Taxonomies, Test Awareness, Sandboxed Patching, Multi-Model Escalation, Confidence Calibration, Risk Prioritization, Deterministic Dependency Scanning, and OASIS SARIF 2.1.0)  
**System**: GitSentinel AI Code Review & Security Gate  
**Date**: 2026-10-05  
**Codebase Verification**: 199/199 Unit & Integration Tests Passing (100% Green across all 3 monorepo workspaces)  
**SARIF Endpoint**: [`apps/web/app/api/reviews/[id]/sarif/route.ts`](file:///e:/college/project/ai%20code%20review/apps/web/app/api/reviews/%5Bid%5D/sarif/route.ts)  
**Worker Review Engine**: [`apps/worker/src/review/pipeline.ts`](file:///e:/college/project/ai%20code%20review/apps/worker/src/review/pipeline.ts)  

---

## Executive Summary: Beyond "LLM + GitHub API + Comments"

A naive code review bot consists of three basic primitives:
```
[GitHub PR Diff] ──> [Send to OpenAI / Claude API] ──> [Post Raw Comments to PR]
```

In an enterprise engineering organization, this naive pattern fails almost immediately for seven catastrophic reasons:
1. **Context Blindness**: Reviewing diff chunks in isolation strips away enclosing functions, interfaces, callers, callees, and database schemas. The model hallucinates missing types or fails to notice that an unescaped input parameter was already sanitized upstream.
2. **Unsupported "Vibe" Reviews**: Models output subjective, anxiety-inducing commentary such as *"This looks dangerous"* or *"Consider refactoring this"* without concrete technical evidence, proof of exploitability, or realistic attack vectors.
3. **Taxonomy Hallucination**: Ungrounded LLMs invent arbitrary, non-standard vulnerability identifiers (e.g. `SEC-CRIT-999`, `CWE-SQL-HAZARD`), breaking automated ingestion pipelines and enterprise compliance audits.
4. **Test Blindness**: Models cannot tell whether a changed function is thoroughly tested or completely uncovered, leading to redundant warnings on tested edge cases while missing untested security logic.
5. **Hallucinated Broken Patches**: When models suggest code replacements, they frequently introduce syntax errors, omit closing brackets, use lazy ellipsis (`...`), or break surrounding types. Blindly committing these patches breaks CI builds.
6. **Confidence Inflation**: LLMs are notoriously overconfident, assigning $0.99$ confidence to benign false positives and $0.80$ to genuine critical remote code execution bugs.
7. **Noisy Blocking vs Quadratic Cost**: Running multiple frontier models on every commit is economically unsustainable ($\sim \$0.05 - \$0.15$ per review), while running a single model produces noisy false rejections on ambiguous code.

**Phase 6 permanently differentiates GitSentinel by replacing the naive wrapper with a 10-layer deterministic + AI hybrid security engine.**

---

## Phase 6 Architecture Pipeline

```mermaid
flowchart TD
    A[GitHub Webhook / Diff] --> B[Deterministic Static Analysis & Lockfile Scanner]
    B -->|ESLint / Bandit / Advisory DB| C[Line-Anchored Static Findings]
    A --> D[Context Retrieval Engine]
    D -->|Token Budget <= 1500| E[Enclosing Functions, Types, Call Graph, Tests & Schema]
    E --> F[Prompt Assembler & Injection Sandbox]
    F --> G[Primary LLM Analysis]
    C --> H[Findings Merger & Deduplicator]
    G --> H
    H --> I[Controlled Taxonomies Normalizer]
    I -->|CWE-89, CWE-918, OWASP Top 10| J[Confidence Calibration Engine]
    J -->|Model + Static + AST + History| K[Explainable Risk Prioritizer 0-100]
    K --> L{Escalation Policy Check}
    L -->|Borderline / Disagreement| M[Secondary Model Consensus Check]
    L -->|Corroborated / Normal| N[Safe Patch Validation Sandbox]
    M -->|Disagreement Detected| O[Mark REVIEW REQUIRED]
    M -->|Consensus Confirmed| N
    N -->|Dry-run, Syntax, Typecheck, ESLint| P[Verified Findings & Remediations]
    O --> P
    P --> Q[OASIS SARIF 2.1.0 Exporter]
    P --> R[PostgreSQL DB & Next.js CyberOps Dashboard]
```

---

## Detailed Implementation Breakdown

### 1. Context-Aware Review (Relevant-Code Retrieval System)
- **Module**: [`apps/worker/src/review/context.ts`](file:///e:/college/project/ai%20code%20review/apps/worker/src/review/context.ts)
- **Purpose**: Solves diff isolation without blowing through context windows or sending entire repositories.
- **Retrieval Capabilities**:
  - **Enclosing Function**: Automatically identifies and extracts the full enclosing function signature, opening/closing lines, and parent scope for every modified line. If the function exceeds budget, it gracefully truncates the body while preserving the signature.
  - **Imports**: Extracts top-level module imports (`import ...` and `require(...)`) from the modified file to understand external dependencies.
  - **Referenced Types & Interfaces**: Analyzes the modified lines and enclosing function for interface, type alias, or class references (e.g., `LoginRequest`, `AuthResponse`) and extracts their complete definitions.
  - **Call Graph (Direct Callers & Callees)**: Scans the file to identify which functions call the changed code and which functions the changed code invokes.
  - **Related Test Files**: Uses deterministic naming heuristics (`*.test.ts`, `*.spec.ts`, `__tests__/*`) to find corresponding test files and extracts test blocks matching changed function names.
  - **Schema & Configuration**: Ingests primary database schemas (e.g. `schema.prisma`, `.env.example`, `package.json`) to provide entity structure.
- **Token Budget Management**: Enforces a strict ceiling (default: 1,500 tokens). Prioritizes enclosing functions > types/interfaces > call graph > tests > schemas.
- **Provenance Tracking**: Every retrieved source records its `type`, `filePath`, `symbol`, line range `[startLine, endLine]`, and token weight.

### 2. Evidence-Backed Findings (No More "This Looks Dangerous")
- **Modules**: [`apps/worker/src/review/prompt.ts`](file:///e:/college/project/ai%20code%20review/apps/worker/src/review/prompt.ts), [`packages/shared/src/schemas.ts`](file:///e:/college/project/ai%20code%20review/packages/shared/src/schemas.ts)
- **Problem**: Naive models emit vague statements like *"This looks dangerous"* or *"Consider sanitizing this input."*
- **Solution**: The review engine enforces an **8-part mandatory finding contract** on all security and bug issues:
  1. `message`: Concise technical summary of the defect.
  2. `evidence`: Concrete technical proof from the added lines explaining the exact mechanism of failure (e.g. *"variable userEmail is interpolated directly into raw SQL template literal without parameter bindings"*).
  3. `impact`: Measurable technical consequence (e.g. *"Full database read/write bypass via unauthenticated query manipulation"*).
  4. `attack_scenario`: Step-by-step hypothetical attack scenario (e.g. *"Attacker supplies payload admin@example.com' OR '1'='1 in the email parameter to dump the users table"*).
  5. `affected_code`: The exact snippet of added code that contains the vulnerability.
  6. `remediation`: Explicit explanation of how to fix the issue.
  7. `confidence`: Raw confidence score from the model.
  8. `supporting_evidence`: Corroborating signals from static analysis or advisory databases.

### 3. Controlled CWE & OWASP Taxonomies
- **Module**: [`packages/shared/src/taxonomies.ts`](file:///e:/college/project/ai%20code%20review/packages/shared/src/taxonomies.ts)
- **Problem**: LLMs invent arbitrary, non-standard taxonomies (e.g. `CWE-SQLI`, `OWASP-HACKING`, `SECURITY-FAIL-01`).
- **Solution**:
  - Controlled lookup dictionary `VALIDATED_CWE_TAXONOMY` covering common vulnerability categories:
    - SQL Injection $\to$ **CWE-89** (`A03:2021-Injection`)
    - Server-Side Request Forgery $\to$ **CWE-918** (`A10:2021-Server-Side Request Forgery`)
    - OS Command Injection $\to$ **CWE-78** (`A03:2021-Injection`)
    - Code Injection (`eval`) $\to$ **CWE-94** (`A03:2021-Injection`)
    - Path Traversal $\to$ **CWE-22** (`A01:2021-Broken Access Control`)
    - Hardcoded Secrets $\to$ **CWE-798** (`A07:2021-Identification and Authentication Failures`)
    - Cryptographically Weak PRNG $\to$ **CWE-338** (`A02:2021-Cryptographic Failures`)
    - Prototype Pollution $\to$ **CWE-1321** (`A03:2021-Injection`)
    - ReDoS $\to$ **CWE-1333** (`A05:2021-Security Misconfiguration`)
    - IDOR $\to$ **CWE-639** (`A01:2021-Broken Access Control`)
  - Controlled `OWASP_TOP_10_2021` taxonomy validation:
    - Rejects any category not in the official 2021 Top 10 list (`A01:2021` through `A10:2021`).
  - Fallback normalizer `inferValidatedTaxonomy` maps textual code signals to verified CWEs and OWASP buckets without allowing the LLM to invent arbitrary identifiers.

### 4. Test-Aware Review
- **Module**: [`apps/worker/src/review/testAware.ts`](file:///e:/college/project/ai%20code%20review/apps/worker/src/review/testAware.ts)
- **Capabilities**:
  - Compares changed functions against available repository test files.
  - Generates a breakdown of:
    - `changedFunctions`: Functions introduced or modified in the pull request.
    - `coveredFunctions`: Functions verified to have corresponding test assertions in test files.
    - `untestedFunctions`: Functions lacking corresponding test coverage.
  - **Security Test Recommendations**: When a critical or security-sensitive function is modified without test coverage, GitSentinel automatically generates a runnable unit test scaffold using `node:test` and `node:assert/strict` targeting edge cases and adversarial input rejection.

### 5. Sandboxed Patch Generation & Isolated Validation
- **Module**: [`apps/worker/src/review/patchValidation.ts`](file:///e:/college/project/ai%20code%20review/apps/worker/src/review/patchValidation.ts)
- **Problem**: Blindly applying or recommending LLM suggested patches breaks CI builds with syntax errors or bad imports.
- **Validation Pipeline**:
  1. **Path Safety**: Rejects path traversal (`..`), absolute paths (`/etc`, `C:\`), and protected directories (`.git/`, `node_modules/`).
  2. **Patch Syntax & Ellipsis Check**: Rejects suggested fixes containing placeholder ellipsis (`...`), `// TODO:`, or `/* existing code */`.
  3. **Context Matching**: Verifies the target line number exists and matches the file content.
  4. **Isolated Scratch Sandbox**: Uses `fs.mkdtemp` in the OS temporary directory to write the patched file in complete isolation.
  5. **Typecheck & Linter Verification**: Runs ESLint and AST syntax parsers on the patched file in the sandbox. If the patch introduces syntax errors, parse failures, or linter errors, the patch is **rejected**, and the issue's `suggested_fix` is set to `null` with an explanation recorded in `supporting_evidence`.
  6. **Guaranteed Cleanup**: Temporary directories are always destroyed in a `finally` block.

### 6. Multi-Model Disagreement & Selective Escalation
- **Module**: [`apps/worker/src/review/escalation.ts`](file:///e:/college/project/ai%20code%20review/apps/worker/src/review/escalation.ts)
- **Problem**: Running multiple models on every PR increases API costs quadratically. Single models, however, can be noisy on critical findings.
- **Escalation Policy**:
  - Selective escalation is triggered **only** when:
    1. Finding severity is `critical` AND static analysis did not corroborate the finding.
    2. Model confidence is borderline ($0.70 \le \text{confidence} < 0.80$) on a security category finding.
    3. The finding is located in a high-criticality component (matching `auth`, `crypto`, `jwt`, `token`, `payment`, `billing`, `rbac`).
  - When triggered:
    - If a secondary model is available, it reviews the specific hunk.
    - If both models agree: Finding status is marked `ESCALATED` and confirmed.
    - If models disagree (e.g. Model A flags critical SQLi, Model B flags clean, Static analysis is clean): Finding is flagged as **`REVIEW REQUIRED`** with the prefix `[REVIEW REQUIRED - MODEL DISAGREEMENT]` and never blocks merges automatically.

### 7. Confidence Calibration Engine
- **Module**: [`packages/shared/src/calibration.ts`](file:///e:/college/project/ai%20code%20review/packages/shared/src/calibration.ts)
- **Problem**: Raw LLM confidence is uncalibrated. A model will output `0.99` confidence for a false positive simply because it hallucinated a hazard.
- **Calibration Formula**:
  $$\text{Calibrated Confidence} = 0.50 \cdot C_{\text{raw}} + 0.25 \cdot A_{\text{static}} + 0.15 \cdot V_{\text{ast}} + 0.10 \cdot F_{\text{history}}$$
  - **$C_{\text{raw}}$ (Raw Model Confidence, 50%)**: Base confidence reported by the LLM.
  - **$A_{\text{static}}$ (Static Analyzer Agreement, 25%)**: $+0.25$ if verified by ESLint, Bandit, Ruff, or regex secret rules; $-0.10$ penalty if a static rule covers this category but reported clean.
  - **$V_{\text{ast}}$ (AST Structural Anchoring, 15%)**: $+0.15$ if the line number strictly anchors inside added AST diff lines; $-0.15$ penalty if floating in pre-existing or synthetic context.
  - **$F_{\text{history}}$ (Historical Feedback Fix Rate, 10%)**: Scaled based on whether developers historically fix or dismiss this issue category.

### 8. Explainable Risk Prioritization (0–100)
- **Module**: [`packages/shared/src/risk.ts`](file:///e:/college/project/ai%20code%20review/packages/shared/src/risk.ts)
- **Score Breakdown**:
  $$\text{Risk Score} = \text{Severity} (35) + \text{Confidence} (20) + \text{Category} (15) + \text{File Criticality} (15) + \text{Change Size} (10) + \text{Test Gap} (5)$$

| Component | Max Points | Scoring Criteria |
| :--- | :--- | :--- |
| **Severity Points** | 35 | Critical = 35, Warning = 20, Suggestion = 5 |
| **Confidence Points** | 20 | $\text{Round}(\text{Calibrated Confidence} \times 20)$ |
| **Category Points** | 15 | Security = 15, Bug = 12, Performance = 8, Maintainability = 5, Style = 2 |
| **File Criticality Points** | 15 | Sensitive (auth, crypto, payment, billing) = 15, Core Source (`src/`) = 8, Configuration/Docs = 1 |
| **Change Size Points** | 10 | Lines changed $\ge 500$ or files $\ge 20 \to 10$; lines $\ge 200 \to 7$; lines $\ge 50 \to 4$; else 1 |
| **Test Gap Points** | 5 | Changed code lacks corresponding test coverage $\to 5$; has tests $\to 0$ |

- **Risk Levels**:
  - **CRITICAL** ($\ge 80$): Immediate merge blocking, security review mandatory.
  - **HIGH** ($65 - 79$): Significant bug or security flaw requiring remediation.
  - **MEDIUM** ($40 - 64$): Standard bug or design issue.
  - **LOW** ($< 40$): Minor suggestion or style improvement.

### 9. Deterministic Dependency Scanning
- **Module**: [`apps/worker/src/review/dependencies.ts`](file:///e:/college/project/ai%20code%20review/apps/worker/src/review/dependencies.ts)
- **Problem**: Asking an LLM *"Does this package have a CVE?"* results in hallucinated CVE numbers and wrong version bounds.
- **Solution**:
  - Supported Ecosystems: **npm** (`package.json`, `package-lock.json`) and **Python** (`requirements.txt`, `Pipfile.lock`).
  - Deterministic advisory database containing verified vulnerabilities (e.g. `lodash` < 4.17.21 CVE-2021-23337, `axios` < 0.21.2 CVE-2020-28168 SSRF, `jsonwebtoken` < 9.0.0 CVE-2022-23529, `tar` < 6.1.9 CVE-2021-37713 Path Traversal, `urllib3` < 1.26.5 CVE-2021-33503 ReDoS, `flask` < 2.2.5 CVE-2023-30861 Cookie Disclosure, `cryptography` < 41.0.6 CVE-2023-49083).
  - Exact line number anchoring in manifest files.
  - Deterministic semver comparison (`isVersionBelow`).
  - Output mapped directly to CWE, OWASP Top 10, confidence 1.0, and actionable upgrade remediation.

### 10. OASIS SARIF 2.1.0 Export & GitHub Code Scanning Integration
- **Modules**: [`packages/shared/src/sarif.ts`](file:///e:/college/project/ai%20code%20review/packages/shared/src/sarif.ts), [`apps/web/app/api/reviews/[id]/sarif/route.ts`](file:///e:/college/project/ai%20code%20review/apps/web/app/api/reviews/%5Bid%5D/sarif/route.ts)
- **Format**: Conforms to standard OASIS Static Analysis Results Interchange Format (SARIF) version 2.1.0.
- **Validation**: Schema-level verification with `validateSarifLog`.
- **API Endpoint**: `GET /api/reviews/:id/sarif` returning `application/sarif+json`.
- **GitHub Code Scanning Action Integration**:
```yaml
name: GitSentinel Code Scanning
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  security-gate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Export GitSentinel Review SARIF
        run: |
          curl -s -f "http://gitsentinel.internal/api/reviews/${{ github.event.pull_request.number }}/sarif" \
            -o gitsentinel.sarif

      - name: Upload SARIF to GitHub Security Tab
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: gitsentinel.sarif
          category: gitsentinel-ai-review
```

---

## Comparison: GitSentinel vs "LLM + GitHub API + Comments"

| Capability | Naive "LLM + GitHub API" Bot | GitSentinel Phase 6 Engine |
| :--- | :--- | :--- |
| **Context Retrieval** | Raw diff only; misses surrounding functions, types, and schema | Context-aware retrieval engine extracting enclosing functions, imports, types, callers/callees, related tests, and schema under a 1,500 token ceiling |
| **Finding Grounding** | "This looks dangerous" subjective commentary | Mandatory 8-part evidence contract: Technical Evidence, Impact, Attack Scenario, Affected Code, Remediation, Confidence |
| **Taxonomies** | Hallucinated arbitrary tags (`SEC-BUG-1`) | Validated CWE identifiers (CWE-89, CWE-918, CWE-22, etc.) and controlled OWASP Top 10 2021 mappings |
| **Test Awareness** | Blind to whether code is tested | Analyzes changed functions vs test files; detects untested functions; generates runnable security test scaffolding |
| **Remediation / Patches** | Untested code snippets with ellipses (`...`) that break builds | Isolated dry-run in OS temp sandbox (`fs.mkdtemp`); verifies syntax, path safety, and ESLint before surfacing |
| **Model Disagreement** | Single model or wasteful multi-model on every PR | Configurable escalation policy; invokes secondary model only on uncorroborated criticals or sensitive files; marks `REVIEW REQUIRED` on disagreement |
| **Confidence Scoring** | Trust raw LLM confidence (prone to severe overconfidence) | Calibrated confidence blending raw confidence (50%), static agreement (25%), AST anchoring (15%), and feedback history (10%) |
| **Risk Prioritization** | Arbitrary severity labels | Explainable 0–100 risk score factoring severity, confidence, security category, file criticality, change size, and test gaps |
| **Dependency Scanning** | Prompts LLM to guess CVEs (hallucination risk) | Deterministic lockfile parsing against curated advisory database (npm and Python) |
| **Enterprise Export** | Markdown PR comments only | OASIS SARIF 2.1.0 export endpoint for GitHub Code Scanning and enterprise SIEM ingestion |

---

## Verification & Test Results

All test suites across the monorepo pass cleanly with zero regressions:

```bash
# Packages Shared (Taxonomies, Calibration, Risk, SARIF, Schemas)
npm run test --workspace=packages/shared
✔ 39 tests passed (0 failed, 100% green)

# Apps Worker (Context, Test-Aware, Patch Validation, Escalation, Dependency Scanning, Pipeline)
npm run test --workspace=apps/worker
✔ 98 tests passed (0 failed, 100% green)

# Apps Web (SARIF API Export, Filtering, Isolation, Webhooks, Queue)
npm run test --workspace=apps/web
✔ 62 tests passed (0 failed, 100% green)

# Total Verified Monorepo Suite
✔ 199 tests passed across 3 workspaces (100% Green)
```

The system is fully operational and verified.
