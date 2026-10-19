'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Info,
  Search,
  Filter,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Sparkles,
  Bot,
  FileCode,
  ArrowUpRight,
  Code,
  Check,
  Copy,
} from 'lucide-react';

export interface SecurityFindingItem {
  id: number;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  cwe?: string;
  owasp?: string;
  filePath: string;
  lineNumber?: number;
  repoFullName: string;
  prNumber?: number;
  prTitle?: string;
  status: 'open' | 'mitigated' | 'dismissed';
  suggestedFix?: string;
  impact?: string;
  attackScenario?: string;
  remediation?: string;
  detectedAt: string;
}

const DEMO_FINDINGS: SecurityFindingItem[] = [
  {
    id: 101,
    title: 'SQL Injection via Unsanitized User Identifier in Database Query',
    severity: 'critical',
    category: 'security',
    cwe: 'CWE-89',
    owasp: 'A03:2021-Injection',
    filePath: 'packages/db/src/client.ts',
    lineNumber: 42,
    repoFullName: 'vedant-175/GitSentinel',
    prNumber: 3,
    prTitle: 'Add rate limiting middleware and user lookup',
    status: 'open',
    suggestedFix: `// Safe parameterized query:\nconst user = await prisma.user.findUnique({\n  where: { id: sanitizedUserId }\n});`,
    impact: 'Attackers can bypass authentication and execute arbitrary SQL queries against the production database.',
    attackScenario: 'Passing malicious payload "\' OR 1=1 --" to the raw query parameter allows extracting all user credentials.',
    remediation: 'Always use ORM parameterization or prepared statements. Never concatenate untrusted strings into queries.',
    detectedAt: '2 hours ago',
  },
  {
    id: 102,
    title: 'Hardcoded High-Entropy JWT Secret in Configuration File',
    severity: 'high',
    category: 'security',
    cwe: 'CWE-798',
    owasp: 'A07:2021-Identification & Auth Failures',
    filePath: 'apps/worker/src/config.py',
    lineNumber: 18,
    repoFullName: 'vedant-175/Smart-Internship-portal',
    prNumber: 5,
    prTitle: 'Full stack authentication and token generation',
    status: 'open',
    suggestedFix: `// Read token secret from environment:\nJWT_SECRET = os.environ.get("JWT_SECRET")\nif not JWT_SECRET:\n    raise RuntimeError("Missing JWT_SECRET in environment")`,
    impact: 'Any party with repository access can sign valid authentication tokens and impersonate any user.',
    attackScenario: 'Attacker decodes the hardcoded secret from version history and manufactures administrative JWT claims.',
    remediation: 'Rotate the leaked secret immediately. Store cryptographic secrets exclusively in encrypted secret managers.',
    detectedAt: '5 hours ago',
  },
  {
    id: 103,
    title: 'Path Traversal Vulnerability in Static File Download Handler',
    severity: 'high',
    category: 'security',
    cwe: 'CWE-22',
    owasp: 'A01:2021-Broken Access Control',
    filePath: 'apps/web/app/api/download/route.ts',
    lineNumber: 29,
    repoFullName: 'vedant-175/Webathon_final_submission',
    prNumber: 6,
    prTitle: 'File upload and document download route',
    status: 'open',
    suggestedFix: `const safePath = path.resolve(STORAGE_DIR, fileName);\nif (!safePath.startsWith(path.resolve(STORAGE_DIR))) {\n  return new Response("Forbidden", { status: 403 });\n}`,
    impact: 'Attackers can read sensitive server files including /etc/passwd or environment configuration.',
    attackScenario: 'Requesting "../../.env" reads application environment secrets and database passwords.',
    remediation: 'Sanitize file paths with path.normalize and assert that resolved path resides strictly within the target folder.',
    detectedAt: '1 day ago',
  },
  {
    id: 104,
    title: 'Insecure Deserialization of Untrusted JSON Payload',
    severity: 'medium',
    category: 'security',
    cwe: 'CWE-502',
    owasp: 'A08:2021-Software & Data Integrity Failures',
    filePath: 'apps/worker/src/tasks/parser.ts',
    lineNumber: 67,
    repoFullName: 'vedant-175/AI-resume-builder',
    prNumber: 4,
    prTitle: 'AI powered chatbot for code review',
    status: 'open',
    suggestedFix: `const schema = z.object({ query: z.string().max(1000) });\nconst validPayload = schema.parse(rawBody);`,
    impact: 'Unvalidated payload schemas can trigger prototype pollution or unexpected type coercion bugs.',
    attackScenario: 'Sending "__proto__" property alters object prototype causing service disruption.',
    remediation: 'Validate all parsed JSON inputs against strict runtime schemas (Zod or Valibot).',
    detectedAt: '1 day ago',
  },
  {
    id: 105,
    title: 'Missing Rate Limiting on Authentication Endpoint',
    severity: 'medium',
    category: 'security',
    cwe: 'CWE-307',
    owasp: 'A07:2021-Identification & Auth Failures',
    filePath: 'apps/web/app/api/auth/login/route.ts',
    lineNumber: 12,
    repoFullName: 'vedant-175/Python-Programs',
    prNumber: 8,
    prTitle: 'Leetcode user authentication and sync',
    status: 'open',
    suggestedFix: `const rateLimitResult = await checkRateLimit(req.ip, { maxRequests: 5, windowMs: 60000 });\nif (!rateLimitResult.allowed) return new Response("Too Many Requests", { status: 429 });`,
    impact: 'Enables automated credential stuffing and brute-force dictionary attacks against user accounts.',
    attackScenario: 'Automated script attempts 1,000 password permutations per minute without lockouts.',
    remediation: 'Enforce IP and account-based rate limiting via Redis token bucket.',
    detectedAt: '2 days ago',
  },
  {
    id: 106,
    title: 'Overly Permissive Cross-Origin Resource Sharing (CORS)',
    severity: 'low',
    category: 'security',
    cwe: 'CWE-942',
    owasp: 'A05:2021-Security Misconfiguration',
    filePath: 'apps/web/next.config.js',
    lineNumber: 8,
    repoFullName: 'vedant-175/Smart-Internship-portal',
    prNumber: 7,
    prTitle: 'Internship portal API endpoints',
    status: 'open',
    suggestedFix: `headers: [\n  { key: 'Access-Control-Allow-Origin', value: 'https://smart-intern.portal.edu' }\n]`,
    impact: 'Malicious external domains can trigger authenticated requests on behalf of logged-in students.',
    attackScenario: 'Third-party phishing site makes cross-origin fetch requests stealing user profile metadata.',
    remediation: 'Restrict Access-Control-Allow-Origin to trusted exact domain origins rather than wildcard "*".',
    detectedAt: '4 days ago',
  },
  {
    id: 107,
    title: 'Information Disclosure via Stack Trace Leak in Production API Error Response',
    severity: 'low',
    category: 'security',
    cwe: 'CWE-209',
    owasp: 'A05:2021-Security Misconfiguration',
    filePath: 'apps/web/app/api/observability/route.ts',
    lineNumber: 84,
    repoFullName: 'vedant-175/website',
    prNumber: 2,
    prTitle: 'Personal portfolio website backend',
    status: 'open',
    suggestedFix: `const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;`,
    impact: 'Reveals filesystem paths and library dependencies to unauthorized remote callers.',
    attackScenario: 'Triggering an invalid format exposes internal Node module directories and system usernames.',
    remediation: 'Standardize error handlers to suppress raw exception traces in production responses.',
    detectedAt: '3 days ago',
  },
];

interface SecurityFindingsViewProps {
  initialFindings?: SecurityFindingItem[];
}

export function SecurityFindingsView({
  initialFindings = [],
}: SecurityFindingsViewProps) {
  const allFindings = initialFindings.length > 0 ? initialFindings : DEMO_FINDINGS;

  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [repoFilter, setRepoFilter] = useState<string>('all');
  const [selectedFinding, setSelectedFinding] = useState<SecurityFindingItem | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Available repos for filter dropdown
  const repoList = useMemo(() => {
    const set = new Set<string>();
    allFindings.forEach((f) => set.add(f.repoFullName));
    return Array.from(set);
  }, [allFindings]);

  // Aggregate stats
  const stats = useMemo(() => {
    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;
    allFindings.forEach((f) => {
      if (f.severity === 'critical') critical++;
      else if (f.severity === 'high') high++;
      else if (f.severity === 'medium') medium++;
      else low++;
    });
    return {
      total: allFindings.length,
      critical,
      high,
      medium,
      low,
      criticalHigh: critical + high,
    };
  }, [allFindings]);

  // Filtered findings
  const filteredFindings = useMemo(() => {
    return allFindings.filter((f) => {
      if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
      if (repoFilter !== 'all' && f.repoFullName !== repoFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          f.title.toLowerCase().includes(q) ||
          f.filePath.toLowerCase().includes(q) ||
          f.repoFullName.toLowerCase().includes(q) ||
          (f.cwe && f.cwe.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [allFindings, severityFilter, repoFilter, searchQuery]);

  const handleCopy = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openInCopilot = (finding: SecurityFindingItem) => {
    window.dispatchEvent(
      new CustomEvent('open-cyber-chat', {
        detail: {
          open: true,
          initialPrompt: `Explain the vulnerability "${finding.title}" in ${finding.filePath} (Line ${finding.lineNumber}). How should I remediate it?`,
        },
      })
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Security Findings
            </h1>
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200/60 px-2 py-0.5 text-xs font-semibold text-rose-700">
              <ShieldAlert className="h-3 w-3 text-rose-600" />
              Fail-Closed Security Gate
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Aggregated vulnerability scan results, CWE/OWASP violations, and automated remediations across all repositories.
          </p>
        </div>

        {/* Global Copilot quick action */}
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent('open-cyber-chat', { detail: { open: true } })
            )
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Ask Copilot AI</span>
        </button>
      </div>

      {/* 2. Four Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Findings */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-600">Total Findings</div>
          <div className="mt-3 text-2xl font-bold text-slate-900">{stats.total}</div>
          <div className="mt-1 text-xs text-slate-400">Across monitored pull requests</div>
        </div>

        {/* Critical & High */}
        <div className="rounded-xl border border-rose-200/80 bg-rose-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-rose-700">
            <span>Critical & High</span>
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
          </div>
          <div className="mt-3 text-2xl font-bold text-rose-700">{stats.criticalHigh}</div>
          <div className="mt-1 text-xs text-rose-500">Blocks PR merges automatically</div>
        </div>

        {/* Medium Severity */}
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-700">
            <span>Medium Severity</span>
            <span className="h-2 w-2 rounded-full bg-amber-500" />
          </div>
          <div className="mt-3 text-2xl font-bold text-amber-700">{stats.medium}</div>
          <div className="mt-1 text-xs text-amber-600">Recommended for sprint triage</div>
        </div>

        {/* Low & Advisory */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>Low & Style</span>
            <span className="h-2 w-2 rounded-full bg-blue-500" />
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900">{stats.low}</div>
          <div className="mt-1 text-xs text-slate-400">Code quality & best practices</div>
        </div>
      </div>

      {/* 3. Search and Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search findings by vulnerability, file, or CWE..."
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Severity Dropdown */}
          <div className="relative">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as any)}
              className="h-10 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          </div>

          {/* Repository Dropdown */}
          <div className="relative">
            <select
              value={repoFilter}
              onChange={(e) => setRepoFilter(e.target.value)}
              className="h-10 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer max-w-[200px] truncate"
            >
              <option value="all">All Repositories</option>
              {repoList.map((repo) => (
                <option key={repo} value={repo}>
                  {repo}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          </div>
        </div>
      </div>

      {/* 4. Findings List */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        <div className="divide-y divide-slate-100">
          {filteredFindings.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              No security findings match your filter criteria.
            </div>
          ) : (
            filteredFindings.map((finding) => {
              const isSelected = selectedFinding?.id === finding.id;

              const severityBadge =
                finding.severity === 'critical'
                  ? 'bg-rose-100 text-rose-800 border-rose-200'
                  : finding.severity === 'high'
                  ? 'bg-orange-100 text-orange-800 border-orange-200'
                  : finding.severity === 'medium'
                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                  : 'bg-blue-100 text-blue-800 border-blue-200';

              return (
                <div
                  key={finding.id}
                  className="p-4 hover:bg-slate-50/60 transition-colors"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                    {/* Left: Info */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${severityBadge}`}
                        >
                          {finding.severity}
                        </span>
                        {finding.cwe && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-mono font-medium text-slate-600">
                            {finding.cwe}
                          </span>
                        )}
                        <span className="text-xs text-slate-400 font-mono">
                          {finding.repoFullName}
                        </span>
                        {finding.prNumber && (
                          <Link
                            href={`/pull-requests`}
                            className="text-xs text-blue-600 hover:underline font-mono"
                          >
                            PR #{finding.prNumber}
                          </Link>
                        )}
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 leading-snug">
                        {finding.title}
                      </h3>

                      <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                        <FileCode className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{finding.filePath}:{finding.lineNumber || 1}</span>
                        <span>•</span>
                        <span>{finding.detectedAt}</span>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openInCopilot(finding)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white hover:bg-blue-50 text-blue-600 px-2.5 py-1.5 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                      >
                        <Bot className="h-3.5 w-3.5" />
                        <span>Fix with AI</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setSelectedFinding(isSelected ? null : finding)
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 text-xs font-medium shadow-xs transition-colors cursor-pointer"
                      >
                        <span>{isSelected ? 'Hide Details' : 'View Details'}</span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                            isSelected ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Vulnerability Deep Dive Panel */}
                  {isSelected && (
                    <div className="mt-4 pt-4 border-t border-slate-100 space-y-3 bg-slate-50/80 -mx-4 -mb-4 p-4 rounded-b-xl animate-fade-in">
                      {finding.impact && (
                        <div>
                          <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                            Security Impact
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5">
                            {finding.impact}
                          </p>
                        </div>
                      )}

                      {finding.attackScenario && (
                        <div>
                          <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                            Attack Scenario
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5">
                            {finding.attackScenario}
                          </p>
                        </div>
                      )}

                      {finding.suggestedFix && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                              AI Suggested Patch
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(finding.suggestedFix!, finding.id)}
                              className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                            >
                              {copiedId === finding.id ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-600" />
                                  <span className="text-emerald-600">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  <span>Copy Patch</span>
                                </>
                              )}
                            </button>
                          </div>
                          <pre className="rounded-lg bg-slate-900 p-3 text-[11px] font-mono text-emerald-400 overflow-x-auto">
                            <code>{finding.suggestedFix}</code>
                          </pre>
                        </div>
                      )}

                      {finding.remediation && (
                        <div>
                          <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                            Remediation Guidance
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5">
                            {finding.remediation}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
