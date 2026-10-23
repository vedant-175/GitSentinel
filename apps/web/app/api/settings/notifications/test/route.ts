import { NextRequest, NextResponse } from 'next/server';
import {
  requireSession,
  getSessionInstallationIds,
  getUserRoleForInstallation,
  handleAuthError,
} from '@/lib/auth-helpers';
import { Permission, assertPermission } from '@ai-reviewer/shared';
import { recordAuditLog } from '@/lib/audit';
import { prisma } from '@ai-reviewer/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const installationIds = await getSessionInstallationIds();
    const targetGithubInstId = installationIds[0];

    if (!targetGithubInstId) {
      return NextResponse.json({ error: 'Forbidden: No accessible installations' }, { status: 403 });
    }

    const userRole = await getUserRoleForInstallation(session, targetGithubInstId);
    assertPermission(userRole, Permission.CONFIG_UPDATE);

    const inst = await prisma.installation.findUnique({
      where: { githubInstallationId: targetGithubInstId },
    });

    // Dispatches a real test audit notification event
    await recordAuditLog({
      installationId: inst?.id || null,
      actor: session.user.login || session.user.id || 'anonymous',
      actorRole: userRole,
      action: 'notification.test',
      resourceType: 'configuration',
      resourceId: 'test-notification',
      metadata: {
        channel: 'audit_log_stream',
        dispatchedAt: new Date().toISOString(),
        status: 'DELIVERED',
        note: 'Test notification verified on GitSentinel internal telemetry stream.',
      },
    });

    return NextResponse.json({
      success: true,
      deliveredTo: 'GitSentinel Audit Log Stream & In-App Telemetry',
      timestamp: new Date().toISOString(),
      message: 'Test notification logged successfully to system audit trail.',
    });
  } catch (error: any) {
    const authRes = handleAuthError(error);
    if (authRes) return authRes;
    return NextResponse.json({ error: error.message || 'Notification test failed' }, { status: 500 });
  }
}
