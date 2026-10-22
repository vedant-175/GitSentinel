'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Terminal } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
}

function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 rounded-xl border border-slate-700/60 dark:border-zinc-800 bg-slate-950 dark:bg-black/90 overflow-hidden shadow-xs">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 dark:bg-zinc-900/90 border-b border-slate-800 dark:border-zinc-800 text-[11px] text-slate-400 dark:text-zinc-400">
        <div className="flex items-center gap-1.5 font-mono">
          <Terminal className="h-3 w-3 text-blue-400" />
          <span>{language || 'code'}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-800 dark:hover:bg-zinc-800 hover:text-slate-200 dark:hover:text-zinc-200 transition-colors cursor-pointer text-[10px]"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Body */}
      <div className="overflow-x-auto p-3 text-[11.5px] leading-relaxed font-mono text-slate-100 dark:text-zinc-100">
        <pre className="!bg-transparent !p-0 !m-0">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`markdown-content leading-relaxed text-xs ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Bold / Strong
          strong: ({ children }) => (
            <strong className="font-bold text-slate-900 dark:text-white">
              {children}
            </strong>
          ),

          // Emphasis / Italic
          em: ({ children }) => (
            <em className="italic text-slate-800 dark:text-zinc-200">
              {children}
            </em>
          ),

          // Headings
          h1: ({ children }) => (
            <h1 className="text-sm font-bold text-slate-900 dark:text-white mt-3 mb-1.5 pb-1 border-b border-slate-200 dark:border-zinc-800">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xs font-bold text-slate-900 dark:text-white mt-2.5 mb-1.5 flex items-center gap-1.5">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-semibold text-slate-800 dark:text-zinc-100 mt-2 mb-1">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-[11px] font-semibold text-slate-800 dark:text-zinc-200 mt-1.5 mb-0.5">
              {children}
            </h4>
          ),

          // Paragraphs
          p: ({ children }) => (
            <p className="my-1.5 leading-relaxed text-slate-800 dark:text-zinc-200">
              {children}
            </p>
          ),

          // Lists
          ul: ({ children }) => (
            <ul className="my-2 ml-4 list-disc space-y-1 text-slate-800 dark:text-zinc-200">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 ml-4 list-decimal space-y-1 text-slate-800 dark:text-zinc-200">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-0.5 text-slate-800 dark:text-zinc-200">
              {children}
            </li>
          ),

          // Horizontal Rule
          hr: () => (
            <hr className="my-3 border-slate-200 dark:border-zinc-800" />
          ),

          // Blockquote
          blockquote: ({ children }) => (
            <blockquote className="my-2.5 border-l-2 border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 px-3 py-1.5 rounded-r-lg text-slate-700 dark:text-zinc-300 italic text-xs">
              {children}
            </blockquote>
          ),

          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 font-medium underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              {children}
            </a>
          ),

          // Tables (GFM)
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-100/90 dark:bg-zinc-800/90 text-slate-900 dark:text-zinc-100 font-semibold border-b border-slate-200 dark:border-zinc-700">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-slate-50/70 dark:hover:bg-zinc-800/40 transition-colors even:bg-slate-50/30 dark:even:bg-zinc-900/30">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 font-semibold text-slate-900 dark:text-zinc-100 text-[11px] uppercase tracking-wider">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-slate-800 dark:text-zinc-200 text-xs">
              {children}
            </td>
          ),

          // Code: Inline and Block
          pre: ({ children }) => <>{children}</>,
          code: ({ node, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            const codeContent = String(children);
            const isMultiline = codeContent.includes('\n');

            if (!match && !isMultiline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded font-mono text-[11px] font-semibold bg-slate-100 dark:bg-zinc-800 text-blue-600 dark:text-blue-400 border border-slate-200/80 dark:border-zinc-700/60"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock
                code={codeContent.replace(/\n$/, '')}
                language={match ? match[1] : undefined}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
