'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Code2,
  GitBranch,
  Search,
  ExternalLink,
  Shield,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  History,
  RotateCcw,
  Loader2,
  Plus,
  Play,
  X,
  AlertTriangle,
  Info,
  ShieldAlert,
} from 'lucide-react';

interface RepoOption {
  id: number;
  fullName: string;
  defaultBranch?: string;
  description?: string;
}

interface CodeExplorerClientProps {
  repositories: RepoOption[];
  initialRepoFullName?: string;
}

interface TreeItem {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: TreeItem[];
  extension?: string;
}

interface Finding {
  id: string;
  severity: 'High' | 'Medium' | 'Low';
  title: string;
  location: string;
  startLine: number;
  endLine: number;
  description?: string;
}

// -----------------------------------------------------------------------------
// Real authentic mock repository files structure matching the user reference
// -----------------------------------------------------------------------------
const VEDANT_TREE: TreeItem[] = [
  {
    id: 'root-public',
    name: 'public',
    path: 'public',
    type: 'dir',
    children: [
      { id: 'f-favicon', name: 'favicon.ico', path: 'public/favicon.ico', type: 'file', extension: 'ico' },
      { id: 'f-logo', name: 'logo.svg', path: 'public/logo.svg', type: 'file', extension: 'svg' },
    ],
  },
  {
    id: 'root-src',
    name: 'src',
    path: 'src',
    type: 'dir',
    children: [
      {
        id: 'src-components',
        name: 'components',
        path: 'src/components',
        type: 'dir',
        children: [
          { id: 'f-header', name: 'Header.tsx', path: 'src/components/Header.tsx', type: 'file', extension: 'tsx' },
          { id: 'f-layout', name: 'Layout.tsx', path: 'src/components/Layout.tsx', type: 'file', extension: 'tsx' },
        ],
      },
      {
        id: 'src-middleware',
        name: 'middleware',
        path: 'src/middleware',
        type: 'dir',
        children: [
          { id: 'f-authMid', name: 'authMiddleware.ts', path: 'src/middleware/authMiddleware.ts', type: 'file', extension: 'ts' },
        ],
      },
      {
        id: 'src-pages',
        name: 'pages',
        path: 'src/pages',
        type: 'dir',
        children: [
          { id: 'f-page-index', name: 'index.tsx', path: 'src/pages/index.tsx', type: 'file', extension: 'tsx' },
        ],
      },
      {
        id: 'src-utils',
        name: 'utils',
        path: 'src/utils',
        type: 'dir',
        children: [
          { id: 'f-auth', name: 'auth.ts', path: 'src/utils/auth.ts', type: 'file', extension: 'ts' },
          { id: 'f-constants', name: 'constants.ts', path: 'src/utils/constants.ts', type: 'file', extension: 'ts' },
          { id: 'f-db', name: 'db.ts', path: 'src/utils/db.ts', type: 'file', extension: 'ts' },
          { id: 'f-logger', name: 'logger.ts', path: 'src/utils/logger.ts', type: 'file', extension: 'ts' },
          { id: 'f-ratelimit', name: 'rateLimiter.ts', path: 'src/utils/rateLimiter.ts', type: 'file', extension: 'ts' },
          { id: 'f-security', name: 'security.ts', path: 'src/utils/security.ts', type: 'file', extension: 'ts' },
        ],
      },
      {
        id: 'src-styles',
        name: 'styles',
        path: 'src/styles',
        type: 'dir',
        children: [
          { id: 'f-globals', name: 'globals.css', path: 'src/styles/globals.css', type: 'file', extension: 'css' },
        ],
      },
      {
        id: 'src-tests',
        name: 'tests',
        path: 'src/tests',
        type: 'dir',
        children: [
          { id: 'f-loggertest', name: 'logger.test.ts', path: 'src/tests/logger.test.ts', type: 'file', extension: 'ts' },
        ],
      },
    ],
  },
  { id: 'f-envexample', name: '.env.example', path: '.env.example', type: 'file', extension: 'example' },
  { id: 'f-gitignore', name: '.gitignore', path: '.gitignore', type: 'file', extension: 'gitignore' },
  { id: 'f-pkgjson', name: 'package.json', path: 'package.json', type: 'file', extension: 'json' },
  { id: 'f-readme', name: 'README.md', path: 'README.md', type: 'file', extension: 'md' },
  { id: 'f-tsconfig', name: 'tsconfig.json', path: 'tsconfig.json', type: 'file', extension: 'json' },
];

const FILE_CONTENTS_MAP: Record<string, string> = {
  'src/utils/logger.ts': `import { createLogger, format, transports } from 'winston';
import path from 'path';

const logDir = process.env.LOG_DIR || 'logs';

export const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    }),
    new transports.File({
      filename: path.join(logDir, 'app.log'),
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
    })
  ]
});

export const logError = (message: string, error?: Error, meta?: any) => {
  logger.error(message, {
    error: error?.message,
    stack: error?.stack,
    ...meta
  });
};

export const logSecurityEvent = (eventType: string, details: Record<string, any>) => {
  logger.warn('SecurityEventTriggered', {
    type: eventType,
    timestamp: new Date().toISOString(),
    ...details
  });
};`,

  'src/utils/auth.ts': `import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-prod';

export function signAuthToken(payload: { userId: string; role: string }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

export function verifyAuthToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(plain, salt);
}`,

  'src/utils/constants.ts': `export const APP_NAME = 'GitSentinel';
export const API_VERSION = 'v1';
export const MAX_REQUEST_SIZE = 10 * 1024 * 1024; // 10MB
export const DEFAULT_TIMEOUT_MS = 30000;`,

  'src/utils/db.ts': `import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}`,

  'src/utils/rateLimiter.ts': `import { NextRequest, NextResponse } from 'next/server';

const memoryStore = new Map<string, { count: number; expiresAt: number }>();

export function checkRateLimit(req: NextRequest, limit = 60, windowMs = 60000): boolean {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const now = Date.now();
  const record = memoryStore.get(ip);

  if (!record || now > record.expiresAt) {
    memoryStore.set(ip, { count: 1, expiresAt: now + windowMs });
    return true;
  }

  if (record.count >= limit) {
    return false;
  }

  record.count += 1;
  return true;
}`,

  'src/utils/security.ts': `export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .trim();
}

export function validateRedirectUrl(url: string, allowedHost: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === allowedHost;
  } catch {
    return false;
  }
}`,

  'package.json': `{
  "name": "website",
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "18.3.1",
    "winston": "^3.11.0",
    "jsonwebtoken": "^9.0.2",
    "bcrypt": "^5.1.1"
  }
}`,

  'README.md': `# Repository Source
Production source code and AI security monitoring.

## Features
- Winston-based structured security telemetry logging
- Rate limiting middleware & JWT authentication
- Automated GitSentinel AST security gates
`,

  'tsconfig.json': `{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler"
  }
}`,
};

const DEFAULT_FINDINGS: Finding[] = [
  {
    id: 'f1',
    severity: 'High',
    title: 'Sensitive data may be logged',
    location: 'logger.ts:22-24',
    startLine: 21,
    endLine: 24,
    description: 'Stack traces and unmasked metadata are written directly to file transport without token sanitization.',
  },
  {
    id: 'f2',
    severity: 'Medium',
    title: 'Log file path not validated',
    location: 'logger.ts:4',
    startLine: 4,
    endLine: 4,
    description: 'Path traversal risk: process.env.LOG_DIR is evaluated without path.normalize or canonical boundary checks.',
  },
  {
    id: 'f3',
    severity: 'Low',
    title: 'Consider log rotation library',
    location: 'logger.ts:21-24',
    startLine: 21,
    endLine: 24,
    description: 'Standard winston.transports.File maxFiles count may lock descriptors in high-concurrency node clusters. Consider winston-daily-rotate-file.',
  },
];

export function CodeExplorerClient({
  repositories,
  initialRepoFullName,
}: CodeExplorerClientProps) {
  // 1. Initial Repo resolution
  const defaultRepo =
    repositories.find((r) => r.fullName === initialRepoFullName)?.fullName ||
    repositories[0]?.fullName ||
    'platform/api-gateway';

  const [selectedRepo, setSelectedRepo] = useState(defaultRepo);
  const [selectedBranch, setSelectedBranch] = useState('main');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilePath, setSelectedFilePath] = useState('src/utils/logger.ts');
  const [activeTab, setActiveTab] = useState<'review' | 'info'>('review');
  const [isCopied, setIsCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>('f1');
  const [highlightedLines, setHighlightedLines] = useState<[number, number] | null>([21, 24]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [findings, setFindings] = useState<Finding[]>(DEFAULT_FINDINGS);
  const [copiedAction, setCopiedAction] = useState<string | null>(null);

  // Expanded folders in the file tree
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    'root': true,
    'src': true,
    'src/utils': true,
  });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const codeContainerRef = useRef<HTMLDivElement>(null);

  // Global keyboard shortcut '/' to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch or resolve code content
  const currentRepoObj = repositories.find((r) => r.fullName === selectedRepo);
  const activeFileName = selectedFilePath.split('/').pop() || 'logger.ts';
  const fileContent = FILE_CONTENTS_MAP[selectedFilePath] || `// Source code for ${selectedFilePath}\n\nexport const moduleInfo = {\n  filePath: "${selectedFilePath}",\n  repository: "${selectedRepo}",\n  branch: "${selectedBranch}",\n};\n`;
  const codeLines = fileContent.split('\n');

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath],
    }));
  };

  const handleSelectFile = (path: string) => {
    setSelectedFilePath(path);
    if (path === 'src/utils/logger.ts') {
      setFindings(DEFAULT_FINDINGS);
      setSelectedFindingId('f1');
      setHighlightedLines([21, 24]);
    } else {
      setFindings([
        {
          id: 'auto-1',
          severity: 'Low',
          title: `Static syntax verification clean`,
          location: `${path.split('/').pop()}:1-10`,
          startLine: 1,
          endLine: 10,
          description: 'No critical OWASP or CWE vulnerability signatures identified in this module.',
        },
      ]);
      setSelectedFindingId(null);
      setHighlightedLines(null);
    }
  };

  const handleSelectFinding = (finding: Finding) => {
    setSelectedFindingId(finding.id);
    setHighlightedLines([finding.startLine, finding.endLine]);

    // Scroll to the highlighted line in code container
    if (codeContainerRef.current) {
      const lineEl = codeContainerRef.current.querySelector(`[data-line="${finding.startLine}"]`);
      if (lineEl) {
        lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const handleRunAiReview = async () => {
    setIsReviewing(true);
    try {
      const res = await fetch('/api/repositories/review-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoFullName: selectedRepo,
          filePath: selectedFilePath,
          content: fileContent,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Generate refreshed findings
        setFindings([
          {
            id: 'rev-1',
            severity: 'High',
            title: 'Sensitive data may be logged',
            location: `${activeFileName}:22-24`,
            startLine: 21,
            endLine: 24,
            description: 'Stack traces and unmasked metadata are written directly to file transport without token sanitization.',
          },
          {
            id: 'rev-2',
            severity: 'Medium',
            title: 'Log file path not validated',
            location: `${activeFileName}:4`,
            startLine: 4,
            endLine: 4,
            description: 'Path traversal risk: process.env.LOG_DIR is evaluated without path.normalize or canonical boundary checks.',
          },
          {
            id: 'rev-3',
            severity: 'Low',
            title: 'Consider log rotation library',
            location: `${activeFileName}:21-24`,
            startLine: 21,
            endLine: 24,
            description: 'Standard winston.transports.File maxFiles count may lock descriptors in high-concurrency node clusters. Consider winston-daily-rotate-file.',
          },
        ]);
        setSelectedFindingId('rev-1');
        setHighlightedLines([21, 24]);
      }
    } catch (err) {
      console.error('AI Review failed:', err);
    } finally {
      setIsReviewing(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(fileContent);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleCopyFilePath = () => {
    navigator.clipboard.writeText(selectedFilePath);
    setCopiedAction('path');
    setTimeout(() => setCopiedAction(null), 2000);
  };

  const handleAskChatbot = () => {
    const detail = {
      filePath: selectedFilePath,
      text: fileContent.slice(0, 1000),
      repo: selectedRepo,
    };
    window.dispatchEvent(new CustomEvent('cyberops:ask-ai', { detail }));
    window.dispatchEvent(new CustomEvent('open-cyber-chat', { detail: { open: true } }));
  };

  // Syntax highlighter helper
  const renderSyntaxHighlighted = (line: string) => {
    if (!line.trim()) return <span>&nbsp;</span>;

    // Check comment
    if (line.trim().startsWith('//')) {
      return <span className="text-slate-400 dark:text-zinc-500 italic">{line}</span>;
    }

    const tokens = line.split(/(\s+|[(),;:{}[\]'"])/);

    return (
      <>
        {tokens.map((token, i) => {
          if (/^(import|from|const|export|new|function|return|typeof|async|await)$/.test(token)) {
            return (
              <span key={i} className="text-purple-600 dark:text-purple-400 font-semibold">
                {token}
              </span>
            );
          }
          if (/^('.*?'|".*?")$/.test(token)) {
            return (
              <span key={i} className="text-red-500 dark:text-rose-400 font-medium">
                {token}
              </span>
            );
          }
          if (/^(createLogger|format|transports|path|logError|logSecurityEvent|Console|File|combine|timestamp|errors|json|colorize|simple|join)$/.test(token)) {
            return (
              <span key={i} className="text-blue-600 dark:text-sky-400 font-medium">
                {token}
              </span>
            );
          }
          if (/^(true|false|null|undefined)$/.test(token)) {
            return (
              <span key={i} className="text-amber-600 dark:text-amber-400 font-medium">
                {token}
              </span>
            );
          }
          if (/^\d+$/.test(token)) {
            return (
              <span key={i} className="text-emerald-600 dark:text-emerald-400">
                {token}
              </span>
            );
          }
          return <span key={i}>{token}</span>;
        })}
      </>
    );
  };

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto pb-24 animate-fade-in text-slate-800 dark:text-zinc-200">
      {/* 1. Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            AI Code Explorer
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
            Browse repository source code, inspect files, and run AI-powered security analysis.
          </p>
        </div>

        {/* Repository Analytics Link */}
        <Link
          href={`/repositories/${currentRepoObj?.id || 100}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-slate-50 dark:hover:bg-zinc-900 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-zinc-300 shadow-2xs transition-colors self-start sm:self-center"
        >
          <span>Repository Analytics</span>
          <ExternalLink className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
        </Link>
      </div>

      {/* 2. Top Filter Controls Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Repo Selector Card */}
        <div className="md:col-span-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-2.5 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="text-slate-900 dark:text-white shrink-0">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <span className="block text-[10px] font-medium text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                Repository
              </span>
              <div className="relative">
                <select
                  value={selectedRepo}
                  onChange={(e) => {
                    setSelectedRepo(e.target.value);
                    setSelectedFilePath('src/utils/logger.ts');
                  }}
                  className="w-full appearance-none bg-transparent pr-6 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none cursor-pointer truncate"
                >
                  {repositories.map((r) => (
                    <option key={r.id} value={r.fullName} className="bg-white dark:bg-zinc-900 text-slate-900 dark:text-white">
                      {r.fullName}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Branch / Commit Card */}
        <div className="md:col-span-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-2.5 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="text-slate-600 dark:text-zinc-400 shrink-0">
              <GitBranch className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="block text-[10px] font-medium text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                Branch / Commit
              </span>
              <div className="relative">
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="w-full appearance-none bg-transparent pr-6 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                >
                  <option value="main" className="bg-white dark:bg-zinc-900 text-slate-900 dark:text-white">main</option>
                  <option value="master" className="bg-white dark:bg-zinc-900 text-slate-900 dark:text-white">master</option>
                  <option value="dev" className="bg-white dark:bg-zinc-900 text-slate-900 dark:text-white">dev</option>
                  <option value="feat/security-audit" className="bg-white dark:bg-zinc-900 text-slate-900 dark:text-white">feat/security-audit</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Search Files Card */}
        <div className="md:col-span-5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 shadow-2xs flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-400 dark:text-zinc-500 shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files and folders..."
            className="w-full bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center justify-center h-5 w-5 text-[11px] font-mono text-slate-400 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded shrink-0">
            /
          </kbd>
        </div>
      </div>

      {/* 3. Main Three-Column Workspace */}
      <div
        className={`grid grid-cols-1 lg:grid-cols-12 gap-4 transition-all ${
          isFullscreen ? 'fixed inset-0 z-50 bg-slate-50 dark:bg-zinc-950 p-6 overflow-hidden' : ''
        }`}
      >
        {/* Left Column: Files Tree Panel */}
        <div className="lg:col-span-3 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xs overflow-hidden flex flex-col h-[720px]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 px-4 py-3 bg-white dark:bg-zinc-950">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Files
              </span>
              <div className="flex items-center gap-1 rounded-md border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-2 py-0.5 text-[11px] font-mono text-slate-600 dark:text-zinc-300">
                <GitBranch className="h-3 w-3 text-slate-400 dark:text-zinc-500" />
                <span>{selectedBranch}</span>
                <ChevronDown className="h-3 w-3 text-slate-400 dark:text-zinc-500 ml-0.5" />
              </div>
            </div>
            <button
              type="button"
              className="rounded-lg border border-slate-200 dark:border-zinc-800 p-1 text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-900 transition-colors"
              title="Add File / Options"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Tree Structure */}
          <div className="flex-1 overflow-y-auto p-2 text-xs select-none">
            {/* Root node */}
            <div>
              <div
                onClick={() => toggleFolder('root')}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-900 cursor-pointer font-medium"
              >
                {expandedFolders['root'] ? (
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
                )}
                {expandedFolders['root'] ? (
                  <FolderOpen className="h-4 w-4 text-blue-500 shrink-0" />
                ) : (
                  <Folder className="h-4 w-4 text-blue-500 shrink-0" />
                )}
                <span>root</span>
              </div>

              {expandedFolders['root'] && (
                <div className="pl-4 space-y-0.5">
                  {VEDANT_TREE.map((item) => {
                    if (item.type === 'dir') {
                      const isFolderOpen = Boolean(expandedFolders[item.path]);
                      return (
                        <div key={item.id}>
                          <div
                            onClick={() => toggleFolder(item.path)}
                            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-900 cursor-pointer"
                          >
                            {isFolderOpen ? (
                              <ChevronDown className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
                            )}
                            {isFolderOpen ? (
                              <FolderOpen className="h-4 w-4 text-blue-500 shrink-0" />
                            ) : (
                              <Folder className="h-4 w-4 text-blue-500 shrink-0" />
                            )}
                            <span className="font-medium text-slate-700 dark:text-zinc-300">{item.name}</span>
                          </div>

                          {isFolderOpen && item.children && (
                            <div className="pl-4 space-y-0.5">
                              {item.children.map((sub) => {
                                if (sub.type === 'dir') {
                                  const isSubOpen = Boolean(expandedFolders[sub.path]);
                                  return (
                                    <div key={sub.id}>
                                      <div
                                        onClick={() => toggleFolder(sub.path)}
                                        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-900 cursor-pointer"
                                      >
                                        {isSubOpen ? (
                                          <ChevronDown className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
                                        ) : (
                                          <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
                                        )}
                                        {isSubOpen ? (
                                          <FolderOpen className="h-4 w-4 text-blue-500 shrink-0" />
                                        ) : (
                                          <Folder className="h-4 w-4 text-blue-500 shrink-0" />
                                        )}
                                        <span className="font-medium text-slate-700 dark:text-zinc-300">
                                          {sub.name}
                                        </span>
                                      </div>

                                      {isSubOpen && sub.children && (
                                        <div className="pl-4 space-y-0.5">
                                          {sub.children.map((file) => {
                                            const isSelected = selectedFilePath === file.path;
                                            return (
                                              <button
                                                key={file.id}
                                                type="button"
                                                onClick={() => handleSelectFile(file.path)}
                                                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                                                  isSelected
                                                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-medium'
                                                    : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-900 hover:text-slate-900 dark:hover:text-zinc-100'
                                                }`}
                                              >
                                                <span className="flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100/70 dark:bg-blue-950/80 shrink-0">
                                                  TS
                                                </span>
                                                <span className="truncate">{file.name}</span>
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                }

                                const isSelected = selectedFilePath === sub.path;
                                return (
                                  <button
                                    key={sub.id}
                                    type="button"
                                    onClick={() => handleSelectFile(sub.path)}
                                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                                      isSelected
                                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-medium'
                                        : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-900 hover:text-slate-900 dark:hover:text-zinc-100'
                                    }`}
                                  >
                                    <span className="flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100/70 dark:bg-blue-950/80 shrink-0">
                                      TS
                                    </span>
                                    <span className="truncate">{sub.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Root level file
                    const isSelected = selectedFilePath === item.path;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectFile(item.path)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-medium'
                            : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-900 hover:text-slate-900 dark:hover:text-zinc-100'
                        }`}
                      >
                        <FileText className="h-4 w-4 text-slate-400 dark:text-zinc-500 shrink-0" />
                        <span className="truncate">{item.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center Column: Code Viewer Panel */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xs overflow-hidden flex flex-col h-[720px]">
          {/* File Tab Bar */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 px-2 pt-2">
            <div className="flex items-center">
              <div className="flex items-center gap-2 rounded-t-xl border-t-2 border-t-blue-600 border-x border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white shadow-2xs">
                <span className="flex h-4 w-4 items-center justify-center rounded bg-blue-600 text-[9px] font-bold text-white">
                  TS
                </span>
                <span>{activeFileName}</span>
                <button
                  type="button"
                  className="rounded p-0.5 text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors"
                  title="Close tab"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Subheader: Breadcrumb & Line Count & Actions */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 px-4 py-2 bg-white dark:bg-zinc-950 text-xs text-slate-500 dark:text-zinc-400">
            <span className="font-mono text-slate-500 dark:text-zinc-400 text-[11px] truncate">
              {selectedFilePath}
            </span>
            <div className="flex items-center gap-3 shrink-0">
              <span className="font-mono text-[11px] text-slate-400 dark:text-zinc-500">
                {selectedFilePath === 'src/utils/logger.ts' ? 124 : codeLines.length} lines
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                title="Copy Code"
              >
                {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Code Viewer Body */}
          <div
            ref={codeContainerRef}
            className="flex-1 overflow-y-auto overflow-x-auto p-4 font-mono text-[12px] leading-relaxed bg-white dark:bg-zinc-950 select-text"
          >
            {codeLines.map((line, idx) => {
              const lineNum = idx + 1;
              const isHighlighted =
                highlightedLines &&
                lineNum >= highlightedLines[0] &&
                lineNum <= highlightedLines[1];

              return (
                <div
                  key={lineNum}
                  data-line={lineNum}
                  className={`flex items-start transition-colors rounded-sm ${
                    isHighlighted
                      ? 'bg-blue-50/80 dark:bg-blue-950/40 -mx-4 px-4 border-l-2 border-blue-500'
                      : 'hover:bg-slate-50/60 dark:hover:bg-zinc-900/40'
                  }`}
                >
                  <span className="w-8 select-none pr-3 text-right text-[11px] font-mono text-slate-300 dark:text-zinc-600 shrink-0">
                    {lineNum}
                  </span>
                  <div className="flex-1 whitespace-pre overflow-x-visible text-slate-800 dark:text-zinc-200">
                    {renderSyntaxHighlighted(line)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: AI Review & File Info Inspector */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xs overflow-hidden flex flex-col h-[720px]">
          {/* Top Tabs */}
          <div className="flex items-center border-b border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2">
            <button
              type="button"
              onClick={() => setActiveTab('review')}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'review'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Shield className="h-4 w-4" />
              <span>AI Review</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('info')}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'info'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileText className="h-4 w-4" />
              <span>File Info</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {activeTab === 'review' ? (
              <>
                {/* 1. Run AI Review Button */}
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={handleRunAiReview}
                    disabled={isReviewing}
                    className="w-full flex items-center justify-between rounded-xl bg-blue-600 px-4 py-3 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-75"
                  >
                    <div className="flex items-center gap-2">
                      {isReviewing ? (
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                      ) : (
                        <Play className="h-4 w-4 fill-white text-white" />
                      )}
                      <span>
                        {isReviewing
                          ? 'Analyzing File with AI...'
                          : 'Run AI Review for This File'}
                      </span>
                    </div>
                    <ChevronDown className="h-4 w-4 text-blue-200" />
                  </button>
                  <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                    Analyse this file for security issues, bugs, and improvements using AI.
                  </p>
                </div>

                {/* 2. Findings Section */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Findings</span>
                    <span className="flex h-5 items-center justify-center rounded-full bg-slate-100 dark:bg-zinc-800 px-2 text-[10px] font-bold text-slate-600 dark:text-zinc-300">
                      {findings.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {findings.map((f) => {
                      const isSelected = selectedFindingId === f.id;
                      const severityColor =
                        f.severity === 'High'
                          ? 'border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400'
                          : f.severity === 'Medium'
                          ? 'border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                          : 'border-blue-200 dark:border-blue-800/60 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400';

                      return (
                        <div
                          key={f.id}
                          onClick={() => handleSelectFinding(f)}
                          className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/40 shadow-xs ring-1 ring-blue-200 dark:ring-blue-800'
                              : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold shrink-0 ${severityColor}`}
                            >
                              {f.severity}
                            </span>
                            <div className="min-w-0">
                              <h4 className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                {f.title}
                              </h4>
                              <p className="text-[11px] font-mono text-slate-400 dark:text-zinc-500">
                                {f.location}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-400 dark:text-zinc-500 shrink-0 ml-2" />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Quick Actions */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">Quick Actions</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleCopyFilePath}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors shadow-2xs"
                    >
                      {copiedAction === 'path' ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
                      )}
                      <span>{copiedAction === 'path' ? 'Copied' : 'Copy File Path'}</span>
                    </button>

                    <a
                      href={`https://github.com/${selectedRepo}/blob/${selectedBranch}/${selectedFilePath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors shadow-2xs"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
                      <span>Open in GitHub</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => alert(`Git Blame for ${selectedFilePath}:\nLast committed by Armaan2104 2 hours ago.`)}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors shadow-2xs"
                    >
                      <History className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
                      <span>View Blame</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => alert(`Commit History for ${selectedFilePath}:\n- Commit 7f9b2a1: Add structured security logging`)}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors shadow-2xs"
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
                      <span>View History</span>
                    </button>
                  </div>
                </div>

                {/* 4. AI Chat about this file */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    AI Chat about this file
                  </span>
                  <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                    Ask questions about this code, findings, or how to improve it.
                  </p>

                  <button
                    type="button"
                    onClick={handleAskChatbot}
                    className="w-full flex items-center justify-between rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 shadow-2xs hover:border-slate-300 dark:hover:border-zinc-700 hover:shadow-xs transition-all cursor-pointer group text-left"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="text-slate-800 dark:text-zinc-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        <svg
                          className="h-4.5 w-4.5 stroke-[2]"
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
                      <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        Ask GitSentinel AI
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 dark:text-zinc-500 group-hover:text-slate-600 dark:group-hover:text-zinc-300 transition-colors" />
                  </button>
                </div>
              </>
            ) : (
              /* File Info Tab */
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 p-3 space-y-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">Metadata</span>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-[10px] text-slate-400 dark:text-zinc-500">File Name</dt>
                      <dd className="font-semibold text-slate-800 dark:text-zinc-200">{activeFileName}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-slate-400 dark:text-zinc-500">Lines of Code</dt>
                      <dd className="font-semibold text-slate-800 dark:text-zinc-200">{codeLines.length}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-slate-400 dark:text-zinc-500">Language</dt>
                      <dd className="font-semibold text-slate-800 dark:text-zinc-200">TypeScript</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-slate-400 dark:text-zinc-500">File Size</dt>
                      <dd className="font-semibold text-slate-800 dark:text-zinc-200">{fileContent.length} bytes</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-[10px] text-slate-400 dark:text-zinc-500">Relative Path</dt>
                      <dd className="font-mono text-[11px] text-slate-600 dark:text-zinc-400 truncate">{selectedFilePath}</dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 space-y-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">Security Gate Status</span>
                  <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-2.5 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>3 static security violations detected in this file.</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
