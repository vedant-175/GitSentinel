import Link from 'next/link';
import { RepoConfig } from '@ai-reviewer/shared';
import { FolderGit2, GitPullRequest, ArrowRight, Shield, Layers } from 'lucide-react';
import { RepoConfigModal } from '../components/RepoConfigModal';
import { DatabaseStatusBanner } from '../components/DatabaseStatusBanner';
import { getRepositories } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function RepositoriesPage() {
  const { data: repositories, isFallback } = await getRepositories();

  return (
    <div className="space-y-6 animate-fade-in">
      <DatabaseStatusBanner isFallback={isFallback} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Tracked Repositories
            <span className="text-xs font-mono font-normal text-slate-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
              {repositories.length} Active
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure rules, ignored file paths, and severity alert thresholds per repository.
          </p>
        </div>
      </div>

      {/* Repositories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {repositories.map((repo) => {
          const config = (repo.config as unknown as RepoConfig) || {};
          const totalPrs = repo.pullRequests.length;
          const allIssuesCount = repo.pullRequests.reduce(
            (sum, pr) => sum + pr.reviews.reduce((rSum, r) => rSum + r.issues.length, 0),
            0
          );

          return (
            <div
              key={repo.id}
              className="glass-panel rounded-2xl p-6 flex flex-col justify-between hover:border-indigo-500/30 transition-all group"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      <FolderGit2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white group-hover:text-indigo-300 transition-colors">
                        {repo.fullName}
                      </h3>
                      <p className="text-xs text-slate-400 font-mono">
                        Branch: {repo.defaultBranch || 'main'}
                      </p>
                    </div>
                  </div>

                  <RepoConfigModal
                    repoId={repo.id}
                    repoName={repo.fullName}
                    initialConfig={config}
                  />
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-white/5">
                  <div className="rounded-xl bg-white/[0.02] p-3 border border-white/5">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <GitPullRequest className="h-3 w-3" /> PRs Monitored
                    </span>
                    <p className="mt-1 text-lg font-bold text-white font-mono">{totalPrs}</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.02] p-3 border border-white/5">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Shield className="h-3 w-3" /> Issues Flagged
                    </span>
                    <p className="mt-1 text-lg font-bold text-rose-400 font-mono">{allIssuesCount}</p>
                  </div>
                </div>

                {/* Config Badges */}
                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-mono text-slate-300 border border-white/5">
                    Threshold: {config.severity_threshold || 'suggestion'}
                  </span>
                  {config.ignored_globs && config.ignored_globs.length > 0 && (
                    <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-mono text-slate-300 border border-white/5">
                      {config.ignored_globs.length} ignored globs
                    </span>
                  )}
                </div>
              </div>

              {/* Action Link */}
              <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                <Link
                  href={`/repositories/${repo.id}`}
                  className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <Layers className="h-3.5 w-3.5" />
                  View Analytics & Trends
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          );
        })}

        {repositories.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-white/10 p-12 text-center text-slate-500">
            <FolderGit2 className="mx-auto h-8 w-8 text-slate-600 mb-2" />
            <p className="text-sm">No repositories tracked yet.</p>
            <p className="text-xs text-slate-600 mt-1">
              Install the GitHub App or run database seeding to see tracked repos.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
