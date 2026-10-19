'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bot, Sparkles } from 'lucide-react';

interface SelectionPos {
  top: number;
  left: number;
  text: string;
  filePath?: string;
  repoFullName?: string;
}

export function GlobalSelectionAskAi() {
  const [pos, setPos] = useState<SelectionPos | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  if (!pos || !pos.text) return null;

  const handleAsk = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const selectedText = pos.text;
    const filePath = pos.filePath;
    const repoFullName = pos.repoFullName;

    // Direct to CyberOps AI
    window.dispatchEvent(
      new CustomEvent('cyberops:ask-ai', {
        detail: {
          text: selectedText,
          filePath,
          repoFullName,
        },
      })
    );

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
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-400 hover:bg-cyan-300 text-black font-mono text-xs font-bold shadow-[0_0_25px_rgba(0,240,255,0.75)] border border-cyan-200 hover:scale-105 active:scale-95 transition-all cursor-pointer"
      >
        <Bot className="h-3.5 w-3.5 text-black" />
        <span>Ask CyberOps AI</span>
        <Sparkles className="h-3 w-3 text-black animate-pulse" />
      </button>
    </div>
  );
}
