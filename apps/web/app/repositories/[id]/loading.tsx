import React from 'react';

export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="space-y-2">
        <div className="h-4 w-32 bg-slate-800 rounded" />
        <div className="pb-4 border-b border-white/10 flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-8 w-72 bg-slate-800 rounded-xl" />
            <div className="h-4 w-96 bg-slate-800/60 rounded" />
          </div>
          <div className="h-10 w-28 bg-slate-800 rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="glass-panel rounded-2xl p-5 h-28 bg-slate-900/40" />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-6 h-80 bg-slate-900/40" />
        <div className="glass-panel rounded-2xl p-6 h-80 bg-slate-900/40" />
      </div>

      <div className="glass-panel rounded-2xl p-6 h-64 bg-slate-900/40" />
    </div>
  );
}
