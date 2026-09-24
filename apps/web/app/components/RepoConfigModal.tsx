'use client';

import { useState } from 'react';
import { Settings, X, Save, CheckCircle } from 'lucide-react';
import { updateRepoConfig } from '@/app/actions/repo-actions';
import { RepoConfig, Severity, Category } from '@ai-reviewer/shared';

interface Props {
  repoId: number;
  repoName: string;
  initialConfig?: RepoConfig | null;
}

const CATEGORIES: Category[] = ['bug', 'security', 'style', 'performance', 'maintainability'];

export function RepoConfigModal({ repoId, repoName, initialConfig }: Props) {
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
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
      >
        <Settings className="h-3.5 w-3.5 text-indigo-400" />
        Settings
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#111827] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div>
                <h3 className="text-base font-semibold text-white">Repository Rules & Config</h3>
                <p className="text-xs text-slate-400 font-mono">{repoName}</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-5 py-4 text-sm">
              {/* Severity Threshold */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Minimum Severity Threshold
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['suggestion', 'warning', 'critical'] as Severity[]).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setSeverityThreshold(level)}
                      className={`py-2 px-3 rounded-lg text-xs font-medium capitalize border transition-all ${
                        severityThreshold === level
                          ? 'border-indigo-500 bg-indigo-500/20 text-indigo-200'
                          : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Only issues matching or exceeding this severity will be posted to pull requests.
                </p>
              </div>

              {/* Disabled Categories */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
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
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize border transition-all ${
                          isDisabled
                            ? 'border-rose-500/40 bg-rose-500/10 text-rose-300 line-through'
                            : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Click a category to disable or re-enable it.
                </p>
              </div>

              {/* Ignored Globs */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Ignored File Patterns (one per line)
                </label>
                <textarea
                  value={ignoredGlobsText}
                  onChange={(e) => setIgnoredGlobsText(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="*.lock&#10;dist/**&#10;*.min.js"
                />
              </div>

              {/* Max Comments */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Max Comments per PR ({maxComments})
                </label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={maxComments}
                  onChange={(e) => setMaxComments(parseInt(e.target.value, 10))}
                  className="w-full accent-indigo-500"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50 transition-all"
              >
                {success ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-emerald-400" />
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
