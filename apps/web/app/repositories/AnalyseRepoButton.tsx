'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { analyseRepositoryAction } from '../actions/repo-actions';

interface AnalyseRepoButtonProps {
  repoId: number;
  repoFullName: string;
  variant?: 'card' | 'compact';
}

export function AnalyseRepoButton({
  repoId,
  repoFullName,
  variant = 'card',
}: AnalyseRepoButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  const handleAnalyse = async () => {
    setLoading(true);
    setStatusText('Initiating AST & LLM surveillance...');

    try {
      const res = await analyseRepositoryAction(repoId);
      if (res.success) {
        setStatusText(`Complete (${res.issuesCount} findings)! Opening analytics...`);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('cyberops:switch-tab', { detail: 'analytics' }));
        }
        router.push(`/repositories/${repoId}?tab=analytics`);
        router.refresh();
        setTimeout(() => {
          setLoading(false);
          setStatusText(null);
        }, 800);
      } else {
        setStatusText(res.error || 'Failed to analyze repository');
        setTimeout(() => {
          setLoading(false);
          setStatusText(null);
        }, 3000);
      }
    } catch (err) {
      setStatusText((err as Error).message || 'Analysis error');
      setTimeout(() => {
        setLoading(false);
        setStatusText(null);
      }, 3000);
    }
  };

  if (variant === 'compact') {
    return (
      <button
        type="button"
        disabled={loading}
        onClick={handleAnalyse}
        className="flex items-center gap-1.5 rounded-xl border border-cyan-500/50 bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-1.5 text-xs font-mono font-bold text-cyan-300 hover:text-white transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer shadow-[0_0_12px_rgba(0,240,255,0.2)]"
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
            <span>{statusText || 'Analyzing...'}</span>
          </>
        ) : (
          <>
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            <span>Analyse Repository</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={handleAnalyse}
      className="w-full flex items-center justify-center gap-2 rounded-xl border border-cyan-500/50 bg-gradient-to-r from-cyan-500/20 via-cyan-500/10 to-teal-500/20 hover:from-cyan-500/30 hover:to-teal-500/30 py-2.5 px-3 text-xs font-mono font-bold text-cyan-300 hover:text-white transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.2)] group"
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
          <span className="truncate">{statusText || 'Analyzing Repository...'}</span>
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4 text-cyan-400 group-hover:rotate-12 transition-transform" />
          <span>Analyse Repository</span>
          <ArrowRight className="h-3.5 w-3.5 ml-auto opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-cyan-400" />
        </>
      )}
    </button>
  );
}
