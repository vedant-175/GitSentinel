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
      className="rounded-2xl border border-slate-200 dark:border-[#172338] bg-white dark:bg-[#0b1019] p-4 shadow-xs dark:shadow-lg transition-all"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            {!isFailed && !isSuperseded && status !== 'completed' && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isFailed
                  ? 'bg-rose-500'
                  : isSuperseded
                  ? 'bg-amber-500'
                  : 'bg-blue-600 dark:bg-blue-400'
              }`}
            />
          </span>
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            REAL REVIEW PROGRESS
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {isPartial && (
            <span className="rounded bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-700 dark:text-amber-400">
              PARTIAL REVIEW
            </span>
          )}
          <span
            role="status"
            aria-live="polite"
            className={`rounded-md px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase ${
              isFailed
                ? 'bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-300'
                : isSuperseded
                ? 'bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-500/40 text-amber-700 dark:text-amber-400'
                : 'bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-500/40 text-blue-700 dark:text-blue-300'
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
              className={`rounded-xl border p-2.5 flex flex-col justify-between transition-all shadow-xs ${
                isStepFailed
                  ? 'border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400'
                  : isPast
                  ? 'border-slate-200 dark:border-[#172338] bg-slate-50 dark:bg-[#06090e] hover:border-blue-300 dark:hover:border-blue-500/30 text-blue-600 dark:text-blue-400'
                  : isCurrent
                  ? 'border-blue-300 dark:border-blue-500/50 bg-blue-50 dark:bg-blue-950/25 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/30'
                  : 'border-slate-200 dark:border-[#172338] bg-white dark:bg-[#06090e]/60 text-slate-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
                  0{idx + 1}
                </span>
                {isStepFailed ? (
                  <AlertCircle className="h-3.5 w-3.5 text-rose-500 dark:text-rose-400" aria-label="Failed" />
                ) : isPast ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-label="Completed" />
                ) : isCurrent ? (
                  <Loader2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 animate-spin" aria-label="In Progress" />
                ) : (
                  <Icon className="h-3.5 w-3.5 text-slate-400 dark:text-slate-600" aria-hidden="true" />
                )}
              </div>

              <div className="mt-2">
                <div
                  className={`text-[11px] font-mono font-bold leading-tight ${
                    isStepFailed
                      ? 'text-rose-600 dark:text-rose-300'
                      : isPast
                      ? 'text-slate-900 dark:text-white'
                      : isCurrent
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {stage.label}
                </div>
                <div className="text-[9px] text-slate-500 dark:text-slate-400 font-sans mt-0.5 truncate hidden sm:block">
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
