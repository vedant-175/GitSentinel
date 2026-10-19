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
  SquareActivity,
  ShieldAlert,
  FileText,
  Settings,
} from 'lucide-react';

interface SidebarProps {
  prCount?: number;
  repoCount?: number;
}

export function Sidebar({ prCount: initialPrCount = 5, repoCount: initialRepoCount = 10 }: SidebarProps) {
  const pathname = usePathname();

  const [prCount, setPrCount] = useState<number>(initialPrCount);
  const [repoCount, setRepoCount] = useState<number>(initialRepoCount);

  // Optionally fetch real active counts on mount
  useEffect(() => {
    let isMounted = true;
    async function fetchCounts() {
      try {
        const [prRes, repoRes] = await Promise.all([
          fetch('/api/pull-requests').then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch('/api/repositories').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        if (isMounted) {
          if (prRes && Array.isArray(prRes.pullRequests)) {
            setPrCount(prRes.pullRequests.length || 5);
          }
          if (repoRes && Array.isArray(repoRes.repositories)) {
            setRepoCount(repoRes.repositories.length || 10);
          }
        }
      } catch (_) {
        // Fallback to default counts 5 & 10
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

  const isWorkerQueueActive =
    pathname === '/worker-queue' ||
    pathname === '/queue';

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
      badge: prCount,
    },
    {
      name: 'Repositories',
      href: '/repositories',
      icon: FolderGit2,
      active: pathname.startsWith('/repositories'),
      badge: repoCount,
    },
    {
      name: 'AI Code Explorer',
      href: '/code-explorer',
      icon: Code2,
      active: pathname.startsWith('/code-explorer'),
    },
    {
      name: 'CyberChatbot',
      href: '#',
      icon: MessageSquareText,
      active: false,
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('open-cyber-chat', { detail: { open: true } }));
        const chatBtn = document.querySelector('[data-chat-toggle]') as HTMLElement;
        if (chatBtn) chatBtn.click();
      },
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
      name: 'Worker Queue',
      href: '/logs?tab=Workers',
      icon: SquareActivity,
      active: isWorkerQueueActive,
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
              onClick={item.onClick}
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
