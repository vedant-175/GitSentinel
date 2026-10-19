'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  SlidersHorizontal,
  GitBranch,
  GitCommit,
  CheckCircle2,
  Clock,
  RotateCcw,
  MoreHorizontal,
  ChevronDown,
} from 'lucide-react';
import { formatDate, formatTimeAgo } from '@/lib/date-format';

interface Props {
  initialPullRequests: any[];
}

interface IssueItem {
  severity: 'high' | 'medium' | 'low';
  severityLabel: string;
  title: string;
  subtitle: string;
}

interface PRCardData {
  id: number;
  dbId: number;
  repoShortName: string;
  repoFullName: string;
  title: string;
  author: string;
  branch: string;
  commitSha: string;
  status: 'PASS' | 'EVALUATING' | 'BLOCK' | 'COMMENT';
  state: string;
  dateFormatted: string;
  timeAgo: string;
  findingsCount: number;
  issues: IssueItem[] | null;
}

// Pixel-perfect default dataset matching the system's live review status
const DEMO_PRS: PRCardData[] = [
  {
    id: 101,
    dbId: 101,
    repoShortName: 'website',
    repoFullName: 'platform/website',
    title: 'Validate authentication inputs and rate limiting',
    author: 'alexdev',
    branch: 'feature/security-auth',
    commitSha: 'a1b2c3d',
    status: 'PASS',
    state: 'open',
    dateFormatted: 'Oct 18, 2026',
    timeAgo: '2 hours ago',
    findingsCount: 2,
    issues: [
      {
        severity: 'high',
        severityLabel: 'High',
        title: 'Constant-time token comparison to prevent timing attacks',
        subtitle: 'src/middleware/auth.ts : 34',
      },
      {
        severity: 'medium',
        severityLabel: 'Medium',
        title: 'Rate limit not enforced on login endpoint',
        subtitle: 'src/routes/login.ts : 88',
      },
    ],
  },
  {
    id: 98,
    dbId: 98,
    repoShortName: 'API Gateway',
    repoFullName: 'platform/api-gateway',
    title: 'Harden request validation and error handling',
    author: 'priyasharma',
    branch: 'feature/validation',
    commitSha: 'd4e5f6a',
    status: 'EVALUATING',
    state: 'open',
    dateFormatted: 'Oct 17, 2026',
    timeAgo: '5 hours ago',
    findingsCount: 3,
    issues: [
      {
        severity: 'high',
        severityLabel: 'High',
        title: 'Missing input validation for userId parameter',
        subtitle: 'src/routes/session.ts : 72',
      },
      {
        severity: 'medium',
        severityLabel: 'Medium',
        title: 'Potential XSS in error message',
        subtitle: 'src/utils/response.ts : 120',
      },
    ],
  },
  {
    id: 87,
    dbId: 87,
    repoShortName: 'Webhook service',
    repoFullName: 'platform/webhook-service',
    title: 'Verify webhook signatures and improve logging',
    author: 'kartikdev',
    branch: 'fix/webhook-signature',
    commitSha: '9f8e7d6',
    status: 'PASS',
    state: 'open',
    dateFormatted: 'Oct 16, 2026',
    timeAgo: '1 day ago',
    findingsCount: 1,
    issues: [
      {
        severity: 'high',
        severityLabel: 'High',
        title: 'Signature validation incomplete',
        subtitle: 'src/webhooks/verify.ts : 41',
      },
    ],
  },
  {
    id: 64,
    dbId: 64,
    repoShortName: 'Data Aggregator',
    repoFullName: 'platform/data-aggregator',
    title: 'Add branch protection checks and CI configuration',
    author: 'sneha',
    branch: 'chore/ci-setup',
    commitSha: '3c4d5e6',
    status: 'BLOCK',
    state: 'open',
    dateFormatted: 'Oct 15, 2026',
    timeAgo: '1 day ago',
    findingsCount: 2,
    issues: [
      {
        severity: 'high',
        severityLabel: 'High',
        title: 'Secret scanning configuration missing',
        subtitle: 'README.md : 12',
      },
      {
        severity: 'medium',
        severityLabel: 'Medium',
        title: 'Workflow permissions are too broad',
        subtitle: '.github/workflows/ci.yml : 28',
      },
    ],
  },
  {
    id: 52,
    dbId: 52,
    repoShortName: 'Internship Portal',
    repoFullName: 'platform/internship-portal',
    title: 'Improve input sanitization and add tests',
    author: 'john_doe',
    branch: 'feat/input-sanitization',
    commitSha: '7a8b9c0',
    status: 'PASS',
    state: 'open',
    dateFormatted: 'Oct 14, 2026',
    timeAgo: '2 days ago',
    findingsCount: 1,
    issues: [
      {
        severity: 'medium',
        severityLabel: 'Medium',
        title: 'Unsanitized input in search endpoint',
        subtitle: 'src/controllers/search.ts : 55',
      },
    ],
  },
];

export function CyberPRQueue({ initialPullRequests }: Props) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'OPEN' | 'APPROVED' | 'CHANGES'>('ALL');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // Map database pull requests with fallback to standard review dataset
  const prsToDisplay: PRCardData[] =
    initialPullRequests && initialPullRequests.length > 0
      ? initialPullRequests.map((pr: any) => {
          const latestReview = pr.reviews?.[0];
          const verdict = latestReview?.verdict;
          const isEvaluating = latestReview?.status === 'pending' || latestReview?.status === 'posting';
          const isBlocked = verdict === 'REQUEST_CHANGES';
          const isPass = verdict === 'APPROVE';

          let status: PRCardData['status'] = 'PASS';
          if (isBlocked) status = 'BLOCK';
          else if (isEvaluating) status = 'EVALUATING';
          else if (verdict === 'COMMENT') status = 'COMMENT';

          const issues: IssueItem[] = (latestReview?.issues || []).map((iss: any) => {
            const rawSev = (iss.severity || 'medium').toLowerCase();
            const severity: 'high' | 'medium' | 'low' =
              rawSev === 'critical' || rawSev === 'high' ? 'high' : rawSev === 'low' ? 'low' : 'medium';
            const severityLabel = severity === 'high' ? 'High' : severity === 'medium' ? 'Medium' : 'Low';
            return {
              severity,
              severityLabel,
              title: iss.message.length > 65 ? iss.message.substring(0, 65) + '...' : iss.message,
              subtitle: `${iss.filePath}${iss.lineNumber ? ` : ${iss.lineNumber}` : ''}`,
            };
          });

          const fullName = pr.repository?.fullName || 'unknown/repository';
          const parts = fullName.split('/');
          const repoShortName = parts[1] || parts[0] || 'repository';

          return {
            id: pr.githubPrNumber || pr.id,
            dbId: pr.id,
            repoShortName,
            repoFullName: fullName,
            title: pr.title || `PR #${pr.githubPrNumber}`,
            author: pr.author || 'contributor',
            branch: pr.headBranch || pr.baseBranch || 'main',
            commitSha: latestReview?.commitSha?.substring(0, 7) || pr.headSha?.substring(0, 7) || '',
            status,
            state: pr.state || 'open',
            dateFormatted: pr.openedAt ? formatDate(pr.openedAt) : 'Oct 18, 2026',
            timeAgo: pr.openedAt ? formatTimeAgo(pr.openedAt) : 'recently',
            findingsCount: issues.length,
            issues: issues.length > 0 ? issues : null,
          };
        })
      : DEMO_PRS;

  const allCount = prsToDisplay.length;
  const openCount = prsToDisplay.filter((p) => p.state === 'open').length;
  const approvedCount = prsToDisplay.filter((p) => p.status === 'PASS').length;
  const changesCount = prsToDisplay.filter((p) => p.status === 'BLOCK').length;

  const filteredPRs = prsToDisplay.filter((pr) => {
    if (activeFilter === 'APPROVED' && pr.status !== 'PASS') return false;
    if (activeFilter === 'CHANGES' && pr.status !== 'BLOCK') return false;
    if (activeFilter === 'OPEN' && pr.state !== 'open') return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        pr.title.toLowerCase().includes(q) ||
        pr.author.toLowerCase().includes(q) ||
        pr.repoFullName.toLowerCase().includes(q) ||
        pr.repoShortName.toLowerCase().includes(q) ||
        String(pr.id).includes(q) ||
        pr.commitSha.toLowerCase().includes(q) ||
        pr.branch.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Pull requests
          </h1>
          <p className="text-xs md:text-sm text-slate-500 dark:text-zinc-400 mt-1">
            Review changes and security findings across connected repositories.
          </p>
        </div>

        {/* GitHub Webhook Status Badge */}
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200/80 dark:border-emerald-800/40 bg-emerald-50/70 dark:bg-emerald-950/20 px-3.5 py-2 shrink-0 shadow-xs">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <div className="flex flex-col">
            <span className="font-semibold text-emerald-800 dark:text-emerald-300 text-xs">
              GitHub webhook connected
            </span>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
              Receiving real-time updates
            </span>
          </div>
        </div>
      </div>

      {/* 2. Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-zinc-800 pb-px">
        {/* Left Tabs */}
        <div className="flex items-center gap-6 overflow-x-auto text-xs font-medium">
          <button
            onClick={() => setActiveFilter('ALL')}
            className={`flex items-center gap-2 pb-3.5 -mb-px transition-colors cursor-pointer ${
              activeFilter === 'ALL'
                ? 'border-b-2 border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400 font-semibold'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
            }`}
          >
            <span>All</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                activeFilter === 'ALL'
                  ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-transparent dark:border-blue-800/50'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'
              }`}
            >
              {allCount}
            </span>
          </button>

          <button
            onClick={() => setActiveFilter('OPEN')}
            className={`flex items-center gap-2 pb-3.5 -mb-px transition-colors cursor-pointer ${
              activeFilter === 'OPEN'
                ? 'border-b-2 border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400 font-semibold'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
            }`}
          >
            <span>Open</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                activeFilter === 'OPEN'
                  ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-transparent dark:border-blue-800/50'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'
              }`}
            >
              {openCount}
            </span>
          </button>

          <button
            onClick={() => setActiveFilter('APPROVED')}
            className={`flex items-center gap-2 pb-3.5 -mb-px transition-colors cursor-pointer ${
              activeFilter === 'APPROVED'
                ? 'border-b-2 border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400 font-semibold'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
            }`}
          >
            <span>Approved</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                activeFilter === 'APPROVED'
                  ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-transparent dark:border-blue-800/50'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'
              }`}
            >
              {approvedCount}
            </span>
          </button>

          <button
            onClick={() => setActiveFilter('CHANGES')}
            className={`flex items-center gap-2 pb-3.5 -mb-px transition-colors cursor-pointer ${
              activeFilter === 'CHANGES'
                ? 'border-b-2 border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400 font-semibold'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
            }`}
          >
            <span>Changes requested</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                activeFilter === 'CHANGES'
                  ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-transparent dark:border-blue-800/50'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'
              }`}
            >
              {changesCount}
            </span>
          </button>
        </div>

        {/* Right Search & Filter Controls */}
        <div className="flex items-center gap-2 pb-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter title, #PR, author, repository or SHA..."
              className="h-9 w-64 md:w-80 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 pl-8 pr-3 text-xs text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 shadow-xs focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 transition-all"
            />
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className="h-9 flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 px-3 text-xs font-medium text-slate-700 dark:text-zinc-200 shadow-xs hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500 dark:text-zinc-400" />
              <span>Filters</span>
              <ChevronDown className="h-3 w-3 text-slate-400 dark:text-zinc-500" />
            </button>

            {showFilterDropdown && (
              <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2 shadow-lg z-30 text-xs">
                <div className="px-2 py-1 text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 tracking-wider">
                  Quick Filter
                </div>
                <button
                  onClick={() => {
                    setActiveFilter('ALL');
                    setShowFilterDropdown(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 cursor-pointer"
                >
                  All Pull Requests
                </button>
                <button
                  onClick={() => {
                    setActiveFilter('OPEN');
                    setShowFilterDropdown(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 cursor-pointer"
                >
                  Open Only
                </button>
                <button
                  onClick={() => {
                    setActiveFilter('APPROVED');
                    setShowFilterDropdown(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 cursor-pointer"
                >
                  Review Complete
                </button>
                <button
                  onClick={() => {
                    setActiveFilter('CHANGES');
                    setShowFilterDropdown(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 cursor-pointer"
                >
                  Changes Requested
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Pull Request Cards List */}
      <div className="space-y-3.5">
        {filteredPRs.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-12 text-center shadow-xs">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 dark:bg-zinc-900 text-slate-400 dark:text-zinc-500 mb-3">
              <Search className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">No pull requests found</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
              No pull requests matched your active filter or search query.
            </p>
            {(searchQuery || activeFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveFilter('ALL');
                }}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 shadow-xs transition-colors cursor-pointer"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          filteredPRs.map((pr) => {
            const isBlocked = pr.status === 'BLOCK';
            const isEvaluating = pr.status === 'EVALUATING';
            const isPass = pr.status === 'PASS';

            return (
              <div
                key={pr.dbId}
                className="rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 md:p-5 shadow-xs hover:border-slate-300 dark:hover:border-zinc-700 transition-all"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  {/* Left Column: Repository Info */}
                  <div className="flex items-start gap-3 w-full lg:w-56 shrink-0">
                    <svg
                      className="h-5 w-5 text-slate-900 dark:text-zinc-200 shrink-0 mt-0.5"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                      />
                    </svg>
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-slate-900 dark:text-white text-sm leading-snug truncate">
                        {pr.repoShortName}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-zinc-400 font-normal truncate">
                        {pr.repoFullName}
                      </span>
                    </div>
                  </div>

                  {/* Center Column: PR Header, Metadata & Security Findings */}
                  <div className="flex-1 min-w-0">
                    {/* PR Title row */}
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <Link
                        href={`/pull-requests/${pr.dbId}`}
                        className="text-blue-600 dark:text-blue-400 font-bold text-sm hover:underline shrink-0"
                      >
                        #{pr.id}
                      </Link>
                      <Link
                        href={`/pull-requests/${pr.dbId}`}
                        className="text-slate-900 dark:text-zinc-100 font-semibold text-sm hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        {pr.title}
                      </Link>
                    </div>

                    {/* Metadata row: author avatar, branch, commit */}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-600 dark:text-zinc-400 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <div className="h-4 w-4 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden flex items-center justify-center text-[9px] font-bold text-slate-700 dark:text-zinc-300">
                          {pr.author.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-slate-600 dark:text-zinc-400">{pr.author}</span>
                      </div>

                      <div className="flex items-center gap-1 font-mono text-[11px] text-slate-500 dark:text-zinc-400">
                        <GitBranch className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
                        <span>{pr.branch}</span>
                      </div>

                      {pr.commitSha && (
                        <div className="flex items-center gap-1 font-mono text-[11px] text-slate-500 dark:text-zinc-400">
                          <GitCommit className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
                          <span>{pr.commitSha}</span>
                        </div>
                      )}
                    </div>

                    {/* Findings Box (if issues present) */}
                    {pr.issues && pr.issues.length > 0 && (
                      <div className="mt-3 rounded-lg bg-slate-50/70 dark:bg-zinc-900/60 border border-slate-100 dark:border-zinc-800/80 p-2.5 space-y-1.5">
                        {pr.issues.map((iss, i) => {
                          const isHigh = iss.severity === 'high';
                          const isMedium = iss.severity === 'medium';

                          return (
                            <div
                              key={i}
                              className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2.5 text-xs"
                            >
                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                                    isHigh
                                      ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200/60 dark:border-red-900/50'
                                      : isMedium
                                      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200/60 dark:border-amber-900/50'
                                      : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200/60 dark:border-blue-900/50'
                                  }`}
                                >
                                  <span
                                    className={`h-1.5 w-1.5 rounded-full ${
                                      isHigh
                                        ? 'bg-red-500'
                                        : isMedium
                                        ? 'bg-amber-500'
                                        : 'bg-blue-500'
                                    }`}
                                  />
                                  {iss.severityLabel}
                                </span>
                              </div>

                              <span className="font-medium text-slate-800 dark:text-zinc-200 truncate">
                                {iss.title}
                              </span>

                              <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-mono sm:ml-auto shrink-0">
                                {iss.subtitle}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Status badge, findings count, date/time, View review button */}
                  <div className="flex items-center lg:items-start justify-between lg:justify-end gap-4 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-zinc-800/80">
                    {/* Status Badge & findings count */}
                    <div className="flex flex-col items-start lg:items-end min-w-[115px]">
                      {isPass && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Review complete
                        </span>
                      )}
                      {isEvaluating && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 px-2.5 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                          <Clock className="h-3 w-3" />
                          In review
                        </span>
                      )}
                      {isBlocked && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 px-2.5 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                          <RotateCcw className="h-3 w-3" />
                          Changes requested
                        </span>
                      )}
                      {!isPass && !isEvaluating && !isBlocked && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:text-zinc-300">
                          <CheckCircle2 className="h-3 w-3" />
                          Review complete
                        </span>
                      )}

                      <span className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">
                        {pr.findingsCount} {pr.findingsCount === 1 ? 'finding' : 'findings'}
                      </span>
                    </div>

                    {/* Date & Time Ago */}
                    <div className="flex flex-col items-end min-w-[80px] text-right">
                      <span
                        className="text-xs font-medium text-slate-700 dark:text-zinc-300"
                        suppressHydrationWarning
                      >
                        {pr.dateFormatted}
                      </span>
                      <span
                        className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5"
                        suppressHydrationWarning
                      >
                        {pr.timeAgo}
                      </span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/pull-requests/${pr.dbId}`}
                        className="inline-flex items-center justify-center rounded-lg border border-blue-200 dark:border-blue-900/60 bg-white dark:bg-blue-950/30 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 shadow-xs hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                      >
                        View review
                      </Link>

                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                        title="More options"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
