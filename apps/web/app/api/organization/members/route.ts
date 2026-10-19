import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, serializeWithBigInt } from '@ai-reviewer/db';
import {
  requireSession,
  getSessionInstallationIds,
  getUserRoleForInstallation,
} from '@/lib/auth-helpers';
import {
  Permission,
  assertPermission,
  RbacForbiddenError,
} from '@ai-reviewer/shared';
import { recordAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const MemberMutationSchema = z.object({
  userLogin: z.string().min(1).max(100),
  role: z.enum(['OWNER', 'ADMIN', 'REVIEWER', 'VIEWER']),
  installationId: z.union([z.number(), z.string()]),
});

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const installationIds = await getSessionInstallationIds();
    const { searchParams } = new URL(req.url);
    const instIdParam = searchParams.get('installationId');

    const targetInstId = instIdParam ? BigInt(instIdParam) : installationIds[0];
    if (!targetInstId || !installationIds.includes(targetInstId)) {
      return NextResponse.json({ error: 'Forbidden: Installation not accessible' }, { status: 403 });
    }

    const inst = await prisma.installation.findUnique({
      where: { githubInstallationId: targetInstId },
      include: {
        members: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!inst) {
      return NextResponse.json({ error: 'Installation not found' }, { status: 404 });
    }

    return NextResponse.json(
      serializeWithBigInt({
        installationId: inst.id,
        githubInstallationId: inst.githubInstallationId,
        accountLogin: inst.accountLogin,
        members: inst.members,
      })
    );
  } catch (error: any) {
    if (error?.name === 'UnauthorizedError') {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const installationIds = await getSessionInstallationIds();
    const body = await req.json();

    const parseResult = MemberMutationSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Bad Request', details: parseResult.error.flatten() }, { status: 400 });
    }

    const { userLogin, role, installationId } = parseResult.data;
    const targetGithubInstId = BigInt(installationId);

    if (!installationIds.includes(targetGithubInstId)) {
      return NextResponse.json({ error: 'Forbidden: Installation not accessible' }, { status: 403 });
    }

    // RBAC: Must have MEMBER_MANAGE permission (OWNER or ADMIN)
    const userRole = await getUserRoleForInstallation(session, targetGithubInstId);
    assertPermission(userRole, Permission.MEMBER_MANAGE);

    const inst = await prisma.installation.findUnique({
      where: { githubInstallationId: targetGithubInstId },
    });

    if (!inst) {
      return NextResponse.json({ error: 'Installation not found' }, { status: 404 });
    }

    // Upsert member
    const member = await prisma.installationMember.upsert({
      where: {
        installation_user_unique: {
          installationId: inst.id,
          userLogin: userLogin.toLowerCase(),
        },
      },
      update: { role },
      create: {
        installationId: inst.id,
        userLogin: userLogin.toLowerCase(),
        role,
      },
    });

    await recordAuditLog({
      installationId: inst.id,
      actor: session.user.login || session.user.id || 'anonymous',
      actorRole: userRole,
      action: 'member.updated',
      resourceType: 'organization',
      resourceId: String(inst.id),
      metadata: {
        targetUser: userLogin,
        assignedRole: role,
      },
    });

    return NextResponse.json(serializeWithBigInt({ success: true, member }));
  } catch (error: any) {
    if (error instanceof RbacForbiddenError || error?.name === 'ForbiddenError') {
      return NextResponse.json({ error: 'Forbidden', message: error.message }, { status: 403 });
    }
    if (error?.name === 'UnauthorizedError') {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
  }
}
