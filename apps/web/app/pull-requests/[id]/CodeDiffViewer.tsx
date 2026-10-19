'use client';

import React, { useState } from 'react';
import { Copy, Check, FileCode, GitCompare, Sparkles, AlertCircle } from 'lucide-react';

interface CodeDiffViewerProps {
  filePath: string;
  lineNumber: number;
  currentCode?: string | null;
  surroundingCode?: string | null;
  suggestedFix?: string | null;
}

/**
 * Lightweight token highlighter for code snippets
 */
function renderHighlightedCode(code: string, isOffendingLine: boolean = false) {
  // Regex for keywords, strings, comments, numbers
  const tokens = code.split(/(\b(?:const|let|var|function|return|if|else|for|while|switch|case|default|import|export|from|class|interface|type|async|await|new|try|catch|finally|throw|def|elif|in|is|not|and|or|lambda|null|undefined|true|false)\b|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*$|#.*$|\b\d+\b)/g);

  return (
    <span>
      {tokens.map((token, i) => {
        if (!token) return null;
        if (/^(const|let|var|function|return|if|else|for|while|switch|case|default|import|export|from|class|interface|type|async|await|new|try|catch|finally|throw|def|elif|in|is|not|and|or|lambda|null|undefined|true|false)$/.test(token)) {
          return <span key={i} className="text-purple-400 font-semibold">{token}</span>;
        }
        if (/^(".*"|'.*'|`.*`)$/.test(token)) {
          return <span key={i} className="text-amber-300">{token}</span>;
        }
        if (/^(\/\/.*|#.*)$/.test(token)) {
          return <span key={i} className="text-slate-500 italic">{token}</span>;
        }
        if (/^\d+$/.test(token)) {
          return <span key={i} className="text-cyan-300">{token}</span>;
        }
        return <span key={i} className={isOffendingLine ? 'text-rose-200' : 'text-slate-200'}>{token}</span>;
      })}
    </span>
  );
}

export function CodeDiffViewer({
  filePath,
  lineNumber,
  currentCode,
  surroundingCode,
  suggestedFix,
}: CodeDiffViewerProps) {
  const [activeTab, setActiveTab] = useState<'context' | 'split' | 'diff'>('context');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!suggestedFix) return;
    navigator.clipboard.writeText(suggestedFix);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Parse surrounding code lines
  const parsedLines: Array<{ lineNum: number; content: string; isTarget: boolean }> = [];

  if (surroundingCode) {
    const rawLines = surroundingCode.split('\n');
    for (const raw of rawLines) {
      const match = raw.match(/^(\d+):\s*(.*)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        parsedLines.push({
          lineNum: num,
          content: match[2],
          isTarget: num === lineNumber,
        });
      } else {
        parsedLines.push({
          lineNum: lineNumber,
          content: raw,
          isTarget: true,
        });
      }
    }
  } else if (currentCode) {
    parsedLines.push({
      lineNum: lineNumber,
      content: currentCode,
      isTarget: true,
    });
  }

  const effectiveCurrentCode = currentCode || (parsedLines.find((p) => p.isTarget)?.content ?? '');

  return (
    <div
      className="rounded-xl border border-[#172338] bg-[#06090e] overflow-hidden my-3 select-text"
      data-filepath={filePath}
    >
      {/* Code Inspector Header & Tabs */}
      <div className="bg-[#0b1019] px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-[#172338]">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-cyan-400" />
          <span className="font-mono text-xs text-slate-300 font-semibold truncate max-w-[200px] sm:max-w-xs">
            {filePath}
          </span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-cyan-400">
            L{lineNumber}
          </span>
        </div>

        <div className="flex items-center gap-1 bg-[#06090e] p-0.5 rounded-lg border border-[#172338] text-[11px] font-mono">
          <button
            type="button"
            onClick={() => setActiveTab('context')}
            className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              activeTab === 'context'
                ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Code Context
          </button>
          {suggestedFix && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('split')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                  activeTab === 'split'
                    ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Before/After</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('diff')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                  activeTab === 'diff'
                    ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <GitCompare className="h-3 w-3" />
                <span>Unified Diff</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tab 1: Surrounding Code Context */}
      {activeTab === 'context' && (
        <div className="p-0 overflow-x-auto text-xs font-mono">
          {parsedLines.length > 0 ? (
            <div className="divide-y divide-white/[0.03]">
              {parsedLines.map((line) => (
                <div
                  key={line.lineNum}
                  className={`flex items-stretch font-mono ${
                    line.isTarget
                      ? 'bg-rose-500/15 border-l-2 border-rose-500'
                      : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <span
                    className={`w-12 shrink-0 py-1 pr-3 text-right select-none ${
                      line.isTarget ? 'text-rose-400 font-bold' : 'text-slate-600'
                    }`}
                  >
                    {line.lineNum}
                  </span>
                  <div className="py-1 px-2 overflow-x-auto whitespace-pre flex-1">
                    {renderHighlightedCode(line.content, line.isTarget)}
                  </div>
                  {line.isTarget && (
                    <span className="shrink-0 self-center mr-2 px-1.5 py-0.5 rounded bg-rose-500/30 text-[9px] font-bold text-rose-300 uppercase tracking-wider">
                      Flagged Line
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-slate-500 italic text-center">
              Contextual lines unavailable. Offending line: {lineNumber}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Before / After Patch Split */}
      {activeTab === 'split' && suggestedFix && (
        <div className="p-3 space-y-3 font-mono text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Before (Current Code) */}
            <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 overflow-hidden">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-rose-500/20 text-[10px] font-bold uppercase tracking-wider text-rose-400">
                <span>Current Offending Code</span>
                <span>Line {lineNumber}</span>
              </div>
              <pre className="overflow-x-auto whitespace-pre text-rose-200 text-[11px] p-2 bg-[#06090e]/70 rounded">
                <code>{effectiveCurrentCode || `// Line ${lineNumber}`}</code>
              </pre>
            </div>

            {/* After (Suggested Patch) */}
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 overflow-hidden">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                <span className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Suggested Patch
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-300 hover:bg-emerald-500/30 cursor-pointer transition-colors"
                  aria-label="Copy suggested patch"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
              <pre className="overflow-x-auto whitespace-pre text-emerald-300 text-[11px] p-2 bg-[#06090e]/70 rounded">
                <code>{suggestedFix}</code>
              </pre>
            </div>
          </div>

          {/* Safety Disclaimer */}
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/20 p-2.5 flex items-start gap-2 text-[11px] text-cyan-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-cyan-400" />
            <div>
              <strong className="text-white">Safety Guarantee:</strong> Repositories are never
              automatically modified. Suggested patches must be reviewed and merged by repository
              maintainers.
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Unified Diff View */}
      {activeTab === 'diff' && suggestedFix && (
        <div className="p-3 space-y-3 font-mono text-xs">
          <div className="rounded-lg border border-[#172338] bg-[#0b1019] p-2 overflow-x-auto">
            <div className="text-[10px] text-slate-500 pb-1 mb-1 border-b border-[#172338]">
              @@ -{lineNumber},1 +{lineNumber},1 @@ {filePath}
            </div>
            {effectiveCurrentCode && (
              <div className="bg-rose-950/40 text-rose-300 px-2 py-1 rounded-sm flex items-center gap-2">
                <span className="select-none font-bold text-rose-500">-</span>
                <span className="whitespace-pre overflow-x-auto">{effectiveCurrentCode}</span>
              </div>
            )}
            <div className="bg-emerald-950/40 text-emerald-300 px-2 py-1 rounded-sm flex items-center gap-2 mt-1">
              <span className="select-none font-bold text-emerald-500">+</span>
              <span className="whitespace-pre overflow-x-auto">{suggestedFix}</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Unified Diff format ready for patch evaluation.</span>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-[#172338] bg-[#06090e] px-2.5 py-1 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? 'Patch Copied!' : 'Copy Patch'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
