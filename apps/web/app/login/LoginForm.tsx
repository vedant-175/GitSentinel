'use client';

import React, { useState, useEffect } from 'react';
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
  Mail,
  UserCheck,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { GitSentinelLogo } from '../components/GitSentinelLogo';

type AuthMethod = 'oauth' | 'username' | 'email';

interface LoginFormProps {
  isDevLoginEnabled?: boolean;
  hasGithubOAuth?: boolean;
}

export function LoginForm({
  isDevLoginEnabled = true,
  hasGithubOAuth = false,
}: LoginFormProps) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const initialMethod = (searchParams.get('method') as AuthMethod) || 'oauth';

  const [activeTab, setActiveTab] = useState<AuthMethod>(initialMethod);

  // Method 1: Email & Password state
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [detectedGithubUser, setDetectedGithubUser] = useState<{
    login: string;
    avatarUrl?: string;
  } | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);

  // Method 2: GitHub Username state
  const [username, setUsername] = useState('');

  // Common state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showOAuthHelp, setShowOAuthHelp] = useState(false);

  // Check if email has an associated GitHub account when typing or on blur
  const checkEmailForGithub = async (emailToCheck: string) => {
    const clean = emailToCheck.trim().toLowerCase();
    if (!clean || !clean.includes('@') || !clean.includes('.')) {
      setDetectedGithubUser(null);
      return;
    }

    setCheckingEmail(true);
    try {
      const res = await fetch(`/api/auth/check-github-email?email=${encodeURIComponent(clean)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.hasGithub && data.login) {
          setDetectedGithubUser({
            login: data.login,
            avatarUrl: data.avatarUrl,
          });
        } else {
          setDetectedGithubUser(null);
        }
      }
    } catch {
      // Ignore background check failure
    } finally {
      setCheckingEmail(false);
    }
  };

  // Reset messages when switching tabs
  const handleTabChange = (tab: AuthMethod) => {
    setActiveTab(tab);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  // =========================================================================
  // METHOD 1: EMAIL & PASSWORD LOGIN / REGISTRATION
  // =========================================================================
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (!password || password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    // If Registration Mode
    if (isRegistering) {
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match. Please re-enter.');
        setLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password, name }),
        });

        const data = await res.json();

        if (!res.ok) {
          // Check if GitHub account was detected
          if (data.githubRequired && data.githubUser?.login) {
            setDetectedGithubUser({
              login: data.githubUser.login,
              avatarUrl: data.githubUser.avatarUrl,
            });
            setErrorMsg(data.message || `Your registered email has a GitHub account (@${data.githubUser.login}). You must connect with your GitHub account.`);
            setLoading(false);
            return;
          }
          setErrorMsg(data.error || 'Registration failed. Please try again.');
          setLoading(false);
          return;
        }

        setSuccessMsg('Account created successfully! Signing you in...');

        // Automatically sign in with credentials
        const signInRes = await signIn('credentials', {
          email: cleanEmail,
          password,
          callbackUrl,
          redirect: false,
        });

        if (signInRes?.error) {
          setErrorMsg(signInRes.error);
          setLoading(false);
        } else if (signInRes?.url) {
          window.location.href = signInRes.url;
        } else {
          window.location.href = callbackUrl;
        }
      } catch (err: any) {
        console.error('Registration exception:', err);
        setErrorMsg('An error occurred during registration. Please try again.');
        setLoading(false);
      }
      return;
    }

    // If Sign-In Mode
    try {
      const res = await signIn('credentials', {
        email: cleanEmail,
        password,
        callbackUrl,
        redirect: false,
      });

      if (res?.error) {
        if (res.error.startsWith('GITHUB_CONNECT_REQUIRED:')) {
          const ghLogin = res.error.split(':')[1] || '';
          setDetectedGithubUser({
            login: ghLogin,
            avatarUrl: `https://github.com/${ghLogin}.png`,
          });
          setErrorMsg(
            `Your registered email has a GitHub account (@${ghLogin}). You must connect with your GitHub account to continue.`
          );
        } else if (res.error === 'CredentialsSignin') {
          setErrorMsg('Invalid email or password. Please verify your credentials.');
        } else {
          setErrorMsg(res.error);
        }
        setLoading(false);
      } else if (res?.url) {
        window.location.href = res.url;
      } else {
        window.location.href = callbackUrl;
      }
    } catch (err: any) {
      console.error('Email sign-in failed:', err);
      setErrorMsg('Failed to sign in. Please verify your credentials.');
      setLoading(false);
    }
  };

  // =========================================================================
  // METHOD 2: GITHUB USERNAME LOGIN / REGISTRATION
  // =========================================================================
  const handleUsernameAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim().replace(/^@/, '');

    if (!cleanUser) {
      setErrorMsg('Please enter your GitHub username (e.g. octocat, torvalds).');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

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
      console.error('GitHub username sign-in failed:', err);
      setErrorMsg('Failed to connect GitHub username. Please try again.');
      setLoading(false);
    }
  };

  // =========================================================================
  // METHOD 3: DIRECT GITHUB OAUTH LOGIN
  // =========================================================================
  const handleDirectOAuth = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await signIn('github', { callbackUrl });
    } catch (err: any) {
      console.error('GitHub OAuth error:', err);
      setErrorMsg('GitHub OAuth failed to initialize. Please verify your connection.');
      setLoading(false);
    }
  };

  // Quick connect for detected GitHub account
  const handleConnectDetectedGitHub = async (loginToConnect: string) => {
    if (hasGithubOAuth) {
      await handleDirectOAuth();
    } else {
      setUsername(loginToConnect);
      setActiveTab('username');
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await signIn('credentials', {
          username: loginToConnect,
          callbackUrl,
          redirect: false,
        });
        if (res?.url) {
          window.location.href = res.url;
        } else {
          window.location.href = callbackUrl;
        }
      } catch (err: any) {
        setErrorMsg('Failed to connect GitHub account. Please try again.');
        setLoading(false);
      }
    }
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center">
      {/* 1. Brand Logo & Title */}
      <div className="flex flex-col items-center text-center">
        <GitSentinelLogo className="h-12 w-12 rounded-2xl shadow-md shadow-blue-500/25 mb-3" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">GitSentinel</h1>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">AI Code Review & Security Platform</p>
      </div>

      {/* 2. White / Dark Sign-in Card */}
      <div className="w-full mt-6 rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 sm:p-7 shadow-sm">
        <div className="text-center">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Sign in to GitSentinel</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Choose your preferred sign-in or registration method
          </p>
        </div>

        {/* 3-Way Method Tabs */}
        <div className="mt-5 grid grid-cols-3 p-1 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 text-[11px] font-medium text-slate-600 dark:text-zinc-400">
          <button
            type="button"
            onClick={() => handleTabChange('oauth')}
            className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg transition-all cursor-pointer ${
              activeTab === 'oauth'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <svg className="h-3.5 w-3.5 fill-current shrink-0" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span className="truncate">GitHub OAuth</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('username')}
            className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg transition-all cursor-pointer ${
              activeTab === 'username'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <UserCheck className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Username</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('email')}
            className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg transition-all cursor-pointer ${
              activeTab === 'email'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Email & Pass</span>
          </button>
        </div>

        {/* Global Feedback Messages */}
        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2 leading-relaxed animate-fade-in">
            <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">{errorMsg}</div>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2 leading-relaxed animate-fade-in">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">{successMsg}</div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: GITHUB OAUTH LOGIN (Direct 1-Click Connection)                     */}
        {/* ========================================================================= */}
        {activeTab === 'oauth' && (
          <div className="mt-5 space-y-4">
            <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/50 text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
              <div className="font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                <span>Direct GitHub OAuth Login</span>
              </div>
              Connects directly to your GitHub account using secure OAuth. Pulls your organizations, repositories, and review permissions with minimal read-only scope.
            </div>

            <button
              type="button"
              onClick={handleDirectOAuth}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-[#1e232b] hover:bg-slate-900 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:border dark:border-zinc-700 text-white font-medium text-xs sm:text-sm py-2.5 px-4 shadow-sm transition-all cursor-pointer disabled:opacity-60"
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
        )}

        {/* ========================================================================= */}
        {/* TAB 2: GITHUB USERNAME LOGIN / REGISTRATION                               */}
        {/* ========================================================================= */}
        {activeTab === 'username' && (
          <form onSubmit={handleUsernameAuth} className="mt-5 space-y-3.5">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  GitHub Username
                </label>
                <span className="text-[10px] text-slate-400 dark:text-zinc-500">Auto-syncs public repos</span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-zinc-500 font-mono text-xs">
                  @
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. octocat, torvalds, or your username"
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900 pl-8 pr-3.5 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-950 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-[#1e232b] hover:bg-slate-900 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:border dark:border-zinc-700 text-white font-medium text-xs sm:text-sm py-2.5 px-4 shadow-sm transition-all cursor-pointer disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <UserCheck className="h-4 w-4 text-white" />
              )}
              <span>Continue with GitHub Username</span>
              <ArrowRight className="h-3.5 w-3.5 ml-0.5" />
            </button>
          </form>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: EMAIL & PASSWORD LOGIN / REGISTRATION                             */}
        {/* ========================================================================= */}
        {activeTab === 'email' && (
          <form onSubmit={handleEmailAuth} className="mt-5 space-y-3.5">
            {/* Sign in vs Register Toggle */}
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                {isRegistering ? 'Create New Account' : 'Sign In with Email'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
              >
                {isRegistering ? 'Already have an account? Sign In' : 'Need an account? Register'}
              </button>
            </div>

            {/* Optional Full Name for Register */}
            {isRegistering && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
                  Full Name (Optional)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Turing"
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900 px-3.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-950 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
            )}

            {/* Email Address */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (detectedGithubUser) setDetectedGithubUser(null);
                  }}
                  onBlur={() => checkEmailForGithub(email)}
                  placeholder="developer@example.com"
                  disabled={loading}
                  required
                  className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900 px-3.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-950 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
                {checkingEmail && (
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                  </div>
                )}
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                required
                className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900 px-3.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-950 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>

            {/* Confirm Password for Register */}
            {isRegistering && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                  required
                  className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900 px-3.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-950 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
            )}

            {/* GitHub Account Detected Callout */}
            {/* Requirement: "if their registered email has github acc in it, so then they must connect with their github" */}
            {detectedGithubUser && (
              <div className="p-3 rounded-xl border border-blue-200 dark:border-blue-800/70 bg-blue-50/80 dark:bg-blue-950/40 text-xs text-blue-950 dark:text-blue-100 space-y-2 animate-fade-in">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 fill-blue-600 dark:fill-blue-400 shrink-0" viewBox="0 0 24 24">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    GitHub Account Detected: @{detectedGithubUser.login}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-zinc-300 leading-relaxed">
                  Your registered email is associated with GitHub account <strong>@{detectedGithubUser.login}</strong>. You must connect with your GitHub account to continue.
                </p>
                <button
                  type="button"
                  onClick={() => handleConnectDetectedGitHub(detectedGithubUser.login)}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs py-2 px-3 shadow-xs transition-all cursor-pointer"
                >
                  <svg className="h-3.5 w-3.5 fill-white" viewBox="0 0 24 24">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  <span>Connect GitHub (@{detectedGithubUser.login})</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs sm:text-sm py-2.5 px-4 shadow-sm transition-all cursor-pointer disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <KeyRound className="h-4 w-4 text-white" />
              )}
              <span>{isRegistering ? 'Register & Sign In' : 'Sign In with Email'}</span>
              <ArrowRight className="h-3.5 w-3.5 ml-0.5" />
            </button>
          </form>
        )}

        {/* OAuth Configuration Help Dropdown */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setShowOAuthHelp(!showOAuthHelp)}
            className="text-[11px] text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 flex items-center justify-between w-full font-medium cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span>How to configure 1-Click GitHub OAuth</span>
            </span>
            {showOAuthHelp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {showOAuthHelp && (
            <div className="mt-2.5 p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 text-[11px] text-slate-600 dark:text-zinc-300 space-y-2 leading-relaxed">
              <p>
                To enable 1-Click GitHub OAuth on production, create an OAuth App at{' '}
                <a
                  href="https://github.com/settings/developers"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 dark:text-blue-400 font-semibold underline inline-flex items-center gap-0.5"
                >
                  GitHub Developer Settings <ExternalLink className="h-2.5 w-2.5" />
                </a>{' '}
                and add the following to your environment variables:
              </p>
              <div className="font-mono text-[10px] bg-white dark:bg-zinc-950 p-2 rounded border border-slate-200 dark:border-zinc-800 space-y-1">
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
            <span>Your code remains private and secure.</span>
          </div>
        </div>

        {/* Three Security Points */}
        <div className="mt-4 space-y-2.5 text-xs text-slate-600 dark:text-zinc-400">
          <div className="flex items-center gap-2.5">
            <FolderLock className="h-4 w-4 text-slate-400 dark:text-zinc-500 shrink-0" />
            <span>Read-only access to your public repositories</span>
          </div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 text-slate-400 dark:text-zinc-500 shrink-0" />
            <span>Encrypted token authentication with GitHub</span>
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

      {/* 3. Bottom Trust Line */}
      <div className="mt-6 text-center space-y-2">
        <p className="text-xs text-slate-500 dark:text-zinc-500">
          Built for developers who care about secure and high quality code.
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
