'use client';

import React from 'react';
import { LatencyAnalytics } from '@/lib/analytics';
import { Clock, Gauge, Zap } from 'lucide-react';

interface Props {
  latency: LatencyAnalytics;
}

export function LatencyDistributionCard({ latency }: Props) {
  if (!latency || latency.totalCompletedReviews === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-white/10 rounded-2xl bg-slate-900/30">
        <Clock className="w-8 h-8 text-slate-600 mb-2" />
        <p className="text-sm font-medium text-slate-300">No Review Latency Telemetry</p>
        <p className="text-xs text-slate-500 mt-1">
          Latency percentiles (p50 and p95) will appear once automated reviews complete.
        </p>
      </div>
    );
  }

  const p50Sec = (latency.p50Ms / 1000).toFixed(1);
  const p95Sec = (latency.p95Ms / 1000).toFixed(1);
  const avgSec = (latency.avgMs / 1000).toFixed(1);
  const maxMs = Math.max(latency.p95Ms, latency.avgMs, 1000);

  const p50Pct = Math.min(100, Math.max(5, (latency.p50Ms / maxMs) * 100));
  const p95Pct = Math.min(100, Math.max(5, (latency.p95Ms / maxMs) * 100));
  const avgPct = Math.min(100, Math.max(5, (latency.avgMs / maxMs) * 100));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">p50 Median</span>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-1">{p50Sec}s</div>
          <span className="text-[10px] text-slate-500 font-mono">{latency.p50Ms}ms</span>
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">p95 Tail</span>
          <div className="text-xl font-bold font-mono text-amber-400 mt-1">{p95Sec}s</div>
          <span className="text-[10px] text-slate-500 font-mono">{latency.p95Ms}ms</span>
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Average</span>
          <div className="text-xl font-bold font-mono text-indigo-400 mt-1">{avgSec}s</div>
          <span className="text-[10px] text-slate-500 font-mono">{latency.avgMs}ms</span>
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <div>
          <div className="flex justify-between text-xs font-mono mb-1">
            <span className="text-emerald-400 flex items-center gap-1">
              <Zap className="w-3 h-3" /> p50 (50% faster than)
            </span>
            <span className="text-slate-300">{p50Sec}s</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${p50Pct}%` }} />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs font-mono mb-1">
            <span className="text-indigo-400 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Average Turnaround
            </span>
            <span className="text-slate-300">{avgSec}s</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${avgPct}%` }} />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs font-mono mb-1">
            <span className="text-amber-400 flex items-center gap-1">
              <Gauge className="w-3 h-3" /> p95 (95% faster than)
            </span>
            <span className="text-slate-300">{p95Sec}s</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${p95Pct}%` }} />
          </div>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 text-center font-mono">
        Aggregated across {latency.totalCompletedReviews} completed automated review run(s).
      </p>
    </div>
  );
}
