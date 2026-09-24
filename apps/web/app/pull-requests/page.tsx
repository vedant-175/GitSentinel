import Link from 'next/link';
import { prisma } from '@ai-reviewer/db';
import { GitPullRequest, ArrowRight, ShieldAlert, CheckCircle, Clock } from 'lucide-react';
import { SimulateButton } from '../components/SimulateButton';
import { PullRequestFilters } from '../components/PullRequestFilters';

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

      {/* Pull Requests Filtered View */}
      <PullRequestFilters initialPullRequests={pullRequests} />
    </div>
  );
}
