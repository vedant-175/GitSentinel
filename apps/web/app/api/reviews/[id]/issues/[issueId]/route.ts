import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, serializeWithBigInt } from '@ai-reviewer/db';
import {
  requireSession,
  requireReviewAccess,
  getUserRoleForInstallation,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/auth-helpers';
import {
  Permission,
  AuditAction,
  assertPermission,
  RbacForbiddenError,
} from '@ai-reviewer/shared';
import { checkIssueUpdateRateLimit } from '@/lib/rate-limit';
import { recordAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const UpdateIssueStatusSchema = z.object({
  status: z.enum(['OPEN', 'DISMISSED', 'FIXED', 'open', 'dismissed', 'fixed']),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; issueId: string }> }
) {
  // 1. Rate limiting (60 req/min for issue updates)
  const rateLimitResponse = await checkIssueUpdateRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  // 2. Authentication
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  // 3. Identifier validation
  const { id, issueId: rawIssueId } = await params;
  const reviewId = parseInt(id, 10);
  const issueId = parseInt(rawIssueId, 10);

  if (isNaN(reviewId) || isNaN(issueId)) {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Invalid review ID or issue ID' },
      { status: 400 }
    );
  }

  // 4. Request body validation
  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Request body must be valid JSON' },
      { status: 400 }
    );
  }

  const parseResult = UpdateIssueStatusSchema.safeParse(bodyJson);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: 'Bad Request',
        message: 'Invalid issue status. Supported values are: OPEN, DISMISSED, FIXED',
        details: parseResult.error.flatten(),
      },
      { status: 400 }
    );
  }

  try {
    // 5. Authorization: Ensure user has access to this review's repository
    const { review } = await requireReviewAccess(reviewId);

    // 5b. RBAC Enforcement: Check specific role permissions
    const installationId = review.pullRequest.repository.installationId;
    const userRole = await getUserRoleForInstallation(session, installationId);
    const normalizedStatus = parseResult.data.status.toLowerCase();

    if (normalizedStatus === 'dismissed') {
      assertPermission(userRole, Permission.ISSUE_DISMISS);
    } else if (normalizedStatus === 'open') {
      assertPermission(userRole, Permission.ISSUE_REOPEN);
    } else if (normalizedStatus === 'fixed') {
      assertPermission(userRole, Permission.ISSUE_FIX);
    }

    // 6. Verify issue exists and belongs to this review
    const issue = await prisma.reviewIssue.findFirst({
      where: {
        id: issueId,
        reviewId: review.id,
      },
    });

    if (!issue) {
      return NextResponse.json(
        { error: 'Not Found', message: `Issue #${issueId} not found for review #${reviewId}` },
        { status: 404 }
      );
    }

    // 7. Database persistence (idempotent update)
    const updated = await prisma.reviewIssue.update({
      where: { id: issue.id },
      data: { status: normalizedStatus },
    });

    // 8. Audit event logging
    const auditAction =
      normalizedStatus === 'dismissed'
        ? AuditAction.ISSUE_DISMISSED
        : normalizedStatus === 'open'
        ? AuditAction.ISSUE_REOPENED
        : AuditAction.ISSUE_FIXED;

    await recordAuditLog({
      installationId,
      actor: session.user?.login || session.user?.id || 'unknown',
      actorRole: userRole,
      action: auditAction,
      resourceType: 'issue',
      resourceId: String(issue.id),
      metadata: {
        reviewId: review.id,
        issueId: issue.id,
        filePath: issue.filePath,
        lineNumber: issue.lineNumber,
        severity: issue.severity,
        category: issue.category,
        previousStatus: issue.status,
        newStatus: normalizedStatus,
      },
    });

    console.info(
      JSON.stringify({
        audit: true,
        action: 'ISSUE_STATUS_UPDATE',
        userId: session.user?.id || session.user?.login || 'unknown',
        reviewId: review.id,
        issueId: issue.id,
        previousStatus: issue.status,
        newStatus: normalizedStatus,
        timestamp: new Date().toISOString(),
      })
    );

    return NextResponse.json({
      success: true,
      issue: serializeWithBigInt({
        ...updated,
        status: updated.status.toUpperCase(),
      }),
    });
  } catch (error: any) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError || error instanceof RbacForbiddenError || error?.name === 'RbacForbiddenError') {
      return NextResponse.json({ error: 'Forbidden', message: error.message }, { status: 403 });
    }
    console.error('Failed to update issue status:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to update issue status' },
      { status: 500 }
    );
  }
}
