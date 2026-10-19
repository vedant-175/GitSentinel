'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShieldCheck,
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
    <aside className="w-64 shrink-0 bg-black border-r border-zinc-800/80 sticky top-16 h-[calc(100vh-4rem)] flex flex-col p-4 select-none overflow-y-auto z-30 transition-colors">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-1.5 py-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shrink-0">
          <ShieldCheck className="h-5 w-5 text-white" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-base font-bold tracking-tight text-white leading-tight truncate">
            GitSentinel
          </span>
          <span className="text-xs text-zinc-400 font-normal leading-tight truncate">
            AI Code Review & Security
          </span>
        </div>
      </div>

      {/* Top Divider */}
      <div className="border-b border-zinc-800/80 my-3.5" />

      {/* WORKSPACE Section */}
      <div className="space-y-1">
        <div className="text-[11px] font-bold tracking-wider text-zinc-400 uppercase px-2 mb-1.5">
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
                  ? 'bg-zinc-900 text-white font-medium border border-zinc-800/50 shadow-xs'
                  : 'text-zinc-300 hover:text-white hover:bg-zinc-900/70 font-normal'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    isActive ? 'text-white' : 'text-zinc-400 group-hover:text-white'
                  }`}
                />
                <span className="truncate">{item.name}</span>
              </div>
              {item.badge !== undefined && (
                <span className="text-xs text-zinc-400 font-normal ml-2 shrink-0">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Middle Divider */}
      <div className="border-b border-zinc-800/80 my-3.5" />

      {/* OPERATIONS Section */}
      <div className="space-y-1">
        <div className="text-[11px] font-bold tracking-wider text-zinc-400 uppercase px-2 mb-1.5">
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
                  ? 'bg-zinc-900 text-white font-medium border border-zinc-800/50 shadow-xs'
                  : 'text-zinc-300 hover:text-white hover:bg-zinc-900/70 font-normal'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    isActive ? 'text-white' : 'text-zinc-400 group-hover:text-white'
                  }`}
                />
                <span className="truncate">{item.name}</span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Bottom Divider */}
      <div className="border-b border-zinc-800/80 my-3.5" />

      {/* Settings Section */}
      <div className="space-y-1">
        <Link
          href={settingsItem.href}
          className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors group cursor-pointer ${
            settingsItem.active
              ? 'bg-zinc-900 text-white font-medium border border-zinc-800/50 shadow-xs'
              : 'text-zinc-300 hover:text-white hover:bg-zinc-900/70 font-normal'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <settingsItem.icon
              className={`h-4 w-4 shrink-0 transition-colors ${
                settingsItem.active ? 'text-white' : 'text-zinc-400 group-hover:text-white'
              }`}
            />
            <span className="truncate">{settingsItem.name}</span>
          </div>
        </Link>
      </div>

      {/* Bottom illustrative preview label */}
      <div className="mt-auto pt-4 text-[11px] text-zinc-500 px-2 leading-relaxed">
        Proposed navigation · illustrative preview
      </div>
    </aside>
  );
}
