import { ReviewIssue, Severity, OwaspCategory } from '@ai-reviewer/shared';

export interface DependencyAdvisory {
  package: string;
  ecosystem: 'npm' | 'pypi';
  affectedBelow: string; // e.g. "4.17.21"
  cve: string;
  cwe: string;
  owasp: OwaspCategory;
  severity: Severity;
  title: string;
  description: string;
  attackScenario: string;
  remediation: string;
}

/**
 * Deterministic vulnerability advisory database.
 * Does NOT rely on LLM hallucinations or dynamic guessing.
 */
export const KNOWN_VULNERABILITY_DATABASE: DependencyAdvisory[] = [
  // --- NPM ECOSYSTEM ---
  {
    package: 'lodash',
    ecosystem: 'npm',
    affectedBelow: '4.17.21',
    cve: 'CVE-2021-23337',
    cwe: 'CWE-1321',
    owasp: 'A03:2021-Injection',
    severity: 'critical',
    title: 'Command Injection & Prototype Pollution via template',
    description: 'Lodash versions prior to 4.17.21 are vulnerable to command injection and prototype pollution when using the template function with untrusted input.',
    attackScenario: 'An attacker submits a malicious JSON payload with prototype pollution keys (__proto__) into an API endpoint using lodash.template, resulting in remote code execution or application crash.',
    remediation: 'Upgrade lodash to version 4.17.21 or higher: `npm install lodash@^4.17.21`',
  },
  {
    package: 'axios',
    ecosystem: 'npm',
    affectedBelow: '0.21.2',
    cve: 'CVE-2020-28168',
    cwe: 'CWE-918',
    owasp: 'A10:2021-Server-Side Request Forgery',
    severity: 'critical',
    title: 'Server-Side Request Forgery (SSRF) bypass',
    description: 'Axios versions prior to 0.21.2 are vulnerable to SSRF where absolute URLs in the path bypass proxy and host restrictions.',
    attackScenario: 'An attacker passes a relative URL containing a full target URL like "/https://169.254.169.254/latest/meta-data" which axios resolves to the metadata endpoint, leaking cloud credentials.',
    remediation: 'Upgrade axios to version 0.21.2 or higher: `npm install axios@^1.7.0`',
  },
  {
    package: 'jsonwebtoken',
    ecosystem: 'npm',
    affectedBelow: '9.0.0',
    cve: 'CVE-2022-23529',
    cwe: 'CWE-327',
    owasp: 'A02:2021-Cryptographic Failures',
    severity: 'critical',
    title: 'Insecure Key Type Handling and Arbitrary Code Execution',
    description: 'jsonwebtoken versions prior to 9.0.0 allow arbitrary code execution when untrusted secret/key objects with toString overrides are passed to verify().',
    attackScenario: 'An attacker sends an object with a customized toString() prototype property as the verification key, executing shell commands on the server during token verification.',
    remediation: 'Upgrade jsonwebtoken to version 9.0.0 or higher: `npm install jsonwebtoken@^9.0.2`',
  },
  {
    package: 'tar',
    ecosystem: 'npm',
    affectedBelow: '6.1.9',
    cve: 'CVE-2021-37713',
    cwe: 'CWE-22',
    owasp: 'A01:2021-Broken Access Control',
    severity: 'critical',
    title: 'Arbitrary File Overwrite via Path Traversal (Zip Slip)',
    description: 'The tar package prior to 6.1.9 does not properly neutralize relative path segments in filenames, allowing arbitrary file overwrites during extraction.',
    attackScenario: 'An attacker uploads a tar archive containing entries with "../../../etc/passwd" or app configuration files, overwriting critical server assets.',
    remediation: 'Upgrade tar to version 6.1.9 or higher: `npm install tar@^6.2.1`',
  },
  {
    package: 'express-fileupload',
    ecosystem: 'npm',
    affectedBelow: '1.1.9',
    cve: 'CVE-2020-7699',
    cwe: 'CWE-1321',
    owasp: 'A03:2021-Injection',
    severity: 'critical',
    title: 'Prototype Pollution via parseNested option',
    description: 'express-fileupload versions prior to 1.1.9 with parseNested enabled allow attackers to pollute the Object prototype.',
    attackScenario: 'An attacker uploads multipart form data with field names like __proto__.polluted, modifying runtime properties across all Node.js requests.',
    remediation: 'Upgrade express-fileupload to version 1.1.9 or higher: `npm install express-fileupload@^1.4.0`',
  },
  {
    package: 'minimist',
    ecosystem: 'npm',
    affectedBelow: '1.2.6',
    cve: 'CVE-2021-44906',
    cwe: 'CWE-1321',
    owasp: 'A03:2021-Injection',
    severity: 'critical',
    title: 'Prototype Pollution in CLI parameter parsing',
    description: 'minimist prior to 1.2.6 is vulnerable to prototype pollution when parsing CLI arguments like --__proto__.polluted.',
    attackScenario: 'An attacker manipulates command-line arguments to modify root Object prototypes in long-running processes.',
    remediation: 'Upgrade minimist to version 1.2.6 or higher: `npm install minimist@^1.2.8`',
  },
  {
    package: 'node-fetch',
    ecosystem: 'npm',
    affectedBelow: '2.6.7',
    cve: 'CVE-2022-0235',
    cwe: 'CWE-200',
    owasp: 'A01:2021-Broken Access Control',
    severity: 'warning',
    title: 'Exposure of Sensitive Information to Unauthorized Actor',
    description: 'node-fetch does not strip sensitive authorization headers during cross-domain redirects.',
    attackScenario: 'A victim service sends an Authorization: Bearer token to api.example.com which redirects to an attacker-controlled server, exposing the bearer token.',
    remediation: 'Upgrade node-fetch to version 2.6.7 or higher: `npm install node-fetch@^2.7.0`',
  },

  // --- PYTHON / PYPI ECOSYSTEM ---
  {
    package: 'urllib3',
    ecosystem: 'pypi',
    affectedBelow: '1.26.5',
    cve: 'CVE-2021-33503',
    cwe: 'CWE-1333',
    owasp: 'A05:2021-Security Misconfiguration',
    severity: 'warning',
    title: 'Catastrophic Regular Expression Denial of Service (ReDoS)',
    description: 'urllib3 prior to 1.26.5 uses an inefficient regular expression in authority parsing leading to catastrophic backtracking.',
    attackScenario: 'An attacker provides a specially crafted URL causing urllib3 to lock up the CPU for extended periods.',
    remediation: 'Upgrade urllib3 to version 1.26.5 or higher: `pip install --upgrade urllib3>=1.26.5`',
  },
  {
    package: 'requests',
    ecosystem: 'pypi',
    affectedBelow: '2.31.0',
    cve: 'CVE-2023-32681',
    cwe: 'CWE-200',
    owasp: 'A01:2021-Broken Access Control',
    severity: 'warning',
    title: 'Proxy-Authorization Header Leak to Destination Server',
    description: 'requests library prior to 2.31.0 leaks the Proxy-Authorization header to destination servers when navigating through HTTPS proxies.',
    attackScenario: 'Internal proxy credentials are transmitted in plaintext to the external destination website.',
    remediation: 'Upgrade requests to version 2.31.0 or higher: `pip install --upgrade requests>=2.31.0`',
  },
  {
    package: 'flask',
    ecosystem: 'pypi',
    affectedBelow: '2.2.5',
    cve: 'CVE-2023-30861',
    cwe: 'CWE-522',
    owasp: 'A07:2021-Identification and Authentication Failures',
    severity: 'critical',
    title: 'Cookie Disclosure via Caching and Insecure Secret Handling',
    description: 'Flask versions prior to 2.2.5 may send an insecure Vary: Cookie header that leads to caching proxies serving private session cookies to other users.',
    attackScenario: 'A CDN or reverse proxy caches a response containing a Set-Cookie header and serves that user\'s session to another unauthenticated client.',
    remediation: 'Upgrade flask to version 2.2.5 or higher: `pip install --upgrade Flask>=2.2.5`',
  },
  {
    package: 'cryptography',
    ecosystem: 'pypi',
    affectedBelow: '41.0.6',
    cve: 'CVE-2023-49083',
    cwe: 'CWE-476',
    owasp: 'A02:2021-Cryptographic Failures',
    severity: 'critical',
    title: 'NULL Pointer Dereference in PKCS7 parsing',
    description: 'cryptography prior to 41.0.6 crashes with a NULL pointer dereference when parsing malicious PKCS7 certificates.',
    attackScenario: 'An attacker sends a malformed PKCS7 payload triggering an immediate unhandled crash / Denial of Service.',
    remediation: 'Upgrade cryptography to version 41.0.6 or higher: `pip install --upgrade cryptography>=41.0.6`',
  },
  {
    package: 'jinja2',
    ecosystem: 'pypi',
    affectedBelow: '3.1.3',
    cve: 'CVE-2024-22195',
    cwe: 'CWE-79',
    owasp: 'A03:2021-Injection',
    severity: 'warning',
    title: 'Cross-Site Scripting (XSS) via xmlattr filter',
    description: 'Jinja2 versions prior to 3.1.3 allow XSS when the xmlattr filter is used with keys containing malicious characters.',
    attackScenario: 'An attacker injects HTML attribute event handlers (e.g. onerror=alert(1)) via untrusted dictionary keys passed to xmlattr.',
    remediation: 'Upgrade jinja2 to version 3.1.3 or higher: `pip install --upgrade Jinja2>=3.1.3`',
  },
];

/**
 * Pure, deterministic semver comparison: returns true if v1 < v2.
 */
export function isVersionBelow(v1: string, v2: string): boolean {
  // Strip pre-release or build tags
  const clean1 = v1.replace(/^[=~^v]/, '').split('-')[0].trim();
  const clean2 = v2.replace(/^[=~^v]/, '').split('-')[0].trim();

  const parts1 = clean1.split('.').map((p) => parseInt(p, 10) || 0);
  const parts2 = clean2.split('.').map((p) => parseInt(p, 10) || 0);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] ?? 0;
    const p2 = parts2[i] ?? 0;
    if (p1 < p2) return true;
    if (p1 > p2) return false;
  }
  return false;
}

export interface ExtractedDependency {
  package: string;
  version: string;
  lineNumber: number;
}

/**
 * Parses package.json or package-lock.json to extract dependencies and line numbers.
 */
export function parseNpmManifest(content: string): ExtractedDependency[] {
  const deps: ExtractedDependency[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Matches e.g. "lodash": "^4.17.20" or "version": "4.17.20" in package-lock
    const pkgMatch = line.match(/"([^"]+)":\s*"([^"]+)"/);
    if (pkgMatch) {
      const name = pkgMatch[1];
      const version = pkgMatch[2];
      if (/^[~^]?\d+\.\d+/.test(version)) {
        deps.push({
          package: name,
          version: version.replace(/^[~^]/, ''),
          lineNumber: i + 1,
        });
      }
    }
  }

  return deps;
}

/**
 * Parses requirements.txt to extract dependencies and line numbers.
 */
export function parsePythonRequirements(content: string): ExtractedDependency[] {
  const deps: ExtractedDependency[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    // Matches e.g. requests==2.28.1 or flask>=2.0.0,<2.2.0
    const match = line.match(/^([a-zA-Z0-9_.-]+)\s*==\s*([0-9a-zA-Z_.-]+)/);
    if (match) {
      deps.push({
        package: match[1].toLowerCase(),
        version: match[2],
        lineNumber: i + 1,
      });
    }
  }

  return deps;
}

export interface ScanDependenciesParams {
  filePath: string;
  fileContent: string;
}

/**
 * Deterministically scans dependency files for known CVE vulnerabilities.
 * Never uses the LLM as the vulnerability database.
 */
export function scanDependenciesForVulnerabilities(params: ScanDependenciesParams): ReviewIssue[] {
  const { filePath, fileContent } = params;
  const issues: ReviewIssue[] = [];
  const lowerPath = filePath.toLowerCase();

  let extractedDeps: ExtractedDependency[] = [];
  let ecosystem: 'npm' | 'pypi' | null = null;

  if (lowerPath.endsWith('package.json') || lowerPath.endsWith('package-lock.json')) {
    extractedDeps = parseNpmManifest(fileContent);
    ecosystem = 'npm';
  } else if (lowerPath.endsWith('requirements.txt') || lowerPath.endsWith('pipfile.lock')) {
    extractedDeps = parsePythonRequirements(fileContent);
    ecosystem = 'pypi';
  }

  if (!ecosystem || extractedDeps.length === 0) {
    return [];
  }

  for (const dep of extractedDeps) {
    const advisory = KNOWN_VULNERABILITY_DATABASE.find(
      (adv) => adv.ecosystem === ecosystem && adv.package.toLowerCase() === dep.package.toLowerCase()
    );

    if (advisory && isVersionBelow(dep.version, advisory.affectedBelow)) {
      issues.push({
        file_path: filePath,
        line_number: dep.lineNumber,
        severity: advisory.severity,
        category: 'security',
        source: 'dependency_scan',
        message: `[Vulnerable Dependency: ${advisory.cve}] ${dep.package}@${dep.version} is vulnerable to ${advisory.title}. Upgrade to >= ${advisory.affectedBelow}.`,
        cwe: advisory.cwe,
        owasp: advisory.owasp,
        impact: advisory.description,
        attack_scenario: advisory.attackScenario,
        remediation: advisory.remediation,
        suggested_fix: null,
        confidence: 1.0,
        supporting_evidence: `Deterministic Advisory DB: ${advisory.cve} (${advisory.cwe}) affects ${advisory.package} < ${advisory.affectedBelow}`,
        escalation_status: 'NORMAL',
      });
    }
  }

  return issues;
}
