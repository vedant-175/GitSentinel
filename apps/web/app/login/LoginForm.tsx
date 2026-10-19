'use client';

import React, { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
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
} from 'lucide-react';
import { GitSentinelLogo } from '../components/GitSentinelLogo';

interface LoginFormProps {
  isDevLoginEnabled?: boolean;
  hasGithubOAuth?: boolean;
}

export function LoginForm({
  isDevLoginEnabled = false,
  hasGithubOAuth = false,
}: LoginFormProps) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showOAuthHelp, setShowOAuthHelp] = useState(false);

  const handleGitHubOAuthClick = async () => {
    setErrorMsg(null);
    setLoading(true);

    if (hasGithubOAuth) {
      try {
        await signIn('github', { callbackUrl });
      } catch (err: any) {
        console.error('GitHub OAuth error:', err);
        setErrorMsg('GitHub OAuth failed to initialize. Please verify your connection.');
        setLoading(false);
      }
      return;
    }

    // When GitHub OAuth credentials are not configured on Vercel yet:
    setErrorMsg(
      'GitHub OAuth App credentials (GITHUB_CLIENT_ID & GITHUB_CLIENT_SECRET) are not configured in your Vercel Environment Variables yet. Enter your GitHub handle below to connect and import your repositories directly!'
    );
    setShowOAuthHelp(true);
    setLoading(false);
  };

  const handleConnectByUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim().replace(/^@/, '');
    if (!cleanUser) {
      setErrorMsg('Please enter your GitHub username (e.g. your-github-handle).');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await signIn('credentials', {
        username: cleanUser,
        callbackUrl,
        redirect: false,
      });

      if (res?.error) {
        setErrorMsg(
          res.error === 'CredentialsSignin'
            ? 'Sign-in failed. Please verify the GitHub username exists.'
            : res.error
        );
        setLoading(false);
      } else if (res?.url) {
        window.location.href = res.url;
      } else {
        window.location.href = callbackUrl;
      }
    } catch (err: any) {
      console.error('GitHub account sign-in failed:', err);
      setErrorMsg('Failed to connect GitHub account. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center">
      {/* 1. Brand Logo & Title */}
      <div className="flex flex-col items-center text-center">
        <GitSentinelLogo className="h-12 w-12 rounded-2xl shadow-md shadow-blue-500/25 mb-3" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">GitSentinel</h1>
        <p className="text-xs text-slate-500 mt-0.5">AI Code Review & Security Platform</p>
      </div>

      {/* 2. White Sign-in Card */}
      <div className="w-full mt-6 rounded-2xl border border-slate-200/90 bg-white p-7 sm:p-8 shadow-sm">
        <div className="text-center">
          <h2 className="text-base font-bold text-slate-900">Sign in to GitSentinel</h2>
          <p className="text-xs text-slate-500 mt-1">
            Connect your GitHub account to review PRs and scan repositories
          </p>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900 leading-relaxed animate-fade-in">
            {errorMsg}
          </div>
        )}

        {/* Option 1: 1-Click GitHub OAuth Button */}
        <div className="mt-5">
          <button
            type="button"
            onClick={handleGitHubOAuthClick}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-[#1e232b] hover:bg-slate-900 text-white font-medium text-xs sm:text-sm py-2.5 px-4 shadow-sm transition-all cursor-pointer disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            ) : (
              <svg className="h-4 w-4 fill-white" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
            )}
            <span>Continue with GitHub OAuth</span>
            <ArrowRight className="h-3.5 w-3.5 ml-0.5" />
          </button>
        </div>

        {/* OR Divider */}
        <div className="relative flex py-4 items-center">
          <div className="flex-grow border-t border-slate-100" />
          <span className="flex-shrink mx-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
            OR CONNECT VIA USERNAME
          </span>
          <div className="flex-grow border-t border-slate-100" />
        </div>

        {/* Option 2: Connect directly with GitHub username */}
        <form onSubmit={handleConnectByUsername} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              GitHub Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-mono text-xs">
                @
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. octocat, torvalds, or your username"
                disabled={loading}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-8 pr-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !username.trim()}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm py-2.5 px-4 shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            ) : (
              <>
                <span>Connect GitHub & Sync Repos</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </form>

        {/* OAuth Configuration Help Dropdown */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setShowOAuthHelp(!showOAuthHelp)}
            className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center justify-between w-full font-medium cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5 text-blue-600" />
              <span>How to enable 1-Click GitHub OAuth on Vercel</span>
            </span>
            {showOAuthHelp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {showOAuthHelp && (
            <div className="mt-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 space-y-2 leading-relaxed">
              <p>
                To enable 1-Click GitHub OAuth, create an OAuth App at{' '}
                <a
                  href="https://github.com/settings/developers"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 font-semibold underline inline-flex items-center gap-0.5"
                >
                  GitHub Developer Settings <ExternalLink className="h-2.5 w-2.5" />
                </a>{' '}
                and add the following to your Vercel Project Environment Variables:
              </p>
              <div className="font-mono text-[10px] bg-white p-2 rounded border border-slate-200 space-y-1">
                <div><span className="text-slate-400">Homepage URL:</span> https://gitsentinel-red.vercel.app</div>
                <div><span className="text-slate-400">Callback URL:</span> https://gitsentinel-red.vercel.app/api/auth/callback/github</div>
                <div><span className="text-blue-600 font-bold">GITHUB_CLIENT_ID:</span> your_oauth_client_id</div>
                <div><span className="text-blue-600 font-bold">GITHUB_CLIENT_SECRET:</span> your_oauth_client_secret</div>
              </div>
            </div>
          )}
        </div>

        {/* Privacy Highlight Box */}
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-3 flex items-start gap-2.5">
          <Lock className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-[11px] text-slate-600 leading-snug">
            <span className="block font-medium text-slate-800">
              We only access repositories you explicitly authorize.
            </span>
            <span>Your code remains private and secure.</span>
          </div>
        </div>

        {/* Three Security Points */}
        <div className="mt-4 space-y-2.5 text-xs text-slate-600">
          <div className="flex items-center gap-2.5">
            <FolderLock className="h-4 w-4 text-slate-400 shrink-0" />
            <span>Read-only access to your public repositories</span>
          </div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 text-slate-400 shrink-0" />
            <span>Encrypted token authentication with GitHub</span>
          </div>
          <div className="flex items-center gap-2.5">
            <RotateCcw className="h-4 w-4 text-slate-400 shrink-0" />
            <span>Revoke access anytime from GitHub settings</span>
          </div>
        </div>

        {/* Terms of Service & Privacy Policy */}
        <div className="mt-6 text-center text-[11px] text-slate-400">
          By continuing, you agree to our{' '}
          <a href="#" className="text-blue-600 hover:underline">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#" className="text-blue-600 hover:underline">
            Privacy Policy
          </a>
          .
        </div>
      </div>

      {/* 3. Bottom Trust Line */}
      <div className="mt-6 text-center space-y-2">
        <p className="text-xs text-slate-500">
          Built for developers who care about secure and high quality code.
        </p>
        <div className="flex items-center justify-center gap-5 text-xs text-slate-600 font-medium">
          <div className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 fill-slate-700" viewBox="0 0 24 24">
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
