import React from 'react';

export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header skeleton */}
      <div className="pb-4 border-b border-white/10 space-y-2">
        <div className="h-8 w-64 bg-slate-800 rounded-xl" />
        <div className="h-4 w-96 bg-slate-800/60 rounded-lg" />
      </div>

      {/* KPI Cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="glass-panel rounded-2xl p-5 space-y-3">
            <div className="h-3 w-28 bg-slate-800 rounded" />
            <div className="h-8 w-20 bg-slate-800/80 rounded-lg" />
            <div className="h-3 w-36 bg-slate-800/40 rounded" />
          </div>
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-6 h-72 bg-slate-900/40" />
        <div className="glass-panel rounded-2xl p-6 h-72 bg-slate-900/40" />
      </div>

      {/* Table skeleton */}
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="h-5 w-48 bg-slate-800 rounded" />
        <div className="space-y-3 pt-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 w-full bg-slate-800/40 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
