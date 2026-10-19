import React from 'react';
import Link from 'next/link';
import {
  FolderGit2,
  GitPullRequest,
  Shield,
  Clock,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  X,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { prisma } from '@ai-reviewer/db';
import { ReviewActivityChart } from './components/ReviewActivityChart';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const repoCount = 10;
  const prCount = 5;
  const findingsCount = 5;

  const recentPRs = [
    {
      id: 2713,
      repo: 'api-service',
      title: 'Add rate limiting middleware',
      author: 'johndoe',
      authorInitial: 'J',
      authorBg: 'bg-emerald-600',
      status: 'Review complete',
      statusVariant: 'success',
      findings: 0,
      updated: '2 hours ago',
    },
    {
      id: 2705,
      repo: 'RockPaperScissor',
      title: 'Improve game logic and input validation',
      author: 'Armaan2104',
      authorInitial: 'A',
      authorBg: 'bg-slate-800',
      status: 'Action required',
      statusVariant: 'danger',
      findings: 3,
      updated: '4 hours ago',
    },
    {
      id: 2689,
      repo: 'web-dashboard',
      title: 'Refactor authentication flow',
      author: 'priyasharma',
      authorInitial: 'P',
      authorBg: 'bg-purple-600',
      status: 'Review complete',
      statusVariant: 'success',
      findings: 0,
      updated: '1 day ago',
    },
    {
      id: 2681,
      repo: 'ml-analyzer',
      title: 'Update model prompts and evaluation',
      author: 'kartikdev',
      authorInitial: 'K',
      authorBg: 'bg-amber-600',
      status: 'In progress',
      statusVariant: 'info',
      findings: 2,
      updated: '1 day ago',
    },
    {
      id: 2678,
      repo: 'infra-setup',
      title: 'Add monitoring and alerting',
      author: 'sneha',
      authorInitial: 'S',
      authorBg: 'bg-blue-600',
      status: 'Review complete',
      statusVariant: 'success',
      findings: 0,
      updated: '2 days ago',
    },
  ];

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-12 animate-fade-in">
      {/* 1. Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Overview</h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Security reviews across your repositories
          </p>
        </div>

        <div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New review</span>
            <ChevronDown className="h-3 w-3 ml-0.5 opacity-80" />
          </button>
        </div>
      </div>

      {/* 2. Success Integration Banner */}
      <div className="rounded-xl border border-emerald-200/90 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/20 p-3.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-emerald-300">GitHub integration connected</div>
            <div className="text-xs text-slate-600 dark:text-emerald-400/80 mt-0.5">
              Your repositories are synchronized and monitored for new pull requests.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/repositories"
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 transition-colors"
          >
            <span>Manage integration</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 3. Four Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Repositories */}
        <Link
          href="/repositories"
          className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-xs hover:border-slate-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
            <div className="flex items-center gap-2">
              <FolderGit2 className="h-4 w-4 text-slate-500 dark:text-zinc-400" />
              <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">Repositories</span>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400 dark:text-zinc-500 group-hover:text-slate-600 dark:group-hover:text-zinc-300 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{repoCount}</div>
            <div className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Connected to GitHub</div>
          </div>
        </Link>

        {/* Card 2: Open pull requests */}
        <Link
          href="/pull-requests"
          className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-xs hover:border-slate-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
            <div className="flex items-center gap-2">
              <GitPullRequest className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">Open pull requests</span>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400 dark:text-zinc-500 group-hover:text-slate-600 dark:group-hover:text-zinc-300 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{prCount}</div>
            <div className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Across 4 repositories</div>
          </div>
        </Link>

        {/* Card 3: Findings to review */}
        <Link
          href="/pull-requests"
          className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-xs hover:border-slate-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-rose-500" />
              <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">Findings to review</span>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400 dark:text-zinc-500 group-hover:text-slate-600 dark:group-hover:text-zinc-300 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{findingsCount}</div>
            <div className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">2 high · 3 medium</div>
          </div>
        </Link>

        {/* Card 4: Median review time */}
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-xs flex flex-col justify-between group">
          <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-500 dark:text-zinc-400" />
              <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">Median review time</span>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400 dark:text-zinc-500" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">24s</div>
            <div className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Last 7 days</div>
          </div>
        </div>
      </div>

      {/* 4. Middle Row: Review activity & Findings by severity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Review activity chart */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Review activity</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Pull requests reviewed over the last 7 days
              </p>
            </div>

            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-zinc-200 shadow-xs hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <span>Last 7 days</span>
              <ChevronDown className="h-3 w-3 text-slate-400 dark:text-zinc-500" />
            </button>
          </div>

          <ReviewActivityChart />
        </div>

        {/* Findings by severity breakdown */}
        <div className="lg:col-span-1 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Findings by severity</h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Total findings across all repositories
            </p>
          </div>

          <div className="space-y-4 my-auto py-2">
            {/* Critical */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 w-20 shrink-0">
                <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">Critical</span>
              </div>
              <span className="text-xs font-bold text-slate-900 dark:text-white w-4 text-right">0</span>
              <div className="h-2 flex-1 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden" />
            </div>

            {/* High */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 w-20 shrink-0">
                <span className="h-2 w-2 rounded-full bg-orange-500 shrink-0" />
                <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">High</span>
              </div>
              <span className="text-xs font-bold text-slate-900 dark:text-white w-4 text-right">2</span>
              <div className="h-2 flex-1 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div className="h-full bg-orange-500 rounded-full" style={{ width: '38%' }} />
              </div>
            </div>

            {/* Medium */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 w-20 shrink-0">
                <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">Medium</span>
              </div>
              <span className="text-xs font-bold text-slate-900 dark:text-white w-4 text-right">3</span>
              <div className="h-2 flex-1 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full" style={{ width: '60%' }} />
              </div>
            </div>

            {/* Low */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 w-20 shrink-0">
                <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">Low</span>
              </div>
              <span className="text-xs font-bold text-slate-900 dark:text-white w-4 text-right">0</span>
              <div className="h-2 flex-1 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden" />
            </div>
          </div>

          <div className="text-[11px] text-slate-400 dark:text-zinc-500 text-center pt-2 border-t border-slate-100 dark:border-zinc-800">
            Automated SAST & AI Security Gate
          </div>
        </div>
      </div>

      {/* 5. Bottom Card: Recent pull requests table */}
      <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Recent pull requests</h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Latest pull requests and their security review status
            </p>
          </div>

          <Link
            href="/pull-requests"
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 transition-colors"
          >
            <span>View all pull requests</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/60 dark:bg-zinc-900/50 text-slate-500 dark:text-zinc-400 font-semibold border-b border-slate-100 dark:border-zinc-800">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Repository</th>
                <th className="py-2.5 px-4 font-semibold">PR</th>
                <th className="py-2.5 px-4 font-semibold">Title</th>
                <th className="py-2.5 px-4 font-semibold">Author</th>
                <th className="py-2.5 px-4 font-semibold">Status</th>
                <th className="py-2.5 px-4 font-semibold">Findings</th>
                <th className="py-2.5 px-4 font-semibold">Updated</th>
                <th className="py-2.5 px-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80 text-slate-700 dark:text-zinc-300">
              {recentPRs.map((pr) => (
                <tr
                  key={pr.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 transition-colors group cursor-pointer"
                >
                  {/* Repository */}
                  <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-slate-700 dark:text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                        />
                      </svg>
                      <span className="font-semibold text-slate-800 dark:text-zinc-200">{pr.repo}</span>
                    </div>
                  </td>

                  {/* PR Number */}
                  <td className="py-3 px-4 font-mono font-medium text-blue-600 dark:text-blue-400">
                    #{pr.id}
                  </td>

                  {/* Title */}
                  <td className="py-3 px-4 text-slate-800 dark:text-zinc-200 max-w-xs truncate">
                    {pr.title}
                  </td>

                  {/* Author */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <div
                        className={`h-5 w-5 rounded-full ${pr.authorBg} text-white text-[10px] flex items-center justify-center font-bold`}
                      >
                        {pr.authorInitial}
                      </div>
                      <span className="text-slate-700 dark:text-zinc-300">{pr.author}</span>
                    </div>
                  </td>

                  {/* Status Pill */}
                  <td className="py-3 px-4">
                    {pr.statusVariant === 'success' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <span>Review complete</span>
                      </span>
                    )}
                    {pr.statusVariant === 'danger' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        <span>Action required</span>
                      </span>
                    )}
                    {pr.statusVariant === 'info' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        <span>In progress</span>
                      </span>
                    )}
                  </td>

                  {/* Findings */}
                  <td className="py-3 px-4">
                    <span
                      className={`font-semibold ${
                        pr.findings > 0 ? (pr.statusVariant === 'danger' ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-amber-600 dark:text-amber-400 font-bold') : 'text-slate-500 dark:text-zinc-500'
                      }`}
                    >
                      {pr.findings}
                    </span>
                  </td>

                  {/* Updated */}
                  <td className="py-3 px-4 text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                    {pr.updated}
                  </td>

                  {/* Chevron action */}
                  <td className="py-3 px-3 text-right">
                    <ChevronRight className="h-4 w-4 text-slate-300 dark:text-zinc-600 group-hover:text-slate-600 dark:group-hover:text-zinc-300 group-hover:translate-x-0.5 transition-all inline-block" />
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
