'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  Download,
  Calendar,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Database,
  Search,
  ChevronDown,
  MoreHorizontal,
  Settings,
  Sparkles,
  GitFork,
  Layers,
  MessageSquare,
  Server,
  AlignLeft,
  X,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { SystemLogsData, LogEntry } from '@/lib/logs-data';

interface SystemLogsViewProps {
  initialData: SystemLogsData;
}

const TABS = [
  { id: 'all', label: 'All Logs' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'workers', label: 'Workers' },
  { id: 'api', label: 'API Requests' },
  { id: 'webhooks', label: 'GitHub Webhooks' },
  { id: 'llm', label: 'LLM Providers' },
  { id: 'errors', label: 'Errors' },
];

export function SystemLogsView({ initialData }: SystemLogsViewProps) {
  const [data, setData] = useState<SystemLogsData>(initialData);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [selectedComponent, setSelectedComponent] = useState<string>('ALL');
  const [selectedRepository, setSelectedRepository] = useState<string>('ALL');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('24h');
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(10); // in seconds, 0 = off
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isAutoRefreshDropdownOpen, setIsAutoRefreshDropdownOpen] = useState(false);
  const [isTimeframeDropdownOpen, setIsTimeframeDropdownOpen] = useState(false);

  // Fetch updated logs from API
  const fetchLogs = useCallback(
    async (pageToFetch: number = currentPage) => {
      try {
        setIsLoading(true);
        const params = new URLSearchParams({
          page: String(pageToFetch),
          pageSize: '10',
          tab: activeTab,
          level: selectedLevel,
          component: selectedComponent,
          repository: selectedRepository,
          search: searchQuery,
          timeframe: selectedTimeframe,
        });

        const res = await fetch(`/api/system-logs?${params.toString()}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            setData(json.data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch system logs:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [currentPage, activeTab, selectedLevel, selectedComponent, selectedRepository, searchQuery, selectedTimeframe]
  );

  // Auto refresh timer
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const interval = setInterval(() => {
      fetchLogs();
    }, autoRefreshInterval * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshInterval, fetchLogs]);

  // Handle Tab Change
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setCurrentPage(1);
  };

  // Trigger search on filter changes
  useEffect(() => {
    fetchLogs(1);
  }, [activeTab, selectedLevel, selectedComponent, selectedRepository, selectedTimeframe]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLogs(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Handle pagination click
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > data.pagination.totalPages) return;
    setCurrentPage(newPage);
    fetchLogs(newPage);
  };

  // Clear all filters
  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedLevel('ALL');
    setSelectedComponent('ALL');
    setSelectedRepository('ALL');
    setCurrentPage(1);
  };

  // Copy JSON details
  const handleCopyDetails = () => {
    if (!selectedLog) return;
    navigator.clipboard.writeText(JSON.stringify(selectedLog, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Render Component Icon
  const renderComponentIcon = (comp: string) => {
    switch (comp.toLowerCase()) {
      case 'worker':
        return <Settings className="h-3.5 w-3.5 text-slate-600" />;
      case 'llm':
        return <Sparkles className="h-3.5 w-3.5 text-blue-600" />;
      case 'webhook':
        return <GitFork className="h-3.5 w-3.5 text-purple-600" />;
      case 'pipeline':
        return <Layers className="h-3.5 w-3.5 text-slate-600" />;
      case 'analysis':
        return <Search className="h-3.5 w-3.5 text-slate-600" />;
      case 'chatbot':
        return <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />;
      case 'queue':
        return <AlignLeft className="h-3.5 w-3.5 text-amber-600" />;
      case 'system':
      default:
        return <Server className="h-3.5 w-3.5 text-slate-600" />;
    }
  };

  // Render Status Icon next to Time
  const renderTimeStatusIcon = (level: string) => {
    switch (level) {
      case 'INFO':
        return (
          <div className="flex h-5 w-5 items-center justify-center rounded border border-emerald-300 bg-emerald-50 text-emerald-700">
            <span className="text-[10px] font-bold">i</span>
          </div>
        );
      case 'DEBUG':
        return (
          <div className="flex h-5 w-5 items-center justify-center rounded border border-blue-300 bg-blue-50 text-blue-700">
            <span className="text-[10px] font-bold">D</span>
          </div>
        );
      case 'WARN':
        return (
          <div className="flex h-5 w-5 items-center justify-center rounded border border-amber-300 bg-amber-50 text-amber-700">
            <AlertTriangle className="h-3 w-3 stroke-[2.5]" />
          </div>
        );
      case 'ERROR':
        return (
          <div className="flex h-5 w-5 items-center justify-center rounded border border-rose-300 bg-rose-50 text-rose-700">
            <X className="h-3 w-3 stroke-[3]" />
          </div>
        );
      default:
        return null;
    }
  };

  // Render Level Badge
  const renderLevelBadge = (level: string) => {
    switch (level) {
      case 'INFO':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/80">
            INFO
          </span>
        );
      case 'DEBUG':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-blue-50 text-blue-700 border border-blue-200/80">
            DEBUG
          </span>
        );
      case 'WARN':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-amber-50 text-amber-800 border border-amber-200/80">
            WARN
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-rose-50 text-rose-700 border border-rose-200/80">
            ERROR
          </span>
        );
      default:
        return <span>{level}</span>;
    }
  };

  // Helper to highlight PR links and finding numbers in messages
  const renderMessageContent = (message: string) => {
    const parts = message.split(/(PR #\d+|\(\d+ findings\))/g);
    return (
      <span className="text-xs text-slate-800 font-normal">
        {parts.map((part, idx) => {
          if (part.startsWith('PR #')) {
            const prNum = part.replace('PR #', '');
            return (
              <span key={idx} className="font-semibold text-blue-600 hover:underline cursor-pointer">
                PR #{prNum}
              </span>
            );
          }
          if (part.includes('findings')) {
            return (
              <span key={idx} className="text-slate-500 font-medium">
                {part}
              </span>
            );
          }
          return <span key={idx}>{part}</span>;
        })}
      </span>
    );
  };

  const { stats, logs, pagination, repositories } = data;

  // Pagination page numbers generator
  const paginationRange = useMemo(() => {
    const total = pagination.totalPages;
    const current = pagination.page;
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    if (current <= 4) {
      return [1, 2, 3, 4, 5, '...', total];
    }
    if (current >= total - 3) {
      return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    }
    return [1, '...', current - 1, current, current + 1, '...', total];
  }, [pagination.totalPages, pagination.page]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
      {/* 1. Header & Global Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
            System Logs
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Monitor system activity, worker execution, API requests, and review pipeline events in real time.
          </p>
        </div>

        {/* Right Top Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Auto-refresh Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsAutoRefreshDropdownOpen(!isAutoRefreshDropdownOpen)}
              className="h-9 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
              <span>
                {autoRefreshInterval > 0 ? `Auto-refresh (${autoRefreshInterval}s)` : 'Auto-refresh (Off)'}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-0.5" />
            </button>

            {isAutoRefreshDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg z-30 text-xs">
                {[
                  { label: 'Off', val: 0 },
                  { label: 'Every 5s', val: 5 },
                  { label: 'Every 10s', val: 10 },
                  { label: 'Every 30s', val: 30 },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => {
                      setAutoRefreshInterval(item.val);
                      setIsAutoRefreshDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-slate-50 font-medium ${
                      autoRefreshInterval === item.val ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export Logs Button */}
          <a
            href="/api/system-logs/export"
            download
            className="h-9 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>Export Logs</span>
          </a>

          {/* Timeframe Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsTimeframeDropdownOpen(!isTimeframeDropdownOpen)}
              className="h-9 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <Calendar className="h-3.5 w-3.5 text-slate-500" />
              <span>
                {selectedTimeframe === '1h'
                  ? 'Last 1 hour'
                  : selectedTimeframe === '7d'
                  ? 'Last 7 days'
                  : selectedTimeframe === '30d'
                  ? 'Last 30 days'
                  : 'Last 24 hours'}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-0.5" />
            </button>

            {isTimeframeDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-40 rounded-xl border border-slate-200 bg-white py-1 shadow-lg z-30 text-xs">
                {[
                  { label: 'Last 1 hour', val: '1h' },
                  { label: 'Last 24 hours', val: '24h' },
                  { label: 'Last 7 days', val: '7d' },
                  { label: 'Last 30 days', val: '30d' },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => {
                      setSelectedTimeframe(item.val);
                      setIsTimeframeDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-slate-50 font-medium ${
                      selectedTimeframe === item.val ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Top 5 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Total Events */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <FileText className="h-4 w-4" />
            </div>
            <span className="text-xs font-semibold text-slate-600">Total Events</span>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900 tracking-tight">
            {stats.totalEventsFormatted}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
            <span>{stats.eventsTrend}</span>
          </div>
        </div>

        {/* Card 2: Successful Jobs */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <span className="text-xs font-semibold text-slate-600">Successful Jobs</span>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900 tracking-tight">
            {stats.successfulJobsFormatted}
          </div>
          <div className="mt-1 text-[11px] text-slate-400 font-medium">
            {stats.successRate}
          </div>
        </div>

        {/* Card 3: Failed Jobs */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600 border border-rose-100">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <span className="text-xs font-semibold text-slate-600">Failed Jobs</span>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900 tracking-tight">
            {stats.failedJobsFormatted}
          </div>
          <div className="mt-1 text-[11px] text-slate-400 font-medium">
            {stats.failureRate}
          </div>
        </div>

        {/* Card 4: Avg. Duration */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <Clock className="h-4 w-4" />
            </div>
            <span className="text-xs font-semibold text-slate-600">Avg. Duration</span>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900 tracking-tight">
            {stats.avgDuration}
          </div>
          <div className="mt-1 text-[11px] text-slate-400 font-medium">
            {stats.p95Duration}
          </div>
        </div>

        {/* Card 5: Active Workers */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <Database className="h-4 w-4" />
            </div>
            <span className="text-xs font-semibold text-slate-600">Active Workers</span>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900 tracking-tight">
            {stats.activeWorkers}
          </div>
          <div className="mt-1 text-[11px] text-slate-400 font-medium">
            {stats.workersSubtext}
          </div>
        </div>
      </div>

      {/* 3. Category Tabs */}
      <div className="border-b border-slate-200 flex items-center gap-6 overflow-x-auto no-scrollbar">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`pb-3 text-xs font-semibold whitespace-nowrap transition-colors relative cursor-pointer ${
                isActive ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>{tab.label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* 4. Search & Filter Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs (e.g. repository, PR #, error message, worker id...)"
            className="h-9.5 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Filter: Levels */}
        <div className="relative min-w-[125px]">
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            className="h-9.5 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-semibold text-slate-700 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="ALL">All Levels</option>
            <option value="INFO">INFO</option>
            <option value="DEBUG">DEBUG</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        </div>

        {/* Filter: Components */}
        <div className="relative min-w-[145px]">
          <select
            value={selectedComponent}
            onChange={(e) => setSelectedComponent(e.target.value)}
            className="h-9.5 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-semibold text-slate-700 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="ALL">All Components</option>
            <option value="worker">worker</option>
            <option value="llm">llm</option>
            <option value="webhook">webhook</option>
            <option value="pipeline">pipeline</option>
            <option value="analysis">analysis</option>
            <option value="chatbot">chatbot</option>
            <option value="queue">queue</option>
            <option value="system">system</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        </div>

        {/* Filter: Repositories */}
        <div className="relative min-w-[155px]">
          <select
            value={selectedRepository}
            onChange={(e) => setSelectedRepository(e.target.value)}
            className="h-9.5 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-semibold text-slate-700 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="ALL">All Repositories</option>
            {repositories.map((repo) => (
              <option key={repo} value={repo}>
                {repo}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        </div>

        {/* Clear Button */}
        <button
          type="button"
          onClick={handleClearFilters}
          className="h-9.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600 shadow-xs transition-colors cursor-pointer"
        >
          Clear
        </button>
      </div>

      {/* 5. Logs Table */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 pl-4 pr-3">Time (IST)</th>
                <th className="py-3 px-3">Level</th>
                <th className="py-3 px-3">Component</th>
                <th className="py-3 px-3 min-w-[280px]">Message</th>
                <th className="py-3 px-3 min-w-[170px]">Repository / PR</th>
                <th className="py-3 px-3 text-right">Duration</th>
                <th className="py-3 pr-4 pl-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-slate-400">
                    No log events found matching the specified filters.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                  >
                    {/* Time (IST) */}
                    <td className="py-3 pl-4 pr-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {renderTimeStatusIcon(log.level)}
                        <span className="font-mono text-xs text-slate-600 font-medium">
                          {log.timestamp}
                        </span>
                      </div>
                    </td>

                    {/* Level */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {renderLevelBadge(log.level)}
                    </td>

                    {/* Component */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-medium text-slate-700">
                        {renderComponentIcon(log.component)}
                        <span className="text-xs">{log.component}</span>
                      </div>
                    </td>

                    {/* Message */}
                    <td className="py-3 px-3">
                      {renderMessageContent(log.message)}
                    </td>

                    {/* Repository / PR */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {log.repo ? (
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/repositories`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            {log.repo}
                          </Link>
                          {log.prNumber ? (
                            <Link
                              href={`/pull-requests`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium text-blue-600 hover:underline"
                            >
                              #{log.prNumber}
                            </Link>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-400">
                          <span>-</span>
                          <span>-</span>
                        </div>
                      )}
                    </td>

                    {/* Duration */}
                    <td className="py-3 px-3 text-right font-mono text-xs text-slate-600 whitespace-nowrap">
                      {log.duration}
                    </td>

                    {/* Actions */}
                    <td className="py-3 pr-4 pl-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedLog(log)}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                        title="View details"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 6. Pagination Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
          <div>
            Showing {(pagination.page - 1) * pagination.pageSize + 1}–
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
            {pagination.total.toLocaleString()} logs
          </div>

          <div className="flex items-center gap-1">
            {/* Prev button */}
            <button
              type="button"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5 text-slate-600" />
            </button>

            {/* Page number buttons */}
            {paginationRange.map((p, idx) => {
              if (p === '...') {
                return (
                  <span key={`dots-${idx}`} className="px-1 text-slate-400">
                    ...
                  </span>
                );
              }
              const pageNum = Number(p);
              const isActive = pageNum === pagination.page;

              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => handlePageChange(pageNum)}
                  className={`flex h-7 min-w-[28px] px-1.5 items-center justify-center rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                    isActive
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            {/* Next button */}
            <button
              type="button"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            >
              <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
            </button>
          </div>
        </div>
      </div>

      {/* 7. Log Details Modal (Drawer) */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                {renderLevelBadge(selectedLog.level)}
                <h3 className="text-base font-bold text-slate-900">
                  Log Event #{selectedLog.id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Metadata Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Component</span>
                <p className="font-bold text-slate-900 mt-0.5">{selectedLog.component}</p>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Time (IST)</span>
                <p className="font-bold text-slate-900 mt-0.5 truncate">{selectedLog.timestamp}</p>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Repository</span>
                <p className="font-bold text-blue-600 mt-0.5 truncate">
                  {selectedLog.repo || 'N/A'}
                </p>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Duration</span>
                <p className="font-bold text-slate-900 mt-0.5">{selectedLog.duration}</p>
              </div>
            </div>

            {/* Message Body */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs">
              <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-1">
                Event Message:
              </span>
              <p className="font-semibold text-slate-900">{selectedLog.message}</p>
            </div>

            {/* JSON Metadata Payload */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Structured Metadata (JSON):</span>
                <button
                  type="button"
                  onClick={handleCopyDetails}
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy JSON</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-slate-900 p-3.5 text-[11px] font-mono text-emerald-400">
                {JSON.stringify(selectedLog.metadata || selectedLog, null, 2)}
              </pre>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
