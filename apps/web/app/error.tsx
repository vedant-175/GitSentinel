'use client';

import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full p-8 rounded-2xl border border-rose-200 dark:border-rose-500/20 bg-rose-50/50 dark:bg-rose-950/10 shadow-xs space-y-4">
        <div className="p-3 mx-auto w-fit rounded-2xl bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30">
          <AlertCircle className="w-8 h-8" />
        </div>

        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Dashboard Encountered an Error</h2>
        <p className="text-xs text-rose-700 dark:text-rose-300/80 font-mono bg-white dark:bg-black/40 p-3 rounded-xl border border-rose-200 dark:border-white/5 break-words">
          {error.message || 'An unexpected runtime error occurred'}
        </p>

        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white transition-all cursor-pointer shadow-xs"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reload Dashboard
        </button>
      </div>
    </div>
  );
}
