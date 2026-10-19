import picomatch from 'picomatch';
import { countTokens } from 'gpt-tokenizer';
import { DiffHunk, FileDiff, AddedCodeLine, StructuredDiffLine } from './types.js';

export const DEFAULT_IGNORED_GLOBS = [
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/node_modules/**',
  '**/coverage/**',
  '**/*.lock',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/*.min.*',
  '**/*.generated.*',
  '**/__snapshots__/**',
];

/**
 * Unquotes and decodes Git paths that are quoted or octal-escaped
 */
export function unquoteGitPath(pathStr: string): string {
  if (!pathStr) return '';
  pathStr = pathStr.trim();
  if (pathStr.startsWith('"') && pathStr.endsWith('"')) {
    const inner = pathStr.slice(1, -1);
    const bytes: number[] = [];
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === '\\' && i + 1 < inner.length) {
        const next = inner[i + 1];
        if (next >= '0' && next <= '7') {
          // Octal escape \NNN (up to 3 octal digits)
          let octalStr = '';
          while (octalStr.length < 3 && i + 1 < inner.length && inner[i + 1] >= '0' && inner[i + 1] <= '7') {
            octalStr += inner[++i];
          }
          bytes.push(parseInt(octalStr, 8));
        } else if (next === 'n') {
          bytes.push(0x0a);
          i++;
        } else if (next === 't') {
          bytes.push(0x09);
          i++;
        } else if (next === 'r') {
          bytes.push(0x0d);
          i++;
        } else if (next === '\\') {
          bytes.push(0x5c);
          i++;
        } else if (next === '"') {
          bytes.push(0x22);
          i++;
        } else {
          bytes.push(inner.charCodeAt(++i));
        }
      } else {
        const code = inner.charCodeAt(i);
        if (code < 128) {
          bytes.push(code);
        } else {
          const charBytes = Buffer.from(inner[i], 'utf8');
          for (const b of charBytes) bytes.push(b);
        }
      }
    }
    return Buffer.from(bytes).toString('utf8');
  }
  return pathStr;
}

function cleanGitPrefix(pathStr: string): string {
  const unquoted = unquoteGitPath(pathStr);
  if (unquoted.startsWith('a/') || unquoted.startsWith('b/')) {
    return unquoted.substring(2);
  }
  return unquoted;
}

function parseDiffGitHeader(line: string): { oldPath: string; newPath: string } | null {
  const rest = line.substring('diff --git '.length).trim();
  let oldPath = '';
  let newPath = '';

  if (rest.startsWith('"')) {
    let i = 1;
    while (i < rest.length) {
      if (rest[i] === '\\') {
        i += 2;
      } else if (rest[i] === '"') {
        break;
      } else {
        i++;
      }
    }
    oldPath = rest.substring(0, i + 1);
    newPath = rest.substring(i + 1).trim();
  } else {
    const bIndex = rest.indexOf(' b/');
    if (bIndex !== -1) {
      oldPath = rest.substring(0, bIndex);
      newPath = rest.substring(bIndex + 1);
    } else {
      const parts = rest.split(/\s+/);
      oldPath = parts[0] || '';
      newPath = parts[1] || '';
    }
  }

  return {
    oldPath: cleanGitPrefix(oldPath),
    newPath: cleanGitPrefix(newPath),
  };
}

/**
 * Parses a standard Git unified diff string tracking hunk line counts
 * from the @@ header instead of sniffing +++ / --- prefixes.
 */
export function parseUnifiedDiff(rawDiff: string): FileDiff[] {
  if (!rawDiff || !rawDiff.trim()) {
    return [];
  }

  // 1. Normalize CRLF to LF
  const normalized = rawDiff.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  const files: FileDiff[] = [];
  let currentFile: FileDiff | null = null;
  let currentHunk: DiffHunk | null = null;

  let remainingOld = 0;
  let remainingNew = 0;
  let _currentOldLine = 0;
  let currentNewLine = 0;

  function finalizeHunk() {
    if (currentHunk && currentFile) {
      currentFile.hunks.push(currentHunk);
      currentHunk = null;
    }
    remainingOld = 0;
    remainingNew = 0;
  }

  function finalizeFile() {
    finalizeHunk();
    if (currentFile) {
      files.push(currentFile);
      currentFile = null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // If inside a hunk and expecting lines:
    if (currentHunk && (remainingOld > 0 || remainingNew > 0)) {
      if (line.startsWith('\\')) {
        // "\ No newline at end of file"
        currentHunk.lines.push(line);
        currentHunk.structuredLines?.push({ type: 'eof', text: line, raw: line });
        if (currentFile) currentFile.rawDiff += line + '\n';
        continue;
      }

      if (line.startsWith('+')) {
        // Added line (even if "+++x")
        currentHunk.lines.push(line);
        currentHunk.addedLineNumbers.push(currentNewLine);
        currentHunk.validNewLines.push(currentNewLine);
        currentHunk.structuredLines?.push({
          type: 'add',
          text: line.substring(1),
          raw: line,
          newLineNumber: currentNewLine,
        });
        currentNewLine++;
        remainingNew--;
        if (currentFile) currentFile.rawDiff += line + '\n';
        if (remainingOld === 0 && remainingNew === 0) {
          finalizeHunk();
        }
        continue;
      }

      if (line.startsWith('-')) {
        // Removed line (even if "--- y")
        currentHunk.lines.push(line);
        currentHunk.structuredLines?.push({
          type: 'delete',
          text: line.substring(1),
          raw: line,
          oldLineNumber: _currentOldLine,
        });
        _currentOldLine++;
        remainingOld--;
        if (currentFile) currentFile.rawDiff += line + '\n';
        if (remainingOld === 0 && remainingNew === 0) {
          finalizeHunk();
        }
        continue;
      }

      if (line.startsWith(' ') || line === '') {
        // Context line (including blank context line)
        currentHunk.lines.push(line);
        currentHunk.validNewLines.push(currentNewLine);
        currentHunk.structuredLines?.push({
          type: 'context',
          text: line.startsWith(' ') ? line.substring(1) : '',
          raw: line,
          newLineNumber: currentNewLine,
          oldLineNumber: _currentOldLine,
        });
        _currentOldLine++;
        currentNewLine++;
        remainingOld--;
        remainingNew--;
        if (currentFile) currentFile.rawDiff += line + '\n';
        if (remainingOld === 0 && remainingNew === 0) {
          finalizeHunk();
        }
        continue;
      }

      // If line doesn't match hunk structure, finish hunk and re-process as header
      finalizeHunk();
    }

    // Outside hunk line tracking: Check file headers
    if (line.startsWith('diff --git ')) {
      finalizeFile();
      const parsedPaths = parseDiffGitHeader(line);
      currentFile = {
        oldPath: parsedPaths?.oldPath || '',
        newPath: parsedPaths?.newPath || '',
        status: 'modified',
        hunks: [],
        rawDiff: line + '\n',
      };
      continue;
    }

    if (!currentFile && (line.startsWith('--- ') || line.startsWith('+++ '))) {
      currentFile = {
        oldPath: '',
        newPath: '',
        status: 'modified',
        hunks: [],
        rawDiff: '',
      };
    } else if (currentFile && currentFile.hunks.length > 0 && line.startsWith('--- ')) {
      finalizeFile();
      currentFile = {
        oldPath: '',
        newPath: '',
        status: 'modified',
        hunks: [],
        rawDiff: '',
      };
    }

    if (currentFile) {
      if (line.startsWith('new file mode ')) {
        currentFile.status = 'added';
        currentFile.rawDiff += line + '\n';
        continue;
      }
      if (line.startsWith('deleted file mode ')) {
        currentFile.status = 'deleted';
        currentFile.rawDiff += line + '\n';
        continue;
      }
      if (line.startsWith('rename from ')) {
        currentFile.status = 'renamed';
        currentFile.oldPath = cleanGitPrefix(line.substring('rename from '.length));
        currentFile.rawDiff += line + '\n';
        continue;
      }
      if (line.startsWith('rename to ')) {
        currentFile.status = 'renamed';
        currentFile.newPath = cleanGitPrefix(line.substring('rename to '.length));
        currentFile.rawDiff += line + '\n';
        continue;
      }
      if (line.startsWith('--- ')) {
        const pathPart = line.substring(4).trim();
        if (pathPart === '/dev/null') {
          currentFile.status = 'added';
        } else {
          currentFile.oldPath = cleanGitPrefix(pathPart);
          if (!currentFile.newPath) {
            currentFile.newPath = currentFile.oldPath;
          }
        }
        currentFile.rawDiff += line + '\n';
        continue;
      }
      if (line.startsWith('+++ ')) {
        const pathPart = line.substring(4).trim();
        if (pathPart === '/dev/null') {
          currentFile.status = 'deleted';
        } else {
          currentFile.newPath = cleanGitPrefix(pathPart);
          if (!currentFile.oldPath) {
            currentFile.oldPath = currentFile.newPath;
          }
        }
        currentFile.rawDiff += line + '\n';
        continue;
      }
      if (line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) {
        currentFile.isBinary = true;
        currentFile.rawDiff += line + '\n';
        continue;
      }
    }

    // Detect Hunk Boundary @@ -X,Y +A,B @@
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/);
    if (hunkMatch) {
      if (!currentFile) {
        currentFile = {
          oldPath: 'unknown',
          newPath: 'unknown',
          status: 'modified',
          hunks: [],
          rawDiff: '',
        };
      }

      finalizeHunk();

      const oldStart = parseInt(hunkMatch[1], 10);
      const oldLines = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
      const newStart = parseInt(hunkMatch[3], 10);
      const newLines = hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1;

      _currentOldLine = oldStart;
      currentNewLine = newStart;
      remainingOld = oldLines;
      remainingNew = newLines;

      currentHunk = {
        header: line,
        oldStart,
        oldLines,
        newStart,
        newLines,
        lines: [line],
        addedLineNumbers: [],
        validNewLines: [],
        structuredLines: [{ type: 'header', text: line, raw: line }],
      };

      currentFile.rawDiff += line + '\n';

      if (remainingOld === 0 && remainingNew === 0) {
        finalizeHunk();
      }
      continue;
    }

    if (currentFile) {
      currentFile.rawDiff += line + '\n';
    }
  }

  finalizeFile();
  return files;
}

export interface DiffChunk {
  filePath: string;
  chunkIndex: number;
  totalChunks: number;
  diff: string;
  addedLines: number[];
  validLines: number[];
  estimatedTokens?: number;
  structuredLines?: StructuredDiffLine[];
  skippedNotes?: string[];
}

/**
 * Estimates LLM token count using gpt-tokenizer (real BPE tokenizer).
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  try {
    return countTokens(text);
  } catch {
    return Math.ceil(text.length / 4);
  }
}

/**
 * Formats a diff chunk prefixing added lines with '+ L  123:' and context lines with '  L  123:'
 * reusing the shared parser's per-line structured data (no second +++/--- sniffer).
 */
export function formatNumberedDiff(chunk: DiffChunk): string {
  if (chunk.structuredLines && chunk.structuredLines.length > 0) {
    return chunk.structuredLines
      .map((l) => {
        if (l.type === 'header') return l.text;
        if (l.type === 'add') {
          const num = String(l.newLineNumber ?? '').padStart(5, ' ');
          return `+ L${num}: ${l.text}`;
        }
        if (l.type === 'context') {
          const num = String(l.newLineNumber ?? '').padStart(5, ' ');
          return `  L${num}: ${l.text}`;
        }
        if (l.type === 'delete') {
          return `-       : ${l.text}`;
        }
        return l.text;
      })
      .join('\n');
  }

  return chunk.diff;
}

/**
 * Breaks down file diffs into manageable chunks for LLM processing based on token budget.
 * Splits oversized hunks at line boundaries so added line numbers remain exact.
 * Handles single very long lines (truncates/splits with visible note) and reserves room for system prompt and output.
 */
export function chunkFileDiff(
  fileDiff: FileDiff,
  maxTokensPerChunk: number = 1800
): DiffChunk[] {
  if (!fileDiff.hunks || fileDiff.hunks.length === 0 || fileDiff.isBinary) {
    return [];
  }

  const chunks: DiffChunk[] = [];
  let currentLines: string[] = [];
  let currentStructuredLines: StructuredDiffLine[] = [];
  let currentAddedLines: number[] = [];
  let currentValidLines: number[] = [];
  let currentSkippedNotes: string[] = [];
  let currentTokens = 0;

  function flushChunk() {
    if (currentLines.length === 0) return;
    chunks.push({
      filePath: fileDiff.newPath || fileDiff.oldPath,
      chunkIndex: chunks.length,
      totalChunks: 0,
      diff: currentLines.join('\n'),
      addedLines: [...currentAddedLines],
      validLines: [...currentValidLines],
      estimatedTokens: currentTokens,
      structuredLines: [...currentStructuredLines],
      skippedNotes: currentSkippedNotes.length > 0 ? [...currentSkippedNotes] : undefined,
    });
    currentLines = [];
    currentStructuredLines = [];
    currentAddedLines = [];
    currentValidLines = [];
    currentSkippedNotes = [];
    currentTokens = 0;
  }

  for (const hunk of fileDiff.hunks) {
    const hunkText = hunk.lines.join('\n');
    const hunkTokens = estimateTokenCount(hunkText);

    // If a single hunk itself is oversized, split it at line boundaries
    if (hunkTokens > maxTokensPerChunk) {
      flushChunk();

      // Split oversized hunk across multiple sub-chunks
      const subHeader = hunk.header;
      currentLines.push(subHeader);
      currentStructuredLines.push({ type: 'header', text: subHeader, raw: subHeader });
      currentTokens = estimateTokenCount(subHeader);

      let hunkAddedIdx = 0;
      let hunkValidIdx = 0;

      for (let i = 1; i < hunk.lines.length; i++) {
        let line = hunk.lines[i];
        let lineTokens = estimateTokenCount(line);

        if (currentTokens + lineTokens > maxTokensPerChunk && currentLines.length > 1) {
          flushChunk();
          // Start next chunk with subHeader for context
          currentLines.push(subHeader);
          currentStructuredLines.push({ type: 'header', text: subHeader, raw: subHeader });
          currentTokens = estimateTokenCount(subHeader);
        }

        // Handle single very long line (Item 16)
        if (lineTokens > maxTokensPerChunk) {
          const note = `Very long line in ${fileDiff.newPath || fileDiff.oldPath} (line ${hunk.addedLineNumbers[hunkAddedIdx] || hunk.validNewLines[hunkValidIdx] || i}) exceeded chunk token limit (${lineTokens} tokens); truncated to fit budget.`;
          currentSkippedNotes.push(note);
          line = line.substring(0, maxTokensPerChunk * 3) + '... [truncated long line]';
          lineTokens = estimateTokenCount(line);
        }

        currentLines.push(line);
        currentTokens += lineTokens;

        if (hunk.structuredLines && hunk.structuredLines[i]) {
          currentStructuredLines.push(hunk.structuredLines[i]);
        }

        if (line.startsWith('+')) {
          if (hunkAddedIdx < hunk.addedLineNumbers.length) {
            currentAddedLines.push(hunk.addedLineNumbers[hunkAddedIdx++]);
          }
          if (hunkValidIdx < hunk.validNewLines.length) {
            currentValidLines.push(hunk.validNewLines[hunkValidIdx++]);
          }
        } else if (line.startsWith(' ') || line === '') {
          if (hunkValidIdx < hunk.validNewLines.length) {
            currentValidLines.push(hunk.validNewLines[hunkValidIdx++]);
          }
        }
      }
      flushChunk();
      continue;
    }

    // Normal hunk
    if (currentLines.length > 0 && currentTokens + hunkTokens > maxTokensPerChunk) {
      flushChunk();
    }

    currentLines.push(...hunk.lines);
    if (hunk.structuredLines) {
      currentStructuredLines.push(...hunk.structuredLines);
    }
    currentAddedLines.push(...hunk.addedLineNumbers);
    currentValidLines.push(...hunk.validNewLines);
    currentTokens += hunkTokens;
  }

  flushChunk();

  for (const chunk of chunks) {
    chunk.totalChunks = chunks.length;
  }

  return chunks;
}

/**
 * Canonical helper shared by static analysis and mock provider to extract
 * all added code lines with their new line numbers from a diff.
 */
export function getAddedLines(diff: string): AddedCodeLine[] {
  const files = parseUnifiedDiff(diff);
  const results: AddedCodeLine[] = [];

  for (const file of files) {
    for (const hunk of file.hunks) {
      let addedIdx = 0;
      for (let i = 1; i < hunk.lines.length; i++) {
        const line = hunk.lines[i];
        if (line.startsWith('+')) {
          if (addedIdx < hunk.addedLineNumbers.length) {
            results.push({
              lineNumber: hunk.addedLineNumbers[addedIdx++],
              content: line.substring(1),
            });
          }
        }
      }
    }
  }

  return results;
}

/**
 * Checks if a given file path matches any glob pattern using picomatch.
 * Merges custom ignored_globs with the default globs.
 */
export function isFileIgnored(filePath: string, customGlobs: string[] = []): boolean {
  const mergedGlobs = Array.from(new Set([...DEFAULT_IGNORED_GLOBS, ...(customGlobs || [])]));
  const normalized = filePath.replace(/\\/g, '/');
  const isMatch = picomatch(mergedGlobs, { dot: true });
  return isMatch(normalized);
}
