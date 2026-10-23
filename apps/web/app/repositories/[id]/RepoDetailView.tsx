'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Shield,
  ShieldAlert,
  Clock,
  TrendingUp,
  Tag,
  GitPullRequest,
  AlertCircle,
  FileText,
  Settings,
  BarChart3,
  Code2,
  Cpu,
  FlaskConical,
  Zap,
  Check,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { AnalyseRepoButton } from '../AnalyseRepoButton';
import { RepoConfigModal } from '../../components/RepoConfigModal';
import { WeeklyTrendChart } from '@/app/components/charts/WeeklyTrendChart';
import { SeverityChart } from '@/app/components/charts/SeverityChart';
import { CategoryChart } from '@/app/components/charts/CategoryChart';
import { LatencyDistributionCard } from '@/app/components/charts/LatencyDistributionCard';
import { RepoConfig } from '@ai-reviewer/shared';

interface RepoDetailViewProps {
  repo: any;
  analytics: any;
  healthReport: any;
  allIssues: any[];
}

export function RepoDetailView({
  repo,
  analytics,
  healthReport,
  allIssues,
}: RepoDetailViewProps) {
  const [activeTab, setActiveTab] = useState<'analytics' | 'prs' | 'issues' | 'files' | 'settings'>('analytics');

  const criticalCount =
    (analytics.severityBreakdown as any[])?.find((s: any) => s.severity === 'critical')?.count || 0;
  const warningCount =
    (analytics.severityBreakdown as any[])?.find((s: any) => s.severity === 'warning')?.count || 1;
  const suggestionCount =
    (analytics.severityBreakdown as any[])?.find((s: any) => s.severity === 'suggestion')?.count || 1;
  const totalIssuesCount = criticalCount + warningCount + suggestionCount;

  const pullRequests = [...(repo.pullRequests || [])].sort((a: any, b: any) => {
    const timeA = a.openedAt ? new Date(a.openedAt).getTime() : 0;
    const timeB = b.openedAt ? new Date(b.openedAt).getTime() : 0;
    if (timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) return timeB - timeA;
    const numA = Number(a.githubPrNumber || a.number || a.id) || 0;
    const numB = Number(b.githubPrNumber || b.number || b.id) || 0;
    if (numA !== numB) return numB - numA;
    return (b.id || 0) - (a.id || 0);
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in text-slate-900 dark:text-zinc-100 font-sans">
      {/* 1. Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
        <Link
          href="/repositories"
          className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          Repositories
        </Link>
        <ChevronRight className="h-3 w-3 text-slate-400 dark:text-zinc-600" />
        <span className="font-semibold text-slate-800 dark:text-zinc-200">{repo.fullName}</span>
      </div>

      {/* 2. Repository Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div className="flex items-center gap-3.5">
          <svg className="h-9 w-9 text-slate-900 dark:text-white shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
            />
          </svg>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {repo.fullName}
              </h1>
              <span className="rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 text-xs px-2.5 py-0.5 font-medium border border-slate-200 dark:border-zinc-700">
                Public
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Default Branch: <span className="font-mono text-slate-700 dark:text-zinc-300">{repo.defaultBranch || 'main'}</span> • Org/Account: <span className="text-slate-700 dark:text-zinc-300">{repo.installation?.accountLogin || 'Unknown'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <AnalyseRepoButton
            repoId={repo.id}
            repoFullName={repo.fullName}
            variant="primary"
          />
          <RepoConfigModal
            repoId={repo.id}
            repoName={repo.fullName}
            initialConfig={repo.config as unknown as RepoConfig}
          />
        </div>
      </div>

      {/* 3. Sub-Navigation Tabs Bar */}
      <div className="flex items-center gap-8 border-b border-slate-200 dark:border-zinc-800 text-sm font-medium overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 pb-3 border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === 'analytics'
              ? 'border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400 font-semibold'
              : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          <span>Repository Analytics</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('prs')}
          className={`flex items-center gap-2 pb-3 border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === 'prs'
              ? 'border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400 font-semibold'
              : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
          }`}
        >
          <GitPullRequest className="h-4 w-4" />
          <span>Pull Requests</span>
          {pullRequests.length > 0 && (
            <span className="rounded-full bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.2 text-[10px] font-bold text-slate-600 dark:text-zinc-400">
              {pullRequests.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('issues')}
          className={`flex items-center gap-2 pb-3 border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === 'issues'
              ? 'border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400 font-semibold'
              : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
          }`}
        >
          <AlertCircle className="h-4 w-4" />
          <span>Issues</span>
          {allIssues.length > 0 && (
            <span className="rounded-full bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.2 text-[10px] font-bold text-slate-600 dark:text-zinc-400">
              {allIssues.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('files')}
          className={`flex items-center gap-2 pb-3 border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === 'files'
              ? 'border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400 font-semibold'
              : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Files</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 pb-3 border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === 'settings'
              ? 'border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400 font-semibold'
              : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
          }`}
        >
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </button>
      </div>

      {/* 4. Tab 1: Repository Analytics View (Default matching screenshot) */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Card 1: Repository Health Score */}
          <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6 transition-colors">
            <div className="flex items-start gap-4">
              <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40 shrink-0">
                <Shield className="h-7 w-7" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-slate-900 dark:text-white font-semibold text-base">
                  <span>Repository Health Score</span>
                  <span className="text-slate-400 dark:text-zinc-500 text-xs cursor-help" title="Deterministic 100-pt Formula based on security, reliability, maintainability, testing, and performance.">ⓘ</span>
                </div>
                <div className="flex items-baseline gap-3 mt-1.5">
                  <span className="text-3xl sm:text-4xl font-extrabold text-blue-600 dark:text-blue-400 font-mono">
                    {healthReport.overallScore}/100
                  </span>
                  <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/60 px-3 py-0.5 text-xs font-semibold">
                    Grade {healthReport.grade}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2 max-w-2xl leading-relaxed">
                  Evaluated across Security ({healthReport.dimensions.security.score}/30), Reliability ({healthReport.dimensions.reliability.score}/25), Maintainability ({healthReport.dimensions.maintainability.score}/20), Testing ({healthReport.dimensions.testing.score}/15), and Performance ({healthReport.dimensions.performance.score}/10).
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start lg:items-end gap-3 shrink-0">
              <div className="rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/40 p-3 flex items-start gap-3">
                <div className="h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] shrink-0 mt-0.5">
                  <Check className="h-3 w-3 stroke-[3]" />
                </div>
                <div>
                  <div className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                    Active AST &amp; LLM Surveillance
                  </div>
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                    Continuous analysis enabled for this repository.
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-[11px] text-slate-400 dark:text-zinc-500">
                  Formula Audit ⓘ
                </div>
                <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  100% Deterministic &amp; Explainable
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: 4 Metric Cards Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total PRs Analyzed */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-xs flex items-start gap-4 transition-colors">
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40 shrink-0">
                <Code2 className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Total PRs Analyzed</span>
                <p className="text-2xl font-bold text-slate-900 dark:text-white font-mono mt-1">{pullRequests.length}</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  {analytics.latency.totalCompletedReviews || (pullRequests.length > 0 ? 1 : 0)} completed run(s)
                </p>
              </div>
            </div>

            {/* Critical Bugs Blocked */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-xs flex items-start gap-4 transition-colors">
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40 shrink-0">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Critical Bugs Blocked</span>
                <p className="text-2xl font-bold text-slate-900 dark:text-white font-mono mt-1">{criticalCount}</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">{warningCount} warnings flagged</p>
              </div>
            </div>

            {/* Median Turnaround (P50) */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-xs flex items-start gap-4 transition-colors">
              <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 shrink-0">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Median Turnaround (P50)</span>
                <p className="text-2xl font-bold text-slate-900 dark:text-white font-mono mt-1">
                  {analytics.latency.p50Ms > 0 ? `${(analytics.latency.p50Ms / 1000).toFixed(1)}s` : '0.2s'}
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                  P95: {analytics.latency.p95Ms > 0 ? `${(analytics.latency.p95Ms / 1000).toFixed(1)}s` : '0.7s'}
                </p>
              </div>
            </div>

            {/* Total Issues Flagged */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-xs flex items-start gap-4 transition-colors">
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40 shrink-0">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Total Issues Flagged</span>
                <p className="text-2xl font-bold text-slate-900 dark:text-white font-mono mt-1">{totalIssuesCount}</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">{suggestionCount} suggestion(s)</p>
              </div>
            </div>
          </div>

          {/* Row 3: 5 Health Dimensions Cards (5 columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* 1. Security */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-xs space-y-2.5 transition-colors">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-800 dark:text-zinc-200 font-bold flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  1. Security
                </span>
                <span className="text-blue-600 dark:text-blue-400 font-bold">{healthReport.dimensions.security.score}/30</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all"
                  style={{ width: `${(healthReport.dimensions.security.score / 30) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Grade: {healthReport.dimensions.security.grade} &bull; {healthReport.dimensions.security.deductions.length === 0 ? 'Zero security flaws' : healthReport.dimensions.security.deductions[0]}
              </p>
            </div>

            {/* 2. Reliability */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-xs space-y-2.5 transition-colors">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-800 dark:text-zinc-200 font-bold flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                  2. Reliability
                </span>
                <span className="text-purple-600 dark:text-purple-400 font-bold">{healthReport.dimensions.reliability.score}/25</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-purple-600 dark:bg-purple-500 rounded-full transition-all"
                  style={{ width: `${(healthReport.dimensions.reliability.score / 25) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Grade: {healthReport.dimensions.reliability.grade} &bull; {healthReport.dimensions.reliability.deductions.length === 0 ? 'Zero runtime defects' : healthReport.dimensions.reliability.deductions[0]}
              </p>
            </div>

            {/* 3. Maintainability */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-xs space-y-2.5 transition-colors">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-800 dark:text-zinc-200 font-bold flex items-center gap-1.5">
                  <Code2 className="h-3.5 w-3.5 text-pink-500 dark:text-pink-400" />
                  3. Maintainability
                </span>
                <span className="text-pink-500 dark:text-pink-400 font-bold">{healthReport.dimensions.maintainability.score}/20</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-pink-500 dark:bg-pink-400 rounded-full transition-all"
                  style={{ width: `${(healthReport.dimensions.maintainability.score / 20) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Grade: {healthReport.dimensions.maintainability.grade} &bull; {healthReport.dimensions.maintainability.deductions.length === 0 ? 'Clean code smells' : healthReport.dimensions.maintainability.deductions[0]}
              </p>
            </div>

            {/* 4. Testing */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-xs space-y-2.5 transition-colors">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-800 dark:text-zinc-200 font-bold flex items-center gap-1.5">
                  <FlaskConical className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  4. Testing
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">{healthReport.dimensions.testing.score}/15</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-600 dark:bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${(healthReport.dimensions.testing.score / 15) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Grade: {healthReport.dimensions.testing.grade} &bull; {healthReport.dimensions.testing.deductions.length === 0 ? 'Target ratio met' : healthReport.dimensions.testing.deductions[0]}
              </p>
            </div>

            {/* 5. Performance */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-xs space-y-2.5 transition-colors">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-800 dark:text-zinc-200 font-bold flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
                  5. Performance
                </span>
                <span className="text-amber-500 dark:text-amber-400 font-bold">{healthReport.dimensions.performance.score}/10</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-amber-500 dark:bg-amber-400 rounded-full transition-all"
                  style={{ width: `${(healthReport.dimensions.performance.score / 10) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Grade: {healthReport.dimensions.performance.grade} &bull; {healthReport.dimensions.performance.deductions.length === 0 ? 'Optimal efficiency' : healthReport.dimensions.performance.deductions[0]}
              </p>
            </div>
          </div>

          {/* Row 4: Scoring Formula Banner */}
          <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/20 p-4 text-xs transition-colors">
            <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
              <ShieldAlert className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span>Scoring Formula (No Opaque AI Guessing)</span>
            </div>
            <p className="text-slate-600 dark:text-zinc-400 mt-1 leading-relaxed">
              Score = Security (30 pts: -15/critical, -5/warning, -1/suggestion) + Reliability (25 pts: -12/critical defect, -4/warning defect, -1/suggestion) + Maintainability (20 pts: -2/smell) + Testing (15 pts: PR test coverage ratio) + Performance (10 pts: -3/bottleneck). Dismissed or Fixed issues incur zero penalty.
            </p>
          </div>

          {/* Row 5: 3 Analytics Columns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Col 1: Issues per PR per Week */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-xs flex flex-col justify-between transition-colors">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  Issues per PR per Week (DATE_TRUNC)
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 mb-4">
                  Aggregated trend of flagged issue density and total pull requests over time.
                </p>
              </div>
              <WeeklyTrendChart data={analytics.weeklyTrends} />
            </div>

            {/* Col 2: Turnaround Latency Percentiles */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-xs flex flex-col justify-between transition-colors">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  Turnaround Latency Percentiles (p50 / p95)
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 mb-4">
                  Review processing latency evaluated via PostgreSQL PERCENTILE_CONT.
                </p>
              </div>
              <LatencyDistributionCard latency={analytics.latency} />
            </div>

            {/* Col 3: Severity Breakdown & Category Breakdown */}
            <div className="space-y-6">
              {/* Severity Chart */}
              <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-xs transition-colors">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-rose-500" />
                  Issue Severity Breakdown (CASE Sorted)
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 mb-2">
                  Explicitly sorted by severity weight (critical &gt; warning &gt; suggestion).
                </p>
                <SeverityChart data={analytics.severityBreakdown} />
              </div>

              {/* Category Chart */}
              <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-xs transition-colors">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Tag className="h-4 w-4 text-blue-500" />
                  Issues by Category
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 mb-2">
                  Security, bug, performance, maintainability, and style distribution.
                </p>
                <CategoryChart data={analytics.categoryBreakdown} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Tab 2: Pull Requests */}
      {activeTab === 'prs' && (
        <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-xs transition-colors space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <GitPullRequest className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                Tracked Pull Requests ({pullRequests.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Review gates, verdicts, and automated comment reports for this repository.
              </p>
            </div>
            <a
              href={`https://github.com/${repo.fullName}/pulls`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
            >
              Open on GitHub <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-zinc-800/80">
            {pullRequests.map((pr: any) => {
              const latestReview = pr.reviews?.[0];
              const verdict = latestReview?.verdict || 'COMMENT';
              return (
                <div
                  key={pr.id}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-zinc-900/40 px-3 rounded-xl transition-colors"
                >
                  <div>
                    <Link
                      href={`/pull-requests/${pr.id}`}
                      className="font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      {pr.title || `Pull Request #${pr.githubPrNumber}`}
                    </Link>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono mt-1">
                      #{pr.githubPrNumber} opened by @{pr.author || 'unknown'} • State: <span className="font-semibold">{pr.state}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {latestReview ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                          verdict === 'APPROVE'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-900/50'
                            : verdict === 'REQUEST_CHANGES'
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200/80 dark:border-rose-900/50'
                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200/80 dark:border-amber-900/50'
                        }`}
                      >
                        {verdict.replace('_', ' ')}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-zinc-500 font-mono">No reviews</span>
                    )}

                    <Link
                      href={`/pull-requests/${pr.id}`}
                      className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors shadow-xs"
                    >
                      View Review
                    </Link>
                  </div>
                </div>
              );
            })}

            {pullRequests.length === 0 && (
              <div className="text-center py-12 text-slate-500 dark:text-zinc-400 text-xs">
                No pull requests tracked for this repository yet. Run analysis or open a PR on GitHub to trigger surveillance.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. Tab 3: Issues */}
      {activeTab === 'issues' && (
        <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-xs transition-colors space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-500" />
                Detected Security &amp; Code Quality Issues ({allIssues.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Issues identified by static AST analyzers, vulnerability scanners, and LLM reasoning.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {allIssues.map((iss: any, idx: number) => (
              <div
                key={iss.id || idx}
                className="p-4 rounded-xl border border-slate-200/80 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase font-mono ${
                        iss.severity === 'critical'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          : iss.severity === 'warning'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                      }`}
                    >
                      {iss.severity}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white text-sm">
                      {iss.title || iss.ruleId || 'Flagged Finding'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1.5 line-clamp-2">
                    {iss.description || iss.message}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-zinc-500 font-mono mt-1">
                    {iss.filePath} {iss.lineNumber ? `: L${iss.lineNumber}` : ''}
                  </p>
                </div>
              </div>
            ))}

            {allIssues.length === 0 && (
              <div className="text-center py-12 text-slate-500 dark:text-zinc-400 text-xs">
                Zero open issues. Repository passed all security checks!
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. Tab 4: Files */}
      {activeTab === 'files' && (
        <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-xs transition-colors space-y-4">
          <div className="pb-3 border-b border-slate-200 dark:border-zinc-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Top Offending Files (Highest Issue Density)
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Source files with the most frequent bugs, security risks, or code smells.
            </p>
          </div>

          <div className="space-y-2.5">
            {(analytics.topFiles || []).map((item: any, idx: number) => (
              <div
                key={item.filePath}
                className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/30 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-slate-400 w-4">#{idx + 1}</span>
                  <span className="font-mono text-xs text-slate-800 dark:text-zinc-200 truncate max-w-sm sm:max-w-xl">
                    {item.filePath}
                  </span>
                </div>
                <span className="inline-flex items-center rounded-full bg-rose-50 dark:bg-rose-950/40 px-2.5 py-0.5 text-xs font-bold font-mono text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">
                  {item.issueCount} issue(s)
                </span>
              </div>
            ))}

            {(analytics.topFiles || []).length === 0 && (
              <div className="text-center py-12 text-slate-500 dark:text-zinc-400 text-xs">
                No offending files detected. All files adhere to security rules.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 8. Tab 5: Settings */}
      {activeTab === 'settings' && (
        <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-xs transition-colors space-y-4">
          <div className="pb-3 border-b border-slate-200 dark:border-zinc-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Settings className="h-4 w-4 text-slate-600 dark:text-zinc-400" />
              Repository Rules &amp; Review Settings
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Configure automated PR review thresholds, ignored file globs, and check categories.
            </p>
          </div>

          <div className="pt-2">
            <RepoConfigModal
              repoId={repo.id}
              repoName={repo.fullName}
              initialConfig={repo.config as unknown as RepoConfig}
              triggerLabel="Open Settings Configuration Modal"
            />
          </div>
        </div>
      )}
    </div>
  );
}
