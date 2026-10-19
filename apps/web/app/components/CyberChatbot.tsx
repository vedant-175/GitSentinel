'use client';

import React, { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  X,
  Send,
  Shield,
  Bot,
  User,
  Copy,
  Check,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider?: string;
  timestamp: string;
}

interface CyberChatbotProps {
  prId?: string | number;
  repoId?: string | number;
  repoFullName?: string;
  defaultOpen?: boolean;
}

export function CyberChatbot({
  prId: initialPrId,
  repoId: initialRepoId,
  repoFullName,
  defaultOpen = false,
}: CyberChatbotProps) {
  const pathname = usePathname();

  const routePrId = pathname?.match(/\/pull-requests\/(\d+)/)?.[1];
  const routeRepoId = pathname?.match(/\/repositories\/(\d+)/)?.[1];
  const prId = initialPrId || routePrId;
  const repoId = initialRepoId || routeRepoId;
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hello! I am **GitSentinel AI**. 
I have real-time access to security rules, AST analysis, and repository telemetry${
        repoFullName ? ` for **${repoFullName}**` : ''
      }${prId ? ` (PR #${prId})` : ''}.

How can I assist you with this codebase or security review today?`,
      timestamp: 'Ready',
      provider: 'Gemini 2.0 Flash',
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  useEffect(() => {
    const handleToggleChat = (e?: any) => {
      if (e?.detail?.open !== undefined) {
        setIsOpen(Boolean(e.detail.open));
      } else {
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('open-cyber-chat', handleToggleChat);
    return () => window.removeEventListener('open-cyber-chat', handleToggleChat);
  }, []);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loadingRef.current) return;

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
          prId: prId ? String(prId) : undefined,
          repoId: repoId ? String(repoId) : undefined,
          message: text,
          messages: [...messagesRef.current, userMsg].map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        throw new Error(`Chat request failed (${res.status})`);
      }

      const data = await res.json();

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.response || 'No response generated.',
        provider: data.provider || 'Gemini 2.0 Flash',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('Chat error:', err);
      const errorMsg: ChatMessage = {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **Connection Error**: ${err.message || 'Unable to communicate with GitSentinel AI.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessageRef = useRef(handleSendMessage);
  handleSendMessageRef.current = handleSendMessage;

  useEffect(() => {
    const handleAskAiEvent = (e: any) => {
      const detail = e.detail;
      if (!detail?.text) return;
      setIsOpen(true);
      const filePathStr = detail.filePath ? ` from \`${detail.filePath}\`` : '';
      const prompt = `Can you review and explain this code snippet${filePathStr}?\n\n\`\`\`\n${detail.text.trim()}\n\`\`\`\n\nWhat does this code do, and are there any security vulnerabilities, edge-case bugs, or performance improvements?`;

      setTimeout(() => {
        handleSendMessageRef.current(prompt);
      }, 50);
    };

    window.addEventListener('cyberops:ask-ai', handleAskAiEvent);
    return () => {
      window.removeEventListener('cyberops:ask-ai', handleAskAiEvent);
    };
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: `Chat history cleared. How can I help you with GitSentinel?`,
        timestamp: 'Ready',
      },
    ]);
  };

  const quickPrompts = [
    { label: '🛡️ Why is merge blocked?', query: 'Why is this PR blocked from merging?' },
    { label: '💻 Show vulnerability fix', query: 'Show me the exact code patch to fix the detected vulnerability' },
    { label: '⚔️ Attack Scenario', query: 'Show me an attack scenario for this vulnerability' },
    { label: '📋 Summarize PR', query: 'Summarize all the findings in this PR' },
  ];

  if (pathname === '/login') return null;

  return (
    <>
      {/* Exact Floating Pill Button Matching User Screenshot */}
      <button
        data-chat-toggle="true"
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-3 rounded-[20px] border border-slate-200/90 bg-white px-5 py-3 shadow-[0_10px_25px_-5px_rgba(15,23,42,0.1),0_8px_10px_-6px_rgba(15,23,42,0.06)] hover:shadow-[0_14px_28px_-5px_rgba(15,23,42,0.14)] hover:border-slate-300 active:scale-[0.98] transition-all cursor-pointer select-none group"
        aria-label="Ask GitSentinel AI"
      >
        {/* Speech Bubble Icon with 3 Dots inside */}
        <div className="flex items-center justify-center text-slate-800 transition-colors">
          <svg
            className="h-5 w-5 stroke-[2]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
            <circle cx="8" cy="12" r="0.8" fill="currentColor" />
            <circle cx="12" cy="12" r="0.8" fill="currentColor" />
            <circle cx="16" cy="12" r="0.8" fill="currentColor" />
          </svg>
        </div>

        {/* Label Text */}
        <span className="text-[14.5px] font-semibold tracking-tight text-slate-800">
          Ask GitSentinel AI
        </span>

        {/* Thin Vertical Divider */}
        <div className="h-5 w-px bg-slate-200 mx-0.5" />

        {/* Chevron Up / Down Icon */}
        <div className="text-slate-800 flex items-center justify-center">
          {isOpen ? (
            <ChevronDown className="h-4.5 w-4.5 stroke-[2.2]" />
          ) : (
            <ChevronUp className="h-4.5 w-4.5 stroke-[2.2]" />
          )}
        </div>
      </button>

      {/* Floating Chat Window Opened Above the Pill */}
      {isOpen && (
        <div
          className={`fixed z-50 transition-all duration-200 flex flex-col ${
            isExpanded
              ? 'inset-4 md:inset-8 rounded-2xl'
              : 'bottom-22 right-6 w-full max-w-lg h-[580px] rounded-2xl'
          } border border-slate-200 bg-white shadow-2xl shadow-slate-300/60 overflow-hidden animate-fade-in`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-200/60">
                <Shield className="h-4 w-4 fill-blue-600/20" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900">GitSentinel AI</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 text-[9px] font-bold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    LIVE
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 font-medium">
                  {prId ? `PR #${prId}` : repoFullName ? repoFullName : 'AI Security Copilot'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 text-slate-400">
              <button
                type="button"
                onClick={handleClearHistory}
                className="rounded-lg p-1.5 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Clear chat history"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="rounded-lg p-1.5 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title={isExpanded ? 'Minimize' : 'Maximize'}
              >
                {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Quick Prompts Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-2 bg-slate-50/40 border-b border-slate-100 no-scrollbar">
            {quickPrompts.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(p.query)}
                disabled={loading}
                className="whitespace-nowrap rounded-lg bg-white border border-slate-200/90 hover:border-blue-400 hover:text-blue-600 px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs bg-slate-50/20">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role === 'assistant' && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100 mt-0.5">
                    <Bot className="h-4 w-4" />
                  </div>
                )}

                <div
                  className={`relative max-w-[85%] rounded-2xl p-3.5 leading-relaxed text-xs shadow-2xs ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white font-medium rounded-tr-xs'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
                  }`}
                >
                  <div className="whitespace-pre-wrap select-text leading-relaxed">
                    {m.content}
                  </div>

                  {m.role === 'assistant' && (
                    <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                      <span suppressHydrationWarning className="font-mono">
                        {m.provider ? `Model: ${m.provider}` : m.timestamp}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(m.content, m.id)}
                        className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer"
                      >
                        {copiedId === m.id ? (
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
                </div>

                {m.role === 'user' && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-700 mt-0.5">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-blue-600 text-xs font-medium pl-1">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>GitSentinel AI analyzing repository context...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="border-t border-slate-100 bg-white p-3 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this code, PR #, security vulnerabilities, or fixes..."
              disabled={loading}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-all disabled:opacity-40 cursor-pointer shadow-xs"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
