import { execSync } from 'child_process';
import path from 'path';

/**
 * Item 26: Script that verifies NO .env files are tracked in git or in git archive,
 * keeping ONLY .env.example.
 */
export function verifyNoTrackedEnvFiles(rootDir = process.cwd()): {
  trackedEnvFiles: string[];
  archivedEnvFiles: string[];
  isValid: boolean;
} {
  // 1. Check git ls-files for tracked files
  let gitTrackedOutput = '';
  try {
    gitTrackedOutput = execSync('git ls-files', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    throw new Error(`Failed to run git ls-files: ${(err as Error).message}`);
  }

  const trackedFiles = gitTrackedOutput
    .split(/\r?\n/)
    .map((f) => f.trim())
    .filter(Boolean);

  // Identify any tracked file that has .env in its path or name, excluding .env.example
  const trackedEnvFiles = trackedFiles.filter((filePath) => {
    const base = path.basename(filePath);
    if (base === '.env.example' || base.endsWith('.env.example')) {
      return false; // Allowed!
    }
    // Match .env, .env.local, .env.development, etc.
    return base === '.env' || base.startsWith('.env.') || base.endsWith('.env');
  });

  // 2. Check git archive file listing
  let archivedFilesOutput = '';
  try {
    // List file paths that git archive would export
    archivedFilesOutput = execSync('git archive --format=tar HEAD | tar -t', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: 'bash',
    });
  } catch {
    // On Windows without bash/tar in PATH, fall back to checking git archive via git ls-tree
    try {
      archivedFilesOutput = execSync('git ls-tree -r --name-only HEAD', {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (archiveErr) {
      console.warn('Note: Could not inspect git archive directly, defaulting to git ls-tree:', archiveErr);
    }
  }

  const archivedFiles = archivedFilesOutput
    .split(/\r?\n/)
    .map((f) => f.trim())
    .filter(Boolean);

  const archivedEnvFiles = archivedFiles.filter((filePath) => {
    const base = path.basename(filePath);
    if (base === '.env.example' || base.endsWith('.env.example')) {
      return false;
    }
    return base === '.env' || base.startsWith('.env.') || base.endsWith('.env');
  });

  const isValid = trackedEnvFiles.length === 0 && archivedEnvFiles.length === 0;

  return {
    trackedEnvFiles,
    archivedEnvFiles,
    isValid,
  };
}

// Direct execution when run from CLI (e.g. tsx scripts/verify-no-env.ts)
if (process.argv[1] && process.argv[1].includes('verify-no-env')) {
  try {
    console.log('🔍 Checking repository for tracked .env files (Item 26)...');
    const result = verifyNoTrackedEnvFiles();

    if (!result.isValid) {
      console.error('❌ REPO HYGIENE VIOLATION: Tracked .env files found in git repository or archive!');
      if (result.trackedEnvFiles.length > 0) {
        console.error('Tracked in git index:');
        result.trackedEnvFiles.forEach((f) => console.error(`  - ${f}`));
      }
      if (result.archivedEnvFiles.length > 0) {
        console.error('Present in git archive:');
        result.archivedEnvFiles.forEach((f) => console.error(`  - ${f}`));
      }
      console.error('\nOnly .env.example may be tracked. Run: git rm --cached <file> and add to .gitignore.');
      process.exit(1);
    }

    console.log('✅ REPO HYGIENE VERIFIED: Zero .env files tracked in git or release archive (only .env.example exists).');
    process.exit(0);
  } catch (err) {
    console.error('Verification failed with error:', (err as Error).message);
    process.exit(1);
  }
}
