/**
 * Phase 6: SARIF 2.1.0 Export & Validation Engine
 *
 * Implements OASIS Static Analysis Results Interchange Format (SARIF) v2.1.0
 * for direct ingestion into GitHub Code Scanning (Security -> Code scanning alerts).
 */

import { ReviewIssue } from './types.js';

export interface SarifArtifactLocation {
  uri: string;
  uriBaseId?: string;
}

export interface SarifRegion {
  startLine: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
  snippet?: {
    text: string;
  };
}

export interface SarifPhysicalLocation {
  artifactLocation: SarifArtifactLocation;
  region: SarifRegion;
}

export interface SarifLocation {
  physicalLocation: SarifPhysicalLocation;
}

export interface SarifRuleDescriptor {
  id: string;
  name: string;
  shortDescription: {
    text: string;
  };
  fullDescription?: {
    text: string;
  };
  helpUri?: string;
  help?: {
    text: string;
    markdown?: string;
  };
  defaultConfiguration?: {
    level: 'error' | 'warning' | 'note';
  };
  properties?: {
    tags?: string[];
    precision?: 'very-high' | 'high' | 'medium' | 'low';
    problem?: {
      severity?: 'error' | 'warning' | 'recommendation';
    };
  };
}

export interface SarifResult {
  ruleId: string;
  ruleIndex: number;
  level: 'error' | 'warning' | 'note';
  message: {
    text: string;
    markdown?: string;
  };
  locations: SarifLocation[];
  properties?: {
    category?: string;
    cwe?: string | null;
    owasp?: string | null;
    confidence?: number;
    riskScore?: number | null;
    source?: string;
    impact?: string | null;
    attackScenario?: string | null;
  };
}

export interface SarifRun {
  tool: {
    driver: {
      name: string;
      version: string;
      informationUri: string;
      rules: SarifRuleDescriptor[];
    };
  };
  results: SarifResult[];
}

export interface SarifLog {
  $schema: string;
  version: '2.1.0';
  runs: SarifRun[];
}

export function generateSarifReport(
  issues: ReviewIssue[],
  options?: {
    toolName?: string;
    toolVersion?: string;
    informationUri?: string;
  }
): SarifLog {
  const toolName = options?.toolName || 'GitSentinel';
  const toolVersion = options?.toolVersion || '1.0.0';
  const informationUri = options?.informationUri || 'https://github.com/gitsentinel/gitsentinel';

  const rulesMap = new Map<string, SarifRuleDescriptor>();
  const results: SarifResult[] = [];

  for (const issue of issues) {
    // Generate unique rule ID
    const ruleId = issue.cwe ? `GS-${issue.cwe}` : `GS-${issue.category.toUpperCase()}`;
    const level: 'error' | 'warning' | 'note' =
      issue.severity === 'critical' ? 'error' : issue.severity === 'warning' ? 'warning' : 'note';

    if (!rulesMap.has(ruleId)) {
      const tags = ['security', issue.category];
      if (issue.cwe) tags.push(issue.cwe.toLowerCase());
      if (issue.owasp) tags.push('owasp-top-10');

      rulesMap.set(ruleId, {
        id: ruleId,
        name: `${issue.category.charAt(0).toUpperCase() + issue.category.slice(1)} Rule (${ruleId})`,
        shortDescription: {
          text: issue.message.slice(0, 100),
        },
        fullDescription: {
          text: issue.message,
        },
        helpUri: issue.cwe ? `https://cwe.mitre.org/data/definitions/${issue.cwe.replace('CWE-', '')}.html` : informationUri,
        help: {
          text: `${issue.message}\n\nSuggested Fix: ${issue.suggested_fix || 'Review code logic'}`,
          markdown: `### Finding\n${issue.message}\n\n${issue.impact ? `**Impact**: ${issue.impact}\n\n` : ''}${issue.remediation ? `**Remediation**: ${issue.remediation}` : ''}`,
        },
        defaultConfiguration: {
          level,
        },
        properties: {
          tags,
          precision: issue.confidence && issue.confidence >= 0.9 ? 'very-high' : 'high',
        },
      });
    }

    const ruleIndex = Array.from(rulesMap.keys()).indexOf(ruleId);

    results.push({
      ruleId,
      ruleIndex,
      level,
      message: {
        text: issue.message,
        markdown: issue.impact ? `**${issue.message}**\n\n*Impact*: ${issue.impact}` : issue.message,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: issue.file_path.replace(/\\/g, '/'),
              uriBaseId: '%SRCROOT%',
            },
            region: {
              startLine: Math.max(1, issue.line_number),
              startColumn: 1,
              snippet: issue.current_code ? { text: issue.current_code } : undefined,
            },
          },
        },
      ],
      properties: {
        category: issue.category,
        cwe: issue.cwe,
        owasp: issue.owasp,
        confidence: issue.confidence,
        riskScore: issue.risk_score,
        source: issue.source,
        impact: issue.impact,
        attackScenario: issue.attack_scenario,
      },
    });
  }

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: toolName,
            version: toolVersion,
            informationUri,
            rules: Array.from(rulesMap.values()),
          },
        },
        results,
      },
    ],
  };
}

/**
 * Validates that a SARIF payload strictly complies with the SARIF 2.1.0 standard
 */
export function validateSarifLog(sarif: unknown): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!sarif || typeof sarif !== 'object') {
    return { isValid: false, errors: ['SARIF must be a JSON object'] };
  }

  const s = sarif as Record<string, any>;

  if (s.version !== '2.1.0') {
    errors.push(`Invalid version: expected "2.1.0", got "${s.version}"`);
  }

  if (!s.$schema || !s.$schema.includes('sarif-schema-2.1.0')) {
    errors.push('Missing or invalid $schema URL for SARIF 2.1.0');
  }

  if (!Array.isArray(s.runs) || s.runs.length === 0) {
    errors.push('SARIF must contain at least one run in "runs" array');
  } else {
    for (let rIdx = 0; rIdx < s.runs.length; rIdx++) {
      const run = s.runs[rIdx];
      if (!run.tool?.driver?.name) {
        errors.push(`Run[${rIdx}] tool.driver.name is required`);
      }
      if (!Array.isArray(run.results)) {
        errors.push(`Run[${rIdx}] results must be an array`);
      } else {
        for (let resIdx = 0; resIdx < run.results.length; resIdx++) {
          const res = run.results[resIdx];
          if (!res.ruleId) {
            errors.push(`Run[${rIdx}].results[${resIdx}] missing ruleId`);
          }
          if (!['error', 'warning', 'note'].includes(res.level)) {
            errors.push(`Run[${rIdx}].results[${resIdx}] invalid level: "${res.level}"`);
          }
          if (!res.message?.text) {
            errors.push(`Run[${rIdx}].results[${resIdx}] missing message.text`);
          }
          if (!Array.isArray(res.locations) || res.locations.length === 0) {
            errors.push(`Run[${rIdx}].results[${resIdx}] must contain at least one location`);
          }
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
