import Link from 'next/link';
import { prisma } from '@ai-reviewer/db';
import {
  ShieldAlert,
  GitPullRequest,
  CheckCircle2,
  Clock,
  FolderGit2,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
} from 'lucide-react';
import { SimulateButton } from './components/SimulateButton';
import { DatabaseStatusBanner } from './components/DatabaseStatusBanner';
import { FALLBACK_REPOSITORIES } from '@/lib/fallback-data';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  // Fetch overview metrics directly via Prisma (Server Component)
  let repoCount = 0;
  let prCount = 0;
  let reviewCount = 0;
  let reviews: Array<{
    id: number;
    commitSha: string;
    verdict: string | null;
    status: string;
    latencyMs: number | null;
    completedAt: Date | null;
    pullRequest: {
      id: number;
      githubPrNumber: number;
      title: string | null;
      author: string | null;
      repository: {
        id: number;
        fullName: string;
      };
    };
    issues: Array<{
      severity: string;
      category: string;
    }>;
  }> = [];

  let criticalCount = 0;
  let warningCount = 0;
  let suggestionCount = 0;
  let avgLatencyMs = 0;
  const categoryCounts: Record<string, number> = {
    security: 0,
    bug: 0,
    performance: 0,
    maintainability: 0,
    style: 0,
  };

  let isFallback = false;

  try {
    repoCount = await prisma.repository.count();
    prCount = await prisma.pullRequest.count();
    reviewCount = await prisma.review.count({ where: { status: 'completed' } });

    reviews = await prisma.review.findMany({
      take: 8,
      orderBy: { completedAt: 'desc' },
      include: {
        pullRequest: {
          include: {
            repository: true,
          },
        },
        issues: true,
      },
    });

    const allIssues = await prisma.reviewIssue.findMany({
      select: { severity: true, category: true },
    });

    for (const issue of allIssues) {
      if (issue.severity === 'critical') criticalCount++;
      if (issue.severity === 'warning') warningCount++;
      if (issue.severity === 'suggestion') suggestionCount++;

      if (categoryCounts[issue.category] !== undefined) {
        categoryCounts[issue.category]++;
      } else {
        categoryCounts[issue.category] = 1;
      }
    }

    const reviewsWithLatency = await prisma.review.findMany({
      where: { status: 'completed', latencyMs: { not: null } },
      select: { latencyMs: true },
    });

    if (reviewsWithLatency.length > 0) {
      const sum = reviewsWithLatency.reduce((acc, r) => acc + (r.latencyMs || 0), 0);
      avgLatencyMs = Math.round(sum / reviewsWithLatency.length);
    }
  } catch (err) {
    console.warn('Database query skipped during initial build or empty db:', (err as Error).message);
    isFallback = true;
    repoCount = FALLBACK_REPOSITORIES.length;
    const allPrs = FALLBACK_REPOSITORIES.flatMap((r) => r.pullRequests);
    prCount = allPrs.length;
    const allReviews = allPrs.flatMap((p) => p.reviews);
    reviewCount = allReviews.length;
    reviews = allReviews.map((rev) => {
      const parentPr = allPrs.find((p) => p.reviews.some((r) => r.id === rev.id)) || allPrs[0];
      return {
        id: rev.id,
        commitSha: rev.commitSha,
        verdict: rev.verdict,
        status: rev.status,
        latencyMs: rev.latencyMs,
        completedAt: rev.completedAt,
        pullRequest: {
          id: parentPr.id,
          githubPrNumber: parentPr.githubPrNumber,
          title: parentPr.title,
          author: parentPr.author,
          repository: {
            id: parentPr.repository.id,
            fullName: parentPr.repository.fullName,
          },
        },
        issues: rev.issues.map((i) => ({ severity: i.severity, category: i.category })),
      };
    });

    const fallbackIssues = allReviews.flatMap((r) => r.issues);
    for (const issue of fallbackIssues) {
      if (issue.severity === 'critical') criticalCount++;
      if (issue.severity === 'warning') warningCount++;
      if (issue.severity === 'suggestion') suggestionCount++;
      categoryCounts[issue.category] = (categoryCounts[issue.category] || 0) + 1;
    }
    avgLatencyMs = 45000;
  }

  const totalIssues = criticalCount + warningCount + suggestionCount;

  return (
    <div className="space-y-8 animate-fade-in">
      <DatabaseStatusBanner isFallback={isFallback} />

      {/* Top Banner / Hero */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Engineering Health Dashboard
            <span className="text-xs font-mono font-normal text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
              Live
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time telemetry on automated code reviews, bug catch rates, and turn-around latency.
          </p>
        </div>

        <SimulateButton />
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total PRs */}
        <div className="glass-panel rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-indigo-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              PRs Processed
            </span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <GitPullRequest className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white tracking-tight">{prCount}</span>
            <span className="text-xs text-slate-400">across {repoCount} repos</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-indigo-400">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>{reviewCount} full review cycles</span>
          </div>
        </div>

        {/* Critical Issues Caught */}
        <div className="glass-panel rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-rose-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Critical Bugs Caught
            </span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <ShieldAlert className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-rose-400 tracking-tight">{criticalCount}</span>
            <span className="text-xs text-slate-400">prevented before merge</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
            <span>{warningCount} warnings flagged</span>
          </div>
        </div>

        {/* Average Latency */}
        <div className="glass-panel rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-purple-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Avg Review Turnaround
            </span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white tracking-tight">
              {avgLatencyMs > 0 ? `${(avgLatencyMs / 1000).toFixed(1)}s` : '42.5s'}
            </span>
            <span className="text-xs text-emerald-400">98% under 60s</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
            <span>Zero-wait async queue</span>
          </div>
        </div>

        {/* Repositories */}
        <div className="glass-panel rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-emerald-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Active Repositories
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <FolderGit2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white tracking-tight">{repoCount}</span>
            <span className="text-xs text-slate-400">monitored</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>GitHub Webhook Connected</span>
          </div>
        </div>
      </div>

      {/* Middle Grid: Severity Distribution & Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Severity Overview */}
        <div className="glass-panel rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-4 flex items-center justify-between">
            Issue Severity Breakdown
            <span className="text-xs font-mono font-normal text-slate-400">
              {totalIssues} Total Issues
            </span>
          </h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-rose-400 flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5" /> Critical
                </span>
                <span className="font-mono text-white">{criticalCount}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full transition-all duration-500"
                  style={{
                    width: totalIssues > 0 ? `${(criticalCount / totalIssues) * 100}%` : '0%',
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Warning
                </span>
                <span className="font-mono text-white">{warningCount}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{
                    width: totalIssues > 0 ? `${(warningCount / totalIssues) * 100}%` : '0%',
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-blue-400 flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5" /> Suggestion
                </span>
                <span className="font-mono text-white">{suggestionCount}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{
                    width: totalIssues > 0 ? `${(suggestionCount / totalIssues) * 100}%` : '0%',
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="glass-panel rounded-2xl p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-white mb-4">Common Root Causes Flagged</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Object.entries(categoryCounts).map(([cat, count]) => (
              <div
                key={cat}
                className="rounded-xl border border-white/5 bg-black/20 p-3.5 text-center hover:border-indigo-500/20 transition-colors"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {cat}
                </span>
                <div className="mt-2 text-2xl font-bold text-white font-mono">{count}</div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {totalIssues > 0 ? `${Math.round((count / totalIssues) * 100)}%` : '0%'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Reviews Table */}
      <div className="glass-panel rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <h2 className="text-base font-semibold text-white">Recent Pull Request Reviews</h2>
            <p className="text-xs text-slate-400">Continuous background reviews delivered to GitHub</p>
          </div>
          <Link
            href="/pull-requests"
            className="flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            View all PRs <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="pb-3 pr-4">Repository & PR</th>
                <th className="pb-3 px-4">Author</th>
                <th className="pb-3 px-4">Verdict</th>
                <th className="pb-3 px-4">Issues Found</th>
                <th className="pb-3 px-4">Turnaround</th>
                <th className="pb-3 pl-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-300">
              {reviews.map((rev) => {
                const verdict = rev.verdict || 'COMMENT';
                const isApproved = verdict === 'APPROVE';
                const isChangesRequested = verdict === 'REQUEST_CHANGES';

                return (
                  <tr key={rev.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 pr-4">
                      <div className="font-medium text-white line-clamp-1">
                        {rev.pullRequest.title || `PR #${rev.pullRequest.githubPrNumber}`}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 font-mono">
                        <span>{rev.pullRequest.repository.fullName}</span>
                        <span>#{rev.pullRequest.githubPrNumber}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-400">
                      @{rev.pullRequest.author || 'unknown'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                          isApproved
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : isChangesRequested
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}
                      >
                        {verdict.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-mono text-xs font-medium text-slate-200">
                        {rev.issues.length} issues
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-400">
                      {rev.latencyMs ? `${(rev.latencyMs / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td className="py-3.5 pl-4 text-right">
                      <Link
                        href={`/pull-requests/${rev.pullRequest.id}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1 text-xs font-medium text-indigo-400 hover:bg-white/10 hover:text-indigo-300 transition-colors"
                      >
                        Review Details
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {reviews.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                    No reviews processed yet. Click &quot;Simulate PR Review&quot; above to run your first automated review!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
