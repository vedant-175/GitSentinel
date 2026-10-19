import { RepoConfig, Severity } from './types.js';

const SEVERITY_RANK: Record<Severity, number> = {
  suggestion: 1,
  warning: 2,
  critical: 3,
};

/**
 * Merges in-repo configuration (.aireview.yml) into stored dashboard configuration.
 * Item 7:
 * - Only merges keys that the file actually sets; does NOT apply schema defaults over stored settings.
 * - May only tighten the dashboard config:
 *   - More ignores of generated files are fine, but NEVER wildcard ignores like '**' or '*'.
 *   - NEVER auto_approve (cannot enable auto_approve if disabled in dashboard).
 *   - NEVER disabled categories (cannot disable checks).
 *   - NEVER lower thresholds (severity_threshold or confidence_threshold cannot be lowered below stored).
 */
export function mergeInRepoConfig(
  storedConfig: RepoConfig,
  rawInRepoConfig: unknown
): RepoConfig {
  if (!rawInRepoConfig || typeof rawInRepoConfig !== 'object' || Array.isArray(rawInRepoConfig)) {
    return { ...storedConfig };
  }

  const inRepo = rawInRepoConfig as Record<string, unknown>;
  const merged: RepoConfig = { ...storedConfig };

  // 1. ignored_globs: More ignores of generated files are fine, but NEVER '**', '**/*', or '*'
  if ('ignored_globs' in inRepo && Array.isArray(inRepo.ignored_globs)) {
    const validNewGlobs = inRepo.ignored_globs
      .filter((g): g is string => typeof g === 'string')
      .map((g) => g.trim())
      .filter((g) => {
        const normalized = g.replace(/^\.\//, '');
        return (
          normalized !== '**' &&
          normalized !== '**/*' &&
          normalized !== '*' &&
          normalized !== ''
        );
      });

    merged.ignored_globs = Array.from(
      new Set([...(storedConfig.ignored_globs || []), ...validNewGlobs])
    );
  }

  // 2. auto_approve: NEVER auto_approve from in-repo config
  // In-repo config can NEVER enable auto_approve (if stored is false, it stays false)
  if ('auto_approve' in inRepo && typeof inRepo.auto_approve === 'boolean') {
    if (storedConfig.auto_approve === true && inRepo.auto_approve === false) {
      merged.auto_approve = false; // Tightening allowed
    }
  }

  // 3. disabled_categories: NEVER allow in-repo config to disable categories
  // inRepo.disabled_categories is strictly ignored to prevent bypassing checks.

  // 4. severity_threshold: NEVER lower threshold
  if (
    'severity_threshold' in inRepo &&
    typeof inRepo.severity_threshold === 'string' &&
    inRepo.severity_threshold in SEVERITY_RANK
  ) {
    const storedRank = SEVERITY_RANK[storedConfig.severity_threshold || 'suggestion'];
    const inRepoRank = SEVERITY_RANK[inRepo.severity_threshold as Severity];
    if (inRepoRank > storedRank) {
      merged.severity_threshold = inRepo.severity_threshold as Severity;
    }
  }

  // 5. confidence_threshold: NEVER lower threshold below stored setting
  if ('confidence_threshold' in inRepo && typeof inRepo.confidence_threshold === 'number') {
    const inRepoConf = inRepo.confidence_threshold;
    if (!isNaN(inRepoConf) && inRepoConf >= 0 && inRepoConf <= 1) {
      const storedConf = storedConfig.confidence_threshold ?? 0.7;
      merged.confidence_threshold = Math.max(storedConf, inRepoConf);
    }
  }

  // 6. max_comments_per_pr: can only tighten (reduce limit)
  if ('max_comments_per_pr' in inRepo && typeof inRepo.max_comments_per_pr === 'number') {
    const storedMax = storedConfig.max_comments_per_pr ?? 25;
    merged.max_comments_per_pr = Math.min(storedMax, inRepo.max_comments_per_pr);
  }

  // 7. block_on_critical: can only tighten (enable true)
  if ('block_on_critical' in inRepo && typeof inRepo.block_on_critical === 'boolean') {
    if (inRepo.block_on_critical === true) {
      merged.block_on_critical = true;
    }
  }

  return merged;
}
