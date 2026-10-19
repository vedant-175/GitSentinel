/**
 * Phase 6: Confidence Calibration Engine
 *
 * Models often exhibit overconfidence (e.g. 0.99 confidence on phantom issues).
 * This engine produces an empirical, multi-factor calibrated confidence score:
 * - Model Confidence (50% base weight)
 * - Static Analyzer Corroboration (25% weight)
 * - Structural & AST Anchor Validation (15% weight)
 * - Historical Developer Feedback & Resolution Rate (10% weight)
 */

export interface CalibrationInput {
  rawConfidence: number;
  staticAnalyzerAgreement: boolean;
  hasStructuralValidation: boolean;
  historicalFeedbackFixRate?: number | null;
  historicalFeedbackCount?: number;
}

export interface CalibrationResult {
  calibratedConfidence: number;
  rawConfidence: number;
  adjustments: {
    modelScore: number;
    staticAdjustment: number;
    structuralAdjustment: number;
    historicalAdjustment: number;
  };
  explanation: string;
}

export function calibrateConfidence(input: CalibrationInput): CalibrationResult {
  const raw = Math.min(1.0, Math.max(0.0, input.rawConfidence || 0.8));

  // 1. Model contribution (50% base weight)
  const modelScore = Math.round(raw * 0.5 * 1000) / 1000;

  // 2. Static Analyzer Agreement (Corroboration)
  let staticAdjustment = 0;
  if (input.staticAnalyzerAgreement) {
    staticAdjustment = 0.25; // Confirmed by deterministic static rule / linter
  } else {
    staticAdjustment = 0.05; // Standard solo LLM detection baseline
  }

  // 3. Structural Validation (Line anchoring and AST syntax validity)
  let structuralAdjustment = 0;
  if (input.hasStructuralValidation) {
    structuralAdjustment = 0.15; // Strictly verified on added line with intact AST scope
  } else {
    structuralAdjustment = -0.20; // Unanchored or context line mismatch penalty
  }

  // 4. Historical Feedback Calibration
  let historicalAdjustment = 0.05; // Neutral default
  const historyCount = input.historicalFeedbackCount || 0;
  const fixRate = input.historicalFeedbackFixRate;

  if (historyCount >= 5 && typeof fixRate === 'number') {
    if (fixRate >= 0.8) {
      historicalAdjustment = 0.10; // High developer acceptance in real PRs
    } else if (fixRate <= 0.4) {
      historicalAdjustment = -0.15; // High developer dismissal rate (noisy rule)
    } else {
      historicalAdjustment = 0.05;
    }
  }

  // Calculate total calibrated score
  const total = modelScore + staticAdjustment + structuralAdjustment + historicalAdjustment;
  const calibratedConfidence = Math.round(Math.min(1.0, Math.max(0.1, total)) * 1000) / 1000;

  // Generate explainable rationale
  const reasons: string[] = [];
  reasons.push(`Base model confidence: ${raw.toFixed(2)}`);
  if (input.staticAnalyzerAgreement) {
    reasons.push('+0.25 corroboration boost from static analyzer agreement');
  }
  if (input.hasStructuralValidation) {
    reasons.push('+0.15 boost for verified added-line AST structural anchor');
  } else {
    reasons.push('-0.20 penalty for unanchored context');
  }
  if (historyCount >= 5 && typeof fixRate === 'number') {
    if (fixRate >= 0.8) {
      reasons.push(`+0.10 historical calibration (${(fixRate * 100).toFixed(0)}% developer fix rate)`);
    } else if (fixRate <= 0.4) {
      reasons.push(`-0.15 historical penalty (${(fixRate * 100).toFixed(0)}% developer fix rate)`);
    }
  }

  const explanation = reasons.join('; ');

  return {
    calibratedConfidence,
    rawConfidence: raw,
    adjustments: {
      modelScore,
      staticAdjustment,
      structuralAdjustment,
      historicalAdjustment,
    },
    explanation,
  };
}
