/**
 * Phase 6: Explainable Risk Prioritization Engine
 *
 * Computes an explainable 0–100 risk score combining:
 * 1. Severity Points (S: 0-40)
 * 2. Calibrated Confidence Points (C: 0-20)
 * 3. Vulnerability Category Points (Cat: 0-15)
 * 4. File Criticality Points (F: 0-15)
 * 5. Change Size Points (CS: 0-5)
 * 6. Test Coverage Gap Points (TG: 0-5)
 *
 * Formula:
 *   Risk Score = min(100, S + C + Cat + F + CS + TG)
 */

import { Severity, Category } from './types.js';

export interface RiskCalculationInput {
  severity: Severity;
  category: Category;
  calibratedConfidence: number; // 0.0 to 1.0
  filePath: string;
  linesChangedCount?: number;
  filesChangedCount?: number;
  hasTestCoverage?: boolean;
}

export interface RiskScoreResult {
  riskScore: number;
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  breakdown: {
    severityPoints: number;
    confidencePoints: number;
    categoryPoints: number;
    fileCriticalityPoints: number;
    changeSizePoints: number;
    testGapPoints: number;
  };
  explanation: string;
}

export function calculateExplainableRisk(input: RiskCalculationInput): RiskScoreResult {
  // 1. Severity Points (0 - 40)
  let severityPoints = 5;
  if (input.severity === 'critical') severityPoints = 40;
  else if (input.severity === 'warning') severityPoints = 20;

  // 2. Confidence Points (0 - 20)
  const confidencePoints = Math.round(
    Math.min(1.0, Math.max(0.0, input.calibratedConfidence)) * 20
  );

  // 3. Category Points (0 - 15)
  let categoryPoints = 2;
  if (input.category === 'security') categoryPoints = 15;
  else if (input.category === 'bug') categoryPoints = 10;
  else if (input.category === 'performance') categoryPoints = 6;
  else if (input.category === 'maintainability') categoryPoints = 3;

  // 4. File Criticality Points (0 - 15)
  const pathLower = input.filePath.toLowerCase();
  let fileCriticalityPoints = 4;
  if (
    pathLower.includes('auth') ||
    pathLower.includes('crypto') ||
    pathLower.includes('security') ||
    pathLower.includes('billing') ||
    pathLower.includes('payment') ||
    pathLower.includes('keys') ||
    pathLower.includes('token') ||
    pathLower.includes('secret') ||
    pathLower.includes('session') ||
    pathLower.includes('schema.prisma') ||
    pathLower.endsWith('.env.example')
  ) {
    fileCriticalityPoints = 15;
  } else if (
    pathLower.includes('api/') ||
    pathLower.includes('routes/') ||
    pathLower.includes('services/') ||
    pathLower.includes('controllers/') ||
    pathLower.includes('middleware') ||
    pathLower.includes('db/')
  ) {
    fileCriticalityPoints = 9;
  } else if (
    pathLower.includes('test') ||
    pathLower.includes('spec') ||
    pathLower.includes('docs/') ||
    pathLower.endsWith('.md')
  ) {
    fileCriticalityPoints = 1;
  }

  // 5. Change Size Points (0 - 5)
  let changeSizePoints = 1;
  const lines = input.linesChangedCount || 0;
  const files = input.filesChangedCount || 0;
  if (lines > 500 || files > 20) {
    changeSizePoints = 5;
  } else if (lines > 150 || files > 5) {
    changeSizePoints = 3;
  }

  // 6. Test Gap Points (0 - 5)
  let testGapPoints = 0;
  if (input.hasTestCoverage === false) {
    testGapPoints = 5; // Untested code increases finding risk
  }

  // Calculate sum and clamp
  const sum = severityPoints + confidencePoints + categoryPoints + fileCriticalityPoints + changeSizePoints + testGapPoints;
  const riskScore = Math.min(100, Math.max(1, sum));

  let riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  if (riskScore >= 80) riskLevel = 'CRITICAL';
  else if (riskScore >= 60) riskLevel = 'HIGH';
  else if (riskScore >= 40) riskLevel = 'MEDIUM';

  const explanation = [
    `Severity: ${input.severity.toUpperCase()} (+${severityPoints} pts)`,
    `Confidence: ${(input.calibratedConfidence * 100).toFixed(0)}% (+${confidencePoints} pts)`,
    `Category: ${input.category.toUpperCase()} (+${categoryPoints} pts)`,
    `File Criticality: ${fileCriticalityPoints >= 10 ? 'CRITICAL MODULE' : 'STANDARD'} (+${fileCriticalityPoints} pts)`,
    changeSizePoints > 1 ? `Change Size (+${changeSizePoints} pts)` : null,
    testGapPoints > 0 ? `Untested Code (+${testGapPoints} pts)` : null,
  ]
    .filter(Boolean)
    .join('; ');

  return {
    riskScore,
    riskLevel,
    breakdown: {
      severityPoints,
      confidencePoints,
      categoryPoints,
      fileCriticalityPoints,
      changeSizePoints,
      testGapPoints,
    },
    explanation,
  };
}
