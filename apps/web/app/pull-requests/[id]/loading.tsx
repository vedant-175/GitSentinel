import React from 'react';

export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-4 w-32 bg-slate-800 rounded" />
        <div className="glass-panel rounded-2xl p-6 space-y-3">
          <div className="flex gap-2">
            <div className="h-5 w-24 bg-slate-800 rounded-full" />
            <div className="h-5 w-12 bg-slate-800 rounded-full" />
          </div>
          <div className="h-8 w-3/4 bg-slate-800/80 rounded-xl" />
          <div className="h-4 w-60 bg-slate-800/40 rounded" />
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 p-6 h-28 bg-slate-900/40" />

      <div className="space-y-4 pt-2">
        <div className="h-6 w-48 bg-slate-800 rounded" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="glass-panel rounded-2xl p-5 h-44 bg-slate-900/40" />
        ))}
      </div>
    </div>
  );
}
