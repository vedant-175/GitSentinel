import React, { Suspense } from 'react';
import {
  Shield,
  Code2,
  BarChart3,
  Clock,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock3,
} from 'lucide-react';
import { LoginForm } from './LoginForm';

export default function LoginPage() {
  const rawClientId = process.env.NEXTAUTH_GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID || '';
  const hasGithubOAuth = Boolean(
    rawClientId.trim().length > 0 &&
      !rawClientId.includes('localdevelopment') &&
      !rawClientId.includes('your_client_id')
  );
  const isDevLoginEnabled =
    process.env.ENABLE_DEV_LOGIN === 'true' ||
    process.env.NODE_ENV === 'development' ||
    Boolean(process.env.VERCEL) ||
    !hasGithubOAuth;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-8 lg:p-12">
      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
        
        {/* ========================================================= */}
        {/* LEFT COLUMN: HERO SHOWCASE & PRODUCT PREVIEW              */}
        {/* ========================================================= */}
        <div className="lg:col-span-7 flex flex-col justify-between space-y-8">
          
          {/* Top Brand & Trusted Badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
                <Shield className="h-4 w-4 fill-white text-blue-600" />
              </div>
              <div>
                <span className="text-base font-bold tracking-tight text-slate-900 leading-tight block">
                  GitSentinel
                </span>
                <span className="text-[10px] text-slate-400 font-normal leading-tight block">
                  AI Code Review & Security Platform
                </span>
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/90 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 shadow-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>Trusted by developers</span>
            </div>
          </div>

          {/* Headline & Subhead */}
          <div className="space-y-3 pt-2">
            <h1 className="text-4xl sm:text-5xl lg:text-[52px] font-extrabold tracking-tight leading-[1.12]">
              <span className="text-blue-600 block">safer, higher quality</span>
              <span className="text-slate-900 block mt-1">code, at every pull request.</span>
            </h1>
            <p className="text-sm text-slate-500 max-w-xl leading-relaxed pt-1">
              Automated security reviews, intelligent code analysis, and actionable feedback directly in your GitHub workflow.
            </p>
          </div>

          {/* 2x2 Feature Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
            {/* Feature 1: Security Analysis */}
            <div className="flex items-start gap-3.5">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100/60">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Security Analysis</h2>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Detect vulnerabilities, insecure patterns, and misconfigurations.
                </p>
              </div>
            </div>

            {/* Feature 2: AI Code Review */}
            <div className="flex items-start gap-3.5">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100/60">
                <Code2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">AI Code Review</h2>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Get intelligent, context-aware feedback on your code changes.
                </p>
              </div>
            </div>

            {/* Feature 3: Quality & Best Practices */}
            <div className="flex items-start gap-3.5">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100/60">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Quality & Best Practices</h2>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Identify code smells and improve maintainability.
                </p>
              </div>
            </div>

            {/* Feature 4: Works in Your Workflow */}
            <div className="flex items-start gap-3.5">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100/60">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Works in Your Workflow</h2>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Integrated with GitHub PRs and runs automatically.
                </p>
              </div>
            </div>
          </div>

          {/* Product UI Mockup Window (Bottom Left) */}
          <div className="pt-2">
            <div className="rounded-t-2xl border-t border-x border-slate-200/90 bg-white shadow-xl shadow-slate-200/60 overflow-hidden">
              {/* macOS Window Controls Bar */}
              <div className="h-8 bg-slate-50 border-b border-slate-100 px-3.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                  <Shield className="h-3 w-3 text-blue-600" />
                  <span>GitSentinel</span>
                </div>
                <div className="w-8" />
              </div>

              {/* Window Content */}
              <div className="p-4 bg-white text-[11px]">
                {/* Header row */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <div className="font-bold text-slate-900 text-xs">Pull Requests</div>
                    <div className="text-[10px] text-slate-400">Review and analyze code changes</div>
                  </div>
                  <button
                    type="button"
                    className="bg-blue-600 text-white rounded-md px-2.5 py-1 text-[10px] font-semibold flex items-center gap-1"
                  >
                    Sync Now
                  </button>
                </div>

                {/* Tabs & Search */}
                <div className="flex items-center justify-between py-2 text-[10px]">
                  <div className="flex items-center gap-3 font-semibold text-slate-500">
                    <span className="text-blue-600 border-b-2 border-blue-600 pb-1">Open (5)</span>
                    <span>Merged (28)</span>
                    <span>Closed (12)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 text-slate-400 text-[10px]">
                      <Search className="h-2.5 w-2.5" />
                      <span>Search pull requests...</span>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 text-slate-600 text-[10px]">
                      <Filter className="h-2.5 w-2.5" />
                      <span>Filters</span>
                    </div>
                  </div>
                </div>

                {/* Table Rows */}
                <div className="space-y-1.5 pt-1">
                  {/* Row 1 */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50/70 border border-slate-100/80 text-[10px]">
                    <div className="flex items-center gap-2">
                      <svg className="h-3 w-3 fill-slate-700" viewBox="0 0 24 24">
                        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                      </svg>
                      <span className="font-semibold text-slate-800">vercel/next.js</span>
                      <span className="text-blue-600">#12345</span>
                    </div>
                    <span className="text-slate-700 truncate max-w-[140px]">Add rate limiting middleware</span>
                    <span className="px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 font-semibold border border-rose-100 text-[9px]">
                      High
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-100 text-[9px]">
                      Review complete
                    </span>
                    <span className="text-slate-400">2 hours ago</span>
                  </div>

                  {/* Row 2 */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50/70 border border-slate-100/80 text-[10px]">
                    <div className="flex items-center gap-2">
                      <svg className="h-3 w-3 fill-slate-700" viewBox="0 0 24 24">
                        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                      </svg>
                      <span className="font-semibold text-slate-800">tailwindlabs/tailwindcss</span>
                      <span className="text-blue-600">#6789</span>
                    </div>
                    <span className="text-slate-700 truncate max-w-[140px]">Fix dark mode class generation</span>
                    <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-600 font-semibold border border-amber-100 text-[9px]">
                      Medium
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-100 text-[9px]">
                      In progress
                    </span>
                    <span className="text-slate-400">5 hours ago</span>
                  </div>

                  {/* Row 3 */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50/70 border border-slate-100/80 text-[10px]">
                    <div className="flex items-center gap-2">
                      <svg className="h-3 w-3 fill-slate-700" viewBox="0 0 24 24">
                        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                      </svg>
                      <span className="font-semibold text-slate-800">acme-corp/api-gateway</span>
                      <span className="text-blue-600">#2705</span>
                    </div>
                    <span className="text-slate-700 truncate max-w-[140px]">Improve game logic and input validation</span>
                    <span className="px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 font-semibold border border-rose-100 text-[9px]">
                      High
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 font-semibold border border-rose-100 text-[9px]">
                      Action required
                    </span>
                    <span className="text-slate-400">1 day ago</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: SIGN IN CARD                                */}
        {/* ========================================================= */}
        <div className="lg:col-span-5 flex flex-col justify-center">
          <Suspense
            fallback={
              <div className="text-center text-sm text-slate-400 animate-pulse">
                Loading login...
              </div>
            }
          >
            <LoginForm
              isDevLoginEnabled={isDevLoginEnabled}
              hasGithubOAuth={hasGithubOAuth}
            />
          </Suspense>
        </div>

      </div>
    </div>
  );
}
