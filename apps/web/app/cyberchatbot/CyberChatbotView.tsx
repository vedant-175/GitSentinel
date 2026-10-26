'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Shield,
  Bot,
  User,
  Send,
  Sparkles,
  RotateCcw,
  Copy,
  Check,
  ChevronDown,
  Terminal,
  Cpu,
  Layers,
  ArrowRight,
  Code2,
  AlertTriangle,
  CheckCircle2,
  FileCode,
  FolderGit2,
  GitPullRequest,
  Search,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider?: string;
  model?: string;
  timestamp: string;
}

interface CyberChatbotViewProps {
  currentUserLogin?: string;
}

const AVAILABLE_REPOSITORIES = [
  { id: 'GitSentinel', name: 'GitSentinel (Core Platform)', desc: 'Autonomous AI Code Review & Security Gate Platform' },
  { id: 'api-service', name: 'api-service (Backend APIs)', desc: 'Backend microservices, rate-limiting, and database access' },
  { id: 'auth-gateway', name: 'auth-gateway (OAuth & JWT)', desc: 'Authentication service and token management' },
  { id: 'web-dashboard', name: 'web-dashboard (Web App)', desc: 'Developer console and PR review web interface' },
];

const PRESET_QUERIES = [
  {
    title: 'Audit OWASP Top 10',
    icon: Shield,
    color: 'text-blue-600 bg-blue-50 border-blue-200/60 dark:bg-blue-950/40 dark:border-blue-800/40 dark:text-blue-400',
    prompt: 'Audit this repository against OWASP Top 10 vulnerabilities (SQLi, broken auth, path traversal, hardcoded secrets). What are the highest priority findings?',
  },
  {
    title: 'Simulate Attack Vector',
    icon: AlertTriangle,
    color: 'text-amber-600 bg-amber-50 border-amber-200/60 dark:bg-amber-950/40 dark:border-amber-800/40 dark:text-amber-400',
    prompt: 'Provide a realistic exploit scenario for the detected vulnerabilities in this codebase. How would an external adversary target these endpoints?',
  },
  {
    title: 'Generate Secure Patch',
    icon: Code2,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200/60 dark:bg-emerald-950/40 dark:border-emerald-800/40 dark:text-emerald-400',
    prompt: 'Show me the exact code patch and drop-in replacement code to fix the detected security issues using safe parameterization and environment secrets.',
  },
  {
    title: 'Explain Merge Gate Rule',
    icon: Zap,
    color: 'text-purple-600 bg-purple-50 border-purple-200/60 dark:bg-purple-950/40 dark:border-purple-800/40 dark:text-purple-400',
    prompt: 'Why would GitSentinel trigger a BLOCK verdict on a Pull Request? Explain the security thresholds, AST heuristics, and how to unblock it.',
  },
];

export function CyberChatbotView({ currentUserLogin = '' }: CyberChatbotViewProps) {
  const [selectedRepo, setSelectedRepo] = useState('GitSentinel');
  const [selectedPr, setSelectedPr] = useState<string>('3');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `### Welcome to GitSentinel AI 🛡️\n\nI am connected directly to your workspace${
        currentUserLogin ? ` for **@${currentUserLogin}**` : ''
      } with live AST analysis and zero-trust security gate telemetry.\n\nYou can ask me to:\n- **Audit code changes** for vulnerabilities (SQL Injection, Path Traversal, Secrets leak, Insecure Deserialization)\n- **Generate production-ready security patches** with syntax highlighted diffs\n- **Simulate attack vectors** and threat models\n- **Explain why a PR merge gate is blocked** and what changes will unblock it\n\nSelect a preset prompt below or ask any question about your codebase:`,
      timestamp: 'Ready',
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prId: selectedPr,
          repoId: selectedRepo,
          message: text,
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        throw new Error(`Chat request returned HTTP ${res.status}`);
      }

      const data = await res.json();

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.response || 'No response generated.',
        provider: data.provider || 'groq',
        model: data.model || 'openai/gpt-oss-120b',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('Chat error:', err);
      const errorMsg: ChatMessage = {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **Connection Error**: ${err.message || 'Unable to communicate with GitSentinel AI.'}\n\nPlease check your internet connection or verify your API configuration in Settings.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: `Conversation reset. Context scoped to **\`${selectedRepo}\`**. How can I assist you with your security review?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
      },
    ]);
  };

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
                CyberChatbot
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/40">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Engine
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Autonomous Security Co-pilot & AST Telemetry Assistant for @{currentUserLogin}
              </p>
            </div>
          </div>
        </div>

        {/* Right Header: Model Specs & Scope Selectors */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Repository Selector */}
          <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 py-1.5 rounded-lg text-xs shadow-xs">
            <FolderGit2 className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={selectedRepo}
              onChange={(e) => setSelectedRepo(e.target.value)}
              className="bg-transparent font-medium text-slate-700 dark:text-zinc-200 outline-none cursor-pointer"
            >
              {AVAILABLE_REPOSITORIES.map((r) => (
                <option key={r.id} value={r.id} className="bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-200">
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* PR Selector */}
          <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 py-1.5 rounded-lg text-xs shadow-xs">
            <GitPullRequest className="h-3.5 w-3.5 text-blue-500" />
            <select
              value={selectedPr}
              onChange={(e) => setSelectedPr(e.target.value)}
              className="bg-transparent font-medium text-slate-700 dark:text-zinc-200 outline-none cursor-pointer"
            >
              <option value="3" className="bg-white dark:bg-zinc-900">PR #3: Rate Limiting & Auth</option>
              <option value="5" className="bg-white dark:bg-zinc-900">PR #5: Full Stack JWT Auth</option>
              <option value="6" className="bg-white dark:bg-zinc-900">PR #6: File Download Path Traversal</option>
              <option value="all" className="bg-white dark:bg-zinc-900">General Repository Context</option>
            </select>
          </div>

          {/* Reset Chat Button */}
          <button
            type="button"
            onClick={handleClearHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 shadow-xs transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Clear Chat</span>
          </button>
        </div>
      </div>

      {/* 2. Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ========================================================= */}
        {/* LEFT COLUMN: QUICK PROMPT PRESETS & ENGINE TELEMETRY      */}
        {/* ========================================================= */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Quick Prompts Panel */}
          <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                Security Prompt Presets
              </h2>
            </div>
            <div className="space-y-2">
              {PRESET_QUERIES.map((preset) => {
                const Icon = preset.icon;
                return (
                  <button
                    key={preset.title}
                    type="button"
                    onClick={() => handleSendMessage(preset.prompt)}
                    className="w-full text-left p-3 rounded-xl border border-slate-200/80 dark:border-zinc-800/80 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-all group cursor-pointer flex items-start gap-3"
                  >
                    <div className={`p-2 rounded-lg border shrink-0 ${preset.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-800 dark:text-zinc-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {preset.title}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-2 mt-0.5">
                        {preset.prompt}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI Engine Status & Keypool Telemetry */}
          <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                  AI Architecture
                </h3>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                HEALTHY
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800">
                <span className="text-slate-500 dark:text-zinc-400">Primary Engine (Tier 1)</span>
                <span className="font-semibold text-slate-800 dark:text-zinc-200">Groq: gpt-oss-120b</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800">
                <span className="text-slate-500 dark:text-zinc-400">Secondary Fallback (Tier 2)</span>
                <span className="font-semibold text-slate-800 dark:text-zinc-200">Gemini 2.0 Flash</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800">
                <span className="text-slate-500 dark:text-zinc-400">Zero-Key Offline Fallback</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Deterministic GitSentinel AI</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800">
                <span className="text-slate-500 dark:text-zinc-400">Key Pool Auto-Rotation</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">5 Rotated Keys (429-Safe)</span>
              </div>
            </div>
          </div>

          {/* Quick Shortcuts to Repos & Pull Requests */}
          <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 mb-2">
              Cross-Platform Navigation
            </h3>
            <div className="space-y-1.5 text-xs">
              <Link
                href="/pull-requests"
                className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-900 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <div className="flex items-center gap-2">
                  <GitPullRequest className="h-3.5 w-3.5" />
                  <span>Inspect Pull Requests Queue</span>
                </div>
                <ArrowRight className="h-3 w-3" />
              </Link>
              <Link
                href="/repositories"
                className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-900 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FolderGit2 className="h-3.5 w-3.5" />
                  <span>View All 10 Connected Repositories</span>
                </div>
                <ArrowRight className="h-3 w-3" />
              </Link>
              <Link
                href="/security"
                className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-900 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>View Active Security Findings</span>
                </div>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: MAIN CHAT TERMINAL INTERFACE                */}
        {/* ========================================================= */}
        <div className="lg:col-span-8 flex flex-col rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xs h-[720px] overflow-hidden">
          
          {/* Chat Stream Messages */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {messages.map((msg) => {
              const isAssistant = msg.role === 'assistant';

              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 max-w-3xl ${isAssistant ? '' : 'ml-auto flex-row-reverse'}`}
                >
                  {/* Avatar */}
                  <div
                    className={`h-8 w-8 rounded-xl shrink-0 flex items-center justify-center shadow-xs ${
                      isAssistant
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-white dark:bg-zinc-800'
                    }`}
                  >
                    {isAssistant ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </div>

                  {/* Bubble */}
                  <div
                    className={`rounded-2xl p-4 text-sm leading-relaxed border transition-all ${
                      isAssistant
                        ? 'bg-slate-50/80 dark:bg-zinc-900/80 border-slate-200/80 dark:border-zinc-800/80 text-slate-800 dark:text-zinc-200'
                        : 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    }`}
                  >
                    {/* Header info for assistant */}
                    {isAssistant && (
                      <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-zinc-800/60 pb-2 mb-2 text-[11px] text-slate-500 dark:text-zinc-400">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 dark:text-zinc-200">GitSentinel AI</span>
                          {msg.provider && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-semibold text-[10px]">
                              {msg.provider}
                            </span>
                          )}
                          {msg.model && (
                            <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                              {msg.model}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.content, msg.id)}
                          className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-600" />
                              <span className="text-emerald-600 font-semibold">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Content Body formatted with rich Markdown */}
                    {isAssistant ? (
                      <MarkdownRenderer content={msg.content} className="text-sm" />
                    ) : (
                      <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                        {msg.content}
                      </div>
                    )}

                    <div
                      className={`text-[10px] mt-2 ${
                        isAssistant ? 'text-slate-400 dark:text-zinc-400' : 'text-blue-100 text-right'
                      }`}
                    >
                      {msg.timestamp}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Loading Indicator */}
            {loading && (
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 animate-pulse">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-2xl p-4 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping" />
                  <span>Analyzing AST semantics and synthesizing security review with Groq...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar & Actions */}
          <div className="border-t border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/60 p-3 sm:p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Ask about security vulnerabilities, code fixes, or PR #${selectedPr}...`}
                className="flex-1 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-xs"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                <span>Send</span>
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
            <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-zinc-500 mt-2 px-1">
              <span>Press <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-[10px]">Enter</kbd> to send query</span>
              <span>Scoping: {selectedRepo} (PR #{selectedPr})</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
