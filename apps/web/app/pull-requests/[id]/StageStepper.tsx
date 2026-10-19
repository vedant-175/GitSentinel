'use client';

import React from 'react';
import {
  Clock,
  Download,
  Terminal,
  Cpu,
  Sparkles,
  CheckCircle2,
  Send,
  AlertCircle,
  Loader2,
} from 'lucide-react';

export const REVIEW_STAGES = [
  { key: 'QUEUED', label: 'Queued', icon: Clock, desc: 'Job queued in BullMQ' },
  { key: 'FETCHING DIFF', label: 'Fetching Diff', icon: Download, desc: 'Loading PR changes & AST' },
  { key: 'STATIC ANALYSIS', label: 'Static Analysis', icon: Terminal, desc: 'ESLint, Bandit & Regex' },
  { key: 'CONTEXT BUILDING', label: 'Context Building', icon: Cpu, desc: 'Token budgeting & chunks' },
  { key: 'AI ANALYSIS', label: 'AI Analysis', icon: Sparkles, desc: 'Deep model semantic scan' },
  { key: 'VALIDATING', label: 'Validating', icon: CheckCircle2, desc: 'Deduplicating & re-review' },
  { key: 'POSTING', label: 'Posting', icon: Send, desc: 'Publishing Check & Comments' },
  { key: 'COMPLETED', label: 'Completed', icon: CheckCircle2, desc: 'Review lifecycle finished' },
] as const;

interface StageStepperProps {
  currentStage?: string | null;
  status?: string;
  isPartial?: boolean;
}

export function StageStepper({ currentStage, status, isPartial }: StageStepperProps) {
  const normalizedStage = (currentStage || (status === 'completed' ? 'COMPLETED' : 'QUEUED')).toUpperCase();
  const isFailed = status === 'failed';
  const isSuperseded = status === 'superseded';

  // Find index of current stage
  let activeIndex = REVIEW_STAGES.findIndex((s) => s.key === normalizedStage);
  if (activeIndex === -1) {
    activeIndex = status === 'completed' ? REVIEW_STAGES.length - 1 : 0;
  }

  return (
    <div
      role="region"
      aria-label="Real-time Review Execution Progress"
      className="rounded-2xl border border-[#172338] bg-[#0b1019] p-4 shadow-lg"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            {!isFailed && !isSuperseded && status !== 'completed' && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isFailed
                  ? 'bg-rose-500'
                  : isSuperseded
                  ? 'bg-amber-400'
                  : status === 'completed'
                  ? 'bg-emerald-400'
                  : 'bg-cyan-400'
              }`}
            />
          </span>
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
            Real Review Progress
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {isPartial && (
            <span className="rounded bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-400">
              PARTIAL REVIEW
            </span>
          )}
          <span
            role="status"
            aria-live="polite"
            className={`rounded-md px-2 py-0.5 text-[10px] font-mono font-bold uppercase ${
              isFailed
                ? 'bg-rose-500/20 border border-rose-500/30 text-rose-400'
                : isSuperseded
                ? 'bg-amber-500/20 border border-amber-500/30 text-amber-400'
                : status === 'completed'
                ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
                : 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-400'
            }`}
          >
            {isFailed
              ? 'EXECUTION FAILED'
              : isSuperseded
              ? 'SUPERSEDED BY NEW COMMIT'
              : normalizedStage}
          </span>
        </div>
      </div>

      {/* Progress Timeline Stepper */}
      <ol
        className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 pt-1 list-none p-0 m-0"
        aria-label="Progress Steps"
      >
        {REVIEW_STAGES.map((stage, idx) => {
          const isPast = idx < activeIndex || status === 'completed';
          const isCurrent = idx === activeIndex && status !== 'completed' && !isFailed;
          const isStepFailed = isFailed && idx === activeIndex;
          const Icon = stage.icon;

          return (
            <li
              key={stage.key}
              aria-current={isCurrent ? 'step' : undefined}
              className={`rounded-xl border p-2 flex flex-col justify-between transition-all ${
                isStepFailed
                  ? 'border-rose-500/40 bg-rose-950/20 text-rose-400'
                  : isPast
                  ? 'border-emerald-500/30 bg-emerald-950/15 text-emerald-400'
                  : isCurrent
                  ? 'border-cyan-500/50 bg-cyan-950/25 text-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.15)] ring-1 ring-cyan-500/30'
                  : 'border-[#172338] bg-[#06090e]/60 text-slate-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono font-bold text-slate-400">
                  0{idx + 1}
                </span>
                {isStepFailed ? (
                  <AlertCircle className="h-3.5 w-3.5 text-rose-400" aria-label="Failed" />
                ) : isPast ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-label="Completed" />
                ) : isCurrent ? (
                  <Loader2 className="h-3.5 w-3.5 text-cyan-400 animate-spin" aria-label="In Progress" />
                ) : (
                  <Icon className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
                )}
              </div>

              <div className="mt-2">
                <div
                  className={`text-[11px] font-mono font-bold leading-tight ${
                    isStepFailed
                      ? 'text-rose-300'
                      : isPast
                      ? 'text-white'
                      : isCurrent
                      ? 'text-cyan-300'
                      : 'text-slate-400'
                  }`}
                >
                  {stage.label}
                </div>
                <div className="text-[9px] text-slate-400 font-sans mt-0.5 truncate hidden sm:block">
                  {stage.desc}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
