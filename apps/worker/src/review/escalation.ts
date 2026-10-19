import { ReviewIssue, DiffChunk } from '@ai-reviewer/shared';
import { LLMProvider } from './llm.js';
import { logger } from '../logger.js';

export interface EscalationPolicy {
  escalateCriticalUncorroborated: boolean; // default true
  escalateLowConfidenceSecurity: boolean;  // default true (confidence < 0.8)
  escalateCriticalFiles: boolean;          // default true (auth, crypto, payment)
  confidenceFloor: number;                 // default 0.8
}

export const DEFAULT_ESCALATION_POLICY: EscalationPolicy = {
  escalateCriticalUncorroborated: true,
  escalateLowConfidenceSecurity: true,
  escalateCriticalFiles: true,
  confidenceFloor: 0.8,
};

export interface EscalationDecision {
  shouldEscalate: boolean;
  reason: string;
}

export function shouldEscalateFinding(
  issue: ReviewIssue,
  policy: EscalationPolicy = DEFAULT_ESCALATION_POLICY
): EscalationDecision {
  // Never escalate static analysis findings (they are deterministic)
  if (issue.source === 'static_analysis' || issue.source === 'dependency_scan') {
    return { shouldEscalate: false, reason: 'Deterministic finding does not require multi-model escalation' };
  }

  // 1. Critical severity without static corroboration
  if (
    policy.escalateCriticalUncorroborated &&
    issue.severity === 'critical' &&
    !issue.supporting_evidence?.includes('Static Analyzer')
  ) {
    return {
      shouldEscalate: true,
      reason: 'Critical severity finding without static analyzer corroboration triggers secondary consensus check',
    };
  }

  // 2. Security issue with borderline confidence (< 0.8)
  if (
    policy.escalateLowConfidenceSecurity &&
    issue.category === 'security' &&
    (issue.confidence ?? 1.0) < policy.confidenceFloor
  ) {
    return {
      shouldEscalate: true,
      reason: `Security finding has borderline model confidence (${issue.confidence ?? 'unknown'} < ${policy.confidenceFloor})`,
    };
  }

  // 3. High file criticality
  if (policy.escalateCriticalFiles && (issue.severity === 'critical' || issue.severity === 'warning')) {
    const sensitiveFilePattern = /(?:auth|crypto|jwt|password|token|payment|billing|secret|permission|rbac|session)/i;
    if (sensitiveFilePattern.test(issue.file_path)) {
      return {
        shouldEscalate: true,
        reason: `Finding located in sensitive security/authentication component: ${issue.file_path}`,
      };
    }
  }

  return { shouldEscalate: false, reason: 'Finding satisfies confidence and corroboration policy' };
}

export interface MultiModelReviewOptions {
  primaryModelName?: string;
  secondaryProvider?: LLMProvider;
  policy?: EscalationPolicy;
}

/**
 * Evaluates findings under the multi-model disagreement escalation policy.
 * When a high-risk or low-confidence finding is identified, it queries a secondary model (if available)
 * or flags the finding as "REVIEW REQUIRED" to prevent noisy automated blocking.
 */
export async function applyEscalationPolicy(
  issue: ReviewIssue,
  chunk: DiffChunk,
  options: MultiModelReviewOptions = {}
): Promise<ReviewIssue> {
  const policy = options.policy || DEFAULT_ESCALATION_POLICY;
  const decision = shouldEscalateFinding(issue, policy);

  if (!decision.shouldEscalate) {
    return {
      ...issue,
      escalation_status: 'NORMAL',
    };
  }

  // If a secondary model is configured and available, query it for consensus
  if (options.secondaryProvider) {
    try {
      logger.info({
        file_path: issue.file_path,
        line_number: issue.line_number,
        reason: decision.reason,
        msg: 'Invoking secondary LLM provider for multi-model consensus verification',
      });

      const secondaryResult = await options.secondaryProvider.reviewChunk(chunk);
      
      // Check if secondary model identified an issue at or near the same line number
      const matchingSecondaryIssue = secondaryResult.issues.find(
        (si) =>
          si.file_path === issue.file_path &&
          Math.abs(si.line_number - issue.line_number) <= 2
      );

      if (matchingSecondaryIssue) {
        // Models agree
        return {
          ...issue,
          escalation_status: 'ESCALATED',
          supporting_evidence: `${issue.supporting_evidence ? issue.supporting_evidence + '; ' : ''}Multi-model consensus confirmed by secondary model.`,
        };
      } else {
        // Multi-model disagreement: Model A = issue, Model B = clean
        return {
          ...issue,
          escalation_status: 'REVIEW_REQUIRED',
          message: `[REVIEW REQUIRED - MODEL DISAGREEMENT] ${issue.message}`,
          supporting_evidence: `${issue.supporting_evidence ? issue.supporting_evidence + '; ' : ''}Secondary model evaluated chunk as clean. Disagreement flagged for human review.`,
        };
      }
    } catch (err: any) {
      logger.warn({
        err: err.message,
        msg: 'Secondary model invocation failed; marking finding as REVIEW REQUIRED',
      });
    }
  }

  // If secondary model is not available or failed, mark as REVIEW REQUIRED due to escalation policy
  return {
    ...issue,
    escalation_status: 'REVIEW_REQUIRED',
    message: issue.message.startsWith('[REVIEW REQUIRED') ? issue.message : `[REVIEW REQUIRED] ${issue.message}`,
    supporting_evidence: `${issue.supporting_evidence ? issue.supporting_evidence + '; ' : ''}Escalated under policy: ${decision.reason}.`,
  };
}
