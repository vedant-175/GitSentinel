'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  RotateCw,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  GitPullRequest,
  Clock,
} from 'lucide-react';
import { formatDateTime } from '@/lib/date-format';

export interface FailedReviewItem {
  id: number;
  commitSha: string;
  errorMessage: string;
  errorStack: string | null;
  failedAt: string | Date;
  resolvedAt: string | Date | null;
  pullRequestId: number | null;
  pullRequest?: {
    id: number;
    githubPrNumber: number;
    title: string | null;
    repository: {
      fullName: string;
    };
  } | null;
}

interface FailedReviewsListProps {
  failedReviews: FailedReviewItem[];
}

export function FailedReviewsList({ failedReviews }: FailedReviewsListProps) {
  const router = useRouter();
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ id: number; message: string; isError?: boolean } | null>(
    null
  );

  const handleRetry = async (id: number) => {
    setRetryingId(id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/failed-reviews/${id}/retry`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to retry review');
      }
      setFeedback({
        id,
        message: `Re-enqueued as job #${data.newJobId || id}`,
      });
      router.refresh();
    } catch (err) {
      setFeedback({
        id,
        message: (err as Error).message,
        isError: true,
      });
    } finally {
      setRetryingId(null);
    }
  };

  if (!failedReviews || failedReviews.length === 0) {
    return null;
  }

  return (
    <div className="glass-panel rounded-2xl p-6 border border-rose-500/20 bg-rose-950/10">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              Failed Reviews
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                {failedReviews.filter((r) => !r.resolvedAt).length} Active
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              PR reviews that exhausted retry attempts. Click Retry to re-enqueue.
            </p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-slate-900/50">
        {failedReviews.map((item) => {
          const isResolved = Boolean(item.resolvedAt);
          const isRetrying = retryingId === item.id;
          const isExpanded = expandedId === item.id;
          const currentFeedback = feedback?.id === item.id ? feedback : null;

          return (
            <div key={item.id} className="p-4 transition-colors hover:bg-white/[0.02]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.pullRequest ? (
                      <Link
                        href={`/pull-requests/${item.pullRequest.id}`}
                        className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5"
                      >
                        <GitPullRequest className="w-3.5 h-3.5" />
                        {item.pullRequest.repository.fullName} #{item.pullRequest.githubPrNumber}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-slate-300">
                        PR Review #{item.id}
                      </span>
                    )}

                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-white/5 text-slate-400 border border-white/10">
                      {item.commitSha.substring(0, 7)}
                    </span>

                    {isResolved ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" /> Resolved
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                        <AlertTriangle className="w-3 h-3" /> Exhausted
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-rose-300 font-mono line-clamp-1">
                    {item.errorMessage}
                  </p>

                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1" suppressHydrationWarning>
                      <Clock className="w-3 h-3" />
                      {formatDateTime(item.failedAt)}
                    </span>
                    {item.errorStack && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="text-slate-400 hover:text-white flex items-center gap-0.5 underline cursor-pointer"
                      >
                        {isExpanded ? 'Hide stack' : 'View stack'}
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-center">
                  {currentFeedback && (
                    <span
                      className={`text-xs ${
                        currentFeedback.isError ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {currentFeedback.message}
                    </span>
                  )}

                  <button
                    type="button"
                    disabled={isRetrying}
                    onClick={() => handleRetry(item.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-all cursor-pointer shadow-sm"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                    {isRetrying ? 'Retrying...' : isResolved ? 'Retry Again' : 'Retry Review'}
                  </button>
                </div>
              </div>

              {/* Collapsible Error Stack Trace */}
              {isExpanded && item.errorStack && (
                <div className="mt-3 p-3 rounded-lg bg-black/60 border border-white/5 font-mono text-[11px] text-slate-400 whitespace-pre-wrap overflow-x-auto max-h-48">
                  {item.errorStack}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
