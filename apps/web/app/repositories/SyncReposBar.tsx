'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import { syncUserReposAction } from '../actions/repo-actions';

interface SyncReposBarProps {
  currentUserLogin?: string;
  totalReposCount: number;
}

export function SyncReposBar({ currentUserLogin, totalReposCount }: SyncReposBarProps) {
  const router = useRouter();
  const [targetUsername, setTargetUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSync = async (usernameToSync?: string) => {
    const user = (usernameToSync || targetUsername || currentUserLogin || '').trim();
    if (!user) {
      setFeedback({ type: 'error', message: 'Please enter a GitHub username to synchronize' });
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const res = await syncUserReposAction(user);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Successfully synchronized ${res.reposCount ?? 0} repositories for '${res.login || user}'!`,
        });
        setTargetUsername('');
        router.refresh();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || `Could not find or synchronize repositories for '${user}'.`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: (err as Error).message || 'Failed to communicate with GitHub API.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 font-mono">
      {/* Action Bar */}
      <div className="rounded-2xl border border-[#172338] bg-[#0b1019] p-3 shadow-lg flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left: Quick Sync Button for current logged-in account */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSync(currentUserLogin)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.15)]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Synchronizing...' : `Sync Repositories (${currentUserLogin || 'Active Account'})`}</span>
          </button>
        </div>

        {/* Right: Search / Import ANY GitHub Account */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSync();
          }}
          className="flex items-center gap-2 w-full md:w-auto"
        >
          <div className="relative flex-1 md:w-72">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-500">
              <Search className="h-3.5 w-3.5 text-cyan-400" />
            </div>
            <input
              type="text"
              value={targetUsername}
              onChange={(e) => setTargetUsername(e.target.value)}
              placeholder="Import any GitHub user (e.g. octocat, torvalds)"
              className="w-full rounded-xl border border-[#172338] bg-[#06090e] pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !targetUsername.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black text-xs font-bold transition-all disabled:opacity-40 cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.3)] shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Import</span>
          </button>
        </form>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`rounded-xl border p-2.5 text-xs flex items-center gap-2 animate-fade-in ${
            feedback.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
}
