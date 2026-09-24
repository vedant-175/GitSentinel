import { DiffHunk, FileDiff } from './types.js';

/**
 * Parses a standard Git unified diff string into structured FileDiff objects.
 */
export function parseUnifiedDiff(rawDiff: string): FileDiff[] {
  if (!rawDiff || !rawDiff.trim()) {
    return [];
  }

  const files: FileDiff[] = [];
  const lines = rawDiff.split(/\r?\n/);
  let currentFile: Partial<FileDiff> | null = null;
  let currentHunk: DiffHunk | null = null;
  let currentOldLine = 0;
  let currentNewLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect file boundary
    if (line.startsWith('diff --git ')) {
      // Finalize previous hunk & file
      if (currentHunk && currentFile && currentFile.hunks) {
        currentFile.hunks.push(currentHunk);
        currentHunk = null;
      }
      if (currentFile && currentFile.newPath) {
        files.push(currentFile as FileDiff);
      }

      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      currentFile = {
        oldPath: match ? match[1] : '',
        newPath: match ? match[2] : '',
        status: 'modified',
        hunks: [],
        rawDiff: line + '\n',
      };
      continue;
    }

    if (line.startsWith('new file mode')) {
      if (currentFile) currentFile.status = 'added';
    } else if (line.startsWith('deleted file mode')) {
      if (currentFile) currentFile.status = 'deleted';
    } else if (line.startsWith('similarity index') || line.startsWith('rename from')) {
      if (currentFile) currentFile.status = 'renamed';
    }

    if (line.startsWith('--- a/')) {
      if (currentFile) currentFile.oldPath = line.substring(6).trim();
    } else if (line.startsWith('+++ b/')) {
      if (currentFile) currentFile.newPath = line.substring(6).trim();
    }

    // Detect hunk boundary: @@ -10,5 +12,7 @@
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

      if (currentHunk) {
        currentFile.hunks?.push(currentHunk);
      }

      const oldStart = parseInt(hunkMatch[1], 10);
      const oldLines = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
      const newStart = parseInt(hunkMatch[3], 10);
      const newLines = hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1;

      currentOldLine = oldStart;
      currentNewLine = newStart;

      currentHunk = {
        header: line,
        oldStart,
        oldLines,
        newStart,
        newLines,
        lines: [line],
        addedLineNumbers: [],
        validNewLines: [],
      };
      currentFile.rawDiff = (currentFile.rawDiff || '') + line + '\n';
      continue;
    }

    if (currentFile) {
      currentFile.rawDiff = (currentFile.rawDiff || '') + line + '\n';
    }

    if (!currentHunk) {
      continue;
    }

    currentHunk.lines.push(line);

    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentHunk.addedLineNumbers.push(currentNewLine);
      currentHunk.validNewLines.push(currentNewLine);
      currentNewLine++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentOldLine++;
    } else if (line.startsWith(' ')) {
      currentHunk.validNewLines.push(currentNewLine);
      currentOldLine++;
      currentNewLine++;
    }
  }

  // Push final hunk and file
  if (currentHunk && currentFile && currentFile.hunks) {
    currentFile.hunks.push(currentHunk);
  }
  if (currentFile && currentFile.newPath) {
    files.push(currentFile as FileDiff);
  }

  return files;
}

export interface DiffChunk {
  filePath: string;
  chunkIndex: number;
  totalChunks: number;
  diff: string;
  addedLines: number[];
  validLines: number[];
}

/**
 * Breaks down file diffs into manageable chunks for LLM processing.
 * Preserves hunk boundaries and metadata so added line numbers remain exact.
 */
export function chunkFileDiff(
  fileDiff: FileDiff,
  maxLinesPerChunk: number = 150
): DiffChunk[] {
  // If file has no hunks (e.g. binary or empty file), return empty
  if (!fileDiff.hunks || fileDiff.hunks.length === 0) {
    return [];
  }

  const chunks: DiffChunk[] = [];
  let currentLines: string[] = [];
  let currentAddedLines: number[] = [];
  let currentValidLines: number[] = [];

  for (const hunk of fileDiff.hunks) {
    // If current chunk + this hunk exceeds line threshold, flush current chunk
    if (currentLines.length > 0 && currentLines.length + hunk.lines.length > maxLinesPerChunk) {
      chunks.push({
        filePath: fileDiff.newPath || fileDiff.oldPath,
        chunkIndex: chunks.length,
        totalChunks: 0, // updated after all chunks created
        diff: currentLines.join('\n'),
        addedLines: [...currentAddedLines],
        validLines: [...currentValidLines],
      });
      currentLines = [];
      currentAddedLines = [];
      currentValidLines = [];
    }

    currentLines.push(...hunk.lines);
    currentAddedLines.push(...hunk.addedLineNumbers);
    currentValidLines.push(...hunk.validNewLines);
  }

  if (currentLines.length > 0) {
    chunks.push({
      filePath: fileDiff.newPath || fileDiff.oldPath,
      chunkIndex: chunks.length,
      totalChunks: 0,
      diff: currentLines.join('\n'),
      addedLines: [...currentAddedLines],
      validLines: [...currentValidLines],
    });
  }

  // Update totalChunks
  for (const chunk of chunks) {
    chunk.totalChunks = chunks.length;
  }

  return chunks;
}

/**
 * Checks if a given file path matches any glob pattern in the ignored list.
 */
export function isFileIgnored(filePath: string, ignoredGlobs: string[]): boolean {
  if (!ignoredGlobs || ignoredGlobs.length === 0) return false;

  const normalized = filePath.replace(/\\/g, '/');

  for (const pattern of ignoredGlobs) {
    const cleanPattern = pattern.trim().replace(/\\/g, '/');
    if (!cleanPattern) continue;

    // Direct extension match: *.lock, *.min.js
    if (cleanPattern.startsWith('*.')) {
      const ext = cleanPattern.substring(1);
      if (normalized.endsWith(ext)) return true;
    }

    // Directory match: dist/**, node_modules/**
    if (cleanPattern.endsWith('/**')) {
      const dir = cleanPattern.slice(0, -3);
      if (normalized.startsWith(dir + '/') || normalized === dir) return true;
    }

    // Subdirectory match: **/vendor/**
    if (cleanPattern.startsWith('**/') && cleanPattern.endsWith('/**')) {
      const part = cleanPattern.slice(3, -3);
      if (normalized.includes('/' + part + '/') || normalized.startsWith(part + '/')) return true;
    }

    // Exact filename match: package-lock.json
    if (normalized === cleanPattern || normalized.endsWith('/' + cleanPattern)) {
      return true;
    }
  }

  return false;
}
