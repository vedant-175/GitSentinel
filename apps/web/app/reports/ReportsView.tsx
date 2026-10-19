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
  { name: 'Santlaj/RockPaperScissor.py', score: 96, grade: 'A', prsScanned: 3, findings: 3, status: 'Pass' },
  { name: 'Santlaj/hackathon', score: 91, grade: 'A-', prsScanned: 5, findings: 4, status: 'Action Required' },
  { name: 'Santlaj/Chatbot', score: 94, grade: 'A', prsScanned: 4, findings: 3, status: 'Pass' },
  { name: 'Santlaj/Webathon_final_submission', score: 89, grade: 'B+', prsScanned: 6, findings: 5, status: 'Action Required' },
  { name: 'Santlaj/DSA_Leetcode', score: 98, grade: 'A+', prsScanned: 8, findings: 5, status: 'Clean' },
  { name: 'Santlaj/santlaj.github.io', score: 97, grade: 'A+', prsScanned: 2, findings: 1, status: 'Clean' },
  { name: 'Santlaj/Smart-Internship-Portal', score: 92, grade: 'A-', prsScanned: 7, findings: 5, status: 'Pass' },
  { name: 'Santlaj/infra-setup', score: 100, grade: 'A+', prsScanned: 0, findings: 0, status: 'Clean' },
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
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Security & Quality Reports
            </h1>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              <ShieldCheck className="h-3 w-3 text-emerald-600" />
              Audit Ready
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Executive compliance audits, fleet code quality scorecards, and review velocity metrics.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap print:hidden">
          {/* Time range selector */}
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-xs text-xs font-medium">
            <button
              onClick={() => setTimeRange('7d')}
              className={`px-2.5 py-1.5 rounded-md transition-colors ${
                timeRange === '7d'
                  ? 'bg-blue-50 text-blue-600 font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setTimeRange('30d')}
              className={`px-2.5 py-1.5 rounded-md transition-colors ${
                timeRange === '30d'
                  ? 'bg-blue-50 text-blue-600 font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setTimeRange('all')}
              className={`px-2.5 py-1.5 rounded-md transition-colors ${
                timeRange === 'all'
                  ? 'bg-blue-50 text-blue-600 font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Time
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportJson}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs transition-colors cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
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
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>Fleet Health Grade</span>
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 font-mono">
              Grade A
            </span>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900">94.8 / 100</div>
          <div className="mt-1 text-xs text-emerald-600 font-medium">↑ 3.2% vs previous month</div>
        </div>

        {/* OWASP Coverage */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-600">OWASP Top 10 Coverage</div>
          <div className="mt-3 text-2xl font-bold text-slate-900">98.4%</div>
          <div className="mt-1 text-xs text-slate-400">Zero critical vulnerabilities escaped</div>
        </div>

        {/* Mean Latency */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-600">Mean Review Turnaround</div>
          <div className="mt-3 text-2xl font-bold text-slate-900">18.2s</div>
          <div className="mt-1 text-xs text-slate-400">Deterministic AST + Multi-LLM</div>
        </div>

        {/* PRs Scanned */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-600">Scanned Pull Requests</div>
          <div className="mt-3 text-2xl font-bold text-slate-900">35 Monitored</div>
          <div className="mt-1 text-xs text-slate-400">100% fail-closed policy adherence</div>
        </div>
      </div>

      {/* 3. Compliance & Governance Matrix */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Compliance & Security Standards Matrix</h2>
            <p className="text-xs text-slate-500 mt-0.5">Automated verification against enterprise code quality and security standards.</p>
          </div>
          <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            All Standards Passing
          </span>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          <div className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
            <div className="space-y-0.5">
              <div className="font-bold text-slate-900">OWASP Top 10 (2021) Vulnerability Gate</div>
              <div className="text-slate-500">Injection (A03), Broken Auth (A07), SSRF (A10), and Cryptographic Failures (A02).</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono font-semibold text-slate-700">98.4% Compliant</span>
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 font-semibold text-emerald-700">
                ENFORCED
              </span>
            </div>
          </div>

          <div className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
            <div className="space-y-0.5">
              <div className="font-bold text-slate-900">CWE / SANS Top 25 Most Dangerous Weaknesses</div>
              <div className="text-slate-500">Static AST analysis + Semantic taint tracking for SQL injection, path traversal, and command injection.</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono font-semibold text-slate-700">99.1% Compliant</span>
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 font-semibold text-emerald-700">
                ENFORCED
              </span>
            </div>
          </div>

          <div className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
            <div className="space-y-0.5">
              <div className="font-bold text-slate-900">Zero Token & Secret Leak Guard (Gitleaks Engine)</div>
              <div className="text-slate-500">Entropy analysis and regex heuristics for API keys, JWT secrets, AWS tokens, and private keys.</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono font-semibold text-slate-700">100% Protected</span>
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 font-semibold text-emerald-700">
                ACTIVE
              </span>
            </div>
          </div>

          <div className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
            <div className="space-y-0.5">
              <div className="font-bold text-slate-900">SOC 2 Type II - Automated Change Management Audit Trail</div>
              <div className="text-slate-500">Immutable audit log of all automated review verdicts, commit hashes, policy snapshots, and timestamps.</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono font-semibold text-slate-700">100% Verified</span>
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 font-semibold text-emerald-700">
                VERIFIED
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Repository Scorecard Table */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Repository Health Scorecards</h2>
            <p className="text-xs text-slate-500 mt-0.5">Individual health grade and security metrics per connected repository.</p>
          </div>
          <Link
            href="/repositories"
            className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
          >
            <span>View all repositories</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/50 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 pl-5 pr-3">Repository</th>
                <th className="py-3 px-3">Health Score</th>
                <th className="py-3 px-3">Grade</th>
                <th className="py-3 px-3 text-center">PRs Scanned</th>
                <th className="py-3 px-3">Findings</th>
                <th className="py-3 pr-5 pl-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {REPO_SCORECARDS.map((r) => (
                <tr key={r.name} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 pl-5 pr-3 font-bold text-slate-900">
                    <div className="flex items-center gap-2">
                      <FolderGit2 className="h-4 w-4 text-slate-400" />
                      <span>{r.name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
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
                      <span className="font-mono font-semibold text-slate-700">{r.score}/100</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-3">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono font-bold text-slate-800">
                      {r.grade}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 text-center font-bold text-slate-900">
                    {r.prsScanned}
                  </td>
                  <td className="py-3.5 px-3 text-slate-600 font-medium">
                    {r.findings > 0 ? (
                      <span className="text-amber-600 font-semibold">{r.findings} issues</span>
                    ) : (
                      <span className="text-emerald-600 font-semibold">0 issues</span>
                    )}
                  </td>
                  <td className="py-3.5 pr-5 pl-3 text-right">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        r.status === 'Clean'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : r.status === 'Pass'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
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
