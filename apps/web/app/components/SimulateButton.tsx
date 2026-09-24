'use client';

import { useState } from 'react';
import { Play, Loader2, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function SimulateButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function handleSimulate() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/simulate', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage(`PR #${data.prNumber} enqueued for review!`);
        router.refresh();
      } else {
        setMessage('Simulation failed');
      }
    } catch {
      setMessage('Network error triggering simulation');
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 4000);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20 animate-fade-in">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {message}
        </span>
      )}
      <button
        onClick={handleSimulate}
        disabled={loading}
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-60 transition-all hover:scale-[1.02] active:scale-[0.98]"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Enqueuing...
          </>
        ) : (
          <>
            <Play className="h-4 w-4 fill-current" />
            Simulate PR Review
          </>
        )}
      </button>
    </div>
  );
}
