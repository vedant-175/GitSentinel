'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileCode, BarChart3 } from 'lucide-react';

interface RepoViewTabsProps {
  initialTab?: string;
  codebaseContent: React.ReactNode;
  analyticsContent: React.ReactNode;
  issuesCount: number;
  healthScore: number;
}

export function RepoViewTabs({
  initialTab = 'analytics',
  codebaseContent,
  analyticsContent,
  issuesCount,
  healthScore,
}: RepoViewTabsProps) {
  const searchParams = useSearchParams();
  const urlTab = searchParams ? searchParams.get('tab') : null;
  const resolvedTab: 'codebase' | 'analytics' =
    urlTab === 'codebase' ? 'codebase' : urlTab === 'analytics' ? 'analytics' : initialTab === 'codebase' ? 'codebase' : 'analytics';
  const [activeTab, setActiveTab] = useState<'codebase' | 'analytics'>(resolvedTab);

  const handleTabChange = (tab: 'codebase' | 'analytics') => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState(null, '', url.toString());
    }
  };

  useEffect(() => {
    if (urlTab === 'analytics' || urlTab === 'codebase') {
      setActiveTab(urlTab);
    }
  }, [urlTab]);

  useEffect(() => {
    const handleSwitch = (e: any) => {
      if (e.detail === 'codebase' || e.detail === 'analytics') {
        setActiveTab(e.detail);
      }
    };
    window.addEventListener('cyberops:switch-tab', handleSwitch);
    return () => window.removeEventListener('cyberops:switch-tab', handleSwitch);
  }, []);

  return (
    <div className="space-y-6">
      {/* Tabs navigation bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#172338] pb-3">
        <div className="flex items-center p-1 rounded-xl bg-[#06090e] border border-[#172338] font-mono text-xs">
          <button
            type="button"
            onClick={() => handleTabChange('codebase')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all cursor-pointer ${
              activeTab === 'codebase'
                ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileCode className="h-4 w-4" />
            <span>Codebase &amp; Files</span>
            {issuesCount > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  activeTab === 'codebase'
                    ? 'bg-black/20 text-black'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}
              >
                {issuesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('analytics')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>Health &amp; Security Analytics</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                activeTab === 'analytics'
                  ? 'bg-black/20 text-black'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              {healthScore}/100
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-emerald-400 font-semibold">Active AST &amp; LLM Surveillance</span>
        </div>
      </div>

      {/* Dynamic Tab Content */}
      <div className="animate-fade-in">
        {activeTab === 'codebase' ? codebaseContent : analyticsContent}
      </div>
    </div>
  );
}
