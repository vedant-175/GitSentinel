import dotenv from 'dotenv';

// Load .env or .env.local if present in the environment
dotenv.config();
dotenv.config({ path: 'apps/web/.env.local' });

type AppTarget = 'web' | 'worker' | 'all';

interface EnvCheckResult {
  variable: string;
  required: boolean;
  status: 'ok' | 'missing' | 'invalid';
  reason?: string;
}

function checkWebEnv(): EnvCheckResult[] {
  const results: EnvCheckResult[] = [];
  const isProd = process.env.NODE_ENV === 'production';

  // Database
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    results.push({ variable: 'DATABASE_URL', required: true, status: 'missing' });
  } else if (!dbUrl.startsWith('postgres://') && !dbUrl.startsWith('postgresql://')) {
    results.push({ variable: 'DATABASE_URL', required: true, status: 'invalid', reason: 'Must start with postgresql://' });
  } else {
    results.push({ variable: 'DATABASE_URL', required: true, status: 'ok' });
  }

  // Redis
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    results.push({ variable: 'REDIS_URL', required: true, status: 'missing' });
  } else if (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
    results.push({ variable: 'REDIS_URL', required: true, status: 'invalid', reason: 'Must start with redis:// or rediss://' });
  } else {
    results.push({ variable: 'REDIS_URL', required: true, status: 'ok' });
  }

  // NextAuth
  const nextAuthSecret = process.env.NEXTAUTH_SECRET;
  if (!nextAuthSecret) {
    results.push({ variable: 'NEXTAUTH_SECRET', required: true, status: 'missing' });
  } else if (nextAuthSecret.length < 16) {
    results.push({ variable: 'NEXTAUTH_SECRET', required: true, status: 'invalid', reason: 'Must be at least 16 characters' });
  } else {
    results.push({ variable: 'NEXTAUTH_SECRET', required: true, status: 'ok' });
  }

  const clientId = process.env.NEXTAUTH_GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    results.push({ variable: 'NEXTAUTH_GITHUB_CLIENT_ID / GITHUB_CLIENT_ID', required: true, status: 'missing' });
  } else {
    results.push({ variable: 'NEXTAUTH_GITHUB_CLIENT_ID / GITHUB_CLIENT_ID', required: true, status: 'ok' });
  }

  const clientSecret = process.env.NEXTAUTH_GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET;
  if (!clientSecret) {
    results.push({ variable: 'NEXTAUTH_GITHUB_CLIENT_SECRET / GITHUB_CLIENT_SECRET', required: true, status: 'missing' });
  } else {
    results.push({ variable: 'NEXTAUTH_GITHUB_CLIENT_SECRET / GITHUB_CLIENT_SECRET', required: true, status: 'ok' });
  }

  // GitHub Webhook Secret
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!webhookSecret) {
    results.push({ variable: 'GITHUB_WEBHOOK_SECRET', required: true, status: 'missing' });
  } else {
    results.push({ variable: 'GITHUB_WEBHOOK_SECRET', required: true, status: 'ok' });
  }

  return results;
}

function checkWorkerEnv(): EnvCheckResult[] {
  const results: EnvCheckResult[] = [];
  const isProd = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';

  // Database
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    results.push({ variable: 'DATABASE_URL', required: true, status: 'missing' });
  } else if (!dbUrl.startsWith('postgres://') && !dbUrl.startsWith('postgresql://')) {
    results.push({ variable: 'DATABASE_URL', required: true, status: 'invalid', reason: 'Must start with postgresql://' });
  } else {
    results.push({ variable: 'DATABASE_URL', required: true, status: 'ok' });
  }

  // Redis
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    results.push({ variable: 'REDIS_URL', required: true, status: 'missing' });
  } else if (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
    results.push({ variable: 'REDIS_URL', required: true, status: 'invalid', reason: 'Must start with redis:// or rediss://' });
  } else {
    results.push({ variable: 'REDIS_URL', required: true, status: 'ok' });
  }

  // GitHub App
  const appId = process.env.GITHUB_APP_ID;
  if (!appId) {
    results.push({ variable: 'GITHUB_APP_ID', required: true, status: 'missing' });
  } else if (isNaN(Number(appId))) {
    results.push({ variable: 'GITHUB_APP_ID', required: true, status: 'invalid', reason: 'Must be numeric' });
  } else {
    results.push({ variable: 'GITHUB_APP_ID', required: true, status: 'ok' });
  }

  const privKey = process.env.GITHUB_PRIVATE_KEY;
  if (!privKey) {
    results.push({ variable: 'GITHUB_PRIVATE_KEY', required: true, status: 'missing' });
  } else {
    results.push({ variable: 'GITHUB_PRIVATE_KEY', required: true, status: 'ok' });
  }

  // LLM Provider
  const provider = (process.env.LLM_PROVIDER || '').toLowerCase();
  if (!provider) {
    results.push({
      variable: 'LLM_PROVIDER',
      required: true,
      status: 'missing',
      reason: 'Must be set to "gemini", "openai", "anthropic", or "mock" (test only)',
    });
  } else if (provider === 'mock') {
    if (!isTest) {
      results.push({
        variable: 'LLM_PROVIDER',
        required: true,
        status: 'invalid',
        reason: 'MockProvider is allowed ONLY when NODE_ENV=test',
      });
    } else {
      results.push({ variable: 'LLM_PROVIDER', required: true, status: 'ok' });
    }
  } else if (provider === 'gemini') {
    results.push({ variable: 'LLM_PROVIDER', required: true, status: 'ok' });
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      results.push({ variable: 'GEMINI_API_KEY', required: true, status: 'missing', reason: 'Required when LLM_PROVIDER=gemini' });
    } else {
      results.push({ variable: 'GEMINI_API_KEY', required: true, status: 'ok' });
    }
    const geminiModel = process.env.GEMINI_MODEL;
    if (!geminiModel) {
      results.push({ variable: 'GEMINI_MODEL', required: true, status: 'missing', reason: 'Required when LLM_PROVIDER=gemini (no hardcoded default permitted)' });
    } else {
      results.push({ variable: 'GEMINI_MODEL', required: true, status: 'ok' });
    }
  } else if (provider === 'openai') {
    results.push({ variable: 'LLM_PROVIDER', required: true, status: 'ok' });
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      results.push({ variable: 'OPENAI_API_KEY', required: true, status: 'missing', reason: 'Required when LLM_PROVIDER=openai' });
    } else {
      results.push({ variable: 'OPENAI_API_KEY', required: true, status: 'ok' });
    }
    const openaiModel = process.env.OPENAI_MODEL;
    if (!openaiModel) {
      results.push({ variable: 'OPENAI_MODEL', required: true, status: 'missing', reason: 'Required when LLM_PROVIDER=openai (no hardcoded default permitted)' });
    } else {
      results.push({ variable: 'OPENAI_MODEL', required: true, status: 'ok' });
    }
  } else if (provider === 'anthropic') {
    results.push({ variable: 'LLM_PROVIDER', required: true, status: 'ok' });
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      results.push({ variable: 'ANTHROPIC_API_KEY', required: true, status: 'missing', reason: 'Required when LLM_PROVIDER=anthropic' });
    } else {
      results.push({ variable: 'ANTHROPIC_API_KEY', required: true, status: 'ok' });
    }
    const anthropicModel = process.env.ANTHROPIC_MODEL;
    if (!anthropicModel) {
      results.push({ variable: 'ANTHROPIC_MODEL', required: true, status: 'missing', reason: 'Required when LLM_PROVIDER=anthropic (no hardcoded default permitted)' });
    } else {
      results.push({ variable: 'ANTHROPIC_MODEL', required: true, status: 'ok' });
    }
  } else {
    results.push({
      variable: 'LLM_PROVIDER',
      required: true,
      status: 'invalid',
      reason: `Unknown provider "${provider}". Allowed: gemini, openai, anthropic, mock (test only)`,
    });
  }

  return results;
}

function printResults(appName: string, results: EnvCheckResult[]): boolean {
  console.log(`\n========================================`);
  console.log(`📋 Checking Environment Variables: ${appName}`);
  console.log(`========================================`);

  let allPassed = true;

  for (const r of results) {
    if (r.status === 'ok') {
      console.log(`  ✅  ${r.variable.padEnd(45)} [Configured]`);
    } else if (r.status === 'missing') {
      console.log(`  ❌  ${r.variable.padEnd(45)} [MISSING]${r.reason ? ` - ${r.reason}` : ''}`);
      allPassed = false;
    } else {
      console.log(`  ⚠️   ${r.variable.padEnd(45)} [INVALID]${r.reason ? ` - ${r.reason}` : ''}`);
      allPassed = false;
    }
  }

  return allPassed;
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith('--app='));
  const appTarget: AppTarget = arg ? (arg.replace('--app=', '') as AppTarget) : 'all';

  let success = true;

  if (appTarget === 'web' || appTarget === 'all') {
    const webResults = checkWebEnv();
    const webPassed = printResults('apps/web', webResults);
    if (!webPassed) success = false;
  }

  if (appTarget === 'worker' || appTarget === 'all') {
    const workerResults = checkWorkerEnv();
    const workerPassed = printResults('apps/worker', workerResults);
    if (!workerPassed) success = false;
  }

  console.log('\n----------------------------------------');
  if (success) {
    console.log('🎉 All required environment variables are set and valid.');
    console.log('----------------------------------------\n');
    process.exit(0);
  } else {
    console.error('❌ Environment validation failed. Please configure missing variables in your environment.');
    console.log('----------------------------------------\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected check-env error:', err);
  process.exit(1);
});
