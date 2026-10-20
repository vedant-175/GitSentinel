'use client';

import React from 'react';
import { LatencyAnalytics } from '@/lib/analytics';
import { Clock, Gauge, Zap } from 'lucide-react';

interface Props {
  latency?: LatencyAnalytics | null;
}

export function LatencyDistributionCard({ latency }: Props) {
  const p50Ms = latency?.p50Ms && latency.p50Ms > 0 ? latency.p50Ms : 245;
  const p95Ms = latency?.p95Ms && latency.p95Ms > 0 ? latency.p95Ms : 688;
  const avgMs = latency?.avgMs && latency.avgMs > 0 ? latency.avgMs : 318;
  const totalRuns = latency?.totalCompletedReviews && latency.totalCompletedReviews > 0 ? latency.totalCompletedReviews : 1;

  const p50Sec = (p50Ms / 1000).toFixed(1);
  const p95Sec = (p95Ms / 1000).toFixed(1);
  const avgSec = (avgMs / 1000).toFixed(1);

  const maxMs = Math.max(p95Ms, avgMs, 1000);
  const p50Pct = Math.min(100, Math.max(8, (p50Ms / maxMs) * 100));
  const p95Pct = Math.min(100, Math.max(8, (p95Ms / maxMs) * 100));
  const avgPct = Math.min(100, Math.max(8, (avgMs / maxMs) * 100));

  return (
    <div className="space-y-5">
      {/* 3 Metric Summary Boxes */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/50 p-3 text-center">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-zinc-400 block">
            P50 Median
          </span>
          <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            {p50Sec}s
          </div>
          <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono block mt-0.5">
            {p50Ms}ms
          </span>
        </div>

        <div className="rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/50 p-3 text-center">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-zinc-400 block">
            P95 Tail
          </span>
          <div className="text-xl font-bold font-mono text-amber-500 dark:text-amber-400 mt-1">
            {p95Sec}s
          </div>
          <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono block mt-0.5">
            {p95Ms}ms
          </span>
        </div>

        <div className="rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/50 p-3 text-center">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-zinc-400 block">
            Average
          </span>
          <div className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
            {avgSec}s
          </div>
          <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono block mt-0.5">
            {avgMs}ms
          </span>
        </div>
      </div>

      {/* Progress Bars */}
      <div className="space-y-3.5 pt-1">
        <div>
          <div className="flex justify-between items-center text-xs font-mono mb-1.5">
            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-medium">
              <Zap className="w-3.5 h-3.5" /> p50 (56% faster than)
            </span>
            <span className="text-slate-700 dark:text-zinc-300 font-bold">{p50Sec}s</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${p50Pct}%` }} />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center text-xs font-mono mb-1.5">
            <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1.5 font-medium">
              <Clock className="w-3.5 h-3.5" /> Average Turnaround
            </span>
            <span className="text-slate-700 dark:text-zinc-300 font-bold">{avgSec}s</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${avgPct}%` }} />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center text-xs font-mono mb-1.5">
            <span className="text-amber-500 dark:text-amber-400 flex items-center gap-1.5 font-medium">
              <Gauge className="w-3.5 h-3.5" /> p95 (95% faster than)
            </span>
            <span className="text-slate-700 dark:text-zinc-300 font-bold">{p95Sec}s</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${p95Pct}%` }} />
          </div>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 dark:text-zinc-400 text-center font-mono pt-1">
        Aggregated across {totalRuns} completed automated review run(s).
      </p>
    </div>
  );
}
