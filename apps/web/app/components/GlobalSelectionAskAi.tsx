'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Bot, Sparkles } from 'lucide-react';

interface SelectionPos {
  top: number;
  left: number;
  text: string;
  filePath?: string;
  repoFullName?: string;
}

export function GlobalSelectionAskAi() {
  const pathname = usePathname();
  const [pos, setPos] = useState<SelectionPos | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Never render on unauthenticated auth pages like /login or /register
  const isAuthPage = pathname === '/login' || pathname === '/register';

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setPos(null);
        return;
      }

      const text = selection.toString().trim();
      if (text.length < 2) {
        setPos(null);
        return;
      }

      // Ignore selection inside input or textarea
      const anchorNode = selection.anchorNode;
      const element = anchorNode instanceof HTMLElement ? anchorNode : anchorNode?.parentElement;
      if (
        element &&
        (element.tagName === 'INPUT' ||
          element.tagName === 'TEXTAREA' ||
          element.isContentEditable ||
          element.closest('input') ||
          element.closest('textarea'))
      ) {
        setPos(null);
        return;
      }

      try {
        if (selection.rangeCount === 0) {
          setPos(null);
          return;
        }

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          setPos(null);
          return;
        }

        // Try to identify nearest file path from DOM context
        let detectedFilePath: string | undefined;
        let detectedRepo: string | undefined;

        if (element) {
          const fileContainer = element.closest('[data-filepath]');
          if (fileContainer) {
            detectedFilePath = fileContainer.getAttribute('data-filepath') || undefined;
            detectedRepo = fileContainer.getAttribute('data-repofullname') || undefined;
          }
        }

        // Position: slightly above the selection, or below if too close to viewport top
        let top = rect.top - 44;
        if (top < 12) {
          top = rect.bottom + 8;
        }
        let left = rect.left + rect.width / 2 - 80;
        if (left < 10) left = 10;
        if (left + 170 > window.innerWidth) {
          left = window.innerWidth - 180;
        }

        setPos({
          top,
          left,
          text,
          filePath: detectedFilePath,
          repoFullName: detectedRepo,
        });
      } catch {
        setPos(null);
      }
    };

    // Listen to selection change and mouseup
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mouseup', handleSelectionChange);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mouseup', handleSelectionChange);
    };
  }, []);

  if (isAuthPage || !pos || !pos.text) return null;

  const handleAsk = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const selectedText = pos.text;
    const filePath = pos.filePath;
    const repoFullName = pos.repoFullName;

    // Direct to GitSentinel AI
    const eventDetail = {
      text: selectedText,
      filePath,
      repoFullName,
    };
    window.dispatchEvent(new CustomEvent('gitsentinel:ask-ai', { detail: eventDetail }));
    window.dispatchEvent(new CustomEvent('cyberops:ask-ai', { detail: eventDetail }));
    window.dispatchEvent(new CustomEvent('open-cyber-chat', { detail: { open: true } }));

    // Clear selection and close floating pill
    setPos(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: `${pos.top}px`,
        left: `${pos.left}px`,
        zIndex: 999999,
      }}
      className="pointer-events-auto animate-in fade-in zoom-in-95 duration-150 select-none"
    >
      <button
        type="button"
        onMouseDown={(e) => {
          // Prevent browser from clearing selection before click fires
          e.preventDefault();
        }}
        onClick={handleAsk}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 text-xs font-semibold shadow-[0_10px_25px_-5px_rgba(15,23,42,0.1),0_8px_10px_-6px_rgba(15,23,42,0.06)] dark:shadow-[0_10px_25px_-5px_rgba(0,0,0,0.6)] hover:border-slate-300 dark:hover:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-900 active:scale-[0.98] transition-all cursor-pointer"
      >
        <div className="flex items-center justify-center text-slate-700 dark:text-zinc-200">
          <svg
            className="h-3.5 w-3.5 stroke-[2]"
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
        <span>Ask GitSentinel AI</span>
        <Sparkles className="h-3 w-3 text-slate-400 dark:text-zinc-400" />
      </button>
    </div>
  );
}
