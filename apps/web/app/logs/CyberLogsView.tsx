'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RotateCcw,
  ShieldCheck,
  Server,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileCode,
  CheckCircle2,
  Flame,
  Activity,
  Layers,
  Cpu,
  DollarSign,
  Clock,
  ExternalLink,
  RefreshCw,
  Search,
  Check,
  HelpCircle,
  Copy,
  Gauge,
  Sliders,
  SlidersHorizontal,
} from 'lucide-react';
import { ReviewLifecycleStage, REVIEW_LIFECYCLE_STAGES } from '@ai-reviewer/shared';
import { formatTime, formatDateTime } from '@/lib/date-format';

interface Props {
  dbFailedReviews: any[];
}

const STAGE_LABELS: Record<ReviewLifecycleStage, { name: string; desc: string }> = {
  github_webhook: { name: '1. Webhook Ingress', desc: 'GitHub payload delivery & header check' },
  webhook_validation: { name: '2. Webhook Validation', desc: 'HMAC signature & schema verification' },
  queue_enqueue: { name: '3. Queue Enqueue', desc: 'BullMQ job registration & deduplication' },
  worker_start: { name: '4. Worker Start', desc: 'Slot acquisition & review lock allocation' },
  repository_fetch: { name: '5. Repository Fetch', desc: 'DB repo lookup & in-repo config loading' },
  diff_generation: { name: '6. Diff Generation', desc: 'GitHub diff fetch, filtering & chunking' },
  static_analysis: { name: '7. Static Analysis', desc: 'ESLint, Bandit, Ruff & vuln scanners' },
  llm_analysis: { name: '8. LLM Analysis', desc: 'Context retrieval & AI review reasoning' },
  finding_validation: { name: '9. Finding Validation', desc: 'CWE normalization, calibration & risk' },
  persistence: { name: '10. Persistence', desc: 'Atomic DB transaction & issue records' },
  review_completion: { name: '11. Review Completion', desc: 'PR comments, check runs & trace cache' },
};

export function CyberLogsView({ dbFailedReviews }: Props) {
  const [activeTab, setActiveTab] = useState<'observability' | 'dlq'>('observability');

  // DLQ State
  const [expandedSnippets, setExpandedSnippets] = useState<Record<number, boolean>>({});
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [retriedIds, setRetriedIds] = useState<Record<number, boolean>>({});

  // Observability Telemetry State
  const [telemetry, setTelemetry] = useState<any>(null);
  const [loadingTelemetry, setLoadingTelemetry] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [traceSearch, setTraceSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showDebugModal, setShowDebugModal] = useState(false);

  const fetchTelemetry = useCallback(async () => {
    try {
      const res = await fetch('/api/observability');
      if (res.ok) {
        const data = await res.json();
        setTelemetry(data);
      }
    } catch (err) {
      console.error('Failed to fetch operational telemetry:', err);
    } finally {
      setLoadingTelemetry(false);
    }
  }, []);

  useEffect(() => {
    fetchTelemetry();
  }, [fetchTelemetry]);

  // Periodic polling
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchTelemetry();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchTelemetry]);

  const handleRetry = async (id: number) => {
    setRetryingId(id);
    try {
      await fetch(`/api/failed-reviews/${id}/retry`, { method: 'POST' });
      setRetriedIds((prev) => ({ ...prev, [id]: true }));
      // Refresh telemetry right after retrying
      fetchTelemetry();
    } catch (e) {
      console.error('Retry error:', e);
    } finally {
      setRetryingId(null);
    }
  };

  const toggleSnippet = (id: number) => {
    setExpandedSnippets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const failedCount = dbFailedReviews.length;
  const stuckCount = telemetry?.stuckReviews?.length || 0;

  // Filter traces
  const filteredTraces = (telemetry?.recentTraces || []).filter((tr: any) => {
    if (!traceSearch) return true;
    const q = traceSearch.toLowerCase();
    return (
      tr.correlationId?.toLowerCase().includes(q) ||
      tr.commitSha?.toLowerCase().includes(q) ||
      tr.repoFullName?.toLowerCase().includes(q) ||
      String(tr.prNumber).includes(q) ||
      String(tr.reviewId).includes(q)
    );
  });

  return (
    <div className="space-y-4 animate-fade-in text-slate-100 font-sans">
      {/* Tab Switcher & Subheader Status Line */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono px-1">
        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 rounded-xl bg-[#06090e] border border-[#172338]">
            <button
              onClick={() => setActiveTab('observability')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'observability'
                  ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              <span>Operational Health</span>
            </button>
            <button
              onClick={() => setActiveTab('dlq')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'dlq'
                  ? 'bg-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,0.4)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Flame className="h-3.5 w-3.5" />
              <span>Quarantine & DLQ ({failedCount})</span>
            </button>
          </div>

          <span className="text-slate-600 hidden md:inline">&bull;</span>
          <div className="hidden md:flex items-center gap-1.5 text-slate-400">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-emerald-400 font-semibold">
              Worker: {telemetry?.workerStatus?.toUpperCase() || 'PROBING'}
            </span>
          </div>
        </div>

        {/* Telemetry Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDebugModal(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#06090e] border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 text-[11px] font-bold transition-all"
            title="SRE Debugging Guide for 90s slow reviews"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>90s Debug Guide</span>
          </button>

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all ${
              autoRefresh
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-[#06090e] border-[#172338] text-slate-400'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            <span>{autoRefresh ? '10s Auto-Poll' : 'Polling Paused'}</span>
          </button>

          <button
            onClick={fetchTelemetry}
            className="p-1.5 rounded-lg bg-[#06090e] border border-[#172338] text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-all"
            title="Refresh Telemetry Now"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingTelemetry ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* SRE DEBUG MODAL */}
      {showDebugModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="max-w-2xl w-full rounded-2xl bg-[#0b1019] border border-[#172338] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#172338]">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                <h3 className="font-bold text-white text-base">Debugging a Review Taking &gt; 90s or Stuck</h3>
              </div>
              <button
                onClick={() => setShowDebugModal(false)}
                className="text-slate-400 hover:text-white font-mono text-sm px-2 py-1"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 font-mono leading-relaxed max-h-[70vh] overflow-y-auto pr-2">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
                <strong>Standard Review Budget:</strong> 30s to 45s. A review exceeding 90s violates SLA and triggers the Stale Job detection watchdog.
              </div>

              <h4 className="font-bold text-cyan-400 text-sm">Diagnostic Step-by-Step Checklist:</h4>
              <ol className="list-decimal list-inside space-y-2 text-slate-300">
                <li>
                  <strong className="text-white">Isolate the culprit stage:</strong> Look at the 11-Stage Waterfall table below. Check if latency is concentrated in <code className="text-cyan-300 bg-slate-900 px-1 py-0.5 rounded">queue_enqueue</code> (queue backlog), <code className="text-cyan-300 bg-slate-900 px-1 py-0.5 rounded">llm_analysis</code> (model response stall), or <code className="text-cyan-300 bg-slate-900 px-1 py-0.5 rounded">persistence</code> (DB deadlock).
                </li>
                <li>
                  <strong className="text-white">Check Correlation ID:</strong> Grab the <code className="text-cyan-300 bg-slate-900 px-1 py-0.5 rounded">correlationId</code> from the trace table and grep worker logs:
                  <pre className="mt-1 p-2 bg-[#06090e] rounded text-emerald-400 text-[11px] overflow-x-auto">
                    grep &apos;correlation_id&apos;: &apos;&lt;ID&gt;&apos; worker.log
                  </pre>
                </li>
                <li>
                  <strong className="text-white">Inspect Lock Contention:</strong> Reviews use distributed locks in Redis. If a previous worker crashed, the lock expires after 180s. The reaper runs every 60s and reaps stale jobs automatically.
                </li>
                <li>
                  <strong className="text-white">Review Stuck Reviews Table:</strong> Check the &quot;Stalled Reviews Alert&quot; section on this dashboard for reviews with &gt; 90s elapsed runtime.
                </li>
              </ol>

              <div className="pt-2 border-t border-[#172338] flex justify-between items-center text-[11px]">
                <span className="text-slate-400">Full runbook available in docs/DEBUGGING_SLOW_REVIEWS.md</span>
                <button
                  onClick={() => setShowDebugModal(false)}
                  className="px-3 py-1.5 bg-cyan-400 text-black font-bold rounded-lg hover:bg-cyan-300 transition-colors"
                >
                  Understood
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: OPERATIONAL HEALTH & TRACES VIEW */}
      {/* ========================================================================= */}
      {activeTab === 'observability' && (
        <div className="space-y-4">
          {/* STUCK REVIEWS EMERGENCY ALERT (if any review > 90s) */}
          {stuckCount > 0 && (
            <div className="rounded-2xl border border-amber-500/50 bg-gradient-to-r from-amber-950/70 to-[#1e1308] p-4 shadow-lg shadow-amber-950/30">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
                    <AlertTriangle className="h-5 w-5 text-amber-400 animate-pulse" />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono font-bold tracking-widest uppercase text-amber-400">
                      LATENCY SLA BREACH &bull; STALE JOB WATCHDOG
                    </div>
                    <h2 className="text-base font-black text-white mt-0.5">
                      {stuckCount} {stuckCount === 1 ? 'Review is' : 'Reviews are'} Currently Stuck or &gt; 90s
                    </h2>
                    <p className="text-xs text-amber-200/90 mt-1 font-sans">
                      These reviews have exceeded the 90s budget. Worker stale-reaper will automatically reclaim orphaned locks upon expiry.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDebugModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-amber-400 text-black font-mono text-xs font-bold hover:bg-amber-300 transition-colors shrink-0"
                >
                  Debug Instructions
                </button>
              </div>

              {/* Stuck reviews list */}
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 font-mono text-xs">
                {telemetry.stuckReviews.map((stuck: any) => (
                  <div
                    key={stuck.id}
                    className="rounded-xl bg-[#06090e]/80 border border-amber-500/30 p-2.5 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-white font-bold">
                        {stuck.repoName} &bull; PR #{stuck.prNumber}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Commit: {stuck.commitSha.substring(0, 7)} | Stage: {stuck.stage || 'PROCESSING'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-amber-400 font-bold text-xs">{stuck.runningDurationSeconds}s elapsed</div>
                      <span className="text-[9px] uppercase tracking-wider text-rose-400 font-bold">STUCK</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TOP 4 TELEMETRY CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. BullMQ Queue Depth */}
            <div className="rounded-2xl border border-[#172338] bg-[#0b1019] p-3.5 shadow-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-300">
                    <Layers className="h-4 w-4 text-cyan-400" />
                    <span>QUEUE DEPTH</span>
                  </div>
                  <span className="rounded bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-mono font-bold text-cyan-400">
                    BullMQ
                  </span>
                </div>
                <div className="text-2xl font-black font-mono text-white">
                  {telemetry?.queueDepth?.waiting ?? 0}
                  <span className="text-xs text-slate-400 font-normal ml-1">waiting</span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-1 font-mono text-center text-[10px] pt-2 border-t border-[#172338]">
                <div className="rounded bg-[#06090e] p-1">
                  <div className="text-slate-400">Active</div>
                  <div className="font-bold text-cyan-400">{telemetry?.queueDepth?.active ?? 0}</div>
                </div>
                <div className="rounded bg-[#06090e] p-1">
                  <div className="text-slate-400">Delay</div>
                  <div className="font-bold text-amber-400">{telemetry?.queueDepth?.delayed ?? 0}</div>
                </div>
                <div className="rounded bg-[#06090e] p-1">
                  <div className="text-slate-400">Failed</div>
                  <div className="font-bold text-rose-400">{telemetry?.queueDepth?.failed ?? 0}</div>
                </div>
                <div className="rounded bg-[#06090e] p-1">
                  <div className="text-slate-400">Done</div>
                  <div className="font-bold text-emerald-400">{telemetry?.queueDepth?.completed ?? 0}</div>
                </div>
              </div>
            </div>

            {/* 2. Worker Health & Fleet */}
            <div className="rounded-2xl border border-[#172338] bg-[#0b1019] p-3.5 shadow-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-300">
                    <Server className="h-4 w-4 text-emerald-400" />
                    <span>WORKER FLEET</span>
                  </div>
                  <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    :3001
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black font-mono text-emerald-400">
                    {telemetry?.workerStatus === 'online' ? 'Healthy' : 'Probing'}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    {Math.floor((telemetry?.workerHealth?.uptimeSeconds ?? 0) / 60)}m uptime
                  </span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1 font-mono text-[10px] pt-2 border-t border-[#172338]">
                <div className="rounded bg-[#06090e] p-1.5 flex justify-between">
                  <span className="text-slate-400">RSS:</span>
                  <span className="font-bold text-white">{telemetry?.workerHealth?.memory?.rssMb ?? 0}MB</span>
                </div>
                <div className="rounded bg-[#06090e] p-1.5 flex justify-between">
                  <span className="text-slate-400">Heap:</span>
                  <span className="font-bold text-cyan-400">{telemetry?.workerHealth?.memory?.heapUsedMb ?? 0}MB</span>
                </div>
              </div>
            </div>

            {/* 3. Stale-Job Detection */}
            <div className="rounded-2xl border border-[#172338] bg-[#0b1019] p-3.5 shadow-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-300">
                    <Clock className="h-4 w-4 text-amber-400" />
                    <span>STALE DETECTION</span>
                  </div>
                  <span className="rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-400">
                    Reaper 60s
                  </span>
                </div>
                <div className="text-2xl font-black font-mono text-white">
                  {telemetry?.staleJobs?.detectedTotal ?? 0}
                  <span className="text-xs text-slate-400 font-normal ml-1">detected</span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1 font-mono text-[10px] pt-2 border-t border-[#172338]">
                <div className="rounded bg-[#06090e] p-1.5 flex justify-between">
                  <span className="text-slate-400">Reaped:</span>
                  <span className="font-bold text-emerald-400">{telemetry?.staleJobs?.reapedTotal ?? 0}</span>
                </div>
                <div className="rounded bg-[#06090e] p-1.5 flex justify-between">
                  <span className="text-slate-400">Stuck Now:</span>
                  <span className={`font-bold ${stuckCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                    {stuckCount}
                  </span>
                </div>
              </div>
            </div>

            {/* 4. LLM Latency & Cost */}
            <div className="rounded-2xl border border-[#172338] bg-[#0b1019] p-3.5 shadow-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-300">
                    <DollarSign className="h-4 w-4 text-purple-400" />
                    <span>LLM & COST</span>
                  </div>
                  <span className="rounded bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 text-[10px] font-mono font-bold text-purple-400">
                    Tokens
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black font-mono text-white">
                    ${telemetry?.llmMetrics?.estimatedCostUsd?.toFixed(4) ?? '0.0000'}
                  </span>
                  <span className="text-[10px] font-mono text-purple-300">
                    {telemetry?.llmMetrics?.tokensConsumedTotal?.toLocaleString() ?? 0} tok
                  </span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1 font-mono text-[10px] pt-2 border-t border-[#172338]">
                <div className="rounded bg-[#06090e] p-1.5 flex justify-between">
                  <span className="text-slate-400">LLM p50:</span>
                  <span className="font-bold text-cyan-400">{telemetry?.llmMetrics?.latency?.p50 ?? 0}ms</span>
                </div>
                <div className="rounded bg-[#06090e] p-1.5 flex justify-between">
                  <span className="text-slate-400">Failures:</span>
                  <span className="font-bold text-rose-400">{telemetry?.llmMetrics?.llmFailuresTotal ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 11-STAGE REVIEW LIFECYCLE WATERFALL */}
          <div className="rounded-2xl border border-[#172338] bg-[#0b1019] p-4 shadow-md space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-[#172338]">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-cyan-400" />
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                  Complete 11-Stage Review Lifecycle Latency Waterfall
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                End-to-End Ingress &rarr; Execution &rarr; Completion
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 font-mono text-xs">
              {REVIEW_LIFECYCLE_STAGES.map((stageKey, idx) => {
                const stageInfo = STAGE_LABELS[stageKey];
                const stats = telemetry?.lifecycleStages?.[stageKey] || {
                  count: 0,
                  avgMs: 0,
                  p50Ms: 0,
                  p95Ms: 0,
                  lastMs: 0,
                };

                return (
                  <div
                    key={stageKey}
                    className="rounded-xl bg-[#06090e] border border-[#172338] p-2.5 flex flex-col justify-between hover:border-cyan-500/40 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200 text-xs truncate">{stageInfo.name}</span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">
                          #{idx + 1}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 truncate">{stageInfo.desc}</div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-[#172338]/80 flex items-center justify-between text-[11px]">
                      <div>
                        <span className="text-slate-500 text-[10px]">p50 / p95: </span>
                        <span className="font-bold text-cyan-400">{stats.p50Ms}ms</span>
                        <span className="text-slate-500"> / </span>
                        <span className="font-bold text-amber-400">{stats.p95Ms}ms</span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {stats.count} {stats.count === 1 ? 'run' : 'runs'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* FAILURE METRICS & ERROR CATEGORIES BREAKDOWN */}
          <div className="rounded-2xl border border-[#172338] bg-[#0b1019] p-4 shadow-md space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#172338]">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-400" />
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                  Failure Metrics & Error Taxonomy Breakdown
                </h3>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="text-slate-400">
                  GitHub API Failures:{' '}
                  <span className="text-rose-400 font-bold">
                    {telemetry?.failureMetrics?.githubFailuresTotal ?? 0}
                  </span>
                </span>
                <span className="text-slate-400">
                  Retries:{' '}
                  <span className="text-amber-400 font-bold">
                    {telemetry?.failureMetrics?.retriesTotal ?? 0}
                  </span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 font-mono text-center text-xs">
              {Object.entries(telemetry?.failureMetrics?.errorCategories || {}).map(([category, count]) => {
                const countNum = Number(count);
                if (category === 'none') return null;
                return (
                  <div
                    key={category}
                    className={`rounded-xl bg-[#06090e] border p-2 ${
                      countNum > 0 ? 'border-rose-500/40 bg-rose-950/10' : 'border-[#172338]'
                    }`}
                  >
                    <div className="text-[10px] uppercase text-slate-400 truncate">{category.replace('_', ' ')}</div>
                    <div className={`text-sm font-bold mt-1 ${countNum > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                      {countNum}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RECENT TRACES INSPECTOR */}
          <div className="rounded-2xl border border-[#172338] bg-[#0b1019] p-4 shadow-md space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#172338]">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-cyan-400" />
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                  Recent Review Lifecycle Traces &amp; Audit Trail
                </h3>
              </div>

              {/* Search trace bar */}
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter correlation ID, commit, PR..."
                  value={traceSearch}
                  onChange={(e) => setTraceSearch(e.target.value)}
                  className="rounded-xl bg-[#06090e] border border-[#172338] pl-8 pr-3 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 w-full sm:w-64"
                />
              </div>
            </div>

            {filteredTraces.length === 0 ? (
              <div className="text-center py-8 font-mono text-xs text-slate-500">
                No review lifecycle traces found matching filter.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTraces.map((trace: any) => {
                  const isExpanded = selectedTraceId === String(trace.reviewId || trace.jobId);
                  const stageCount = trace.stages ? Object.keys(trace.stages).length : 0;
                  const totalSeconds = (trace.totalDurationMs / 1000).toFixed(2);
                  const traceKey = String(trace.reviewId || trace.jobId);

                  return (
                    <div
                      key={traceKey}
                      className="rounded-xl bg-[#06090e] border border-[#172338] overflow-hidden transition-all"
                    >
                      {/* Summary Bar */}
                      <div
                        onClick={() => setSelectedTraceId(isExpanded ? null : traceKey)}
                        className="p-3 flex flex-col md:flex-row md:items-center justify-between gap-2 cursor-pointer hover:bg-slate-900/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-mono font-bold ${
                              trace.status === 'completed'
                                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                                : trace.status === 'failed'
                                ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                                : 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400'
                            }`}
                          >
                            {trace.status?.toUpperCase() || 'UNKNOWN'}
                          </span>

                          <span className="font-mono text-xs text-white font-bold">
                            {trace.repoFullName} &bull; PR #{trace.prNumber}
                          </span>

                          <span className="font-mono text-[11px] text-slate-500 hidden sm:inline">
                            Commit: {trace.commitSha?.substring(0, 7) || 'unknown'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 font-mono text-xs">
                          <div className="flex items-center gap-1.5 text-slate-400">
                            <Clock className="h-3.5 w-3.5 text-cyan-400" />
                            <span className="font-bold text-slate-200">{totalSeconds}s</span>
                          </div>

                          <div className="text-[10px] text-slate-500 hidden lg:inline">
                            Correlation:{' '}
                            <span className="text-slate-300">
                              {trace.correlationId?.substring(0, 14)}...
                            </span>
                          </div>

                          <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                            {stageCount}/11 Stages
                          </span>

                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                          )}
                        </div>
                      </div>

                      {/* Expanded 11-Stage Drilldown */}
                      {isExpanded && (
                        <div className="p-3 border-t border-[#172338] bg-[#0b1019] space-y-3 font-mono text-xs">
                          {/* Metadata Header */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pb-2 border-b border-[#172338]/60">
                            <div>
                              <span className="text-slate-500">Correlation ID:</span>
                              <div className="flex items-center gap-1 text-slate-200 font-bold mt-0.5">
                                <span className="truncate">{trace.correlationId}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(trace.correlationId, `corr-${traceKey}`);
                                  }}
                                  className="text-slate-400 hover:text-white"
                                  title="Copy Correlation ID"
                                >
                                  {copiedId === `corr-${traceKey}` ? (
                                    <Check className="h-3 w-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </button>
                              </div>
                            </div>

                            <div>
                              <span className="text-slate-500">Review ID / Job ID:</span>
                              <div className="text-slate-200 font-bold mt-0.5">
                                Rev #{trace.reviewId || 'N/A'} / Job {trace.jobId}
                              </div>
                            </div>

                            <div>
                              <span className="text-slate-500">Commit SHA:</span>
                              <div className="text-slate-200 font-bold mt-0.5 font-mono">
                                {trace.commitSha}
                              </div>
                            </div>

                            <div>
                              <span className="text-slate-500">Completed At:</span>
                              <div className="text-slate-200 mt-0.5" suppressHydrationWarning>
                                {trace.completedAt ? formatTime(trace.completedAt) : 'In Progress'}
                              </div>
                            </div>
                          </div>

                          {/* 11 Stage Breakdown Table */}
                          <div className="space-y-1.5">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                              Stage Execution Telemetry:
                            </div>

                            <div className="divide-y divide-[#172338]/60 rounded-xl border border-[#172338] bg-[#06090e] overflow-hidden">
                              {REVIEW_LIFECYCLE_STAGES.map((stg) => {
                                const stageData = trace.stages?.[stg];
                                const isStageSuccess = stageData?.status === 'success';
                                const isStageFailed = stageData?.status === 'failed';
                                const duration = stageData?.durationMs ?? 0;

                                return (
                                  <div
                                    key={stg}
                                    className="p-2 flex items-center justify-between text-[11px] hover:bg-slate-900/30 transition-colors"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`h-2 w-2 rounded-full ${
                                          isStageSuccess
                                            ? 'bg-emerald-400'
                                            : isStageFailed
                                            ? 'bg-rose-400'
                                            : 'bg-slate-600'
                                        }`}
                                      />
                                      <span className="text-slate-300 font-bold">{STAGE_LABELS[stg].name}</span>
                                      {stageData?.errorCategory && stageData.errorCategory !== 'none' && (
                                        <span className="rounded bg-rose-500/20 text-rose-300 px-1.5 py-0.2 text-[9px] font-bold">
                                          {stageData.errorCategory}
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-3">
                                      {stageData?.metadata && Object.keys(stageData.metadata).length > 0 && (
                                        <span className="text-[10px] text-slate-500 hidden md:inline">
                                          {Object.entries(stageData.metadata)
                                            .map(([k, v]) => `${k}: ${v}`)
                                            .join(' | ')}
                                        </span>
                                      )}

                                      <span className="font-bold text-slate-200 w-16 text-right">
                                        {duration}ms
                                      </span>

                                      <span
                                        className={`rounded px-1.5 py-0.5 text-[9px] uppercase font-bold w-16 text-center ${
                                          isStageSuccess
                                            ? 'bg-emerald-500/10 text-emerald-400'
                                            : isStageFailed
                                            ? 'bg-rose-500/10 text-rose-400'
                                            : 'bg-slate-800 text-slate-500'
                                        }`}
                                      >
                                        {stageData?.status || 'skipped'}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: QUARANTINE & DLQ VIEW (PRESERVED COMPLETE DLQ WORKFLOW) */}
      {/* ========================================================================= */}
      {activeTab === 'dlq' && (
        <div className="space-y-4">
          {/* FAIL-CLOSED QUARANTINE TOP ALERT BANNER */}
          <div
            className={`rounded-2xl border p-4 shadow-lg ${
              failedCount > 0
                ? 'border-rose-500/50 bg-gradient-to-b from-rose-950/80 to-[#7f1d1d]/40 shadow-rose-950/40'
                : 'border-emerald-500/40 bg-gradient-to-b from-emerald-950/60 to-[#0b1019] shadow-emerald-950/30'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                  failedCount > 0
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'bg-emerald-500/20 text-emerald-300'
                }`}
              >
                {failedCount > 0 ? (
                  <RotateCcw className="h-4 w-4 text-rose-300" />
                ) : (
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
                )}
              </div>
              <div>
                <div
                  className={`text-[10px] font-mono font-bold tracking-widest uppercase ${
                    failedCount > 0 ? 'text-rose-300' : 'text-emerald-400'
                  }`}
                >
                  FAIL-CLOSED QUARANTINE &bull;
                </div>
                <h1 className="text-lg font-black tracking-tight text-white mt-0.5">
                  {failedCount === 0
                    ? '0 Failed Jobs in DLQ'
                    : `${failedCount} Failed ${failedCount === 1 ? 'Job' : 'Jobs'} Quarantined`}
                </h1>
                <div
                  className={`flex items-center gap-1.5 text-xs mt-1 font-sans ${
                    failedCount > 0 ? 'text-rose-200/90' : 'text-emerald-300/90'
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {failedCount === 0
                      ? 'All worker queues clear. Zero stalled reviews.'
                      : '0 unreviewed PRs approved. Branch protection locks sustained.'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* QUARANTINE QUEUE LIST */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-1.5 text-white font-bold">
                <Flame className="h-4 w-4 text-rose-400" />
                <span>Quarantine Queue</span>
              </div>
              <span className="rounded-full bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300 font-semibold">
                DLQ &bull; {failedCount} Items
              </span>
            </div>

            {failedCount > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {dbFailedReviews.map((fr: any) => {
                  const isRetrying = retryingId === fr.id;
                  const isRetried = retriedIds[fr.id];
                  const isSnippetOpen = expandedSnippets[fr.id] ?? false;

                  return (
                    <div
                      key={fr.id}
                      className="rounded-2xl bg-[#0b1019] border border-[#172338] border-l-4 border-l-rose-500 p-3.5 shadow-md flex flex-col justify-between space-y-2.5"
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="font-bold text-white">
                            {fr.pullRequest ? `PR #${fr.pullRequest.githubPrNumber}` : `Job #${fr.id}`}
                          </span>
                          <span className="rounded bg-rose-500/20 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                            FAILED
                          </span>
                        </div>

                        <div className="font-mono text-xs text-slate-400 mt-1">
                          <div className="text-slate-300 font-medium">
                            {fr.pullRequest?.repository?.fullName || 'system-dispatcher'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Commit: {fr.commitSha?.substring(0, 7) || 'HEAD'}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-1.5 mt-2 border-t border-[#172338]">
                          <span suppressHydrationWarning>{formatDateTime(fr.failedAt)}</span>
                          <span className="text-rose-400 font-medium">Auto-retry Terminated</span>
                        </div>

                        {/* Error Message */}
                        <div className="space-y-1 mt-2">
                          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-rose-400">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{fr.errorMessage}</span>
                          </div>
                        </div>

                        {/* Collapsible Stack Trace Snippet */}
                        {fr.errorStack && (
                          <div className="rounded-xl border border-[#172338] bg-[#06090e] overflow-hidden mt-2.5">
                            <button
                              onClick={() => toggleSnippet(fr.id)}
                              className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-mono text-slate-400 hover:text-white transition-colors"
                            >
                              <div className="flex items-center gap-1.5">
                                <FileCode className="h-3 w-3 text-cyan-400" />
                                <span>Stack Trace</span>
                              </div>
                              {isSnippetOpen ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </button>

                            {isSnippetOpen && (
                              <pre className="p-3 text-[10px] font-mono text-rose-300/90 overflow-x-auto leading-relaxed border-t border-[#172338] bg-[#06090e]">
                                {fr.errorStack}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="space-y-2 pt-2 border-t border-[#172338]">
                        <button
                          onClick={() => handleRetry(fr.id)}
                          disabled={isRetrying || isRetried}
                          className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan-400 py-2.5 text-xs font-mono font-bold text-black shadow-[0_0_15px_rgba(0,240,255,0.4)] hover:bg-cyan-300 transition-all cursor-pointer disabled:opacity-60"
                        >
                          <RotateCcw className={`h-3.5 w-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                          <span>
                            {isRetried ? 'Dispatched to Queue' : isRetrying ? 'Retrying Review...' : '1-CLICK RETRY REVIEW'}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#172338] bg-[#0b1019]/60 p-10 text-center text-slate-400 font-mono space-y-2">
                <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Dead Letter Queue is Clean</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Zero failed review jobs. All BullMQ queue tasks and GitHub API calls have completed without unhandled exceptions.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
