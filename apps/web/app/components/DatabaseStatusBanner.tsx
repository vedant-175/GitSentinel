'use client';

import { useState } from 'react';
import { Database, AlertCircle, X } from 'lucide-react';

interface Props {
  isFallback: boolean;
}

export function DatabaseStatusBanner({ isFallback }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (!isFallback || dismissed) {
    return null;
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-950/30 p-3.5 text-xs text-amber-200 backdrop-blur-md flex items-center justify-between gap-3 shadow-lg">
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
          <Database className="h-4 w-4" />
        </div>
        <div>
          <span className="font-semibold text-amber-300">Offline Demo Mode:</span>{' '}
          PostgreSQL connection offline or credentials invalid. Displaying cached demo telemetry and review data. To connect a live database, start Docker (<code>docker compose up -d</code>) or update <code>DATABASE_URL</code> in <code>.env</code>.
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-400 hover:text-white transition-colors p-1"
        title="Dismiss notice"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
