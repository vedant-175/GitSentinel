/**
 * Phase 6: Controlled CWE & OWASP Top 10 Taxonomies
 *
 * Prevents LLMs from inventing arbitrary vulnerability taxonomy identifiers
 * and provides validated mappings for automated security categorization.
 */

export const OWASP_TOP_10_2021 = [
  'A01:2021-Broken Access Control',
  'A02:2021-Cryptographic Failures',
  'A03:2021-Injection',
  'A04:2021-Insecure Design',
  'A05:2021-Security Misconfiguration',
  'A06:2021-Vulnerable and Outdated Components',
  'A07:2021-Identification and Authentication Failures',
  'A08:2021-Software and Data Integrity Failures',
  'A09:2021-Security Logging and Monitoring Failures',
  'A10:2021-Server-Side Request Forgery',
] as const;

export type OwaspCategory = (typeof OWASP_TOP_10_2021)[number];

export interface CweDefinition {
  id: string;
  name: string;
  owasp: OwaspCategory;
  description: string;
}

export const VALIDATED_CWE_TAXONOMY: Record<string, CweDefinition> = {
  'CWE-89': {
    id: 'CWE-89',
    name: 'Improper Neutralization of Special Elements used in an SQL Command (SQL Injection)',
    owasp: 'A03:2021-Injection',
    description: 'The software constructs all or part of an SQL command using untrusted input from an upstream component.',
  },
  'CWE-943': {
    id: 'CWE-943',
    name: 'Improper Neutralization of Special Elements in Data Query Logic (NoSQL Injection)',
    owasp: 'A03:2021-Injection',
    description: 'The software constructs a query in a data store using untrusted input without proper neutralization.',
  },
  'CWE-78': {
    id: 'CWE-78',
    name: 'Improper Neutralization of Special Elements used in an OS Command (OS Command Injection)',
    owasp: 'A03:2021-Injection',
    description: 'The software constructs an OS command using untrusted input from an external source.',
  },
  'CWE-94': {
    id: 'CWE-94',
    name: 'Improper Control of Generation of Code (Code Injection / eval)',
    owasp: 'A03:2021-Injection',
    description: 'The software constructs all or part of a code segment using untrusted input (e.g. eval, Function).',
  },
  'CWE-918': {
    id: 'CWE-918',
    name: 'Server-Side Request Forgery (SSRF)',
    owasp: 'A10:2021-Server-Side Request Forgery',
    description: 'The web server receives a URL or similar request from an upstream component and retrieves the contents of this URL to an unexpected destination.',
  },
  'CWE-22': {
    id: 'CWE-22',
    name: 'Improper Limitation of a Pathname to a Restricted Directory (Path Traversal)',
    owasp: 'A01:2021-Broken Access Control',
    description: 'The software uses external input to construct a pathname intended to identify a file or directory located underneath a restricted parent directory.',
  },
  'CWE-79': {
    id: 'CWE-79',
    name: 'Improper Neutralization of Input During Web Page Generation (Cross-Site Scripting)',
    owasp: 'A03:2021-Injection',
    description: 'The software does not neutralize or incorrectly neutralizes user-controllable input before placing it in output used as a web page.',
  },
  'CWE-798': {
    id: 'CWE-798',
    name: 'Use of Hard-coded Credentials',
    owasp: 'A07:2021-Identification and Authentication Failures',
    description: 'The software contains hard-coded credentials, such as a password or cryptographic key, which it uses for inbound authentication or outbound communication.',
  },
  'CWE-338': {
    id: 'CWE-338',
    name: 'Use of Cryptographically Weak Pseudo-Random Number Generator (PRNG)',
    owasp: 'A02:2021-Cryptographic Failures',
    description: 'The software uses a PRNG that is not cryptographically strong to produce values in a security-sensitive context.',
  },
  'CWE-328': {
    id: 'CWE-328',
    name: 'Use of Weak Hash',
    owasp: 'A02:2021-Cryptographic Failures',
    description: 'The software uses an algorithm that produces a message digest (hash) that is susceptible to collision attacks or pre-image attacks.',
  },
  'CWE-327': {
    id: 'CWE-327',
    name: 'Use of a Broken or Risky Cryptographic Algorithm',
    owasp: 'A02:2021-Cryptographic Failures',
    description: 'The use of a broken or risky cryptographic algorithm is an unnecessary risk that may result in the exposure of sensitive information.',
  },
  'CWE-352': {
    id: 'CWE-352',
    name: 'Cross-Site Request Forgery (CSRF)',
    owasp: 'A01:2021-Broken Access Control',
    description: 'The web application does not, or cannot, sufficiently verify whether a well-formed, valid, consistent request was intentionally provided by the user.',
  },
  'CWE-639': {
    id: 'CWE-639',
    name: 'Authorization Bypass Through User-Controlled Key (IDOR / BOLA)',
    owasp: 'A01:2021-Broken Access Control',
    description: 'The system user-controlled key to access a record directly without verifying that the user has permission to access that record.',
  },
  'CWE-915': {
    id: 'CWE-915',
    name: 'Improperly Controlled Modification of Dynamically-Determined Object Attributes (Mass Assignment)',
    owasp: 'A08:2021-Software and Data Integrity Failures',
    description: 'The software receives input from an upstream component, but it does not restrict or incorrectly restricts which attributes or parameters can be modified.',
  },
  'CWE-1321': {
    id: 'CWE-1321',
    name: 'Improperly Controlled Modification of Object Prototype Attributes (Prototype Pollution)',
    owasp: 'A03:2021-Injection',
    description: 'The software receives input from an upstream component, but does not properly restrict modifications to the prototype of an object.',
  },
  'CWE-1333': {
    id: 'CWE-1333',
    name: 'Inefficient Regular Expression Complexity (ReDoS)',
    owasp: 'A05:2021-Security Misconfiguration',
    description: 'The software uses a regular expression that can be made to consume excessive CPU resources when matching specifically crafted input.',
  },
  'CWE-362': {
    id: 'CWE-362',
    name: 'Concurrent Execution using Shared Resource with Improper Synchronization (Race Condition)',
    owasp: 'A04:2021-Insecure Design',
    description: 'The software performs a series of actions on a shared resource, but a concurrent operation can change the resource before the series completes.',
  },
  'CWE-775': {
    id: 'CWE-775',
    name: 'Missing Release of File Descriptor or Handle after Effective Lifetime',
    owasp: 'A05:2021-Security Misconfiguration',
    description: 'The software does not release a file descriptor or handle after it has finished using it, leading to resource exhaustion.',
  },
  'CWE-401': {
    id: 'CWE-401',
    name: 'Missing Release of Memory after Effective Lifetime (Memory Leak)',
    owasp: 'A05:2021-Security Misconfiguration',
    description: 'The software does not sufficiently track and release allocated memory, causing memory depletion over time.',
  },
  'CWE-476': {
    id: 'CWE-476',
    name: 'NULL Pointer Dereference',
    owasp: 'A04:2021-Insecure Design',
    description: 'A NULL pointer dereference occurs when the application dereferences a pointer that it expects to be valid, but is NULL.',
  },
  'CWE-601': {
    id: 'CWE-601',
    name: 'URL Redirection to Untrusted Site (Open Redirect)',
    owasp: 'A01:2021-Broken Access Control',
    description: 'A web application accepts a user-controlled input that specifies a link to an external site, and uses that link in a Redirect.',
  },
  'CWE-1395': {
    id: 'CWE-1395',
    name: 'Dependency on Vulnerable Third-Party Component',
    owasp: 'A06:2021-Vulnerable and Outdated Components',
    description: 'The product relies on a third-party component that contains known vulnerabilities.',
  },
  'CWE-703': {
    id: 'CWE-703',
    name: 'Improper Check or Handling of Exceptional Conditions',
    owasp: 'A04:2021-Insecure Design',
    description: 'The software does not properly anticipate or handle exceptional conditions, leading to unexpected behavior.',
  },
  'CWE-209': {
    id: 'CWE-209',
    name: 'Generation of Error Message Containing Sensitive Information',
    owasp: 'A09:2021-Security Logging and Monitoring Failures',
    description: 'The software generates an error message that includes sensitive information about its environment, users, or data.',
  },
};

/**
 * Validates and canonicalizes a CWE string (e.g. "CWE-89", "89", "cwe-89").
 * If the input is not in the controlled taxonomy, returns null to prevent hallucinated IDs.
 */
export function validateAndNormalizeCwe(input: string | null | undefined): CweDefinition | null {
  if (!input) return null;
  const cleaned = input.trim().toUpperCase();
  const match = cleaned.match(/(?:CWE-)?(\d+)/);
  if (!match) return null;

  const standardId = `CWE-${match[1]}`;
  return VALIDATED_CWE_TAXONOMY[standardId] || null;
}

/**
 * Validates and canonicalizes an OWASP category string against the 2021 Top 10 controlled taxonomy.
 */
export function validateAndNormalizeOwasp(input: string | null | undefined): OwaspCategory | null {
  if (!input) return null;
  const cleaned = input.trim();

  // Exact match
  const exact = OWASP_TOP_10_2021.find((cat) => cat.toLowerCase() === cleaned.toLowerCase());
  if (exact) return exact;

  // Partial match by code e.g. "A01", "A03:2021", "Injection"
  for (const cat of OWASP_TOP_10_2021) {
    const prefix = cat.split('-')[0].toLowerCase(); // e.g. "a03:2021"
    const simplePrefix = prefix.split(':')[0]; // e.g. "a03"
    const dashIdx = cat.indexOf('-');
    const namePart = dashIdx >= 0 ? cat.substring(dashIdx + 1).toLowerCase() : '';

    if (
      cleaned.toLowerCase().includes(simplePrefix) ||
      cleaned.toLowerCase().includes(prefix) ||
      cleaned.toLowerCase() === namePart ||
      cleaned.toLowerCase().includes(namePart)
    ) {
      return cat;
    }
  }

  return null;
}

/**
 * Infers appropriate, validated CWE and OWASP mappings based on finding signals,
 * ensuring arbitrary taxonomy values are never emitted by the review engine.
 */
export function inferValidatedTaxonomy(
  message: string,
  category: string,
  code?: string
): { cwe: string | null; owasp: OwaspCategory | null } {
  const text = `${message} ${code || ''}`.toLowerCase();

  const isSqlMatch =
    (text.includes('sql') || text.includes('select ') || text.includes('insert into') || text.includes('update ') || text.includes('delete from')) &&
    (text.includes('inject') || text.includes('query') || text.includes('concat'));

  if (isSqlMatch) {
    return { cwe: 'CWE-89', owasp: 'A03:2021-Injection' };
  }
  if (text.includes('nosql') || text.includes('mongodb') && text.includes('inject')) {
    return { cwe: 'CWE-943', owasp: 'A03:2021-Injection' };
  }
  if (text.includes('ssrf') || (text.includes('request forgery') && text.includes('server')) || (text.includes('metadata') && text.includes('ip'))) {
    return { cwe: 'CWE-918', owasp: 'A10:2021-Server-Side Request Forgery' };
  }
  if (text.includes('command injection') || (text.includes('exec') && text.includes('child_process')) || text.includes('system(')) {
    return { cwe: 'CWE-78', owasp: 'A03:2021-Injection' };
  }
  if (text.includes('eval(') || text.includes('code execution') || text.includes('new function(')) {
    return { cwe: 'CWE-94', owasp: 'A03:2021-Injection' };
  }
  if (text.includes('path traversal') || text.includes('directory traversal') || text.includes('zip slip') || text.includes('../')) {
    return { cwe: 'CWE-22', owasp: 'A01:2021-Broken Access Control' };
  }
  if (text.includes('xss') || text.includes('cross-site script') || (text.includes('innerhtml') && text.includes('unescaped'))) {
    return { cwe: 'CWE-79', owasp: 'A03:2021-Injection' };
  }
  if (text.includes('hardcoded') || text.includes('secret') || text.includes('private key') || text.includes('api key') || text.includes('token')) {
    return { cwe: 'CWE-798', owasp: 'A07:2021-Identification and Authentication Failures' };
  }
  if (text.includes('math.random') || text.includes('weak prng') || (text.includes('random') && text.includes('crypto'))) {
    return { cwe: 'CWE-338', owasp: 'A02:2021-Cryptographic Failures' };
  }
  if (text.includes('md5') || text.includes('sha1') || text.includes('weak hash')) {
    return { cwe: 'CWE-328', owasp: 'A02:2021-Cryptographic Failures' };
  }
  if (text.includes('csrf') || text.includes('cross-site request forgery')) {
    return { cwe: 'CWE-352', owasp: 'A01:2021-Broken Access Control' };
  }
  if (text.includes('idor') || text.includes('broken object level') || text.includes('authorization bypass')) {
    return { cwe: 'CWE-639', owasp: 'A01:2021-Broken Access Control' };
  }
  if (text.includes('prototype pollution') || text.includes('__proto__') || text.includes('constructor.prototype')) {
    return { cwe: 'CWE-1321', owasp: 'A03:2021-Injection' };
  }
  if (text.includes('redos') || (text.includes('catastrophic') && text.includes('regex')) || text.includes('backtrack')) {
    return { cwe: 'CWE-1333', owasp: 'A05:2021-Security Misconfiguration' };
  }
  if (text.includes('race condition') || text.includes('check-then-act') || text.includes('concurrency')) {
    return { cwe: 'CWE-362', owasp: 'A04:2021-Insecure Design' };
  }
  if (text.includes('open redirect') || text.includes('untrusted redirect')) {
    return { cwe: 'CWE-601', owasp: 'A01:2021-Broken Access Control' };
  }
  if (text.includes('mass assignment') || text.includes('role escalation')) {
    return { cwe: 'CWE-915', owasp: 'A08:2021-Software and Data Integrity Failures' };
  }
  if (text.includes('dependency') || text.includes('outdated component') || text.includes('package-lock')) {
    return { cwe: 'CWE-1395', owasp: 'A06:2021-Vulnerable and Outdated Components' };
  }
  if (text.includes('resource leak') || text.includes('stream leak') || text.includes('unclosed')) {
    return { cwe: 'CWE-775', owasp: 'A05:2021-Security Misconfiguration' };
  }
  if (text.includes('memory leak') || text.includes('event emitter listener leak') || text.includes('goroutine leak')) {
    return { cwe: 'CWE-401', owasp: 'A05:2021-Security Misconfiguration' };
  }
  if (text.includes('null pointer') || text.includes('undefined dereference') || text.includes('null dereference')) {
    return { cwe: 'CWE-476', owasp: 'A04:2021-Insecure Design' };
  }

  // Fallback defaults by category if security
  if (category === 'security') {
    return { cwe: null, owasp: 'A04:2021-Insecure Design' };
  }

  return { cwe: null, owasp: null };
}
