'use client';

import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  FolderGit2,
  ArrowRight,
  Sparkles,
  X,
  ExternalLink,
} from 'lucide-react';
import { GithubConnectionModal } from './GithubConnectionModal';

export function GithubConnectionBanner() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Suppress on login page or diff inspector
  if (
    pathname === '/login' ||
    (pathname.startsWith('/pull-requests/') && pathname !== '/pull-requests')
  ) {
    return null;
  }

  // Only render if user is authenticated via email and GitHub is not connected
  const isEmailUser = session?.user?.authMethod === 'email';
  const isGithubConnected = session?.user?.isGithubConnected;

  if (status !== 'authenticated' || !isEmailUser || isGithubConnected || isDismissed) {
    return null;
  }

  const detectedLogin = session?.user?.detectedGithubLogin;
  const userEmail = session?.user?.email;

  return (
    <>
      <div
        id="github-connection-banner"
        className="relative z-40 border-b border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/5 dark:from-amber-950/40 dark:via-zinc-950 dark:to-zinc-950 px-4 py-3 sm:px-6 transition-all backdrop-blur-xs"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 max-w-7xl mx-auto">
          {/* Left: Icon + Content */}
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              <AlertTriangle className="h-4 w-4" />
            </div>

            <div className="min-w-0 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider text-[11px] px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/30">
                  GitHub Not Connected
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  You have to connect with GitHub to access and review repositories.
                </span>
              </div>

              {detectedLogin ? (
                <div className="mt-1 flex items-center gap-1.5 text-slate-700 dark:text-zinc-300">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span>
                    We detected that your registered email (
                    <span className="font-medium text-slate-900 dark:text-white">{userEmail}</span>
                    ) is linked with GitHub account{' '}
                    <span className="font-bold text-blue-600 dark:text-blue-400 underline decoration-blue-500/40">
                      @{detectedLogin}
                    </span>
                    .
                  </span>
                </div>
              ) : (
                <div className="mt-1 text-slate-600 dark:text-zinc-400">
                  Link your GitHub username or sign in with GitHub to synchronize repositories.
                </div>
              )}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
            {detectedLogin ? (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-1.5 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <FolderGit2 className="h-3.5 w-3.5" />
                <span>Connect @{detectedLogin}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <FolderGit2 className="h-3.5 w-3.5" />
                <span>Connect with GitHub</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsDismissed(true)}
              className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-amber-500/10 transition-colors"
              title="Dismiss banner for this session"
              aria-label="Dismiss banner"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <GithubConnectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        detectedLogin={detectedLogin}
      />
    </>
  );
}
