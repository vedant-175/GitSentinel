import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@ai-reviewer/db';
import {
  ArrowLeft,
  GitPullRequest,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Clock,
  Layers,
  FileCheck,
} from 'lucide-react';
import { DiffIssueCard } from '../../components/DiffIssueCard';

export const dynamic = 'force-dynamic';

export default async function PullRequestDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const prId = parseInt(params.id, 10);
  if (isNaN(prId)) return notFound();

  const pullRequest = await prisma.pullRequest.findUnique({
    where: { id: prId },
    include: {
      repository: true,
      reviews: {
        orderBy: { completedAt: 'desc' },
        include: {
          issues: {
            orderBy: [{ severity: 'asc' }, { filePath: 'asc' }, { lineNumber: 'asc' }],
          },
        },
      },
    },
  });

  if (!pullRequest) return notFound();

  const latestReview = pullRequest.reviews[0];
  const verdict = latestReview?.verdict || 'COMMENT';
  const isApproved = verdict === 'APPROVE';
  const isChangesRequested = verdict === 'REQUEST_CHANGES';

  const criticalIssues = latestReview?.issues.filter((i) => i.severity === 'critical') || [];
  const warningIssues = latestReview?.issues.filter((i) => i.severity === 'warning') || [];
  const suggestionIssues = latestReview?.issues.filter((i) => i.severity === 'suggestion') || [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back button */}
      <div>
        <Link
          href="/pull-requests"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Pull Requests
        </Link>

        {/* PR Header */}
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <span className="font-mono text-xs font-semibold text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20">
              {pullRequest.repository.fullName}
            </span>
            <span className="font-mono text-xs text-slate-400">#{pullRequest.githubPrNumber}</span>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-300">
              {pullRequest.state}
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
            {pullRequest.title || `Pull Request #${pullRequest.githubPrNumber}`}
          </h1>

          <p className="text-xs text-slate-400 font-mono mt-2">
            Authored by <span className="text-slate-200">@{pullRequest.author || 'unknown'}</span> • {pullRequest.reviews.length} review run(s) recorded
          </p>
        </div>
      </div>

      {/* Review Status Banner */}
      {latestReview ? (
        <div
          className={`rounded-2xl border p-6 ${
            isApproved
              ? 'border-emerald-500/30 bg-emerald-950/20'
              : isChangesRequested
              ? 'border-rose-500/30 bg-rose-950/20'
              : 'border-amber-500/30 bg-amber-950/20'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-2xl ${
                  isApproved
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : isChangesRequested
                    ? 'bg-rose-500/20 text-rose-400'
                    : 'bg-amber-500/20 text-amber-400'
                }`}
              >
                {isApproved ? (
                  <CheckCircle2 className="h-6 w-6" />
                ) : isChangesRequested ? (
                  <ShieldAlert className="h-6 w-6" />
                ) : (
                  <AlertTriangle className="h-6 w-6" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    {isApproved
                      ? 'AI Verdict: Approved'
                      : isChangesRequested
                      ? 'AI Verdict: Changes Requested'
                      : 'AI Verdict: Comments & Suggestions'}
                  </h2>
                  <span className="font-mono text-xs text-slate-400 bg-black/40 px-2 py-0.5 rounded border border-white/5">
                    {latestReview.commitSha.substring(0, 7)}
                  </span>
                </div>
                <p className="text-sm text-slate-300 mt-1">{latestReview.summary}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono text-slate-400 self-end sm:self-center">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-indigo-400" />
                {latestReview.latencyMs ? `${(latestReview.latencyMs / 1000).toFixed(1)}s turnaround` : 'Instant'}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 text-center text-slate-400">
          <Clock className="h-8 w-8 mx-auto mb-2 text-indigo-400 animate-spin" />
          <p className="text-sm">Review job currently pending in BullMQ worker queue...</p>
        </div>
      )}

      {/* Review History per Commit */}
      {pullRequest.reviews.length > 1 && (
        <div className="glass-panel rounded-2xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" /> Commit Review History ({pullRequest.reviews.length} runs)
          </h3>
          <div className="flex flex-wrap gap-2">
            {pullRequest.reviews.map((r, i) => (
              <span
                key={r.id}
                className={`font-mono text-xs px-2.5 py-1 rounded-lg border ${
                  i === 0
                    ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300 font-bold'
                    : 'border-white/5 bg-white/[0.02] text-slate-400'
                }`}
              >
                {r.commitSha.substring(0, 7)}: {r.verdict} ({r.issues.length} issues)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Issues List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-indigo-400" />
            Inline Review Comments ({latestReview?.issues.length || 0})
          </h2>
          <div className="flex items-center gap-2 text-xs font-mono">
            {criticalIssues.length > 0 && (
              <span className="text-rose-400 font-bold">{criticalIssues.length} Critical</span>
            )}
            {warningIssues.length > 0 && (
              <span className="text-amber-400 font-medium">{warningIssues.length} Warnings</span>
            )}
            {suggestionIssues.length > 0 && (
              <span className="text-blue-400 font-medium">{suggestionIssues.length} Suggestions</span>
            )}
          </div>
        </div>

        {latestReview?.issues && latestReview.issues.length > 0 ? (
          <div className="space-y-4">
            {latestReview.issues.map((issue) => (
              <DiffIssueCard
                key={issue.id}
                filePath={issue.filePath}
                lineNumber={issue.lineNumber}
                severity={issue.severity}
                category={issue.category}
                message={issue.message}
                suggestedFix={issue.suggestedFix}
                source={issue.source}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-12 text-center text-slate-400">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400 mb-2" />
            <p className="text-sm font-semibold text-white">No Issues Flagged</p>
            <p className="text-xs text-slate-500 mt-1">
              The inspected diff passed all deterministic static checks and LLM quality rules.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
