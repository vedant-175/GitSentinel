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
      <div className="glass-panel max-w-md w-full p-8 rounded-2xl border border-rose-500/20 bg-rose-950/10 space-y-4">
        <div className="p-3 mx-auto w-fit rounded-2xl bg-rose-500/20 text-rose-400">
          <AlertCircle className="w-8 h-8" />
        </div>

        <h2 className="text-lg font-bold text-white">Dashboard Encountered an Error</h2>
        <p className="text-xs text-rose-300/80 font-mono bg-black/40 p-3 rounded-xl border border-white/5 break-words">
          {error.message || 'An unexpected runtime error occurred'}
        </p>

        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all cursor-pointer shadow-lg"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reload Dashboard
        </button>
      </div>
    </div>
  );
}
