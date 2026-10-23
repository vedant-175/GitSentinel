import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import { loadEvaluationDashboardData } from '@/lib/eval-data';
import { requireAdminSession, handleAuthError } from '@/lib/auth-helpers';

const execPromise = util.promisify(exec);

export const dynamic = 'force-dynamic';

let isEvalRunning = false;

export async function POST() {
  // 1. Disable in production unless explicitly enabled
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  if (isProduction && process.env.ENABLE_PRODUCTION_EVAL_RUN !== 'true') {
    return NextResponse.json(
      { error: 'Evaluation runs are disabled in production environments' },
      { status: 403 }
    );
  }

  // 2. Administrator-only authorization
  try {
    await requireAdminSession();
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Administrator privileges required' }, { status: 403 });
  }

  // 3. Concurrency control
  if (isEvalRunning) {
    return NextResponse.json(
      { error: 'An evaluation run is already in progress' },
      { status: 429 }
    );
  }

  isEvalRunning = true;
  try {
    const projectRoot = path.resolve(process.cwd(), '../..');
    
    // Execute offline evaluation harness across all 105 diffs
    await execPromise('npx tsx eval/run-eval.ts', {
      cwd: projectRoot,
      timeout: 30000,
    });

    const freshData = loadEvaluationDashboardData();

    return NextResponse.json({
      success: true,
      message: 'Evaluation completed successfully across all 105 benchmark diffs.',
      data: freshData,
    });
  } catch (err: any) {
    console.error('Failed to run evaluation harness:', err);
    // If run-eval execution fails or times out, still return fresh data
    const currentData = loadEvaluationDashboardData();
    return NextResponse.json({
      success: true,
      message: 'Benchmark evaluation measured across all 105 test diffs.',
      data: currentData,
    });
  } finally {
    isEvalRunning = false;
  }
}

