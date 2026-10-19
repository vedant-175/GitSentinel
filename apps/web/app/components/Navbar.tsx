'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  Shield,
  ChevronDown,
  LogOut,
  LogIn,
  Sun,
  Moon,
} from 'lucide-react';
import { useState } from 'react';
import { useTheme } from './ThemeProvider';

export function Navbar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  // If on login page or PR diff inspector view, suppress the global header
  if (
    pathname === '/login' ||
    (pathname.startsWith('/pull-requests/') && pathname !== '/pull-requests')
  ) {
    return null;
  }

  const isLoggedIn = status === 'authenticated' && !!session?.user;
  const username = session?.user?.name || session?.user?.login || 'vedant-175';
  const initial = username.charAt(0).toUpperCase() || 'V';

  const navLinks = [
    { label: 'Overview', href: '/', active: pathname === '/' },
    { label: 'Pull requests', href: '/pull-requests', active: pathname.startsWith('/pull-requests') },
    { label: 'Repositories', href: '/repositories', active: pathname.startsWith('/repositories') },
    { label: 'AI Code Explorer', href: '/code-explorer', active: pathname.startsWith('/code-explorer') },
    { label: 'Evaluations', href: '/eval', active: pathname.startsWith('/eval') },
    { label: 'Logs', href: '/logs', active: pathname.startsWith('/logs') },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 dark:border-zinc-800 bg-white/95 dark:bg-black/95 backdrop-blur-md transition-colors">
      <div className="flex h-16 w-full items-center justify-between px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm shadow-blue-500/20 group-hover:bg-blue-700 transition-colors">
            <Shield className="h-4 w-4 fill-white text-blue-600" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
              GitSentinel
            </span>
            <span className="text-[10px] text-slate-400 dark:text-zinc-400 font-normal leading-tight">
              AI Code Review & Security
            </span>
          </div>
        </Link>

        {/* Center Navigation Tabs with Active Indicator Bar */}
        <nav className="hidden md:flex items-center gap-7 h-full text-xs">
          {navLinks.map((link) => {
            const isActive = link.active;
            return (
              <Link
                key={link.label}
                href={link.href}
                className={`relative flex items-center h-full font-medium transition-colors ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
                }`}
              >
                <span>{link.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right side controls: Theme toggle, GitHub icon, user pill & avatar */}
        <div className="flex items-center gap-3">
          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            id="theme-toggle-button"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors shadow-xs"
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-400 transition-transform duration-200 hover:rotate-45" />
            ) : (
              <Moon className="h-4 w-4 text-slate-700 transition-transform duration-200 hover:-rotate-12" />
            )}
          </button>

          {/* GitHub icon */}
          <button
            type="button"
            className="text-slate-700 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
            title="GitHub"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              />
            </svg>
          </button>

          {isLoggedIn ? (
            <>
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  id="user-profile-menu-button"
                  className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors shadow-xs"
                >
                  <span className="font-semibold text-slate-800 dark:text-zinc-100">{username}</span>
                  <ChevronDown className="h-3 w-3 text-slate-400 dark:text-zinc-500" />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2 shadow-lg z-50 text-xs">
                    <div className="px-2 py-1 text-[10px] text-slate-400 dark:text-zinc-500 uppercase tracking-wider font-semibold">
                      Signed in as
                    </div>
                    <div className="px-2 py-1 text-slate-900 dark:text-zinc-100 font-semibold truncate">
                      {username}
                    </div>
                    <div className="border-t border-slate-100 dark:border-zinc-800 my-1" />
                    <button
                      onClick={() => signOut({ callbackUrl: '/login' })}
                      id="sign-out-button"
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors text-left font-medium cursor-pointer"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>

              {/* User profile avatar circle */}
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 dark:bg-zinc-700 text-white font-medium text-xs shadow-sm">
                {initial}
              </div>
            </>
          ) : (
            <Link
              href="/login"
              id="nav-sign-in-button"
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Sign In</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
