'use client';

import { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, Check, Copy, Code2 } from 'lucide-react';

interface IssueProps {
  filePath: string;
  lineNumber: number | null;
  severity: string;
  category: string;
  message: string;
  suggestedFix?: string | null;
  source?: string;
  certainty?: string;
  reasoning?: string;
  evidence?: string;
  traceablePath?: any;
}

export function DiffIssueCard({
  filePath,
  lineNumber,
  severity,
  category,
  message,
  suggestedFix,
  source,
  certainty,
  reasoning,
  evidence,
  traceablePath,
}: IssueProps) {
  const [copied, setCopied] = useState(false);

  const isCritical = severity.toLowerCase() === 'critical';
  const isWarning = severity.toLowerCase() === 'warning';

  const badgeColor = isCritical
    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
    : isWarning
    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    : 'bg-blue-500/10 text-blue-400 border-blue-500/20';

  const Icon = isCritical ? AlertCircle : isWarning ? AlertTriangle : Info;

  async function handleCopy() {
    if (suggestedFix) {
      await navigator.clipboard.writeText(suggestedFix);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 shadow-sm hover:border-white/20 transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider border ${badgeColor}`}
          >
            <Icon className="h-3 w-3" />
            {severity}
          </span>
          <span className="rounded-md bg-white/5 px-2 py-0.5 text-xs font-medium text-slate-300 uppercase tracking-wider">
            {category}
          </span>
          {certainty && (
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider border ${
                certainty === 'confirmed'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : certainty === 'probable'
                  ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}
            >
              {certainty}
            </span>
          )}
          {source === 'static_analysis' && (
            <span className="rounded-md bg-purple-500/10 px-2 py-0.5 text-[11px] font-medium text-purple-300 border border-purple-500/20">
              Deterministic Static Check
            </span>
          )}
          {source === 'hybrid' && (
            <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-300 border border-indigo-500/20">
              Hybrid Corroborated
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 font-mono text-xs text-slate-400">
          <span className="text-slate-200 font-semibold">{filePath}</span>
          {lineNumber && (
            <span className="rounded bg-black/40 px-1.5 py-0.5 text-indigo-400 border border-indigo-500/20">
              :{lineNumber}
            </span>
          )}
        </div>
      </div>

      {/* Message */}
      <p className="pt-3 text-sm text-slate-200 leading-relaxed">{message}</p>

      {/* Technical Evidence & Reasoning */}
      {(evidence || reasoning) && (
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
          {evidence && (
            <div className="rounded-lg bg-black/40 border border-white/5 p-2.5 font-mono text-slate-300">
              <span className="text-[10px] uppercase font-bold text-cyan-400 block mb-1">Code Evidence</span>
              <span className="text-slate-300">{evidence}</span>
            </div>
          )}
          {reasoning && (
            <div className="rounded-lg bg-black/40 border border-white/5 p-2.5 text-slate-300">
              <span className="text-[10px] uppercase font-bold text-indigo-400 block mb-1">Reasoning</span>
              <p className="text-slate-300 leading-normal">{reasoning}</p>
            </div>
          )}
        </div>
      )}

      {/* Suggested Fix */}
      {suggestedFix && (
        <div className="mt-3 overflow-hidden rounded-lg border border-emerald-500/20 bg-emerald-950/20">
          <div className="flex items-center justify-between bg-emerald-900/20 px-3 py-1.5 border-b border-emerald-500/20">
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
              <Code2 className="h-3.5 w-3.5" />
              Suggested Replacement
            </span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-[11px] text-emerald-300 hover:text-white transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> Copy
                </>
              )}
            </button>
          </div>
          <pre className="p-3 font-mono text-xs text-emerald-200/90 overflow-x-auto whitespace-pre">
            {suggestedFix}
          </pre>
        </div>
      )}

      {/* Verified Traceable Path */}
      {traceablePath && (
        <div className="mt-2.5 flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
          <span className="text-cyan-400">audit trail:</span>
          <span>diff → evidence → reasoning → classification → severity → remediation</span>
        </div>
      )}
    </div>
  );
}
