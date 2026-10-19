import React from 'react';

export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="pb-4 border-b border-white/10 space-y-2">
        <div className="h-8 w-60 bg-slate-800 rounded-xl" />
        <div className="h-4 w-96 bg-slate-800/60 rounded-lg" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="glass-panel rounded-2xl p-6 h-56 bg-slate-900/40" />
        ))}
      </div>
    </div>
  );
}
