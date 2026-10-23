import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession, handleAuthError } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch (error) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: 'Administrator privileges required' }, { status: 403 });
  }

  try {

    const appId = process.env.GITHUB_APP_ID;
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    const privateKey = process.env.GITHUB_PRIVATE_KEY;

    const checks = {
      appIdConfigured: Boolean(appId),
      webhookSecretConfigured: Boolean(webhookSecret),
      privateKeyConfigured: Boolean(privateKey),
    };

    const isReady = checks.appIdConfigured && checks.webhookSecretConfigured && checks.privateKeyConfigured;

    return NextResponse.json({
      success: isReady,
      checks,
      message: isReady
        ? 'GitHub App configuration verified: App ID, Webhook Secret, and Private Key are present.'
        : 'GitHub App configuration incomplete. Missing required environment variables.',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    if (error?.name === 'UnauthorizedError') {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || 'Connection test failed' }, { status: 500 });
  }
}
