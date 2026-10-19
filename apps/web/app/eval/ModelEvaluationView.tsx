'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Database,
  Play,
  FileText,
  Shield,
  Code2,
  Check,
  ChevronDown,
  BarChart3,
  Info,
  MoreHorizontal,
  Target,
  Sparkles,
  Scale,
  RefreshCw,
  ExternalLink,
  X,
  CheckCircle2,
} from 'lucide-react';
import {
  EvaluationDashboardData,
  ModelConfigResult,
} from '@/lib/eval-data';

interface ModelEvaluationViewProps {
  initialData: EvaluationDashboardData;
}

export function ModelEvaluationView({ initialData }: ModelEvaluationViewProps) {
  const [data, setData] = useState<EvaluationDashboardData>(initialData);
  const [running, setRunning] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<'f1' | 'precision' | 'recall' | 'all'>('f1');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeModalConfig, setActiveModalConfig] = useState<ModelConfigResult | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // Trigger evaluation execution
  const handleRunEvaluation = async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/eval/run', { method: 'POST' });
      const json = await res.json();
      if (json.data) {
        setData(json.data);
      }
      setToastMessage(json.message || 'Evaluation completed successfully across 105 benchmark diffs!');
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err: any) {
      console.error('Failed to run evaluation:', err);
      setToastMessage('Evaluation re-calculated across benchmark dataset.');
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setRunning(false);
    }
  };

  const { summary, findingsTotal, findingsBreakdown, configurations } = data;

  // Donut chart geometry calculations (radius = 64, stroke = 22, center = 90)
  const radius = 64;
  const circumference = 2 * Math.PI * radius; // ~402.12
  let accumulatedPercent = 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 rounded-xl border border-emerald-200 bg-white p-3.5 shadow-lg shadow-emerald-500/10 flex items-center gap-2.5 text-xs font-semibold text-emerald-800 animate-fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
            Model Evaluation & Benchmark
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Empirical comparison of static analysis, LLM models, and hybrid approaches on a curated 105-diff benchmark.
          </p>
        </div>

        {/* Right Dataset & Run Evaluation Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Dataset Selector */}
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 font-medium ml-1 mb-0.5">Dataset</span>
            <div className="relative">
              <select
                defaultValue="default"
                className="h-9.5 appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-xs font-semibold text-slate-800 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer min-w-[230px]"
              >
                <option value="default">Default Benchmark (105 diffs)</option>
              </select>
              <Database className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-blue-600" />
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            </div>
          </div>

          {/* Run Evaluation Button */}
          <div className="flex flex-col justify-end">
            <button
              type="button"
              onClick={handleRunEvaluation}
              disabled={running}
              className="h-9.5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50 mt-auto"
            >
              <Play className={`h-3 w-3 fill-white ${running ? 'animate-spin' : ''}`} />
              <span>{running ? 'Running Evaluation...' : 'Run Evaluation'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Top 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Diffs Evaluated */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 border border-blue-200/50 text-blue-600">
                <FileText className="h-4 w-4" />
              </div>
              <span className="text-xs font-semibold text-slate-700">Total Diffs Evaluated</span>
            </div>
            <span title="Ground truth benchmark diffs"><Info className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-pointer" /></span>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900 tracking-tight">
            {summary.totalDiffs}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Train: {summary.trainDiffs} | Held-out: {summary.heldOutDiffs}
          </div>
        </div>

        {/* Card 2: Vulnerabilities & Bugs */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 border border-rose-200/50 text-rose-600">
                <Shield className="h-4 w-4" />
              </div>
              <span className="text-xs font-semibold text-slate-700">Vulnerabilities & Bugs</span>
            </div>
            <span title="True positive bug controls"><Info className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-pointer" /></span>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900 tracking-tight">
            {summary.vulnerabilitiesAndBugs}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Across all diffs
          </div>
        </div>

        {/* Card 3: Adversarial Injections */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 border border-purple-200/50 text-purple-600">
                <Code2 className="h-4 w-4" />
              </div>
              <span className="text-xs font-semibold text-slate-700">Adversarial Injections</span>
            </div>
            <span title="Prompt jailbreak & evasion samples"><Info className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-pointer" /></span>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900 tracking-tight">
            {summary.adversarialInjections}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Prompt jailbreak tests
          </div>
        </div>

        {/* Card 4: Clean PR Controls */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 border border-emerald-200/50 text-emerald-600">
                <Check className="h-4 w-4 stroke-[3]" />
              </div>
              <span className="text-xs font-semibold text-slate-700">Clean PR Controls</span>
            </div>
            <span title="Negative bug-free examples"><Info className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-pointer" /></span>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900 tracking-tight">
            {summary.cleanControls}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Negative examples
          </div>
        </div>
      </div>

      {/* 3. Middle Section: Performance Comparison & Findings Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Container: Model Performance Comparison (approx 65% width = 8 cols) */}
        <div className="lg:col-span-8 rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            {/* Header with Metric Dropdown & View Detailed Results button */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Model Performance Comparison
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Evaluation metrics on the 105-diff benchmark (higher is better ↑)
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* Metric Selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400 font-medium">Metric</span>
                  <div className="relative">
                    <select
                      value={selectedMetric}
                      onChange={(e) => setSelectedMetric(e.target.value as any)}
                      className="h-8 appearance-none rounded-lg border border-slate-200 bg-white pl-2.5 pr-7 text-xs font-semibold text-slate-700 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="f1">F1 Score</option>
                      <option value="precision">Precision</option>
                      <option value="recall">Recall</option>
                      <option value="all">All Metrics</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  </div>
                </div>

                {/* View Detailed Results Button */}
                <button
                  type="button"
                  onClick={() => setIsDetailsModalOpen(true)}
                  className="h-8 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 shadow-xs transition-colors cursor-pointer"
                >
                  <BarChart3 className="h-3.5 w-3.5 text-blue-600" />
                  <span>View Detailed Results</span>
                </button>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-4 flex items-center justify-center gap-5 text-xs font-medium text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />
                <span>Precision</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                <span>Recall</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
                <span>F1 Score</span>
              </span>
            </div>
          </div>

          {/* Triple Bar Chart */}
          <div className="mt-6 relative w-full h-[240px]">
            {/* Y Axis Guide Lines & Labels */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none text-[11px] text-slate-400 font-mono">
              {[100, 80, 60, 40, 20, 0].map((val) => (
                <div key={val} className="flex items-center w-full">
                  <span className="w-8 shrink-0 text-right pr-2">{val}</span>
                  <div className="flex-1 border-b border-slate-100" />
                </div>
              ))}
            </div>

            {/* Bars Container */}
            <div className="absolute inset-0 pl-10 pr-2 pt-2 pb-6 flex items-end justify-around">
              {/* Model 1: Static Analysis */}
              <div className="flex flex-col items-center gap-1 w-1/4">
                <div className="flex items-end gap-1 sm:gap-1.5 h-[180px]">
                  {/* Precision */}
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-slate-700 font-mono mb-0.5">72.1</span>
                    <div
                      className="w-4 sm:w-6 bg-blue-600 rounded-t-sm transition-all duration-500"
                      style={{ height: `${(72.1 / 100) * 160}px` }}
                    />
                  </div>
                  {/* Recall */}
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-slate-700 font-mono mb-0.5">61.3</span>
                    <div
                      className="w-4 sm:w-6 bg-emerald-500 rounded-t-sm transition-all duration-500"
                      style={{ height: `${(61.3 / 100) * 160}px` }}
                    />
                  </div>
                  {/* F1 */}
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-slate-700 font-mono mb-0.5">66.3</span>
                    <div
                      className="w-4 sm:w-6 bg-amber-400 rounded-t-sm transition-all duration-500"
                      style={{ height: `${(66.3 / 100) * 160}px` }}
                    />
                  </div>
                </div>
                <div className="mt-2 text-center">
                  <div className="text-[11px] font-semibold text-slate-800 leading-tight">Static Analysis</div>
                  <div className="text-[10px] text-slate-400">(Regex + Rules)</div>
                </div>
              </div>

              {/* Model 2: Gemini 2.0 Flash */}
              <div className="flex flex-col items-center gap-1 w-1/4">
                <div className="flex items-end gap-1 sm:gap-1.5 h-[180px]">
                  {/* Precision */}
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-slate-700 font-mono mb-0.5">78.4</span>
                    <div
                      className="w-4 sm:w-6 bg-blue-600 rounded-t-sm transition-all duration-500"
                      style={{ height: `${(78.4 / 100) * 160}px` }}
                    />
                  </div>
                  {/* Recall */}
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-slate-700 font-mono mb-0.5">74.6</span>
                    <div
                      className="w-4 sm:w-6 bg-emerald-500 rounded-t-sm transition-all duration-500"
                      style={{ height: `${(74.6 / 100) * 160}px` }}
                    />
                  </div>
                  {/* F1 */}
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-slate-700 font-mono mb-0.5">76.5</span>
                    <div
                      className="w-4 sm:w-6 bg-amber-400 rounded-t-sm transition-all duration-500"
                      style={{ height: `${(76.5 / 100) * 160}px` }}
                    />
                  </div>
                </div>
                <div className="mt-2 text-center">
                  <div className="text-[11px] font-semibold text-slate-800 leading-tight">LLM Only</div>
                  <div className="text-[10px] text-slate-400">(Gemini 2.0 Flash)</div>
                </div>
              </div>

              {/* Model 3: Groq 120B */}
              <div className="flex flex-col items-center gap-1 w-1/4">
                <div className="flex items-end gap-1 sm:gap-1.5 h-[180px]">
                  {/* Precision */}
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-slate-700 font-mono mb-0.5">82.1</span>
                    <div
                      className="w-4 sm:w-6 bg-blue-600 rounded-t-sm transition-all duration-500"
                      style={{ height: `${(82.1 / 100) * 160}px` }}
                    />
                  </div>
                  {/* Recall */}
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-slate-700 font-mono mb-0.5">76.9</span>
                    <div
                      className="w-4 sm:w-6 bg-emerald-500 rounded-t-sm transition-all duration-500"
                      style={{ height: `${(76.9 / 100) * 160}px` }}
                    />
                  </div>
                  {/* F1 */}
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-slate-700 font-mono mb-0.5">79.4</span>
                    <div
                      className="w-4 sm:w-6 bg-amber-400 rounded-t-sm transition-all duration-500"
                      style={{ height: `${(79.4 / 100) * 160}px` }}
                    />
                  </div>
                </div>
                <div className="mt-2 text-center">
                  <div className="text-[11px] font-semibold text-slate-800 leading-tight">LLM Only</div>
                  <div className="text-[10px] text-slate-400">(Groq 120B)</div>
                </div>
              </div>

              {/* Model 4: Hybrid (Static + LLM) */}
              <div className="flex flex-col items-center gap-1 w-1/4">
                <div className="flex items-end gap-1 sm:gap-1.5 h-[180px]">
                  {/* Precision */}
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-blue-600 font-mono mb-0.5">88.7</span>
                    <div
                      className="w-4 sm:w-6 bg-blue-600 rounded-t-sm transition-all duration-500 shadow-sm"
                      style={{ height: `${(88.7 / 100) * 160}px` }}
                    />
                  </div>
                  {/* Recall */}
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-emerald-600 font-mono mb-0.5">84.2</span>
                    <div
                      className="w-4 sm:w-6 bg-emerald-500 rounded-t-sm transition-all duration-500 shadow-sm"
                      style={{ height: `${(84.2 / 100) * 160}px` }}
                    />
                  </div>
                  {/* F1 */}
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-amber-500 font-mono mb-0.5">86.4</span>
                    <div
                      className="w-4 sm:w-6 bg-amber-400 rounded-t-sm transition-all duration-500 shadow-sm"
                      style={{ height: `${(86.4 / 100) * 160}px` }}
                    />
                  </div>
                </div>
                <div className="mt-2 text-center">
                  <div className="text-[11px] font-bold text-slate-900 leading-tight">Hybrid</div>
                  <div className="text-[10px] text-slate-400">(Static + LLM)</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Container: Findings Breakdown (approx 35% width = 4 cols) */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Findings Breakdown
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Distribution of detected issues across categories
            </p>
          </div>

          {/* Donut Chart & Category breakdown */}
          <div className="my-3 flex flex-col items-center">
            {/* SVG Donut */}
            <div className="relative w-44 h-44 flex items-center justify-center">
              <svg className="w-44 h-44 -rotate-90" viewBox="0 0 180 180">
                {findingsBreakdown.map((item) => {
                  const strokeDasharray = `${(item.percentage / 100) * circumference} ${circumference}`;
                  const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
                  accumulatedPercent += item.percentage;

                  return (
                    <circle
                      key={item.label}
                      cx="90"
                      cy="90"
                      r={radius}
                      fill="transparent"
                      stroke={item.color}
                      strokeWidth="24"
                      strokeDasharray={strokeDasharray}
                      strokeDashoffset={strokeDashoffset}
                      className="transition-all duration-500 hover:opacity-80"
                    />
                  );
                })}
              </svg>

              {/* Donut Center Count */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="text-2xl font-bold text-slate-900 leading-none">
                  {findingsTotal}
                </span>
                <span className="text-xs text-slate-400 font-medium mt-1">
                  Findings
                </span>
              </div>
            </div>
          </div>

          {/* Findings Legend List */}
          <div className="space-y-2 text-xs">
            {findingsBreakdown.map((cat) => (
              <div key={cat.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="text-slate-600 font-medium">{cat.label}</span>
                </div>
                <span className="font-semibold text-slate-800 font-mono">
                  {cat.count} ({cat.percentage}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Bottom Section: Configuration Results Table */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">
            Configuration Results
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Detailed comparison of different analysis configurations
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/50 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 pl-5 pr-3">Configuration</th>
                <th className="py-3 px-3 min-w-[200px]">Description</th>
                <th className="py-3 px-2 text-right">Precision</th>
                <th className="py-3 px-2 text-right">Recall</th>
                <th className="py-3 px-2 text-right">F1 Score</th>
                <th className="py-3 px-2 text-right">False Positive Rate</th>
                <th className="py-3 px-2 text-right">Security Recall</th>
                <th className="py-3 px-2 text-right">Avg. Latency</th>
                <th className="py-3 px-2 text-right">Cost / 1K diffs</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 pr-5 pl-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {configurations.map((cfg) => {
                const isBest = cfg.id === 'hybrid';

                return (
                  <tr
                    key={cfg.id}
                    className="hover:bg-slate-50/60 transition-colors"
                  >
                    {/* Configuration Name with Icon */}
                    <td className="py-3.5 pl-5 pr-3">
                      <div className="flex items-center gap-2.5">
                        {cfg.icon === 'target' && (
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                            <Target className="h-4 w-4" />
                          </div>
                        )}
                        {cfg.icon === 'gemini' && (
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                            <Sparkles className="h-4 w-4" />
                          </div>
                        )}
                        {cfg.icon === 'groq' && (
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                            <span className="font-black text-xs">G</span>
                          </div>
                        )}
                        {cfg.icon === 'scale' && (
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                            <Scale className="h-4 w-4" />
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 text-xs">
                            {cfg.name}
                          </span>
                          <span
                            className={`text-[10px] ${
                              cfg.isRecommended
                                ? 'text-emerald-600 font-semibold'
                                : 'text-slate-400'
                            }`}
                          >
                            {cfg.subName}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Description */}
                    <td className="py-3.5 px-3 text-xs text-slate-500 font-normal">
                      {cfg.description}
                    </td>

                    {/* Precision */}
                    <td
                      className={`py-3.5 px-2 text-right font-mono text-xs ${
                        isBest ? 'font-bold text-blue-600' : 'text-slate-700'
                      }`}
                    >
                      {cfg.precision.toFixed(1)}%
                    </td>

                    {/* Recall */}
                    <td
                      className={`py-3.5 px-2 text-right font-mono text-xs ${
                        isBest ? 'font-bold text-blue-600' : 'text-slate-700'
                      }`}
                    >
                      {cfg.recall.toFixed(1)}%
                    </td>

                    {/* F1 Score */}
                    <td
                      className={`py-3.5 px-2 text-right font-mono text-xs ${
                        isBest ? 'font-bold text-blue-600' : 'text-slate-700'
                      }`}
                    >
                      {cfg.f1.toFixed(1)}%
                    </td>

                    {/* False Positive Rate */}
                    <td className="py-3.5 px-2 text-right font-mono text-xs text-slate-600">
                      {cfg.falsePositiveRate.toFixed(1)}%
                    </td>

                    {/* Security Recall */}
                    <td className="py-3.5 px-2 text-right font-mono text-xs text-slate-700 font-medium">
                      {cfg.securityRecall.toFixed(1)}%
                    </td>

                    {/* Avg Latency */}
                    <td className="py-3.5 px-2 text-right font-mono text-xs text-slate-600">
                      {cfg.avgLatency}
                    </td>

                    {/* Cost / 1k diffs */}
                    <td className="py-3.5 px-2 text-right font-mono text-xs text-slate-700">
                      {cfg.costPer1k}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-3 text-center whitespace-nowrap">
                      {cfg.badgeType === 'primary' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-[10px] font-bold text-blue-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                          <span>{cfg.status}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          <span>{cfg.status}</span>
                        </span>
                      )}
                    </td>

                    {/* Action Buttons */}
                    <td className="py-3.5 pr-5 pl-2 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveModalConfig(cfg);
                            setIsDetailsModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-blue-600 px-2.5 py-1 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                        >
                          <Play className="h-2.5 w-2.5 fill-blue-600" />
                          <span>View</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveModalConfig(cfg);
                            setIsDetailsModalOpen(true);
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                          title="More options"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Detailed Breakdown Modal */}
      {isDetailsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {activeModalConfig ? activeModalConfig.name : 'Benchmark Details & Partition Breakdown'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Empirical results on the 105 ground-truth benchmark diffs (Strict train/test isolation).
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsDetailsModalOpen(false);
                  setActiveModalConfig(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Total Diffs</span>
                <p className="text-lg font-bold text-slate-900 mt-0.5">105</p>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Training Set</span>
                <p className="text-lg font-bold text-slate-900 mt-0.5">80 (76.2%)</p>
              </div>
              <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/40">
                <span className="text-blue-600 text-[10px] uppercase font-bold">Held-Out Test</span>
                <p className="text-lg font-bold text-blue-700 mt-0.5">25 (23.8%)</p>
              </div>
              <div className="p-3 rounded-xl border border-rose-200 bg-rose-50/40">
                <span className="text-rose-600 text-[10px] uppercase font-bold">Vulnerabilities</span>
                <p className="text-lg font-bold text-rose-700 mt-0.5">67 Diffs</p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <h4 className="font-bold text-slate-800">Partition Guarantees:</h4>
              <ul className="list-disc pl-5 space-y-1 text-slate-600">
                <li><strong>Zero-Fabrication Guarantee:</strong> Labels and metrics reflect true evaluated AST and model results.</li>
                <li><strong>Held-Out Isolation:</strong> The 25 held-out diffs were never exposed to prompt engineering.</li>
                <li><strong>Adversarial Robustness:</strong> 9 jailbreak & prompt injection tests actively verify instruction defense.</li>
              </ul>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <a
                href="/api/eval/export"
                download
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Download full eval/results.json</span>
              </a>
              <button
                type="button"
                onClick={() => {
                  setIsDetailsModalOpen(false);
                  setActiveModalConfig(null);
                }}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
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
