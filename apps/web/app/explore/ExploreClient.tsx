'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import {
  Search,
  FolderGit2,
  Star,
  GitFork,
  ExternalLink,
  Shield,
  ArrowRight,
  Loader2,
  AlertCircle,
  GitBranch,
} from 'lucide-react';

interface RepoData {
  id: number;
  name: string;
  fullName: string;
  description: string;
  defaultBranch: string;
  stars: number;
  forks: number;
  language: string;
  htmlUrl: string;
  updatedAt: string;
  isPrivate: boolean;
  openIssuesCount: number;
}

interface UserProfile {
  login: string;
  name: string;
  avatarUrl: string;
  bio: string;
  publicRepos: number;
  htmlUrl: string;
}

const SAMPLE_USERS = ['octocat', 'torvalds', 'vercel', 'facebook'];

export function ExploreClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialUsername = searchParams.get('username') || searchParams.get('q') || '';

  const [usernameInput, setUsernameInput] = useState(initialUsername);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [repositories, setRepositories] = useState<RepoData[]>([]);
  const [repoFilter, setRepoFilter] = useState('');

  const fetchRepositories = async (targetUsername: string) => {
    const clean = targetUsername.trim().replace(/^@/, '');
    if (!clean) return;

    setLoading(true);
    setErrorMsg(null);
    setUserProfile(null);
    setRepositories([]);

    try {
      const res = await fetch(`/api/explore?username=${encodeURIComponent(clean)}`);
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to inspect public repositories.');
        return;
      }

      setUserProfile(data.user);
      setRepositories(data.repos || []);
    } catch (err: any) {
      console.error('Failed to explore repositories:', err);
      setErrorMsg('Could not connect to repository service. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialUsername) {
      setUsernameInput(initialUsername);
      fetchRepositories(initialUsername);
    }
  }, [initialUsername]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = usernameInput.trim().replace(/^@/, '');
    if (!clean) return;
    router.push(`/explore?username=${encodeURIComponent(clean)}`);
    fetchRepositories(clean);
  };

  const handleSelectSample = (sample: string) => {
    setUsernameInput(sample);
    router.push(`/explore?username=${encodeURIComponent(sample)}`);
    fetchRepositories(sample);
  };

  const filteredRepos = repositories.filter((repo) => {
    if (!repoFilter) return true;
    const q = repoFilter.toLowerCase();
    return (
      repo.name.toLowerCase().includes(q) ||
      repo.description.toLowerCase().includes(q) ||
      repo.language.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto w-full space-y-8 px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* 1. Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-900/60">
              <FolderGit2 className="h-3 w-3" />
              Public Preview
            </span>
            <span className="text-xs text-slate-400 dark:text-zinc-500">•</span>
            <span className="text-xs text-slate-500 dark:text-zinc-400">No account required</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Explore Public Repositories
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-1">
            Discover publicly accessible GitHub repositories and preview source code structure.
          </p>
        </div>

        {/* Primary Sign In CTA */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => signIn('github', { callbackUrl: '/repositories' })}
            className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-xs sm:text-sm py-2 px-4 shadow-sm transition-all cursor-pointer"
          >
            <svg className="h-4 w-4 fill-white" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span>Continue with GitHub</span>
            <ArrowRight className="h-3.5 w-3.5 ml-0.5" />
          </button>
        </div>
      </div>

      {/* 2. Security & Scope Clarification Banner */}
      <div className="rounded-2xl border border-blue-200/90 dark:border-blue-900/50 bg-gradient-to-r from-blue-50/70 via-blue-50/40 to-transparent dark:from-blue-950/30 dark:via-blue-950/10 dark:to-transparent p-4 sm:p-5 text-xs text-slate-700 dark:text-zinc-300">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-xl bg-blue-600/10 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <span className="font-bold text-slate-900 dark:text-white block sm:inline">
                Anonymous Read-Only Access
              </span>
              <span className="sm:ml-1 text-slate-600 dark:text-zinc-400">
                Exploring public repositories does not create an authenticated session or grant access to private repositories.
                To enable autonomous AI code reviews, pull-request security gates, or manage private repositories, connect your GitHub account.
              </span>
            </div>
          </div>
          <Link
            href="/login"
            className="self-start sm:self-auto shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            <span>Learn more about permissions</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* 3. Search Bar Form */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 sm:p-6 shadow-sm">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-zinc-500 font-mono text-sm">
                @
              </div>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="Enter any GitHub username or organization (e.g. octocat, torvalds, vercel)"
                disabled={loading}
                className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900 pl-9 pr-4 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-950 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !usernameInput.trim()}
              className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-black dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white font-medium text-xs sm:text-sm py-2.5 px-5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <Search className="h-4 w-4 text-white" />
              )}
              <span>Explore</span>
            </button>
          </div>

          {/* Quick Sample Suggestions */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-500 dark:text-zinc-400">
            <span className="font-medium text-[11px]">Popular to explore:</span>
            {SAMPLE_USERS.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => handleSelectSample(sample)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200/80 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 hover:bg-slate-100 dark:hover:bg-zinc-800 text-[11px] font-mono text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
              >
                <span>@{sample}</span>
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* 4. Error Message */}
      {errorMsg && (
        <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 text-xs sm:text-sm text-rose-900 dark:text-rose-200 flex items-start gap-3 animate-fade-in">
          <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">{errorMsg}</p>
            <p className="text-xs text-rose-700 dark:text-rose-300">
              Please verify the GitHub username exists on github.com or sign in with your GitHub account to access private repositories.
            </p>
          </div>
        </div>
      )}

      {/* 5. User Profile Card & Search within Repositories */}
      {userProfile && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={userProfile.avatarUrl}
                alt={userProfile.login}
                className="h-14 w-14 rounded-2xl border border-slate-200 dark:border-zinc-800 object-cover shadow-xs"
              />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                    {userProfile.name}
                  </h2>
                  <span className="text-xs text-slate-400 dark:text-zinc-500 font-mono">
                    @{userProfile.login}
                  </span>
                </div>
                {userProfile.bio && (
                  <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1 max-w-xl line-clamp-2">
                    {userProfile.bio}
                  </p>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 dark:text-zinc-400">
                  <span>
                    <strong className="text-slate-900 dark:text-white font-semibold">
                      {repositories.length}
                    </strong>{' '}
                    public repositories loaded
                  </span>
                  <span>•</span>
                  <a
                    href={userProfile.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <span>View on GitHub</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>

            <div className="w-full sm:w-auto">
              <input
                type="text"
                value={repoFilter}
                onChange={(e) => setRepoFilter(e.target.value)}
                placeholder="Filter repositories..."
                className="w-full sm:w-64 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-950 focus:border-blue-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          {/* 6. Repository Grid */}
          {filteredRepos.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRepos.map((repo) => (
                <div
                  key={repo.id}
                  className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-xs hover:border-slate-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FolderGit2 className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        <a
                          href={repo.htmlUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-bold text-sm text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate"
                          title={repo.name}
                        >
                          {repo.name}
                        </a>
                      </div>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 shrink-0">
                        Public
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-2 leading-relaxed min-h-[32px]">
                      {repo.description}
                    </p>
                  </div>

                  <div className="pt-4 mt-3 border-t border-slate-100 dark:border-zinc-900 flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
                    <div className="flex items-center gap-3">
                      {repo.language && (
                        <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-zinc-300 text-[11px]">
                          <span className="h-2 w-2 rounded-full bg-blue-500" />
                          {repo.language}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[11px]">
                        <Star className="h-3.5 w-3.5 text-amber-500" />
                        {repo.stars}
                      </span>
                      <span className="flex items-center gap-1 text-[11px]">
                        <GitFork className="h-3.5 w-3.5" />
                        {repo.forks}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 font-mono text-[11px]">
                      <GitBranch className="h-3 w-3 text-slate-400" />
                      <span>{repo.defaultBranch}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800 p-8 space-y-2">
              <FolderGit2 className="h-8 w-8 text-slate-400 dark:text-zinc-600 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                No matching public repositories found
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {repoFilter ? 'Try clearing your filter query.' : 'This GitHub user does not currently have any public repositories.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 7. Initial Empty State Guide */}
      {!userProfile && !loading && !errorMsg && (
        <div className="rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-8 text-center space-y-4">
          <div className="h-12 w-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto border border-blue-100 dark:border-blue-900/40">
            <Search className="h-6 w-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Inspect any GitHub user or organization
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Enter a GitHub handle above to discover public projects. No credentials or authentication required.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
