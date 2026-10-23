'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  GitPullRequest,
  FolderGit2,
  Code2,
  MessageSquareText,
  TrendingUp,
  ShieldAlert,
  FileText,
  Settings,
} from 'lucide-react';

interface SidebarProps {
  prCount?: number;
  repoCount?: number;
}

export function Sidebar({ prCount: initialPrCount, repoCount: initialRepoCount }: SidebarProps) {
  const pathname = usePathname();

  const [prCount, setPrCount] = useState<number | undefined>(() => {
    if (typeof initialPrCount === 'number') return initialPrCount;
    if (typeof window !== 'undefined') {
      const cached = sessionStorage.getItem('gitsentinel_sidebar_prCount');
      if (cached !== null) return parseInt(cached, 10);
    }
    return undefined;
  });
  const [repoCount, setRepoCount] = useState<number | undefined>(() => {
    if (typeof initialRepoCount === 'number') return initialRepoCount;
    if (typeof window !== 'undefined') {
      const cached = sessionStorage.getItem('gitsentinel_sidebar_repoCount');
      if (cached !== null) return parseInt(cached, 10);
    }
    return undefined;
  });

  // Fetch real active counts on mount (throttled via sessionStorage)
  useEffect(() => {
    let isMounted = true;
    async function fetchCounts() {
      try {
        const lastFetch = typeof window !== 'undefined' ? sessionStorage.getItem('gitsentinel_sidebar_last_fetch') : null;
        if (lastFetch && Date.now() - Number(lastFetch) < 30000) {
          // Cached within last 30 seconds
          return;
        }

        const [prRes, repoRes] = await Promise.all([
          fetch('/api/pull-requests').then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch('/api/repositories').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        if (isMounted) {
          const prList = Array.isArray(prRes?.data)
            ? prRes.data
            : Array.isArray(prRes?.pullRequests)
            ? prRes.pullRequests
            : null;
          const repoList = Array.isArray(repoRes?.data)
            ? repoRes.data
            : Array.isArray(repoRes?.repositories)
            ? repoRes.repositories
            : null;
          if (prList !== null) {
            setPrCount(prList.length);
            sessionStorage.setItem('gitsentinel_sidebar_prCount', String(prList.length));
          }
          if (repoList !== null) {
            setRepoCount(repoList.length);
            sessionStorage.setItem('gitsentinel_sidebar_repoCount', String(repoList.length));
          }
          sessionStorage.setItem('gitsentinel_sidebar_last_fetch', String(Date.now()));
        }
      } catch (_) {
        // Ignore fetch errors
      }
    }
    fetchCounts();
    return () => {
      isMounted = false;
    };
  }, []);

  // Hide sidebar only on login or inside the dedicated full-screen PR diff inspector (/pull-requests/[id])
  if (
    pathname === '/login' ||
    (pathname.startsWith('/pull-requests/') && pathname !== '/pull-requests')
  ) {
    return null;
  }

  const isLogsActive = pathname === '/logs';

  const workspaceItems = [
    {
      name: 'Overview',
      href: '/',
      icon: LayoutGrid,
      active: pathname === '/',
    },
    {
      name: 'Pull Requests',
      href: '/pull-requests',
      icon: GitPullRequest,
      active: pathname.startsWith('/pull-requests'),
      badge: typeof prCount === 'number' && prCount > 0 ? prCount : undefined,
    },
    {
      name: 'Repositories',
      href: '/repositories',
      icon: FolderGit2,
      active: pathname.startsWith('/repositories'),
      badge: typeof repoCount === 'number' && repoCount > 0 ? repoCount : undefined,
    },
    {
      name: 'AI Code Explorer',
      href: '/code-explorer',
      icon: Code2,
      active: pathname.startsWith('/code-explorer'),
    },
    {
      name: 'CyberChatbot',
      href: '/cyberchatbot',
      icon: MessageSquareText,
      active: pathname.startsWith('/cyberchatbot') || pathname.startsWith('/chatbot') || pathname.startsWith('/cybercharbot'),
    },
  ];

  const operationsItems = [
    {
      name: 'Evaluations',
      href: '/eval',
      icon: TrendingUp,
      active: pathname.startsWith('/eval'),
    },
    {
      name: 'Security Findings',
      href: '/security',
      icon: ShieldAlert,
      active: pathname.startsWith('/security'),
    },
    {
      name: 'Logs',
      href: '/logs',
      icon: FileText,
      active: isLogsActive,
    },
  ];

  const settingsItem = {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
    active: pathname.startsWith('/settings'),
  };

  return (
    <aside className="w-64 shrink-0 bg-white dark:bg-black border-r border-slate-200 dark:border-zinc-800 sticky top-16 h-[calc(100vh-4rem)] flex flex-col p-4 select-none overflow-y-auto z-30 transition-colors">
      {/* WORKSPACE Section */}
      <div className="space-y-1">
        <div className="text-[11px] font-bold tracking-wider text-slate-400 dark:text-zinc-400 uppercase px-2 mb-1.5">
          WORKSPACE
        </div>
        {workspaceItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.active;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors group cursor-pointer ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-semibold border border-blue-200/60 shadow-xs dark:bg-zinc-900 dark:text-white dark:border-zinc-800/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium dark:text-zinc-300 dark:hover:text-white dark:hover:bg-zinc-900/70'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    isActive ? 'text-blue-600 dark:text-white' : 'text-slate-400 group-hover:text-slate-600 dark:text-zinc-400 dark:group-hover:text-white'
                  }`}
                />
                <span className="truncate">{item.name}</span>
              </div>
              {item.badge !== undefined && (
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 dark:text-zinc-400 dark:bg-zinc-800/60 ml-2 shrink-0 px-2 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Middle Divider */}
      <div className="border-b border-slate-200 dark:border-zinc-800/80 my-3" />

      {/* OPERATIONS Section */}
      <div className="space-y-1">
        <div className="text-[11px] font-bold tracking-wider text-slate-400 dark:text-zinc-400 uppercase px-2 mb-1.5">
          OPERATIONS
        </div>
        {operationsItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.active;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors group cursor-pointer ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-semibold border border-blue-200/60 shadow-xs dark:bg-zinc-900 dark:text-white dark:border-zinc-800/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium dark:text-zinc-300 dark:hover:text-white dark:hover:bg-zinc-900/70'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    isActive ? 'text-blue-600 dark:text-white' : 'text-slate-400 group-hover:text-slate-600 dark:text-zinc-400 dark:group-hover:text-white'
                  }`}
                />
                <span className="truncate">{item.name}</span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Bottom Divider */}
      <div className="border-b border-slate-200 dark:border-zinc-800/80 my-3" />

      {/* Settings Section */}
      <div className="space-y-1">
        <Link
          href={settingsItem.href}
          className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors group cursor-pointer ${
            settingsItem.active
              ? 'bg-blue-50 text-blue-700 font-semibold border border-blue-200/60 shadow-xs dark:bg-zinc-900 dark:text-white dark:border-zinc-800/50'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium dark:text-zinc-300 dark:hover:text-white dark:hover:bg-zinc-900/70'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <settingsItem.icon
              className={`h-4 w-4 shrink-0 transition-colors ${
                settingsItem.active ? 'text-blue-600 dark:text-white' : 'text-slate-400 group-hover:text-slate-600 dark:text-zinc-400 dark:group-hover:text-white'
              }`}
            />
            <span className="truncate">{settingsItem.name}</span>
          </div>
        </Link>
      </div>
    </aside>
  );
}
