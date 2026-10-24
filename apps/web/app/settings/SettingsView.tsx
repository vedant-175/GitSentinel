'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTheme } from '../components/ThemeProvider';
import {
  Settings,
  User,
  Shield,
  Sparkles,
  Moon,
  Sun,
  Save,
  CheckCircle2,
  GitPullRequest,
  Check,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

interface RepoOption {
  id: number;
  fullName: string;
  defaultBranch: string;
}

export function SettingsView() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();

  // Settings State
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [repositories, setRepositories] = useState<RepoOption[]>([]);
  const [aiModel, setAiModel] = useState<string>('gemini-2.0-flash');
  const [reviewSensitivity, setReviewSensitivity] = useState<'balanced' | 'strict' | 'lenient'>('balanced');
  const [reviewTone, setReviewTone] = useState<'constructive' | 'concise'>('constructive');
  const [autoReview, setAutoReview] = useState<boolean>(true);
  const [inlineSuggestions, setInlineSuggestions] = useState<boolean>(true);
  const [summaryComment, setSummaryComment] = useState<boolean>(true);
  const [securityGate, setSecurityGate] = useState<boolean>(true);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load initial settings from server & localStorage
  useEffect(() => {
    let isMounted = true;

    // Load local preferences
    try {
      const savedModel = localStorage.getItem('gitsentinel_pref_model');
      if (savedModel) setAiModel(savedModel);

      const savedSensitivity = localStorage.getItem('gitsentinel_pref_sensitivity') as any;
      if (savedSensitivity) setReviewSensitivity(savedSensitivity);

      const savedTone = localStorage.getItem('gitsentinel_pref_tone') as any;
      if (savedTone) setReviewTone(savedTone);

      const savedAuto = localStorage.getItem('gitsentinel_pref_auto');
      if (savedAuto !== null) setAutoReview(savedAuto === 'true');

      const savedInline = localStorage.getItem('gitsentinel_pref_inline');
      if (savedInline !== null) setInlineSuggestions(savedInline === 'true');

      const savedSummary = localStorage.getItem('gitsentinel_pref_summary');
      if (savedSummary !== null) setSummaryComment(savedSummary === 'true');

      const savedGate = localStorage.getItem('gitsentinel_pref_gate');
      if (savedGate !== null) setSecurityGate(savedGate === 'true');
    } catch {
      // Ignore localStorage errors
    }

    // Fetch repository list & server config
    async function fetchSettings() {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;

        if (data?.installation?.repositories && Array.isArray(data.installation.repositories)) {
          setRepositories(data.installation.repositories);
          if (data.installation.repositories.length > 0 && selectedRepoId === null) {
            setSelectedRepoId(data.installation.repositories[0].id);
          }
        }

        if (data?.selectedRepository?.config) {
          const cfg = data.selectedRepository.config;
          if (cfg.severity_threshold === 'critical') setReviewSensitivity('lenient');
          else if (cfg.severity_threshold === 'suggestion') setReviewSensitivity('strict');
          else if (cfg.severity_threshold === 'warning') setReviewSensitivity('balanced');

          if (typeof cfg.block_on_critical === 'boolean') {
            setSecurityGate(cfg.block_on_critical);
          }
        }

        if (data?.aiEngine?.geminiModel) {
          setAiModel(data.aiEngine.geminiModel);
        }
      } catch {
        // Fallback to defaults
      }
    }

    fetchSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleRepoChange = async (newRepoId: number) => {
    setSelectedRepoId(newRepoId);
    try {
      const res = await fetch(`/api/settings?repoId=${newRepoId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data?.selectedRepository?.config) {
        const cfg = data.selectedRepository.config;
        if (cfg.severity_threshold === 'critical') setReviewSensitivity('lenient');
        else if (cfg.severity_threshold === 'suggestion') setReviewSensitivity('strict');
        else if (cfg.severity_threshold === 'warning') setReviewSensitivity('balanced');

        if (typeof cfg.block_on_critical === 'boolean') {
          setSecurityGate(cfg.block_on_critical);
        }
      }
    } catch {
      // Ignore fetch error
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // 1. Save preferences locally
      localStorage.setItem('gitsentinel_pref_model', aiModel);
      localStorage.setItem('gitsentinel_pref_sensitivity', reviewSensitivity);
      localStorage.setItem('gitsentinel_pref_tone', reviewTone);
      localStorage.setItem('gitsentinel_pref_auto', String(autoReview));
      localStorage.setItem('gitsentinel_pref_inline', String(inlineSuggestions));
      localStorage.setItem('gitsentinel_pref_summary', String(summaryComment));
      localStorage.setItem('gitsentinel_pref_gate', String(securityGate));

      // 2. Persist to API if a repository is selected
      if (selectedRepoId) {
        const severityMap: Record<string, 'critical' | 'warning' | 'suggestion'> = {
          lenient: 'critical',
          balanced: 'warning',
          strict: 'suggestion',
        };

        const res = await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repositoryId: selectedRepoId,
            repoConfig: {
              severity_threshold: severityMap[reviewSensitivity] || 'warning',
              block_on_critical: securityGate,
              include_style_nitpicks: reviewSensitivity === 'strict',
            },
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.warn('[Settings] Server save warning:', errData);
        }
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const userLogin = session?.user?.login || (session?.user as any)?.name || 'Developer';
  const userImage = session?.user?.image || `https://github.com/${userLogin}.png`;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Settings className="w-6 h-6 text-primary" />
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your account preferences, review sensitivity, and AI behavior.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
        >
          {isSaving ? (
            <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
          ) : saveSuccess ? (
            <Check className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saveSuccess ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {/* Notifications / Alerts */}
      {saveSuccess && (
        <div className="flex items-center gap-2.5 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>Your settings have been saved successfully.</span>
        </div>
      )}

      {saveError && (
        <div className="flex items-center gap-2.5 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* 1. Account & Profile */}
      <div className="rounded-xl border border-border/60 bg-card/60 p-6 shadow-sm space-y-6">
        <div className="flex items-center gap-2 text-base font-semibold text-foreground">
          <User className="w-4 h-4 text-primary" />
          <h2>Connected Account</h2>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-4 p-4 rounded-lg bg-secondary/30 border border-border/40">
          <div className="flex items-center gap-3.5">
            <img
              src={userImage}
              alt={userLogin}
              className="w-11 h-11 rounded-full border border-border/60 object-cover"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div>
              <div className="font-medium text-foreground flex items-center gap-2">
                <span>{userLogin}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                  Connected
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Authenticated via GitHub OAuth
              </p>
            </div>
          </div>

          <a
            href={`https://github.com/${userLogin}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md border border-border/50 hover:bg-secondary/50"
          >
            <span>View GitHub Profile</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Appearance Toggle */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <div className="text-sm font-medium text-foreground">Theme & Appearance</div>
            <div className="text-xs text-muted-foreground">
              Select your interface color theme
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg border border-border/50 bg-secondary/40">
            <button
              onClick={() => setTheme('light')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                theme === 'light'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Light</span>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                theme === 'dark'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Dark</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. AI Review Preferences */}
      <div className="rounded-xl border border-border/60 bg-card/60 p-6 shadow-sm space-y-6">
        <div className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2>AI Review Engine</h2>
        </div>

        {/* Target Repository Selector if repos exist */}
        {repositories.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Apply to Repository
            </label>
            <select
              value={selectedRepoId || ''}
              onChange={(e) => handleRepoChange(Number(e.target.value))}
              className="w-full sm:w-80 px-3 py-2 text-sm rounded-lg border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {repositories.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* AI Model Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Review Intelligence Model
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setAiModel('gemini-2.0-flash')}
              className={`p-3.5 rounded-lg border text-left transition-all ${
                aiModel === 'gemini-2.0-flash'
                  ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary'
                  : 'border-border/50 bg-secondary/20 hover:bg-secondary/40 text-muted-foreground'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-foreground">Gemini 2.0 Flash</span>
                {aiModel === 'gemini-2.0-flash' && <Check className="w-4 h-4 text-primary" />}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Fast, comprehensive security and logic reasoning. Recommended for all codebases.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setAiModel('openai/gpt-oss-120b')}
              className={`p-3.5 rounded-lg border text-left transition-all ${
                aiModel === 'openai/gpt-oss-120b'
                  ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary'
                  : 'border-border/50 bg-secondary/20 hover:bg-secondary/40 text-muted-foreground'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-foreground">Groq Ultra-Speed</span>
                {aiModel === 'openai/gpt-oss-120b' && <Check className="w-4 h-4 text-primary" />}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Ultra-low latency reviewer optimized for rapid feedback loops.
              </p>
            </button>
          </div>
        </div>

        {/* Review Sensitivity */}
        <div className="space-y-2 pt-2">
          <label className="text-sm font-medium text-foreground">
            Review Sensitivity Level
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {[
              {
                id: 'lenient',
                label: 'Lenient',
                desc: 'Only flags critical bugs and major security vulnerabilities.',
              },
              {
                id: 'balanced',
                label: 'Balanced',
                desc: 'Balanced feedback on bugs, security, and clean code hygiene.',
              },
              {
                id: 'strict',
                label: 'Strict',
                desc: 'Rigorous inspection for security flaws, performance, and best practices.',
              },
            ].map((lvl) => (
              <button
                key={lvl.id}
                type="button"
                onClick={() => setReviewSensitivity(lvl.id as any)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  reviewSensitivity === lvl.id
                    ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary'
                    : 'border-border/50 bg-secondary/20 hover:bg-secondary/40 text-muted-foreground'
                }`}
              >
                <div className="font-medium text-xs text-foreground flex items-center justify-between">
                  <span>{lvl.label}</span>
                  {reviewSensitivity === lvl.id && <Check className="w-3.5 h-3.5 text-primary" />}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  {lvl.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Review Tone */}
        <div className="space-y-2 pt-2">
          <label className="text-sm font-medium text-foreground">
            Review Comment Tone
          </label>
          <div className="flex items-center gap-3">
            {[
              { id: 'constructive', label: 'Constructive & Helpful' },
              { id: 'concise', label: 'Direct & Concise' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setReviewTone(t.id as any)}
                className={`px-3.5 py-2 rounded-lg border text-xs font-medium transition-all ${
                  reviewTone === t.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/50 bg-secondary/20 hover:bg-secondary/40 text-muted-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Automation & Quality Gates */}
      <div className="rounded-xl border border-border/60 bg-card/60 p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Shield className="w-4 h-4 text-primary" />
          <h2>Automations & Security Gates</h2>
        </div>

        <div className="divide-y divide-border/40">
          {/* Toggle: Auto-Review */}
          <div className="flex items-center justify-between py-3.5 first:pt-0">
            <div className="space-y-0.5 pr-4">
              <div className="text-sm font-medium text-foreground flex items-center gap-2">
                <GitPullRequest className="w-4 h-4 text-muted-foreground" />
                Automatic Review on Pull Request
              </div>
              <div className="text-xs text-muted-foreground">
                Trigger an automated AI security review as soon as a PR is opened or updated.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAutoReview(!autoReview)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                autoReview ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  autoReview ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Toggle: Summary Comment */}
          <div className="flex items-center justify-between py-3.5">
            <div className="space-y-0.5 pr-4">
              <div className="text-sm font-medium text-foreground">
                Post Executive Summary Comment
              </div>
              <div className="text-xs text-muted-foreground">
                Post an overview comment with score and checklist on the main PR conversation.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSummaryComment(!summaryComment)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                summaryComment ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  summaryComment ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Toggle: Inline Suggestions */}
          <div className="flex items-center justify-between py-3.5">
            <div className="space-y-0.5 pr-4">
              <div className="text-sm font-medium text-foreground">
                Inline Code Diff Comments
              </div>
              <div className="text-xs text-muted-foreground">
                Attach suggestions directly to the affected line numbers in the diff.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInlineSuggestions(!inlineSuggestions)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                inlineSuggestions ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  inlineSuggestions ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Toggle: Security Gate */}
          <div className="flex items-center justify-between py-3.5 last:pb-0">
            <div className="space-y-0.5 pr-4">
              <div className="text-sm font-medium text-foreground">
                Fail Check Run on Critical Security Flaws
              </div>
              <div className="text-xs text-muted-foreground">
                Block PR merging if high or critical vulnerabilities (CWE/OWASP) are discovered.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSecurityGate(!securityGate)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                securityGate ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  securityGate ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Save Button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm shadow hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
        >
          {isSaving ? (
            <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
          ) : saveSuccess ? (
            <Check className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saveSuccess ? 'Changes Saved!' : 'Save All Settings'}
        </button>
      </div>
    </div>
  );
}
