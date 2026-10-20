'use client';

import { useState } from 'react';
import { Settings, X, Save, CheckCircle } from 'lucide-react';
import { updateRepoConfig } from '@/app/actions/repo-actions';
import { RepoConfig, Severity, Category } from '@ai-reviewer/shared';

interface Props {
  repoId: number;
  repoName: string;
  initialConfig?: RepoConfig | null;
  triggerLabel?: string;
}

const CATEGORIES: Category[] = ['bug', 'security', 'style', 'performance', 'maintainability'];

export function RepoConfigModal({ repoId, repoName, initialConfig, triggerLabel = 'Repository Settings' }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const [ignoredGlobsText, setIgnoredGlobsText] = useState(
    (initialConfig?.ignored_globs || ['*.lock', 'package-lock.json', 'dist/**']).join('\n')
  );
  const [severityThreshold, setSeverityThreshold] = useState<Severity>(
    initialConfig?.severity_threshold || 'suggestion'
  );
  const [disabledCategories, setDisabledCategories] = useState<Category[]>(
    initialConfig?.disabled_categories || []
  );
  const [maxComments, setMaxComments] = useState<number>(
    initialConfig?.max_comments_per_pr || 25
  );

  function toggleCategory(cat: Category) {
    if (disabledCategories.includes(cat)) {
      setDisabledCategories(disabledCategories.filter((c) => c !== cat));
    } else {
      setDisabledCategories([...disabledCategories, cat]);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSuccess(false);

    const ignoredGlobs = ignoredGlobsText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const config: RepoConfig = {
      ignored_globs: ignoredGlobs,
      severity_threshold: severityThreshold,
      disabled_categories: disabledCategories,
      max_comments_per_pr: maxComments,
    };

    const res = await updateRepoConfig(repoId, config);
    setSaving(false);

    if (res.success) {
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setIsOpen(false);
      }, 1000);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 px-3.5 py-2 text-xs sm:text-sm font-medium shadow-xs transition-colors cursor-pointer shrink-0"
      >
        <Settings className="h-4 w-4 text-slate-500 dark:text-zinc-400" />
        <span>{triggerLabel}</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-slate-900 dark:text-zinc-100">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-zinc-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Repository Rules &amp; Config</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono mt-0.5">{repoName}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-5 py-4 text-sm">
              {/* Severity Threshold */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5">
                  Minimum Severity Threshold
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['suggestion', 'warning', 'critical'] as Severity[]).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setSeverityThreshold(level)}
                      className={`py-2 px-3 rounded-lg text-xs font-medium capitalize border transition-all cursor-pointer ${
                        severityThreshold === level
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold'
                          : 'border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/60 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
                  Only issues matching or exceeding this severity will be posted to pull requests.
                </p>
              </div>

              {/* Disabled Categories */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5">
                  Disabled Check Categories
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => {
                    const isDisabled = disabledCategories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize border transition-all cursor-pointer ${
                          isDisabled
                            ? 'border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 line-through'
                            : 'border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/60 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
                  Click a category to disable or re-enable it.
                </p>
              </div>

              {/* Ignored Globs */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5">
                  Ignored File Patterns (one per line)
                </label>
                <textarea
                  value={ignoredGlobsText}
                  onChange={(e) => setIgnoredGlobsText(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-3 py-2 font-mono text-xs text-slate-900 dark:text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="*.lock&#10;dist/**&#10;*.min.js"
                />
              </div>

              {/* Max Comments */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5">
                  Max Comments per PR ({maxComments})
                </label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={maxComments}
                  onChange={(e) => setMaxComments(parseInt(e.target.value, 10))}
                  className="w-full accent-blue-600"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-xs disabled:opacity-50 transition-all cursor-pointer"
              >
                {success ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-emerald-300" />
                    Saved!
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {saving ? 'Saving...' : 'Save Configuration'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
