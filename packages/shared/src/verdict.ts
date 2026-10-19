import { RepoConfig, ReviewIssue } from './types.js';

/**
 * Determines review verdict according to strict hardening rules:
 * - Item 8: APPROVE needs reviewComplete AND auto_approve AND zero issues.
 * - REQUEST_CHANGES only if config.block_on_critical is true AND critical issues exist.
 * - Default review event is COMMENT.
 * - Never returns APPROVE for an unreviewed or partially reviewed PR (fails closed).
 */
export function determineVerdict(
  config: RepoConfig,
  issues: ReviewIssue[],
  reviewCompleteOrAllChunksSucceeded: boolean,
  isPartial: boolean = false
): 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' {
  const reviewComplete = !isPartial && reviewCompleteOrAllChunksSucceeded;

  // Fail-closed ground rule: A failed, skipped, or partial review NEVER produces APPROVE
  if (!reviewComplete) {
    const hasCritical = issues.some((i) => i.severity === 'critical');
    if (config.block_on_critical === true && hasCritical) {
      return 'REQUEST_CHANGES';
    }
    return 'COMMENT';
  }

  // Item 8: APPROVE needs reviewComplete AND auto_approve AND zero issues
  if (config.auto_approve === true && issues.length === 0) {
    return 'APPROVE';
  }

  const hasCritical = issues.some((i) => i.severity === 'critical');
  if (config.block_on_critical === true && hasCritical) {
    return 'REQUEST_CHANGES';
  }

  return 'COMMENT';
}

