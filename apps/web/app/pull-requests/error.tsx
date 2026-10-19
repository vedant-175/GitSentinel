'use client';

import React from 'react';
import Link from 'next/link';
import { AlertCircle, RotateCcw, ArrowLeft } from 'lucide-react';

export default function PullRequestsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="glass-panel max-w-md w-full p-8 rounded-2xl border border-rose-500/20 bg-rose-950/10 space-y-4">
        <div className="p-3 mx-auto w-fit rounded-2xl bg-rose-500/20 text-rose-400">
          <AlertCircle className="w-8 h-8" />
        </div>

        <h2 className="text-lg font-bold text-white">Failed to Load Pull Requests</h2>
        <p className="text-xs text-rose-300/80 font-mono bg-black/40 p-3 rounded-xl border border-white/5 break-words">
          {error.message || 'Unable to fetch pull request review list.'}
        </p>

        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Retry
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
