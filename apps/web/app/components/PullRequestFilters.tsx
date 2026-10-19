'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, ShieldAlert, ArrowRight, Clock, GitPullRequest, ChevronLeft, ChevronRight } from 'lucide-react';

interface PRItem {
  id: number;
  githubPrNumber: number;
  title: string | null;
  author: string | null;
  state: string | null;
  repository: {
    fullName: string;
  };
  reviews: Array<{
    id: number;
    verdict: string | null;
    issues: Array<{ severity: string }>;
  }>;
}

interface Props {
  initialPullRequests: PRItem[];
}

export function PullRequestFilters({ initialPullRequests }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVerdict, setSelectedVerdict] = useState<string>('ALL');
  const [selectedRepo, setSelectedRepo] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Extract unique repositories
  const repoNames = Array.from(
    new Set(initialPullRequests.map((pr) => pr.repository.fullName))
  );

  const filteredPRs = initialPullRequests.filter((pr) => {
    // Search query match (title, author, or PR number)
    const matchesSearch =
      !searchQuery ||
      pr.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pr.author?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(pr.githubPrNumber).includes(searchQuery) ||
      pr.repository.fullName.toLowerCase().includes(searchQuery.toLowerCase());

    // Repository match
    const matchesRepo =
      selectedRepo === 'ALL' || pr.repository.fullName === selectedRepo;

    // Verdict match
    const latestVerdict = pr.reviews[0]?.verdict || 'PENDING';
    const matchesVerdict =
      selectedVerdict === 'ALL' || latestVerdict === selectedVerdict;

    return matchesSearch && matchesRepo && matchesVerdict;
  });

  const totalPages = Math.max(1, Math.ceil(filteredPRs.length / pageSize));
  const paginatedPRs = filteredPRs.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleFilterChange = (setter: (val: string) => void, val: string) => {
    setter(val);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Control Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleFilterChange(setSearchQuery, e.target.value)}
            placeholder="Filter by title, author (@username), repo, or PR #..."
            className="w-full rounded-xl border border-white/10 bg-slate-900/60 pl-10 pr-4 py-2 text-xs text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Verdict Filter */}
        <div className="flex items-center gap-2">
          <select
            value={selectedVerdict}
            onChange={(e) => handleFilterChange(setSelectedVerdict, e.target.value)}
            className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Verdicts</option>
            <option value="APPROVE">Approved</option>
            <option value="REQUEST_CHANGES">Changes Requested</option>
            <option value="COMMENT">Comments</option>
          </select>

          {/* Repo Filter */}
          {repoNames.length > 1 && (
            <select
              value={selectedRepo}
              onChange={(e) => handleFilterChange(setSelectedRepo, e.target.value)}
              className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none max-w-[200px] truncate"
            >
              <option value="ALL">All Repositories</option>
              {repoNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between text-xs text-slate-400 font-mono px-1">
        <span>
          Showing {paginatedPRs.length} of {filteredPRs.length} pull requests (Page {currentPage} of {totalPages})
        </span>
        {(searchQuery || selectedVerdict !== 'ALL' || selectedRepo !== 'ALL') && (
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedVerdict('ALL');
              setSelectedRepo('ALL');
              setCurrentPage(1);
            }}
            className="text-indigo-400 hover:text-indigo-300"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* PR Cards */}
      <div className="space-y-3">
        {paginatedPRs.map((pr) => {
          const latestReview = pr.reviews[0];
          const verdict = latestReview?.verdict || 'PENDING';
          const isApproved = verdict === 'APPROVE';
          const isChangesRequested = verdict === 'REQUEST_CHANGES';
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

        {filteredPRs.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-slate-500">
            <GitPullRequest className="mx-auto h-8 w-8 text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-300">No pull requests matching your filters</p>
            <p className="text-xs text-slate-500 mt-1">
              Try adjusting the search query or verdict filters.
            </p>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-white/5 text-xs font-mono">
          <span className="text-slate-400">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 bg-slate-900/60 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 bg-slate-900/60 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-colors cursor-pointer"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
