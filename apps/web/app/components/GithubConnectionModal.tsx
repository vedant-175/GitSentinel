'use client';

import React, { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ExternalLink,
  Shield,
  FolderGit2,
  Sparkles,
} from 'lucide-react';

interface GithubConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  detectedLogin?: string | null;
}

export function GithubConnectionModal({
  isOpen,
  onClose,
  detectedLogin: propDetectedLogin,
}: GithubConnectionModalProps) {
  const { data: session, update } = useSession();
  const router = useRouter();

  const detected =
    propDetectedLogin ||
    session?.user?.detectedGithubLogin ||
    null;

  const [username, setUsername] = useState(detected || '');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (detected) {
      setUsername(detected);
    }
  }, [detected]);

  if (!isOpen) return null;

  const handleConnect = async (targetLogin: string) => {
    const clean = targetLogin.trim().replace(/^@/, '');
    if (!clean) {
      setErrorMsg('Please enter your GitHub username.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/connect-github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubLogin: clean }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to connect GitHub account.');
        setLoading(false);
        return;
      }

      setSuccessMsg(
        `Successfully connected @${data.githubLogin}! Synced ${data.reposCount || 0} repositories.`
      );

      // Update NextAuth session state
      if (update) {
        await update({
          user: {
            isGithubConnected: true,
            githubLogin: data.githubLogin,
            login: data.githubLogin,
          },
        }).catch(() => {});
      }

      // Revalidate and reload so that the banner and navbar immediately update
      setTimeout(() => {
        router.refresh();
        window.location.reload();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred while connecting.');
      setLoading(false);
    }
  };

  const handleOAuthConnect = () => {
    signIn('github', { callbackUrl: window.location.href });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 sm:p-7 shadow-2xl transition-all">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-3.5 mb-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-xs">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
              Connect Your GitHub Account
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 leading-relaxed">
              You are signed in with email <span className="font-semibold text-slate-700 dark:text-zinc-300">{session?.user?.email}</span>. Connect GitHub to synchronize repositories and run AI security code reviews.
            </p>
          </div>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="font-medium">{successMsg}</span>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-800 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span className="font-medium">{errorMsg}</span>
          </div>
        )}

        {/* Detected Account Highlight Card */}
        {detected && (
          <div className="mb-5 rounded-xl border border-amber-500/20 dark:border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-amber-500/10 p-4">
            <div className="flex items-center justify-between mb-2.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                <Sparkles className="h-3.5 w-3.5" />
                Detected GitHub Account Linked to Your Email
              </span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 font-bold">
                Auto-Detected
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://github.com/${detected}.png`}
                  alt={detected}
                  className="h-9 w-9 rounded-full border border-amber-500/30 object-cover shrink-0"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    @{detected}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                    github.com/{detected}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleConnect(detected)}
                disabled={loading}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white px-3.5 py-2 text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FolderGit2 className="h-3.5 w-3.5" />
                )}
                <span>Connect @{detected}</span>
              </button>
            </div>
          </div>
        )}

        {/* Manual Connect Form */}
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
            {detected ? 'Or connect a different GitHub username:' : 'Enter your GitHub username:'}
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400 dark:text-zinc-500">
                @
              </span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. torvalds, octocat, your-handle"
                disabled={loading}
                className="h-10 w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900 pl-7 pr-3 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>
            <button
              type="button"
              onClick={() => handleConnect(username)}
              disabled={loading || !username.trim()}
              className="h-10 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 px-4 text-xs font-semibold text-white shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5" />
              )}
              <span>Connect</span>
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200 dark:border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase">
            <span className="bg-white dark:bg-zinc-950 px-2 text-slate-400 dark:text-zinc-500 font-semibold tracking-wider">
              Or connect via OAuth
            </span>
          </div>
        </div>

        {/* OAuth Connect Button */}
        <button
          type="button"
          onClick={handleOAuthConnect}
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 px-4 py-2.5 text-xs font-semibold text-slate-800 dark:text-zinc-200 shadow-xs transition-colors cursor-pointer"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
            />
          </svg>
          <span>Authorize GitHub OAuth & Link Account</span>
        </button>

        <p className="text-[11px] text-center text-slate-400 dark:text-zinc-500 mt-4">
          Connecting your GitHub account allows GitSentinel to analyze PR diffs, check vulnerabilities, and enforce branch policies.
        </p>
      </div>
    </div>
  );
}
