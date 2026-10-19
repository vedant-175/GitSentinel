import { NextRequest, NextResponse } from 'next/server';
import { prisma, serializeWithBigInt } from '@ai-reviewer/db';
import {
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
import { recordAuditLog } from '@/lib/audit';
import { checkApiRateLimit } from '@/lib/rate-limit';
import { parsePaginationParams, paginateResults } from '@/lib/pagination';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Rate limiting
  const rateLimitResponse = await checkApiRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const reviewId = parseInt(params.id, 10);
    if (isNaN(reviewId)) {
      return NextResponse.json({ error: 'Invalid review ID' }, { status: 400 });
    }

    // 2. Auth: ensure user has access to the review's repo installation
    const { review } = await requireReviewAccess(reviewId);

    // 3. Cursor pagination & filtering (default: 25, max: 100)
    const { cursor, limit } = parsePaginationParams(req.url, 25, 100);
    const { searchParams } = new URL(req.url);
    const severity = searchParams.get('severity');
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const file = searchParams.get('file');
    const source = searchParams.get('source');
    const minConfidence = searchParams.get('confidence');

    const issues = await prisma.reviewIssue.findMany({
      where: {
        reviewId: review.id,
        ...(severity && severity !== 'all' ? { severity } : {}),
        ...(category && category !== 'all' ? { category } : {}),
        ...(status && status !== 'all' ? { status } : {}),
        ...(file && file !== 'all' ? { filePath: { contains: file } } : {}),
        ...(source && source !== 'all' ? { source } : {}),
        ...(minConfidence && !isNaN(parseFloat(minConfidence))
          ? { confidence: { gte: parseFloat(minConfidence) } }
          : {}),
      },
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: 'asc' },
    });

    const paginated = paginateResults(issues, limit);
    return NextResponse.json(serializeWithBigInt(paginated));
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Forbidden', message: error.message }, { status: 403 });
    }
    console.error('Failed to fetch review issues:', error);
    return NextResponse.json({ error: 'Failed to fetch review issues' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const rateLimitResponse = await checkApiRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const reviewId = parseInt(params.id, 10);
    if (isNaN(reviewId)) {
      return NextResponse.json({ error: 'Invalid review ID' }, { status: 400 });
    }

    const { review, session } = await requireReviewAccess(reviewId);
    const body = await req.json();
    const { issueId, status } = body;

    if (!issueId || !status || !['open', 'dismissed', 'fixed'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid issueId or status (allowed: open, dismissed, fixed)' },
        { status: 400 }
      );
    }

    // RBAC: Verify caller role and required permission
    const installationId = review.pullRequest.repository.installationId;
    const userRole = await getUserRoleForInstallation(session, installationId);
    const normalizedStatus = status.toLowerCase();

    if (normalizedStatus === 'dismissed') {
      assertPermission(userRole, Permission.ISSUE_DISMISS);
    } else if (normalizedStatus === 'open') {
      assertPermission(userRole, Permission.ISSUE_REOPEN);
    } else if (normalizedStatus === 'fixed') {
      assertPermission(userRole, Permission.ISSUE_FIX);
    }

    const parsedIssueId = parseInt(String(issueId), 10);
    const issue = await prisma.reviewIssue.findFirst({
      where: { id: parsedIssueId, reviewId: review.id },
    });

    if (!issue) {
      return NextResponse.json(
        { error: 'Not Found', message: `Issue #${parsedIssueId} not found for review #${review.id}` },
        { status: 404 }
      );
    }

    const updated = await prisma.reviewIssue.update({
      where: { id: issue.id },
      data: { status: normalizedStatus },
    });

    // Record audit log
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

    return NextResponse.json(serializeWithBigInt(updated));
  } catch (error: any) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    if (
      error instanceof ForbiddenError ||
      error instanceof RbacForbiddenError ||
      error?.name === 'RbacForbiddenError' ||
      error?.name === 'ForbiddenError'
    ) {
      return NextResponse.json({ error: 'Forbidden', message: error.message }, { status: 403 });
    }
    console.error('Failed to update issue status:', error);
    return NextResponse.json({ error: 'Failed to update issue status' }, { status: 500 });
  }
}
