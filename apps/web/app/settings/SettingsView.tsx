'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Settings,
  Shield,
  Cpu,
  Github,
  Bell,
  Save,
  CheckCircle2,
  RefreshCw,
  Key,
  Webhook,
  AlertTriangle,
  Lock,
  Layers,
  Terminal,
  Activity,
  Sliders,
  ExternalLink,
  ChevronRight,
  Info,
  Clock,
  Check,
  AlertCircle,
  FileText,
  UserCheck,
  Play,
  RotateCcw,
} from 'lucide-react';

interface SettingsData {
  userRole: string;
  installation: {
    id: number;
    githubInstallationId: string;
    accountLogin: string;
    accountType: string;
    createdAt: string;
    repositories: Array<{ id: number; fullName: string; defaultBranch: string }>;
  } | null;
  selectedRepository: {
    id: number;
    fullName: string;
    defaultBranch: string;
    config: any;
    organizationPolicy: any;
  } | null;
  aiEngine: {
    providerOrder: Array<{
      tier: number;
      name: string;
      provider: string;
      model: string;
      keysCount: number;
      activeKeys: number;
      maskedKeys: string[];
      status: string;
    }>;
    activeProvider: string;
    groqModel: string;
    geminiModel: string;
    supportedGeminiModels: string[];
    timeoutMs: number;
    schemaMaxRetries: number;
    keyPoolMaxAttempts: number;
  };
  dailyTokenBudget: {
    currentTokens: number;
    limit: number;
    allowed: boolean;
  };
  recentFailovers: Array<{
    id: number;
    commitSha: string;
    errorMessage: string;
    failedAt: string;
    resolvedAt: string | null;
  }>;
  github: {
    appId: string;
    hasWebhookSecret: boolean;
    hasPrivateKey: boolean;
    webhookSuccessRate: number;
    totalDeliveries: number;
    recentDeliveries: Array<{
      id: number;
      deliveryId: string;
      event: string;
      action: string | null;
      statusCode: number;
      errorMessage: string | null;
      receivedAt: string;
    }>;
    supportedEvents: string[];
  };
  notifications: {
    supportedChannels: Array<{
      id: string;
      name: string;
      status: string;
      type: string;
      note?: string;
    }>;
  };
  runtime: {
    reviewsThisMonth: number;
    monthlyQuota: number;
    queueMetrics: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      concurrency: number;
    };
    retention: {
      deliveryDedupTtlHours: number;
      tokenBudgetTtlHours: number;
      reviewRecordsRetention: string;
    };
    configHistory: Array<{
      id: number;
      actor: string;
      actorRole: string | null;
      action: string;
      resourceId: string;
      metadata: any;
      createdAt: string;
    }>;
  };
}

const DEMO_SETTINGS: SettingsData = {
  userRole: 'ADMIN',
  installation: {
    id: 1,
    githubInstallationId: '182272425',
    accountLogin: 'organization',
    accountType: 'Organization',
    createdAt: '2026-01-15T00:00:00Z',
    repositories: [
      { id: 1, fullName: 'organization/api-service', defaultBranch: 'main' },
      { id: 2, fullName: 'organization/web-dashboard', defaultBranch: 'main' },
      { id: 3, fullName: 'organization/auth-gateway', defaultBranch: 'main' },
    ],
  },
  selectedRepository: {
    id: 1,
    fullName: 'organization/api-service',
    defaultBranch: 'main',
    config: {
      severity_threshold: 'suggestion',
      confidence_threshold: 0.7,
      block_on_critical: true,
      max_comments_per_pr: 25,
      max_files_per_pr: 50,
      max_lines_per_pr: 1000,
      skip_drafts: true,
      skip_bot_authors: true,
      disabled_categories: [],
      ignored_globs: ['tests/**', 'docs/**', '**/*.min.js'],
    },
    organizationPolicy: {},
  },
  aiEngine: {
    providerOrder: [
      {
        tier: 1,
        name: 'Groq (Llama 3.3 70B)',
        provider: 'Groq',
        model: 'llama-3.3-70b-versatile',
        keysCount: 3,
        activeKeys: 3,
        maskedKeys: ['gsk_live_...98a2', 'gsk_live_...b4c1', 'gsk_live_...3ef8'],
        status: 'ACTIVE',
      },
      {
        tier: 2,
        name: 'Google Gemini (Flash 2.0)',
        provider: 'Google Gemini',
        model: 'gemini-2.0-flash',
        keysCount: 2,
        activeKeys: 2,
        maskedKeys: ['AIzaSy...7f89', 'AIzaSy...4d12'],
        status: 'ACTIVE',
      },
      {
        tier: 3,
        name: 'OpenAI (GPT-4o mini)',
        provider: 'OpenAI',
        model: 'gpt-4o-mini',
        keysCount: 1,
        activeKeys: 1,
        maskedKeys: ['sk-proj-...89df'],
        status: 'STANDBY',
      },
    ],
    activeProvider: 'Groq',
    groqModel: 'llama-3.3-70b-versatile',
    geminiModel: 'gemini-2.0-flash',
    supportedGeminiModels: [
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
    ],
    timeoutMs: 30000,
    schemaMaxRetries: 3,
    keyPoolMaxAttempts: 5,
  },
  dailyTokenBudget: {
    currentTokens: 142850,
    limit: 1000000,
    allowed: true,
  },
  recentFailovers: [
    {
      id: 1,
      commitSha: 'a1b2c3d4e5f6',
      errorMessage: 'Rate limit 429 encountered on primary provider; seamlessly failed over to secondary Tier-2 pool',
      failedAt: '2 hours ago',
      resolvedAt: '2 hours ago',
    },
  ],
  github: {
    appId: '1098421',
    hasWebhookSecret: true,
    hasPrivateKey: true,
    webhookSuccessRate: 99.4,
    totalDeliveries: 1240,
    recentDeliveries: [
      {
        id: 1,
        deliveryId: 'del-99881122-infra',
        event: 'pull_request',
        action: 'opened',
        statusCode: 200,
        errorMessage: null,
        receivedAt: '14 minutes ago',
      },
      {
        id: 2,
        deliveryId: 'del-88776655-api',
        event: 'pull_request',
        action: 'synchronize',
        statusCode: 200,
        errorMessage: null,
        receivedAt: '42 minutes ago',
      },
    ],
    supportedEvents: ['pull_request.opened', 'pull_request.synchronize', 'pull_request.reopened'],
  },
  notifications: {
    supportedChannels: [
      { id: 'github_pr', name: 'GitHub PR Inline Comments & Summary', status: 'ACTIVE', type: 'github' },
      { id: 'slack', name: 'Slack Security Alert Webhook', status: 'OPTIONAL', type: 'slack' },
      { id: 'email', name: 'Email Digest', status: 'OPTIONAL', type: 'email' },
    ],
  },
  runtime: {
    reviewsThisMonth: 124,
    monthlyQuota: 10000,
    queueMetrics: {
      waiting: 0,
      active: 2,
      completed: 3198,
      failed: 12,
      concurrency: 10,
    },
    retention: {
      deliveryDedupTtlHours: 24,
      tokenBudgetTtlHours: 24,
      reviewRecordsRetention: '90 days',
    },
    configHistory: [
      {
        id: 101,
        actor: 'admin',
        actorRole: 'ADMIN',
        action: 'policy.updated',
        resourceId: 'organization/api-service',
        metadata: { changed: 'severityThreshold -> suggestion' },
        createdAt: '2026-10-18T14:20:00Z',
      },
    ],
  },
};

export function SettingsView() {
  const [activeTab, setActiveTab] = useState<'ai' | 'security' | 'github' | 'notifications' | 'runtime'>('ai');
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Server data state
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected Repository for Security Gate policies
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);

  // Form states for Security & Quality Gate
  const [severityThreshold, setSeverityThreshold] = useState<'critical' | 'warning' | 'suggestion'>('suggestion');
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.7);
  const [blockCritical, setBlockCritical] = useState<boolean>(true);
  const [maxComments, setMaxComments] = useState<number>(25);
  const [maxFiles, setMaxFiles] = useState<number>(50);
  const [maxLines, setMaxLines] = useState<number>(1000);
  const [skipDrafts, setSkipDrafts] = useState<boolean>(true);
  const [skipBotAuthors, setSkipBotAuthors] = useState<boolean>(true);
  const [disabledCategories, setDisabledCategories] = useState<string[]>([]);
  const [ignoredGlobsText, setIgnoredGlobsText] = useState<string>('tests/**, docs/**, **/*.min.js');
  const [incompleteBehavior, setIncompleteBehavior] = useState<'WARN' | 'BLOCK' | 'PASS'>('WARN');

  // Tracking dirty form state
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Testing states
  const [validatingCredentials, setValidatingCredentials] = useState<string | null>(null);
  const [credentialValidationResult, setCredentialValidationResult] = useState<any>(null);

  const [testingGithub, setTestingGithub] = useState(false);
  const [githubTestResult, setGithubTestResult] = useState<any>(null);

  const [testingNotification, setTestingNotification] = useState(false);
  const [notificationTestResult, setNotificationTestResult] = useState<any>(null);

  // 1. Fetch initial settings
  const fetchSettings = async (repoId?: number) => {
    setLoading(true);
    setError(null);
    try {
      const url = repoId ? `/api/settings?repoId=${repoId}` : '/api/settings';
      const res = await fetch(url);
      if (res.status === 401) {
        setData(DEMO_SETTINGS);
        setIsDemoMode(true);
        setSelectedRepoId(DEMO_SETTINGS.selectedRepository?.id || 1);
        setIsDirty(false);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load settings`);
      const json: SettingsData = await res.json();
      setData(json);
      setIsDemoMode(false);

      // Hydrate selected repo and gate form
      const repo = json.selectedRepository;
      if (repo) {
        setSelectedRepoId(repo.id);
        const config = repo.config || {};
        const policy = repo.organizationPolicy || {};

        setSeverityThreshold(config.severity_threshold || 'suggestion');
        setConfidenceThreshold(config.confidence_threshold ?? policy.minConfidence ?? 0.7);
        setBlockCritical(config.block_on_critical ?? policy.blockCriticalSecurity ?? true);
        setMaxComments(config.max_comments_per_pr ?? policy.maxComments ?? 25);
        setMaxFiles(config.max_files_per_pr ?? 50);
        setMaxLines(config.max_lines_per_pr ?? 1000);
        setSkipDrafts(config.skip_drafts ?? true);
        setSkipBotAuthors(config.skip_bot_authors ?? true);
        setDisabledCategories(config.disabled_categories || policy.disabledCategories || []);
        setIgnoredGlobsText((config.ignored_globs || policy.ignoredPaths || ['tests/**', 'docs/**', '**/*.min.js']).join(', '));
      }
      setIsDirty(false);
    } catch (err: any) {
      console.error('[Settings] Error loading settings:', err);
      setError(err.message || 'Failed to load platform settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  // Handle repository switch
  const handleRepoChange = (newRepoId: number) => {
    if (isDirty) {
      if (!window.confirm('You have unsaved changes in your security gate policy. Discard changes?')) {
        return;
      }
    }
    setSelectedRepoId(newRepoId);
    fetchSettings(newRepoId);
  };

  // Mark dirty on edits
  const handleFieldChange = () => {
    if (!isDirty) setIsDirty(true);
    if (saveSuccess) setSaveSuccess(false);
    if (saveError) setSaveError(null);
  };

  // Toggle category
  const toggleCategory = (cat: string) => {
    handleFieldChange();
    setDisabledCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  // 2. Save Security & Quality Gate Settings
  const handleSaveSecurityGate = async () => {
    if (isDemoMode) {
      alert('You are currently viewing Platform Settings in demonstration mode. Please Sign In to save custom policies.');
      return;
    }
    if (!selectedRepoId) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const parsedGlobs = ignoredGlobsText
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean);

      const payload = {
        repositoryId: selectedRepoId,
        repoConfig: {
          severity_threshold: severityThreshold,
          confidence_threshold: confidenceThreshold,
          block_on_critical: blockCritical,
          max_comments_per_pr: maxComments,
          max_files_per_pr: maxFiles,
          max_lines_per_pr: maxLines,
          skip_drafts: skipDrafts,
          skip_bot_authors: skipBotAuthors,
          disabled_categories: disabledCategories,
          ignored_globs: parsedGlobs,
        },
        orgPolicy: {
          blockCriticalSecurity: blockCritical,
          minConfidence: confidenceThreshold,
          maxComments: maxComments,
          ignoredPaths: parsedGlobs,
          disabledCategories: disabledCategories,
        },
      };

      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || errorData.error || `HTTP ${res.status}`);
      }

      setSaveSuccess(true);
      setIsDirty(false);
      setTimeout(() => setSaveSuccess(false), 4000);
      // Refresh configuration history
      fetchSettings(selectedRepoId);
    } catch (err: any) {
      console.error('[Settings] Save error:', err);
      setSaveError(err.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  // 3. Credential Test
  const handleValidateCredential = async (provider: 'groq' | 'gemini') => {
    setValidatingCredentials(provider);
    setCredentialValidationResult(null);
    try {
      const res = await fetch('/api/settings/ai-engine/validate-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const json = await res.json();
      setCredentialValidationResult(json);
    } catch (err: any) {
      setCredentialValidationResult({ success: false, error: err.message });
    } finally {
      setValidatingCredentials(null);
    }
  };

  // 4. GitHub Connection Test
  const handleTestGithub = async () => {
    setTestingGithub(true);
    setGithubTestResult(null);
    try {
      const res = await fetch('/api/settings/github/test-connection', {
        method: 'POST',
      });
      const json = await res.json();
      setGithubTestResult(json);
    } catch (err: any) {
      setGithubTestResult({ success: false, error: err.message });
    } finally {
      setTestingGithub(false);
    }
  };

  // 5. Notification Test Alert
  const handleTestNotification = async () => {
    setTestingNotification(true);
    setNotificationTestResult(null);
    try {
      const res = await fetch('/api/settings/notifications/test', {
        method: 'POST',
      });
      const json = await res.json();
      setNotificationTestResult(json);
    } catch (err: any) {
      setNotificationTestResult({ success: false, error: err.message });
    } finally {
      setTestingNotification(false);
    }
  };

  const isAdmin = data?.userRole === 'OWNER' || data?.userRole === 'ADMIN';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] space-y-3">
        <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
        <span className="text-xs font-semibold text-slate-500">Loading system configuration & telemetry...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto mt-8 p-6 rounded-2xl border border-red-200 bg-red-50 text-red-900 space-y-3">
        <div className="flex items-center gap-2 font-bold text-sm">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <span>Configuration Service Unavailable</span>
        </div>
        <p className="text-xs text-red-700">{error || 'Unable to retrieve settings from server.'}</p>
        <button
          onClick={() => fetchSettings()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Retry Loading</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 animate-fade-in text-slate-800 dark:text-slate-100">
      {/* Demonstration notice when unauthenticated */}
      {isDemoMode && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 dark:bg-blue-950/40 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-blue-900 dark:text-blue-200">
            <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <span>
              <strong>Demonstration Mode:</strong> You are previewing live enterprise settings. Sign in to customize gate policies, rotate provider API keys, or manage webhooks.
            </span>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors cursor-pointer shrink-0"
          >
            <span>Sign In</span>
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Platform & Security Policy Settings
            </h1>
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200/60 px-2 py-0.5 text-xs font-semibold text-blue-700">
              <Shield className="h-3 w-3 text-blue-600" />
              Role: {data.userRole}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Enterprise multi-model AI orchestration, fail-closed security gates, GitHub webhook telemetry, and runtime budgets.
          </p>
        </div>

        {/* Global Save Button for Dirty Forms */}
        {activeTab === 'security' && (
          <div className="flex items-center gap-3">
            {isDirty && (
              <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                Unsaved changes
              </span>
            )}
            {saveSuccess && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 animate-fade-in">
                <CheckCircle2 className="h-4 w-4" />
                <span>Policies updated!</span>
              </span>
            )}
            {saveError && (
              <span className="text-xs font-semibold text-red-600 max-w-xs truncate" title={saveError}>
                {saveError}
              </span>
            )}
            <button
              type="button"
              onClick={handleSaveSecurityGate}
              disabled={saving || !isDirty || !isAdmin}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>{saving ? 'Saving...' : 'Save Gate Policies'}</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. Primary Navigation Tabs */}
      <div className="flex border-b border-slate-200 text-xs font-medium text-slate-600 gap-6 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('ai')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'ai' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Cpu className="h-4 w-4" />
          <span>1. AI Review Engine</span>
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'security' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Shield className="h-4 w-4" />
          <span>2. Security & Quality Gate</span>
        </button>

        <button
          onClick={() => setActiveTab('github')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'github' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Github className="h-4 w-4" />
          <span>3. GitHub & Webhooks</span>
        </button>

        <button
          onClick={() => setActiveTab('notifications')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'notifications' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Bell className="h-4 w-4" />
          <span>4. Alerts & Notifications</span>
        </button>

        <button
          onClick={() => setActiveTab('runtime')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'runtime' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Activity className="h-4 w-4" />
          <span>5. Runtime & Usage</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: AI REVIEW ENGINE                                               */}
      {/* ========================================================================= */}
      {activeTab === 'ai' && (
        <div className="space-y-6 animate-fade-in">
          {/* Active Provider Topology Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Configured Multi-Tier Provider Topology</h3>
                <p className="text-xs text-slate-500">
                  Worker executes strict cascading fallback: Primary KeyPool ➔ Secondary KeyPool ➔ Deterministic Offline Gate.
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-0.5 text-xs font-semibold">
                Autonomous Failover Active
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.aiEngine.providerOrder.map((provider) => (
                <div
                  key={provider.tier}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">
                        Tier {provider.tier}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          provider.status === 'healthy'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {provider.status.toUpperCase()}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-slate-900">{provider.name}</h4>
                    <div className="text-[11px] font-mono text-slate-600 bg-white border border-slate-200 rounded p-1.5 break-all">
                      {provider.model}
                    </div>
                    <div className="text-xs text-slate-500 space-y-1 pt-1">
                      <div className="flex justify-between">
                        <span>Configured Keys:</span>
                        <span className="font-semibold text-slate-800">{provider.keysCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Active (Ready):</span>
                        <span className="font-semibold text-emerald-600">{provider.activeKeys}</span>
                      </div>
                    </div>
                  </div>

                  {provider.provider !== 'deterministic-cyberops' && (
                    <div className="pt-2 border-t border-slate-200/70">
                      <button
                        type="button"
                        onClick={() => handleValidateCredential(provider.provider as any)}
                        disabled={validatingCredentials === provider.provider}
                        className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
                      >
                        {validatingCredentials === provider.provider ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                        <span>{validatingCredentials === provider.provider ? 'Testing...' : 'Validate Handshake'}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Validation Feedback Modal / Banner */}
            {credentialValidationResult && (
              <div
                className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 animate-fade-in ${
                  credentialValidationResult.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                {credentialValidationResult.success ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-bold">
                    {credentialValidationResult.success ? 'Credential Handshake Succeeded' : 'Handshake Failed'}
                  </span>
                  <p className="mt-0.5">
                    {credentialValidationResult.success
                      ? `Provider "${credentialValidationResult.provider}" (${credentialValidationResult.model}) responded in ${credentialValidationResult.latencyMs}ms using verified key ${credentialValidationResult.testedKey}.`
                      : credentialValidationResult.error}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Masked Credentials & Execution Bounds */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Masked Keys Audit */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <Key className="h-4 w-4 text-slate-700" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Masked Credential Registry
                </h3>
              </div>
              <p className="text-xs text-slate-500">
                Plaintext API keys are never stored in database tables or delivered to client browsers.
              </p>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="font-semibold text-slate-700">Groq KeyPool (5 Registered Keys):</span>
                  <div className="grid grid-cols-1 gap-1.5 mt-1">
                    {data.aiEngine.providerOrder[0]?.maskedKeys.map((k, i) => (
                      <div key={i} className="flex items-center justify-between font-mono bg-slate-50 px-2.5 py-1 rounded border border-slate-200 text-slate-600">
                        <span>Key #{i + 1}: {k}</span>
                        <span className="text-[10px] text-emerald-600 font-sans font-bold">READY</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="font-semibold text-slate-700">Gemini KeyPool (5 Registered Keys):</span>
                  <div className="grid grid-cols-1 gap-1.5 mt-1">
                    {data.aiEngine.providerOrder[1]?.maskedKeys.map((k, i) => (
                      <div key={i} className="flex items-center justify-between font-mono bg-slate-50 px-2.5 py-1 rounded border border-slate-200 text-slate-600">
                        <span>Key #{i + 1}: {k}</span>
                        <span className="text-[10px] text-emerald-600 font-sans font-bold">READY</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Bounded Retries & Budget */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <Sliders className="h-4 w-4 text-slate-700" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Timeout & Token Quota Limits
                </h3>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <div>
                    <span className="font-semibold text-slate-800">Enforced LLM Request Timeout</span>
                    <p className="text-[11px] text-slate-400">Hard timeout on individual file review calls</p>
                  </div>
                  <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded">
                    {data.aiEngine.timeoutMs}ms
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <div>
                    <span className="font-semibold text-slate-800">Schema Validation Retry Bound</span>
                    <p className="text-[11px] text-slate-400">Retries before failing over on malformed JSON</p>
                  </div>
                  <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded">
                    {data.aiEngine.schemaMaxRetries} attempts
                  </span>
                </div>

                {/* Daily Token Budget Bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-800">Daily Installation Token Quota</span>
                    <span className="font-mono text-slate-600">
                      {data.dailyTokenBudget.currentTokens.toLocaleString()} / {data.dailyTokenBudget.limit.toLocaleString()} tokens
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        data.dailyTokenBudget.currentTokens / data.dailyTokenBudget.limit > 0.8
                          ? 'bg-amber-500'
                          : 'bg-blue-600'
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          (data.dailyTokenBudget.currentTokens / data.dailyTokenBudget.limit) * 100
                        )}%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400">
                    Resets automatically daily via Redis 48h rolling window.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Failover History */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Recent Provider Failover & Resolution History
            </h3>
            {data.recentFailovers.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">
                No recent provider failovers recorded. All reviews completed through Tier 1.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-semibold">
                      <th className="pb-2">Failed Commit</th>
                      <th className="pb-2">Error / Failover Cause</th>
                      <th className="pb-2">Timestamp</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.recentFailovers.map((failover) => (
                      <tr key={failover.id} className="hover:bg-slate-50/60">
                        <td className="py-2.5 font-mono text-blue-600">{failover.commitSha.slice(0, 7)}</td>
                        <td className="py-2.5 text-slate-700 max-w-md truncate" title={failover.errorMessage}>
                          {failover.errorMessage}
                        </td>
                        <td className="py-2.5 text-slate-400">{new Date(failover.failedAt).toLocaleTimeString()}</td>
                        <td className="py-2.5">
                          {failover.resolvedAt ? (
                            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[10px] font-bold">
                              Resolved
                            </span>
                          ) : (
                            <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[10px] font-bold">
                              Logged
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: SECURITY & QUALITY GATE                                        */}
      {/* ========================================================================= */}
      {activeTab === 'security' && (
        <div className="space-y-6 animate-fade-in">
          {/* Target Repository Selector */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Configuring Repository:
              </span>
              <select
                value={selectedRepoId || ''}
                onChange={(e) => handleRepoChange(parseInt(e.target.value, 10))}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none cursor-pointer"
              >
                {data.installation?.repositories.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fullName} ({r.defaultBranch})
                  </option>
                ))}
              </select>
            </div>

            <span className="text-xs text-slate-500">
              Settings update both in-database `Repository.config` and `organizationPolicy`.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Gate Strictness & Severities */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2">
                Blocking Thresholds & Severity
              </h3>

              <div className="space-y-4 text-xs">
                {/* Block Critical Security */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-semibold text-slate-900 block">Block on Critical Security Findings</label>
                    <span className="text-[11px] text-slate-500">
                      Automatically issues BLOCK gate verdict if CWE/OWASP vulnerabilities with risk &ge; 80 detected.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={blockCritical}
                    onChange={(e) => {
                      handleFieldChange();
                      setBlockCritical(e.target.checked);
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </div>

                {/* Minimum Blocking Severity */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-900 block">Minimum Blocking Severity Threshold</label>
                  <select
                    value={severityThreshold}
                    onChange={(e) => {
                      handleFieldChange();
                      setSeverityThreshold(e.target.value as any);
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800"
                  >
                    <option value="critical">Critical (Block only on severe exploits)</option>
                    <option value="warning">Warning (Require developer review on bugs & security)</option>
                    <option value="suggestion">Suggestion (Advisory on all issues)</option>
                  </select>
                </div>

                {/* Confidence Threshold */}
                <div className="space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span>Minimum Calibrated Confidence</span>
                    <span className="font-mono text-blue-600">{Math.round(confidenceThreshold * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="0.95"
                    step="0.05"
                    value={confidenceThreshold}
                    onChange={(e) => {
                      handleFieldChange();
                      setConfidenceThreshold(parseFloat(e.target.value));
                    }}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400">
                    Filters out speculative LLM hallucinations below this score.
                  </span>
                </div>

                {/* Incomplete Analysis Fallback Behavior */}
                <div className="space-y-1 pt-2 border-t border-slate-100">
                  <label className="font-semibold text-slate-900 block">Behavior when Analysis is Incomplete</label>
                  <select
                    value={incompleteBehavior}
                    onChange={(e) => {
                      handleFieldChange();
                      setIncompleteBehavior(e.target.value as any);
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800"
                  >
                    <option value="WARN">WARN (Log warning; allow merge with note)</option>
                    <option value="BLOCK">BLOCK (Fail-closed: block PR merge until retried)</option>
                    <option value="PASS">PASS (Ignore partial analysis)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Scope & Size Gates */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2">
                PR Scope & Notification Budgets
              </h3>

              <div className="space-y-4 text-xs">
                {/* Max Comments */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-semibold text-slate-900 block">Max Comments per PR</label>
                    <span className="text-[11px] text-slate-500">Prevents review fatigue on large diffs</span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={maxComments}
                    onChange={(e) => {
                      handleFieldChange();
                      setMaxComments(parseInt(e.target.value, 10));
                    }}
                    className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-right font-mono"
                  />
                </div>

                {/* Max Files per PR */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-semibold text-slate-900 block">Max Files per PR</label>
                    <span className="text-[11px] text-slate-500">Exceeding triggers partial scan</span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={maxFiles}
                    onChange={(e) => {
                      handleFieldChange();
                      setMaxFiles(parseInt(e.target.value, 10));
                    }}
                    className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-right font-mono"
                  />
                </div>

                {/* Max Lines per PR */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-semibold text-slate-900 block">Max Changed Lines</label>
                    <span className="text-[11px] text-slate-500">Large diff cut-off safeguard</span>
                  </div>
                  <input
                    type="number"
                    min="50"
                    max="50000"
                    value={maxLines}
                    onChange={(e) => {
                      handleFieldChange();
                      setMaxLines(parseInt(e.target.value, 10));
                    }}
                    className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-right font-mono"
                  />
                </div>

                {/* Skip Drafts & Bots */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">Skip Draft PRs</span>
                    <input
                      type="checkbox"
                      checked={skipDrafts}
                      onChange={(e) => {
                        handleFieldChange();
                        setSkipDrafts(e.target.checked);
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">Skip Bot Authors (Dependabot, Renovate)</span>
                    <input
                      type="checkbox"
                      checked={skipBotAuthors}
                      onChange={(e) => {
                        handleFieldChange();
                        setSkipBotAuthors(e.target.checked);
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Enabled Categories & Ignored Globs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Enabled Categories */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Audited Issue Categories
              </h3>
              <p className="text-xs text-slate-500">
                Uncheck categories to disable reporting. In-repo .aireview.yml cannot override disabled checks.
              </p>

              <div className="flex flex-wrap gap-2 pt-1">
                {['security', 'bug', 'performance', 'maintainability', 'style'].map((cat) => {
                  const isEnabled = !disabledCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        isEnabled
                          ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-2xs'
                          : 'bg-slate-100 border-slate-200 text-slate-400 line-through'
                      }`}
                    >
                      {cat.toUpperCase()} {isEnabled ? '✓' : '✕'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ignored Globs */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Ignored File Patterns (Globs)
              </h3>
              <p className="text-xs text-slate-500">
                Comma-separated glob patterns. Broad wildcards (e.g. `**`) are rejected automatically.
              </p>
              <textarea
                rows={3}
                value={ignoredGlobsText}
                onChange={(e) => {
                  handleFieldChange();
                  setIgnoredGlobsText(e.target.value);
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: GITHUB & WEBHOOKS                                              */}
      {/* ========================================================================= */}
      {activeTab === 'github' && (
        <div className="space-y-6 animate-fade-in">
          {/* Connection Status Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <Github className="h-6 w-6 text-slate-900" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    GitHub App Installation: {data.installation?.accountLogin || 'Connected App'}
                  </h3>
                  <span className="text-xs text-slate-500">
                    Installation ID: {data.installation?.githubInstallationId} • Account Type: {data.installation?.accountType}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTestGithub}
                disabled={testingGithub}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
              >
                {testingGithub ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5 text-blue-600" />}
                <span>{testingGithub ? 'Checking...' : 'Test Connection'}</span>
              </button>
            </div>

            {/* Test result banner */}
            {githubTestResult && (
              <div className={`p-3 rounded-xl border text-xs ${githubTestResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                <span className="font-bold">{githubTestResult.success ? '✓ GitHub App Verified' : '✕ Verification Failed'}:</span> {githubTestResult.message}
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">24h Delivery Success</span>
                <span className="text-lg font-bold text-emerald-600">{data.github.webhookSuccessRate}%</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Total Webhooks Processed</span>
                <span className="text-lg font-bold text-slate-900">{data.github.totalDeliveries}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Monitored Repositories</span>
                <span className="text-lg font-bold text-blue-600">{data.installation?.repositories.length || 0}</span>
              </div>
            </div>
          </div>

          {/* Webhook Delivery Logs Table */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Recent Ingress Webhook Deliveries (`WebhookDelivery`)
            </h3>

            {data.github.recentDeliveries.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">No recent deliveries recorded in database.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-semibold">
                      <th className="pb-2">Delivery ID</th>
                      <th className="pb-2">Event</th>
                      <th className="pb-2">Action</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Received</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.github.recentDeliveries.map((del) => (
                      <tr key={del.id} className="hover:bg-slate-50/60">
                        <td className="py-2 font-mono text-slate-600 truncate max-w-[120px]">{del.deliveryId}</td>
                        <td className="py-2 font-semibold text-slate-900">{del.event}</td>
                        <td className="py-2 text-slate-600">{del.action || '-'}</td>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${del.statusCode >= 200 && del.statusCode < 300 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                            HTTP {del.statusCode}
                          </span>
                        </td>
                        <td className="py-2 text-slate-400">{new Date(del.receivedAt).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 4: ALERTS & NOTIFICATIONS                                         */}
      {/* ========================================================================= */}
      {activeTab === 'notifications' && (
        <div className="space-y-6 animate-fade-in">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Configured Notification Channels</h3>
                <p className="text-xs text-slate-500">
                  Surfaces supported in-app review feedback vs. unattached external dispatchers.
                </p>
              </div>

              <button
                type="button"
                onClick={handleTestNotification}
                disabled={testingNotification}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
              >
                {testingNotification ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5 text-blue-600" />}
                <span>Send Test Alert</span>
              </button>
            </div>

            {/* Test result banner */}
            {notificationTestResult && (
              <div className="p-3 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{notificationTestResult.message} Dispatched to: {notificationTestResult.deliveredTo}</span>
              </div>
            )}

            {/* Channels List */}
            <div className="space-y-3">
              {data.notifications.supportedChannels.map((channel) => (
                <div
                  key={channel.id}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/50"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">{channel.name}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.2 rounded-full ${channel.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                        {channel.status}
                      </span>
                    </div>
                    {channel.note && (
                      <p className="text-[11px] text-amber-700 font-medium">⚠️ {channel.note}</p>
                    )}
                  </div>

                  <span className="text-[11px] font-mono text-slate-400 capitalize">{channel.type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 5: RUNTIME & USAGE                                                */}
      {/* ========================================================================= */}
      {activeTab === 'runtime' && (
        <div className="space-y-6 animate-fade-in">
          {/* Runtime Metrics Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Reviews Completed (Month)</span>
              <span className="text-xl font-bold text-slate-900 mt-1 block">{data.runtime.reviewsThisMonth} / {data.runtime.monthlyQuota}</span>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Active Queue Workers</span>
              <span className="text-xl font-bold text-blue-600 mt-1 block">{data.runtime.queueMetrics.concurrency} concurrent</span>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Pending Queue Depth</span>
              <span className="text-xl font-bold text-slate-900 mt-1 block">{data.runtime.queueMetrics.waiting} waiting</span>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Deduplication Lock TTL</span>
              <span className="text-xl font-bold text-slate-900 mt-1 block">{data.runtime.retention.deliveryDedupTtlHours} hours</span>
            </div>
          </div>

          {/* Pre-Push Review CLI Defaults */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Developer Pre-Push Review Hook Defaults
            </h3>
            <p className="text-xs text-slate-500">
              Developers can execute static gate audits locally before pushing branches to GitHub:
            </p>
            <div className="bg-slate-900 text-slate-100 p-3 rounded-xl font-mono text-xs overflow-x-auto">
              <code>npm run review:pre-push -- --strict --fail-on-critical</code>
            </div>
          </div>

          {/* Configuration History Audit Table */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Policy & Configuration Change Audit Trail (`AuditLog`)
            </h3>

            {data.runtime.configHistory.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">No configuration changes logged yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-semibold">
                      <th className="pb-2">Actor</th>
                      <th className="pb-2">Role</th>
                      <th className="pb-2">Action</th>
                      <th className="pb-2">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.runtime.configHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/60">
                        <td className="py-2.5 font-semibold text-slate-800">{item.actor}</td>
                        <td className="py-2.5 text-blue-600 font-medium">{item.actorRole || 'ADMIN'}</td>
                        <td className="py-2.5 font-mono text-slate-600">{item.action}</td>
                        <td className="py-2.5 text-slate-400">{new Date(item.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
