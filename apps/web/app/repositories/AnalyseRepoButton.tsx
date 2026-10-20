'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { analyseRepositoryAction } from '../actions/repo-actions';

interface AnalyseRepoButtonProps {
  repoId: number;
  repoFullName: string;
  variant?: 'card' | 'compact' | 'primary';
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
    setStatusText('Analyzing repo...');

    try {
      const res = await analyseRepositoryAction(repoId, repoFullName);
      if (res.success) {
        setStatusText(`Complete (${res.issuesCount} findings)!`);
        router.push(`/repositories/${repoId}`);
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

  if (variant === 'compact' || variant === 'primary') {
    return (
      <button
        type="button"
        disabled={loading}
        onClick={handleAnalyse}
        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] px-4 py-2 text-xs sm:text-sm font-medium text-white shadow-xs transition-all cursor-pointer disabled:opacity-60 shrink-0"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-white" />
            <span className="font-mono text-xs">{statusText || 'Analyzing...'}</span>
          </>
        ) : (
          <>
            <Play className="h-3.5 w-3.5 fill-current" />
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
      className="w-full flex items-center justify-center gap-2 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 py-2.5 px-3 text-xs font-semibold text-blue-700 dark:text-blue-300 transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer shadow-xs group"
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
          <span className="truncate">{statusText || 'Analyzing Repository...'}</span>
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400 group-hover:rotate-12 transition-transform" />
          <span>Analyse Repository</span>
          <ArrowRight className="h-3.5 w-3.5 ml-auto opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-blue-600 dark:text-blue-400" />
        </>
      )}
    </button>
  );
}
