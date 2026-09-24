import Link from 'next/link';
import { prisma } from '@ai-reviewer/db';
import { GitPullRequest, ArrowRight, ShieldAlert, CheckCircle, Clock } from 'lucide-react';
import { SimulateButton } from '../components/SimulateButton';

export const dynamic = 'force-dynamic';

export default async function PullRequestsPage() {
  const pullRequests = await prisma.pullRequest.findMany({
    include: {
      repository: true,
      reviews: {
        orderBy: { completedAt: 'desc' },
        include: {
          issues: true,
        },
      },
    },
    orderBy: { openedAt: 'desc' },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Pull Requests
            <span className="text-xs font-mono font-normal text-slate-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
              {pullRequests.length} Total
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Browse automated AI code review history and status for each pull request.
          </p>
        </div>

        <SimulateButton />
      </div>

      {/* Pull Requests List */}
      <div className="space-y-3">
        {pullRequests.map((pr) => {
          const latestReview = pr.reviews[0];
          const verdict = latestReview?.verdict || 'PENDING';
          const isApproved = verdict === 'APPROVE';
          const isChangesRequested = verdict === 'REQUEST_CHANGES';
          const issuesCount = latestReview?.issues.length || 0;
          const criticalCount =
            latestReview?.issues.filter((i) => i.severity === 'critical').length || 0;

          return (
            <div
              key={pr.id}
              className="glass-panel rounded-2xl p-5 hover:border-indigo-500/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-xs font-semibold text-slate-300 border border-white/5">
                    {pr.repository.fullName}
                  </span>
                  <span className="font-mono text-xs text-indigo-400">#{pr.githubPrNumber}</span>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-400">
                    {pr.state}
                  </span>
                </div>

                <Link
                  href={`/pull-requests/${pr.id}`}
                  className="text-base font-semibold text-white group-hover:text-indigo-300 transition-colors block"
                >
                  {pr.title || `PR #${pr.githubPrNumber}`}
                </Link>

                <p className="text-xs text-slate-400 font-mono">
                  Opened by @{pr.author || 'unknown'} • {pr.reviews.length} review run(s)
                </p>
              </div>

              {/* Status and Action */}
              <div className="flex items-center gap-4 self-end md:self-center">
                {latestReview ? (
                  <div className="flex items-center gap-3">
                    {criticalCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-rose-400 bg-rose-500/10 px-2 py-1 rounded-md border border-rose-500/20 font-mono">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        {criticalCount} critical
                      </span>
                    )}

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
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                    <Clock className="h-3 w-3 animate-spin" /> In Queue
                  </span>
                )}

                <Link
                  href={`/pull-requests/${pr.id}`}
                  className="flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-indigo-400 hover:bg-white/10 hover:text-white transition-colors"
                >
                  Inspect
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          );
        })}

        {pullRequests.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-slate-500">
            <GitPullRequest className="mx-auto h-8 w-8 text-slate-600 mb-2" />
            <p className="text-sm">No pull requests tracked yet.</p>
            <p className="text-xs text-slate-600 mt-1">
              Trigger a webhook event or use &quot;Simulate PR Review&quot; to populate.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
