'use client';

import React, { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Lock,
  FolderLock,
  ShieldCheck,
  RotateCcw,
  Shield,
  Heart,
  ArrowRight,
  Loader2,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Search,
} from 'lucide-react';
import { GitSentinelLogo } from '../components/GitSentinelLogo';

interface LoginFormProps {
  isDevLoginEnabled?: boolean;
  hasGithubOAuth?: boolean;
}

export function LoginForm({
  hasGithubOAuth = false,
}: LoginFormProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const callbackUrl = searchParams.get('callbackUrl') || '/repositories';
  const queryError = searchParams.get('error');

  // Primary OAuth state
  const [oauthLoading, setOauthLoading] = useState(false);
  const [lastUsedOAuth, setLastUsedOAuth] = useState(false);

  // Secondary Public Exploration state
  const [exploreUsername, setExploreUsername] = useState('');
  const [exploreLoading, setExploreLoading] = useState(false);
  const [exploreError, setExploreError] = useState<string | null>(null);

  // Common UI state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showOAuthHelp, setShowOAuthHelp] = useState(false);

  // Check last used auth method from localStorage/cookie (only reflect valid GitHub OAuth)
  useEffect(() => {
    try {
      const savedMethod = localStorage.getItem('gitsentinel_last_auth_method');
      if (savedMethod === 'oauth' || savedMethod === 'github') {
        setLastUsedOAuth(true);
      }
    } catch {
      // Ignore if localStorage is restricted
    }
  }, []);

  // Map OAuth callback error query parameters to user-friendly error messages
  useEffect(() => {
    if (queryError) {
      if (queryError === 'OAuthCallback' || queryError === 'OAuthSignin' || queryError === 'Callback') {
        setErrorMessage('GitHub authorization failed or state verification expired. Please try signing in again.');
      } else if (queryError === 'AccessDenied') {
        setErrorMessage('Access was denied or the GitHub authorization was cancelled.');
      } else if (queryError === 'Configuration') {
        setErrorMessage('GitHub OAuth is not configured. Please ensure GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are set in your environment.');
      } else if (queryError === 'OAuthCreateAccount') {
        setErrorMessage('Could not sign in with this GitHub account. Please try again.');
      } else if (queryError === 'SessionRequired') {
        setErrorMessage('Please sign in with GitHub to access the requested page.');
      } else {
        setErrorMessage(`Authentication error: ${queryError}. Please try again.`);
      }
    }
  }, [queryError]);

  // Primary Flow: Continue with GitHub OAuth
  const handleGithubOAuth = async () => {
    setOauthLoading(true);
    setErrorMessage(null);

    try {
      localStorage.setItem('gitsentinel_last_auth_method', 'oauth');
      document.cookie = 'gitsentinel_last_auth_method=oauth; path=/; max-age=2592000; SameSite=Lax';
    } catch {
      // Ignore storage errors
    }

    try {
      await signIn('github', { callbackUrl });
    } catch (err: any) {
      console.error('GitHub OAuth initialization error:', err);
      setErrorMessage('Failed to connect to GitHub. Please check your internet connection.');
      setOauthLoading(false);
    }
  };

  // Secondary Flow: Explore Public Repositories (Non-Authenticated)
  const handleExploreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setExploreError(null);

    const cleanUsername = exploreUsername.trim().replace(/^@/, '');
    if (!cleanUsername) {
      setExploreError('Please enter a GitHub username to explore.');
      return;
    }

    // Validate GitHub username character set
    const validUsernameRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
    if (!validUsernameRegex.test(cleanUsername)) {
      setExploreError('Invalid username. GitHub usernames only contain alphanumeric characters and hyphens.');
      return;
    }

    setExploreLoading(true);
    router.push(`/explore?username=${encodeURIComponent(cleanUsername)}`);
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center">
      {/* 1. Brand Logo & Header */}
      <div className="flex flex-col items-center text-center">
        <GitSentinelLogo className="h-12 w-12 rounded-2xl shadow-md shadow-blue-500/25 mb-3" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">GitSentinel</h1>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">AI Code Review & Security Platform</p>
      </div>

      {/* 2. Main Authentication Card */}
      <div className="w-full mt-6 rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 sm:p-7 shadow-sm">
        
        {/* Heading & Subtitle */}
        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Sign in to GitSentinel
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            AI Code Review & Security Platform
          </p>

          {/* Last-used Indicator (Valid OAuth only) */}
          {lastUsedOAuth && (
            <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 text-[11px] text-slate-600 dark:text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>
                Last used: <strong className="text-slate-900 dark:text-white">GitHub OAuth</strong>
              </span>
            </div>
          )}
        </div>

        {/* Global Error Notice */}
        {errorMessage && (
          <div className="mt-4 p-3 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2 leading-relaxed animate-fade-in">
            <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">{errorMessage}</div>
          </div>
        )}

        {/* Unconfigured OAuth Environment Notice */}
        {!hasGithubOAuth && (
          <div className="mt-4 p-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-300 flex items-start gap-2 leading-relaxed">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              GitHub OAuth is not configured in this environment. Set <code className="font-mono text-[10px] font-bold">NEXTAUTH_GITHUB_CLIENT_ID</code> and <code className="font-mono text-[10px] font-bold">NEXTAUTH_GITHUB_CLIENT_SECRET</code> to enable one-click sign in.
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PRIMARY ACTION: CONTINUE WITH GITHUB                                     */}
        {/* ========================================================================= */}
        <div className="mt-6 space-y-3">
          <button
            type="button"
            id="continue-with-github-btn"
            onClick={handleGithubOAuth}
            disabled={oauthLoading}
            className="w-full flex items-center justify-center gap-3 rounded-xl bg-[#1e232b] hover:bg-black active:bg-[#111418] dark:bg-white dark:hover:bg-zinc-100 dark:active:bg-zinc-200 text-white dark:text-black font-semibold text-sm py-3 px-4 shadow-sm hover:shadow-md transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {oauthLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-white dark:text-black" />
            ) : (
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
            )}
            <span>Continue with GitHub</span>
            <ArrowRight className="h-4 w-4 ml-0.5" />
          </button>

          {/* Primary Supporting Description */}
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 text-center leading-relaxed px-1">
            Securely connect your GitHub account to manage authorized repositories and AI-powered code reviews.
          </p>
        </div>

        {/* ========================================================================= */}
        {/* SEPARATOR: OR EXPLORE PUBLICLY                                           */}
        {/* ========================================================================= */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200 dark:border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-wider font-semibold">
            <span className="bg-white dark:bg-zinc-950 px-3 text-slate-400 dark:text-zinc-500">
              or explore public code
            </span>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECONDARY CARD: EXPLORE PUBLIC REPOSITORIES                              */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-slate-200/80 dark:border-zinc-800/90 bg-slate-50/60 dark:bg-zinc-900/40 p-4 space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                <span>Explore Public Repositories</span>
              </h3>
              <span className="text-[10px] text-slate-400 dark:text-zinc-500 bg-slate-200/60 dark:bg-zinc-800 px-2 py-0.5 rounded-full font-medium">
                No login needed
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 leading-relaxed">
              Discover publicly accessible repositories using a GitHub username.
            </p>
          </div>

          <form onSubmit={handleExploreSubmit} className="space-y-2">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-zinc-500 font-mono text-xs">
                @
              </div>
              <input
                type="text"
                value={exploreUsername}
                onChange={(e) => {
                  setExploreUsername(e.target.value);
                  if (exploreError) setExploreError(null);
                }}
                placeholder="GitHub username (e.g. octocat, torvalds)"
                disabled={exploreLoading}
                className="w-full rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 pl-8 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>

            {exploreError && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400">{exploreError}</p>
            )}

            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="submit"
                disabled={exploreLoading || !exploreUsername.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 hover:bg-black dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white font-medium text-xs py-2 px-3 transition-colors cursor-pointer disabled:opacity-50"
              >
                {exploreLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                <span>Explore Repositories</span>
              </button>

              <button
                type="button"
                onClick={() => router.push('/explore')}
                className="px-2.5 py-2 text-xs font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                Browse All &rarr;
              </button>
            </div>
          </form>

          <p className="text-[10px] text-slate-400 dark:text-zinc-500 leading-tight">
            Anonymous read-only preview. GitHub OAuth is required to run automated code reviews or access private repositories.
          </p>
        </div>

        {/* ========================================================================= */}
        {/* OAUTH CONFIGURATION HELP DROPDOWN                                         */}
        {/* ========================================================================= */}
        <div className="mt-5 pt-3 border-t border-slate-100 dark:border-zinc-850">
          <button
            type="button"
            onClick={() => setShowOAuthHelp(!showOAuthHelp)}
            className="text-[11px] text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 flex items-center justify-between w-full font-medium cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span>How to configure GitHub OAuth</span>
            </span>
            {showOAuthHelp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {showOAuthHelp && (
            <div className="mt-2.5 p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 text-[11px] text-slate-600 dark:text-zinc-300 space-y-2 leading-relaxed animate-fade-in">
              <p>
                To configure GitHub OAuth, create an OAuth App at{' '}
                <a
                  href="https://github.com/settings/developers"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 dark:text-blue-400 font-semibold underline inline-flex items-center gap-0.5"
                >
                  GitHub Developer Settings <ExternalLink className="h-2.5 w-2.5" />
                </a>{' '}
                and add the following environment variables:
              </p>
              <div className="font-mono text-[10px] bg-white dark:bg-zinc-950 p-2.5 rounded-lg border border-slate-200 dark:border-zinc-800 space-y-1">
                <div><span className="text-slate-400 dark:text-zinc-500">Homepage URL:</span> https://gitsentinel-red.vercel.app</div>
                <div><span className="text-slate-400 dark:text-zinc-500">Callback URL:</span> https://gitsentinel-red.vercel.app/api/auth/callback/github</div>
                <div><span className="text-blue-600 dark:text-blue-400 font-bold">GITHUB_CLIENT_ID:</span> your_oauth_client_id</div>
                <div><span className="text-blue-600 dark:text-blue-400 font-bold">GITHUB_CLIENT_SECRET:</span> your_oauth_client_secret</div>
              </div>
            </div>
          )}
        </div>

        {/* Privacy Highlight Box */}
        <div className="mt-4 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-950/30 p-3 flex items-start gap-2.5">
          <Lock className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="text-[11px] text-slate-600 dark:text-zinc-300 leading-snug">
            <span className="block font-medium text-slate-800 dark:text-zinc-200">
              We only access repositories you explicitly authorize.
            </span>
            <span>Your source code remains private and protected.</span>
          </div>
        </div>

        {/* Three Security Points */}
        <div className="mt-4 space-y-2.5 text-xs text-slate-600 dark:text-zinc-400">
          <div className="flex items-center gap-2.5">
            <FolderLock className="h-4 w-4 text-slate-400 dark:text-zinc-500 shrink-0" />
            <span>Read-only access to authorized repositories</span>
          </div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 text-slate-400 dark:text-zinc-500 shrink-0" />
            <span>Encrypted OAuth token exchange with GitHub</span>
          </div>
          <div className="flex items-center gap-2.5">
            <RotateCcw className="h-4 w-4 text-slate-400 dark:text-zinc-500 shrink-0" />
            <span>Revoke access anytime from GitHub settings</span>
          </div>
        </div>

        {/* Terms of Service & Privacy Policy */}
        <div className="mt-6 text-center text-[11px] text-slate-400 dark:text-zinc-500">
          By continuing, you agree to our{' '}
          <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">
            Privacy Policy
          </a>
          .
        </div>
      </div>

      {/* 3. Bottom Trust Highlights */}
      <div className="mt-6 text-center space-y-2">
        <p className="text-xs text-slate-500 dark:text-zinc-500">
          Built for developers who care about secure, high quality code.
        </p>
        <div className="flex items-center justify-center gap-5 text-xs text-slate-600 dark:text-zinc-400 font-medium">
          <div className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 fill-slate-700 dark:fill-zinc-300" viewBox="0 0 24 24">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              />
            </svg>
            <span>Open Source</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5 text-rose-500 fill-rose-500" />
            <span>Developer Friendly</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-blue-600" />
            <span>Security Focused</span>
          </div>
        </div>
      </div>
    </div>
  );
}
