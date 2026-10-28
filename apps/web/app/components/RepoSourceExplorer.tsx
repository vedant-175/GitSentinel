'use client';

import React, { useState, useEffect } from 'react';
import {
  FolderGit2,
  FileCode,
  Folder,
  FolderOpen,
  File,
  Sparkles,
  Loader2,
  Copy,
  Check,
  ShieldAlert,
  ChevronRight,
  Code,
  Bot,
  RefreshCw,
  Home,
  CornerLeftUp,
} from 'lucide-react';

interface RepoSourceExplorerProps {
  repoFullName: string;
  initialIssues?: Array<any>;
}

interface RepoFile {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
}

export function RepoSourceExplorer({
  repoFullName,
  initialIssues = [],
}: RepoSourceExplorerProps) {
  const [files, setFiles] = useState<RepoFile[]>([]);
  const [currentDirectory, setCurrentDirectory] = useState<string>('');
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [activeFileContent, setActiveFileContent] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [fileReview, setFileReview] = useState<{
    markdown: string;
    provider: string;
    model?: string;
    tier?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSnippet, setSelectedSnippet] = useState<string>('');

  useEffect(() => {
    const handleSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setSelectedSnippet('');
        return;
      }
      const text = sel.toString().trim();
      if (text.length >= 2) {
        setSelectedSnippet(text);
      } else {
        setSelectedSnippet('');
      }
    };
    document.addEventListener('selectionchange', handleSelection);
    return () => document.removeEventListener('selectionchange', handleSelection);
  }, []);

  // 1. Fetch directory contents or file
  const loadDirectory = async (dirPath: string = '', autoSelectFirst = false) => {
    setLoadingFiles(true);
    setError(null);
    try {
      const res = await fetch('/api/repositories/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoFullName, path: dirPath }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.isDir && data.files) {
        setFiles(data.files);
        setCurrentDirectory(dirPath);

        if (autoSelectFirst && data.activeFilePath && data.activeFileContent) {
          setActiveFilePath(data.activeFilePath);
          setActiveFileContent(data.activeFileContent);
        }
      } else if (data.activeFileContent) {
        setActiveFilePath(data.activeFilePath || dirPath);
        setActiveFileContent(data.activeFileContent);
      }
    } catch (err: any) {
      console.error('[RepoSourceExplorer] Error:', err);
      setError(err.message || 'Failed to load file tree');
    } finally {
      setLoadingFiles(false);
    }
  };

  // Initial mount load
  useEffect(() => {
    loadDirectory('', true);
  }, [repoFullName]);

  // 2. Click on a file or folder
  const handleItemClick = async (item: RepoFile) => {
    if (item.type === 'dir') {
      // Navigate into folder
      await loadDirectory(item.path, false);
    } else {
      // Select and view file
      if (item.path === activeFilePath && activeFileContent) return;
      setActiveFilePath(item.path);
      setLoadingContent(true);
      setFileReview(null);
      try {
        const res = await fetch('/api/repositories/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoFullName, path: item.path }),
        });
        const data = await res.json();
        if (data.activeFileContent) {
          setActiveFileContent(data.activeFileContent);
        }
      } catch (err) {
        console.error('Failed to load file content:', err);
      } finally {
        setLoadingContent(false);
      }
    }
  };

  // Navigate back to parent folder
  const handleNavigateUp = () => {
    if (!currentDirectory) return;
    const parts = currentDirectory.split('/');
    parts.pop();
    const parentPath = parts.join('/');
    loadDirectory(parentPath, false);
  };

  // 3. Trigger Instant AI Review on Active File
  const handleReviewActiveFile = async () => {
    if (!activeFilePath || !activeFileContent || reviewing) return;
    setReviewing(true);
    try {
      const res = await fetch('/api/repositories/review-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoFullName,
          filePath: activeFilePath,
          content: activeFileContent,
        }),
      });
      const data = await res.json();
      if (data.reviewMarkdown) {
        setFileReview({
          markdown: data.reviewMarkdown,
          provider: data.provider,
          model: data.model,
          tier: data.tier,
        });
      }
    } catch (err) {
      console.error('File review failed:', err);
    } finally {
      setReviewing(false);
    }
  };

  const handleCopyCode = () => {
    if (!activeFileContent) return;
    navigator.clipboard.writeText(activeFileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filter issues for active file
  const activeFileIssues = initialIssues.filter(
    (iss) => iss.filePath === activeFilePath || activeFilePath?.endsWith(iss.filePath)
  );

  // Compute breadcrumbs
  const breadcrumbParts = currentDirectory ? currentDirectory.split('/') : [];

  return (
    <div className="rounded-2xl border border-[#172338] bg-[#0b1019] shadow-2xl overflow-hidden animate-fade-in font-sans">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#172338] bg-[#06090e] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
            <Code className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white font-mono flex items-center gap-1.5">
              <span>{repoFullName}</span>
              <span className="text-[10px] text-slate-500">&bull; Source Code Explorer</span>
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              {files.length} items in current view &bull; Connected via GitSentinel Resilient Engine
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadDirectory(currentDirectory, false)}
            disabled={loadingFiles}
            className="rounded-xl border border-[#172338] bg-[#090d15] px-2.5 py-1.5 text-xs font-mono text-slate-400 hover:text-white hover:border-cyan-500/40 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
            title="Refresh File List"
          >
            <RefreshCw className={`h-3 w-3 ${loadingFiles ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Reload</span>
          </button>

          {/* Ask GitSentinel AI on Selected Text */}
          {selectedSnippet && (
            <button
              onClick={() => {
                const detail = {
                  text: selectedSnippet,
                  filePath: activeFilePath,
                  repoFullName,
                };
                window.dispatchEvent(new CustomEvent('gitsentinel:ask-ai', { detail }));
                window.dispatchEvent(new CustomEvent('cyberops:ask-ai', { detail }));
                window.dispatchEvent(new CustomEvent('open-cyber-chat', { detail: { open: true } }));
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-zinc-100 shadow-sm hover:border-slate-300 dark:hover:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-900 active:scale-95 transition-all cursor-pointer"
              title="Direct to GitSentinel AI with highlighted code"
            >
              <div className="flex items-center justify-center text-slate-700 dark:text-zinc-300">
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
              <span>Ask GitSentinel AI ({selectedSnippet.length} chars)</span>
              <Sparkles className="h-3 w-3 text-slate-400 dark:text-zinc-400" />
            </button>
          )}

          {activeFileContent && (
            <button
              onClick={handleReviewActiveFile}
              disabled={reviewing}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 px-3 py-1.5 text-xs font-mono font-bold text-black shadow-[0_0_15px_rgba(0,240,255,0.3)] hover:scale-105 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              {reviewing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Reviewing with Groq (120B)...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Review This File with AI</span>
                </>
              )}
            </button>
          )}

          {activeFileContent && (
            <button
              onClick={handleCopyCode}
              className="rounded-xl border border-[#172338] bg-[#090d15] px-2.5 py-1.5 text-xs font-mono text-slate-300 hover:text-white hover:border-cyan-500/40 transition-colors flex items-center gap-1 cursor-pointer"
              title="Copy code"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Sidebar File Tree + Code Viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[520px]">
        {/* Left Sidebar: File Tree */}
        <div className="lg:col-span-4 border-r border-[#172338] bg-[#06090e]/70 p-3 space-y-2 overflow-y-auto max-h-[650px] flex flex-col justify-between">
          <div>
            {/* Breadcrumb Navigation */}
            <div className="flex items-center flex-wrap gap-1 text-[11px] font-mono pb-2 border-b border-[#172338] text-slate-400">
              <button
                onClick={() => loadDirectory('', false)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#0f172a] hover:text-cyan-300 cursor-pointer transition-colors ${
                  !currentDirectory ? 'text-cyan-400 font-bold' : ''
                }`}
                title="Go to root"
              >
                <Home className="h-3 w-3" />
                <span>root</span>
              </button>

              {breadcrumbParts.map((part, index) => {
                const stepPath = breadcrumbParts.slice(0, index + 1).join('/');
                const isLast = index === breadcrumbParts.length - 1;
                return (
                  <React.Fragment key={stepPath}>
                    <span className="text-slate-600">/</span>
                    <button
                      onClick={() => loadDirectory(stepPath, false)}
                      className={`px-1 py-0.5 rounded hover:bg-[#0f172a] hover:text-cyan-300 cursor-pointer transition-colors ${
                        isLast ? 'text-cyan-400 font-bold' : ''
                      }`}
                    >
                      {part}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Back to Parent Directory Button */}
            {currentDirectory && (
              <button
                onClick={handleNavigateUp}
                className="w-full mt-2 flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-mono text-slate-400 hover:text-white hover:bg-[#0f172a] border border-dashed border-[#172338] transition-all cursor-pointer"
              >
                <CornerLeftUp className="h-3.5 w-3.5 text-cyan-400" />
                <span>.. (Up to parent directory)</span>
              </button>
            )}

            {/* Loading Indicator */}
            {loadingFiles && (
              <div className="flex items-center gap-2 p-4 text-xs font-mono text-cyan-400 animate-pulse">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Fetching folder contents...</span>
              </div>
            )}

            {/* Empty Folder Notice */}
            {!loadingFiles && files.length === 0 && (
              <div className="p-4 text-center space-y-2">
                <div className="text-xs font-mono text-slate-500">No files found in this directory.</div>
                <button
                  onClick={() => loadDirectory('', true)}
                  className="text-[11px] font-mono text-cyan-400 hover:underline cursor-pointer"
                >
                  Return to repository root
                </button>
              </div>
            )}

            {/* File & Folder List */}
            <div className="mt-2 space-y-1">
              {files.map((file) => {
                const isDir = file.type === 'dir';
                const isSelected = file.path === activeFilePath;
                const hasIssue = initialIssues.some(
                  (i) => i.filePath === file.path || i.filePath?.endsWith(file.name)
                );

                return (
                  <button
                    key={file.path}
                    onClick={() => handleItemClick(file)}
                    className={`w-full flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-xs font-mono transition-all text-left cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/40 shadow-[0_0_15px_rgba(0,240,255,0.15)] font-bold'
                        : isDir
                        ? 'text-amber-300 hover:bg-[#0f172a] hover:text-amber-200 border border-transparent'
                        : 'text-slate-400 hover:bg-[#0f172a] hover:text-white border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {isDir ? (
                        <Folder className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <FileCode className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                      )}
                      <span className="truncate">{file.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {hasIssue && (
                        <span
                          className="flex h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_6px_#f43f5e]"
                          title="Security Finding Detected"
                        />
                      )}
                      {isDir ? (
                        <span className="text-[10px] text-amber-400/60 font-semibold uppercase">dir</span>
                      ) : (
                        <ChevronRight
                          className={`h-3 w-3 ${isSelected ? 'text-cyan-400' : 'text-slate-600'}`}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Directory Summary Footer */}
          <div className="pt-2 border-t border-[#172338] text-[10px] font-mono text-slate-500 flex items-center justify-between">
            <span>{files.filter((f) => f.type === 'dir').length} folders</span>
            <span>{files.filter((f) => f.type === 'file').length} files</span>
          </div>
        </div>

        {/* Right Area: Code Display & Inline Findings */}
        <div
          className="lg:col-span-8 flex flex-col bg-[#0b1019] overflow-hidden"
          data-filepath={activeFilePath || ''}
          data-repofullname={repoFullName}
        >
          {/* Active File Header */}
          <div className="flex items-center justify-between border-b border-[#172338] bg-[#070b12] px-4 py-2.5 text-xs font-mono">
            <div className="flex items-center gap-2 text-slate-300">
              <FileCode className="h-3.5 w-3.5 text-cyan-400" />
              <span className="font-bold text-white truncate max-w-sm">
                {activeFilePath || 'Select a file to inspect'}
              </span>
              {activeFileIssues.length > 0 && (
                <span className="rounded bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 text-[10px] text-rose-400 font-bold shrink-0">
                  {activeFileIssues.length} Vulnerability Flagged
                </span>
              )}
            </div>

            <div className="text-[11px] text-slate-500 shrink-0">
              {activeFileContent ? `${activeFileContent.split('\n').length} lines` : ''}
            </div>
          </div>

          {/* AI Review Drawer Banner */}
          {fileReview && (
            <div className="border-b border-cyan-500/30 bg-[#06090e] p-4 text-xs font-sans space-y-2 animate-fade-in">
              <div className="flex items-center justify-between font-mono text-[11px] pb-2 border-b border-[#172338]">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-cyan-400" />
                  <span className="font-bold text-cyan-300">GitSentinel AI Code Review</span>
                  <span className="rounded bg-cyan-500/10 border border-cyan-500/30 px-1.5 py-0.5 text-[10px] text-cyan-300 font-bold">
                    {fileReview.tier || fileReview.provider?.toUpperCase()}
                  </span>
                </div>
                <button
                  onClick={() => setFileReview(null)}
                  className="text-slate-500 hover:text-white transition-colors cursor-pointer"
                >
                  ✕ Close Review
                </button>
              </div>

              <div className="max-h-64 overflow-y-auto whitespace-pre-wrap text-slate-200 font-sans text-xs leading-relaxed select-text pr-2">
                {fileReview.markdown}
              </div>
            </div>
          )}

          {/* Code Viewer Body */}
          <div className="flex-1 overflow-auto bg-[#04060a] p-4 font-mono text-xs max-h-[600px]">
            {loadingContent && (
              <div className="flex items-center justify-center p-16 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin text-cyan-400 mr-2" />
                <span>Loading source code...</span>
              </div>
            )}

            {!loadingContent && !activeFileContent && (
              <div className="p-16 text-center text-slate-500 space-y-2">
                <FileCode className="h-8 w-8 mx-auto text-slate-600" />
                <p>Select any file from the repository tree on the left to inspect its code.</p>
              </div>
            )}

            {!loadingContent && activeFileContent && (
              <div className="space-y-0.5">
                {activeFileContent.split('\n').map((line, idx) => {
                  const lineNum = idx + 1;
                  const issueOnThisLine = activeFileIssues.find((i) => i.lineNumber === lineNum);

                  return (
                    <div key={lineNum} className="group flex flex-col">
                      <div
                        className={`flex items-start hover:bg-slate-900/60 rounded px-1 transition-colors ${
                          issueOnThisLine ? 'bg-rose-950/20 border-l-2 border-rose-500' : ''
                        }`}
                      >
                        {/* Line number gutter */}
                        <span className="w-10 shrink-0 select-none text-slate-600 text-right pr-3 font-mono text-[11px]">
                          {lineNum}
                        </span>

                        {/* Code line content */}
                        <span className="flex-1 whitespace-pre-wrap break-all text-slate-200 select-text">
                          {line || ' '}
                        </span>
                      </div>

                      {/* Inline Security Issue Badge Anchored to This Line */}
                      {issueOnThisLine && (
                        <div className="my-1.5 ml-10 rounded-xl border border-rose-500/40 bg-[#0f070b] p-3 text-xs font-mono text-rose-300 space-y-1.5 shadow-[0_0_15px_rgba(244,63,94,0.15)] animate-fade-in">
                          <div className="flex items-center justify-between">
                            <span className="font-bold flex items-center gap-1.5 text-rose-200">
                              <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
                              <span>
                                {issueOnThisLine.severity?.toUpperCase()}:{' '}
                                {issueOnThisLine.cwe || 'Security Flaw'}
                              </span>
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Anchored to Line {lineNum}
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-300 font-sans">
                            {issueOnThisLine.message}
                          </p>

                          {issueOnThisLine.suggestedFix && (
                            <div className="mt-1 rounded-lg bg-black/80 border border-[#172338] p-2 text-[10px] text-emerald-300 font-mono overflow-x-auto select-all">
                              <div className="text-[9px] text-slate-500 mb-0.5 font-sans">
                                Suggested Remediation:
                              </div>
                              {issueOnThisLine.suggestedFix}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
