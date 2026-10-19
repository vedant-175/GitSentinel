import { estimateTokenCount } from '@ai-reviewer/shared';

export interface CodeContextSource {
  type: 'enclosing_function' | 'import' | 'type_definition' | 'interface' | 'caller_callee' | 'test' | 'schema_config';
  filePath: string;
  symbol?: string;
  lines?: [number, number];
  content: string;
  estimatedTokens: number;
}

export interface RetrievedContext {
  sources: CodeContextSource[];
  summary: {
    enclosingFunctionsCount: number;
    typesCount: number;
    relatedTestsCount: number;
    schemasCount: number;
    totalTokens: number;
  };
  promptSnippet: string;
}

export interface ContextRetrievalOptions {
  tokenBudget?: number; // Default 1500 tokens
  maxRelatedTestTokens?: number;
}

/**
 * Lightweight, robust AST/regex parser to extract top-level and class-level functions,
 * types, interfaces, and imports from TypeScript/JavaScript files.
 */
export function extractFileStructure(code: string, _filePath?: string) {
  const lines = code.split('\n');
  const imports: string[] = [];
  const functions: { name: string; signature: string; startLine: number; endLine: number; code: string }[] = [];
  const typesAndInterfaces: { name: string; kind: 'type' | 'interface' | 'class'; startLine: number; endLine: number; code: string }[] = [];

  // 1. Extract imports
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('import ') || (line.startsWith('const ') && line.includes('require('))) {
      imports.push(lines[i]);
    }
  }

  // 2. Extract functions (named functions, arrow functions, class methods)
  const fnRegex = /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*[^=]+)?\s*=>|(?:public|private|protected|static|async)*\s*([a-zA-Z0-9_$]+)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\s*\{/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(fnRegex);
    if (match) {
      const name = match[1] || match[3] || match[5];
      if (name && !['if', 'for', 'while', 'switch', 'catch'].includes(name)) {
        // Find closing brace matching this function
        let braceCount = 0;
        let started = false;
        let endLine = i;
        for (let j = i; j < Math.min(lines.length, i + 80); j++) {
          for (const ch of lines[j]) {
            if (ch === '{') {
              braceCount++;
              started = true;
            } else if (ch === '}') {
              braceCount--;
            }
          }
          if (started && braceCount === 0) {
            endLine = j;
            break;
          }
        }
        functions.push({
          name,
          signature: line.trim().replace(/\{$/, '').trim(),
          startLine: i + 1,
          endLine: endLine + 1,
          code: lines.slice(i, endLine + 1).join('\n'),
        });
      }
    }
  }

  // 3. Extract types, interfaces, and classes
  const typeRegex = /(?:export\s+)?(?:interface|type|class)\s+([a-zA-Z0-9_$]+)/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(typeRegex);
    if (match) {
      const name = match[1];
      const kind = line.includes('interface') ? 'interface' : line.includes('class') ? 'class' : 'type';
      let braceCount = 0;
      let started = false;
      let endLine = i;
      for (let j = i; j < Math.min(lines.length, i + 60); j++) {
        for (const ch of lines[j]) {
          if (ch === '{') {
            braceCount++;
            started = true;
          } else if (ch === '}') {
            braceCount--;
          }
        }
        if (started && braceCount === 0) {
          endLine = j;
          break;
        }
        if (!started && kind === 'type' && lines[j].includes(';')) {
          endLine = j;
          break;
        }
      }
      typesAndInterfaces.push({
        name,
        kind,
        startLine: i + 1,
        endLine: endLine + 1,
        code: lines.slice(i, endLine + 1).join('\n'),
      });
    }
  }

  return { imports, functions, typesAndInterfaces };
}

/**
 * Identifies direct callers and callees of a given function within file content.
 */
export function extractCallGraph(code: string, targetFunctionName: string): { callers: string[]; callees: string[] } {
  const structure = extractFileStructure(code, '');
  const callers: string[] = [];
  const callees: string[] = [];

  const targetFn = structure.functions.find((f) => f.name === targetFunctionName);

  // Callees: symbols called inside targetFn
  if (targetFn) {
    for (const fn of structure.functions) {
      if (fn.name !== targetFunctionName && targetFn.code.includes(`${fn.name}(`)) {
        callees.push(fn.name);
      }
    }
  }

  // Callers: other functions calling targetFunctionName
  for (const fn of structure.functions) {
    if (fn.name !== targetFunctionName && fn.code.includes(`${targetFunctionName}(`)) {
      callers.push(fn.name);
    }
  }

  return { callers, callees };
}

/**
 * Finds related test files for a given source path.
 */
export function findRelatedTestPath(filePath: string, availableFiles: string[]): string | null {
  const cleanPath = filePath.replace(/^[\\/]/, '');
  const baseName = cleanPath.replace(/\.[^/.]+$/, '');
  const ext = cleanPath.split('.').pop() || '';

  const potentialCandidates = [
    `${baseName}.test.${ext}`,
    `${baseName}.spec.${ext}`,
    cleanPath.replace(/^src\//, 'test/').replace(/\.[^/.]+$/, `.test.${ext}`),
    cleanPath.replace(/^src\//, 'tests/').replace(/\.[^/.]+$/, `.test.${ext}`),
    cleanPath.replace(/\/([^/]+)$/, '/__tests__/$1').replace(/\.[^/.]+$/, `.test.${ext}`),
  ];

  for (const candidate of potentialCandidates) {
    const match = availableFiles.find(
      (f) => f.toLowerCase() === candidate.toLowerCase() || f.endsWith(candidate)
    );
    if (match) return match;
  }

  // Fallback: check if any file in availableFiles includes the base file name and 'test'
  const simpleName = baseName.split(/[\\/]/).pop() || '';
  if (simpleName.length >= 3) {
    const match = availableFiles.find(
      (f) => (f.includes('.test.') || f.includes('.spec.')) && f.includes(simpleName)
    );
    if (match) return match;
  }

  return null;
}

export interface ContextRetrievalInput {
  changedFilePath: string;
  changedLines: number[];
  fileContent?: string;
  allRepoFiles?: { path: string; content?: string }[];
  schemaFiles?: { path: string; content: string }[];
}

/**
 * Builds a compact, relevant-code context retrieval package adhering to strict token budgets.
 */
export function retrieveRelevantContext(
  input: ContextRetrievalInput,
  options: ContextRetrievalOptions = {}
): RetrievedContext {
  const tokenBudget = options.tokenBudget ?? 1500;
  const sources: CodeContextSource[] = [];
  let currentTokenCount = 0;

  const code = input.fileContent || '';
  const structure = extractFileStructure(code, input.changedFilePath);
  const changedLinesSet = new Set(input.changedLines);

  // 1. Retrieve Enclosing Functions for changed lines
  const matchedFunctions = structure.functions.filter((fn) => {
    for (let l = fn.startLine; l <= fn.endLine; l++) {
      if (changedLinesSet.has(l)) return true;
    }
    return false;
  });

  for (const fn of matchedFunctions) {
    const fnTokens = estimateTokenCount(fn.code);
    if (currentTokenCount + fnTokens <= tokenBudget) {
      sources.push({
        type: 'enclosing_function',
        filePath: input.changedFilePath,
        symbol: fn.name,
        lines: [fn.startLine, fn.endLine],
        content: fn.code,
        estimatedTokens: fnTokens,
      });
      currentTokenCount += fnTokens;
    } else {
      // If full function doesn't fit, provide signature
      const sigTokens = estimateTokenCount(fn.signature);
      if (currentTokenCount + sigTokens <= tokenBudget) {
        sources.push({
          type: 'enclosing_function',
          filePath: input.changedFilePath,
          symbol: fn.name,
          lines: [fn.startLine, fn.startLine],
          content: `${fn.signature} { /* ... body truncated for token budget ... */ }`,
          estimatedTokens: sigTokens,
        });
        currentTokenCount += sigTokens;
      }
    }
  }

  // 2. Retrieve Imports (compact summary)
  if (structure.imports.length > 0) {
    const importSnippet = structure.imports.slice(0, 15).join('\n');
    const importTokens = estimateTokenCount(importSnippet);
    if (currentTokenCount + importTokens <= tokenBudget) {
      sources.push({
        type: 'import',
        filePath: input.changedFilePath,
        content: importSnippet,
        estimatedTokens: importTokens,
      });
      currentTokenCount += importTokens;
    }
  }

  // 3. Retrieve Related Types and Interfaces referenced in changed code or enclosing function
  const combinedChangedText = matchedFunctions.map((f) => f.code).join('\n') || code;
  for (const t of structure.typesAndInterfaces) {
    if (combinedChangedText.includes(t.name)) {
      const typeTokens = estimateTokenCount(t.code);
      if (currentTokenCount + typeTokens <= tokenBudget) {
        sources.push({
          type: t.kind === 'interface' ? 'interface' : 'type_definition',
          filePath: input.changedFilePath,
          symbol: t.name,
          lines: [t.startLine, t.endLine],
          content: t.code,
          estimatedTokens: typeTokens,
        });
        currentTokenCount += typeTokens;
      }
    }
  }

  // 4. Retrieve Call Graph (Callers & Callees)
  for (const fn of matchedFunctions) {
    const { callers, callees } = extractCallGraph(code, fn.name);
    if (callers.length > 0 || callees.length > 0) {
      const callGraphText = `Function ${fn.name}: Direct Callers=[${callers.join(', ')}], Direct Callees=[${callees.join(', ')}]`;
      const callTokens = estimateTokenCount(callGraphText);
      if (currentTokenCount + callTokens <= tokenBudget) {
        sources.push({
          type: 'caller_callee',
          filePath: input.changedFilePath,
          symbol: fn.name,
          content: callGraphText,
          estimatedTokens: callTokens,
        });
        currentTokenCount += callTokens;
      }
    }
  }

  // 5. Retrieve Related Tests
  if (input.allRepoFiles && input.allRepoFiles.length > 0) {
    const filePaths = input.allRepoFiles.map((f) => f.path);
    const testPath = findRelatedTestPath(input.changedFilePath, filePaths);
    if (testPath) {
      const testFileObj = input.allRepoFiles.find((f) => f.path === testPath);
      const testContent = testFileObj?.content || '';
      if (testContent) {
        // Extract relevant test block if any matched function is mentioned
        const testLines = testContent.split('\n');
        const relevantTestSnippets: string[] = [];
        for (let i = 0; i < testLines.length; i++) {
          const l = testLines[i];
          if (matchedFunctions.some((fn) => l.includes(fn.name))) {
            const snippet = testLines.slice(Math.max(0, i - 1), Math.min(testLines.length, i + 8)).join('\n');
            relevantTestSnippets.push(snippet);
            i += 7;
          }
        }

        const snippetToInclude =
          relevantTestSnippets.length > 0
            ? relevantTestSnippets.slice(0, 3).join('\n---\n')
            : testLines.slice(0, 25).join('\n');

        const testTokens = estimateTokenCount(snippetToInclude);
        if (currentTokenCount + testTokens <= tokenBudget) {
          sources.push({
            type: 'test',
            filePath: testPath,
            content: snippetToInclude,
            estimatedTokens: testTokens,
          });
          currentTokenCount += testTokens;
        }
      }
    }
  }

  // 6. Retrieve Configuration / Schema if relevant to changes
  if (input.schemaFiles && input.schemaFiles.length > 0) {
    for (const schema of input.schemaFiles) {
      const snippet = schema.content.slice(0, 500);
      const schemaTokens = estimateTokenCount(snippet);
      if (currentTokenCount + schemaTokens <= tokenBudget) {
        sources.push({
          type: 'schema_config',
          filePath: schema.path,
          content: snippet,
          estimatedTokens: schemaTokens,
        });
        currentTokenCount += schemaTokens;
        break; // Include at most 1 primary schema file
      }
    }
  }

  // Build clean prompt block
  const promptParts: string[] = [];
  if (sources.length > 0) {
    promptParts.push('<relevant_code_context>');
    for (const src of sources) {
      const symbolAttr = src.symbol ? ` symbol="${src.symbol}"` : '';
      const linesAttr = src.lines ? ` lines="${src.lines[0]}-${src.lines[1]}"` : '';
      promptParts.push(
        `<context_source type="${src.type}" file="${src.filePath}"${symbolAttr}${linesAttr}>\n${src.content}\n</context_source>`
      );
    }
    promptParts.push('</relevant_code_context>');
  }

  return {
    sources,
    summary: {
      enclosingFunctionsCount: sources.filter((s) => s.type === 'enclosing_function').length,
      typesCount: sources.filter((s) => s.type === 'type_definition' || s.type === 'interface').length,
      relatedTestsCount: sources.filter((s) => s.type === 'test').length,
      schemasCount: sources.filter((s) => s.type === 'schema_config').length,
      totalTokens: currentTokenCount,
    },
    promptSnippet: promptParts.join('\n\n'),
  };
}
