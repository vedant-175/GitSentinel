import { NextRequest, NextResponse } from 'next/server';
import { prisma, serializeWithBigInt } from '@ai-reviewer/db';
import {
  requireSession,
  getSessionInstallationIds,
  getUserRoleForInstallation,
} from '@/lib/auth-helpers';
import { Permission, assertPermission, RbacForbiddenError } from '@ai-reviewer/shared';
import { parsePaginationParams, paginateResults } from '@/lib/pagination';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const installationIds = await getSessionInstallationIds();

    if (!installationIds || installationIds.length === 0) {
      return NextResponse.json({ error: 'No accessible installations' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const actionFilter = searchParams.get('action');
    const resourceTypeFilter = searchParams.get('resourceType');
    const installationIdParam = searchParams.get('installationId');

    // Determine target installation
    let targetInstId: number | bigint;
    if (installationIdParam) {
      const parsedId = BigInt(installationIdParam);
      if (!installationIds.some((id) => BigInt(id) === parsedId)) {
        return NextResponse.json({ error: 'Forbidden: Installation not accessible' }, { status: 403 });
      }
      targetInstId = parsedId;
    } else {
      targetInstId = installationIds[0];
    }

    // RBAC: Verify AUDIT_VIEW permission (OWNER or ADMIN)
    const userRole = await getUserRoleForInstallation(session, targetInstId);
    assertPermission(userRole, Permission.AUDIT_VIEW);

    const { limit, cursor } = parsePaginationParams(req.url, 25, 100);

    const where: any = {
      installation: {
        githubInstallationId: targetInstId,
      },
    };

    if (actionFilter) {
      where.action = actionFilter;
    }

    if (resourceTypeFilter) {
      where.resourceType = resourceTypeFilter;
    }

    if (cursor) {
      where.id = { lt: cursor };
    }

    const logs = await prisma.auditLog.findMany({
      where,
      take: limit + 1,
      orderBy: { id: 'desc' },
    });

    const paginated = paginateResults(logs, limit);

    return NextResponse.json(serializeWithBigInt(paginated));
  } catch (error: any) {
    if (error instanceof RbacForbiddenError || error?.name === 'ForbiddenError') {
      return NextResponse.json({ error: 'Forbidden', message: error.message }, { status: 403 });
    }
    if (error?.name === 'UnauthorizedError') {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    console.error('Audit logs API error:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
  }
}
