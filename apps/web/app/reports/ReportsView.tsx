'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  Download,
  Printer,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  FolderGit2,
  GitPullRequest,
  Sparkles,
  TrendingUp,
  ExternalLink,
  ChevronRight,
  Filter,
} from 'lucide-react';

interface RepoScorecard {
  name: string;
  score: number;
  grade: string;
  prsScanned: number;
  findings: number;
  status: 'Clean' | 'Pass' | 'Action Required';
}

const REPO_SCORECARDS: RepoScorecard[] = [
  { name: 'GitSentinel/platform', score: 98, grade: 'A+', prsScanned: 5, findings: 2, status: 'Clean' },
  { name: 'platform/api-gateway', score: 94, grade: 'A', prsScanned: 4, findings: 3, status: 'Pass' },
  { name: 'platform/auth-service', score: 96, grade: 'A', prsScanned: 3, findings: 2, status: 'Pass' },
  { name: 'platform/data-aggregator', score: 91, grade: 'A-', prsScanned: 6, findings: 4, status: 'Action Required' },
  { name: 'platform/worker-queue', score: 98, grade: 'A+', prsScanned: 8, findings: 3, status: 'Clean' },
  { name: 'platform/web-dashboard', score: 99, grade: 'A+', prsScanned: 2, findings: 0, status: 'Clean' },
  { name: 'platform/ml-analyzer', score: 97, grade: 'A+', prsScanned: 2, findings: 1, status: 'Clean' },
  { name: 'platform/webhook-service', score: 95, grade: 'A', prsScanned: 3, findings: 2, status: 'Pass' },
];

export function ReportsView() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('30d');
  const [exporting, setExporting] = useState(false);

  const handleExportJson = () => {
    setExporting(true);
    const reportData = {
      platform: 'GitSentinel AI Code Review & Security Gate',
      generatedAt: new Date().toISOString(),
      timeRange,
      fleetSummary: {
        fleetGrade: 'A (94.8/100)',
        owaspComplianceRate: '98.4%',
        scannedPullRequests: 35,
        totalFindings: 26,
        meanLatencySeconds: 18.2,
      },
      complianceStandards: [
        { standard: 'OWASP Top 10 (2021)', status: 'Compliant', score: '98.4%' },
        { standard: 'CWE/SANS Top 25', status: 'Enforced', score: '99.1%' },
        { standard: 'SOC 2 Change Management Audit', status: 'Verified', score: '100%' },
        { standard: 'Gitleaks Zero-Token Leak Gate', status: 'Active', score: '100%' },
      ],
      repositories: REPO_SCORECARDS,
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gitsentinel-security-audit-${timeRange}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in print:p-0">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Security & Quality Reports
            </h1>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-900/50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              Audit Ready
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Executive compliance audits, fleet code quality scorecards, and review velocity metrics.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap print:hidden">
          {/* Time range selector */}
          <div className="flex rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-0.5 shadow-xs text-xs font-medium">
            <button
              onClick={() => setTimeRange('7d')}
              className={`px-2.5 py-1.5 rounded-md transition-colors ${
                timeRange === '7d'
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setTimeRange('30d')}
              className={`px-2.5 py-1.5 rounded-md transition-colors ${
                timeRange === '30d'
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setTimeRange('all')}
              className={`px-2.5 py-1.5 rounded-md transition-colors ${
                timeRange === 'all'
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Time
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportJson}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-200 shadow-xs transition-colors cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-slate-500 dark:text-zinc-400" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* 2. Top Key Audit Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Fleet Grade */}
        <div className="rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-zinc-400">
            <span>Fleet Health Grade</span>
            <span className="rounded bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 font-mono">
              Grade A
            </span>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">94.8 / 100</div>
          <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">↑ 3.2% vs previous month</div>
        </div>

        {/* OWASP Coverage */}
        <div className="rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-600 dark:text-zinc-400">OWASP Top 10 Coverage</div>
          <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">98.4%</div>
          <div className="mt-1 text-xs text-slate-400 dark:text-zinc-500">Zero critical vulnerabilities escaped</div>
        </div>

        {/* Mean Latency */}
        <div className="rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-600 dark:text-zinc-400">Mean Review Turnaround</div>
          <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">18.2s</div>
          <div className="mt-1 text-xs text-slate-400 dark:text-zinc-500">Deterministic AST + Multi-LLM</div>
        </div>

        {/* PRs Scanned */}
        <div className="rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-600 dark:text-zinc-400">Scanned Pull Requests</div>
          <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">35 Monitored</div>
          <div className="mt-1 text-xs text-slate-400 dark:text-zinc-500">100% fail-closed policy adherence</div>
        </div>
      </div>

      {/* 3. Compliance & Governance Matrix */}
      <div className="rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Compliance & Security Standards Matrix</h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Automated verification against enterprise code quality and security standards.</p>
          </div>
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            All Standards Passing
          </span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-zinc-800/80 text-xs">
          <div className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-zinc-900/50 transition-colors">
            <div className="space-y-0.5">
              <div className="font-bold text-slate-900 dark:text-white">OWASP Top 10 (2021) Vulnerability Gate</div>
              <div className="text-slate-500 dark:text-zinc-400">Injection (A03), Broken Auth (A07), SSRF (A10), and Cryptographic Failures (A02).</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono font-semibold text-slate-700 dark:text-zinc-300">98.4% Compliant</span>
              <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/50 px-2.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-400">
                ENFORCED
              </span>
            </div>
          </div>

          <div className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-zinc-900/50 transition-colors">
            <div className="space-y-0.5">
              <div className="font-bold text-slate-900 dark:text-white">CWE / SANS Top 25 Most Dangerous Weaknesses</div>
              <div className="text-slate-500 dark:text-zinc-400">Static AST analysis + Semantic taint tracking for SQL injection, path traversal, and command injection.</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono font-semibold text-slate-700 dark:text-zinc-300">99.1% Compliant</span>
              <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/50 px-2.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-400">
                ENFORCED
              </span>
            </div>
          </div>

          <div className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-zinc-900/50 transition-colors">
            <div className="space-y-0.5">
              <div className="font-bold text-slate-900 dark:text-white">Zero Token & Secret Leak Guard (Gitleaks Engine)</div>
              <div className="text-slate-500 dark:text-zinc-400">Entropy analysis and regex heuristics for API keys, JWT secrets, AWS tokens, and private keys.</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono font-semibold text-slate-700 dark:text-zinc-300">100% Protected</span>
              <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/50 px-2.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-400">
                ACTIVE
              </span>
            </div>
          </div>

          <div className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-zinc-900/50 transition-colors">
            <div className="space-y-0.5">
              <div className="font-bold text-slate-900 dark:text-white">SOC 2 Type II - Automated Change Management Audit Trail</div>
              <div className="text-slate-500 dark:text-zinc-400">Immutable audit log of all automated review verdicts, commit hashes, policy snapshots, and timestamps.</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono font-semibold text-slate-700 dark:text-zinc-300">100% Verified</span>
              <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/50 px-2.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-400">
                VERIFIED
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Repository Scorecard Table */}
      <div className="rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Repository Health Scorecards</h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Individual health grade and security metrics per connected repository.</p>
          </div>
          <Link
            href="/repositories"
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold flex items-center gap-1"
          >
            <span>View all repositories</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/60 text-[11px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
                <th className="py-3 pl-5 pr-3">Repository</th>
                <th className="py-3 px-3">Health Score</th>
                <th className="py-3 px-3">Grade</th>
                <th className="py-3 px-3 text-center">PRs Scanned</th>
                <th className="py-3 px-3">Findings</th>
                <th className="py-3 pr-5 pl-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
              {REPO_SCORECARDS.map((r) => (
                <tr key={r.name} className="hover:bg-slate-50/60 dark:hover:bg-zinc-900/40 transition-colors">
                  <td className="py-3.5 pl-5 pr-3 font-bold text-slate-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <FolderGit2 className="h-4 w-4 text-slate-400 dark:text-zinc-500" />
                      <span>{r.name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            r.score >= 95
                              ? 'bg-emerald-500'
                              : r.score >= 90
                              ? 'bg-blue-500'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${r.score}%` }}
                        />
                      </div>
                      <span className="font-mono font-semibold text-slate-700 dark:text-zinc-300">{r.score}/100</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-3">
                    <span className="rounded bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-mono font-bold text-slate-800 dark:text-zinc-200">
                      {r.grade}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 text-center font-bold text-slate-900 dark:text-white">
                    {r.prsScanned}
                  </td>
                  <td className="py-3.5 px-3 text-slate-600 dark:text-zinc-400 font-medium">
                    {r.findings > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">{r.findings} issues</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">0 issues</span>
                    )}
                  </td>
                  <td className="py-3.5 pr-5 pl-3 text-right">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        r.status === 'Clean'
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50'
                          : r.status === 'Pass'
                          ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50'
                          : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
