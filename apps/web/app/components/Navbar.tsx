'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, GitPullRequest, FolderGit2, BarChart3, ShieldCheck } from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { label: 'Overview', href: '/', icon: BarChart3 },
    { label: 'Repositories', href: '/repositories', icon: FolderGit2 },
    { label: 'Pull Requests', href: '/pull-requests', icon: GitPullRequest },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#090d16]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/25 transition-transform group-hover:scale-105">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                ReviewAI
                <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-400 border border-indigo-500/20">
                  Bot
                </span>
              </span>
              <p className="text-[11px] text-slate-400 font-mono">Autonomous PR Assistant</p>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 ml-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-white/10 text-white shadow-sm'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right side stats & status */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Queue Worker Active
          </div>

          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <ShieldCheck className="h-4 w-4 text-indigo-400" />
            <span>GitHub App</span>
          </a>
        </div>
      </div>
    </header>
  );
}
