import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@ai-reviewer/db';
import { generateSarifReport, validateSarifLog, ReviewIssue } from '@ai-reviewer/shared';
import {
  requireSession,
  getSessionInstallationIds,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/auth-helpers';
import { checkApiRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Rate limiting
  const rateLimitResponse = await checkApiRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  // 2. Authentication: SARIF export requires an authenticated session
  try {
    await requireSession();
  } catch {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const { id } = await params;
  const reviewId = parseInt(id, 10);
  if (isNaN(reviewId)) {
    return NextResponse.json({ error: 'Invalid review ID' }, { status: 400 });
  }

  try {
    // 3. Find review in database
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        issues: true,
        pullRequest: {
          include: {
            repository: {
              include: {
                installation: true,
              },
            },
          },
        },
      },
    });

    if (!review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }

    // 4. Tenancy Authorization: user must have access to the review's installation
    const installationIds = await getSessionInstallationIds();
    const repoInstallationId = review.pullRequest.repository.installation.githubInstallationId;
    const isAuthorized = installationIds.some(
      (id) => BigInt(id) === BigInt(repoInstallationId)
    );

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Forbidden', message: `Access denied to review #${reviewId}` },
        { status: 403 }
      );
    }

    // 5. If pre-generated sarifReport exists on review, use it
    if (review.sarifReport) {
      return new NextResponse(JSON.stringify(review.sarifReport, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/sarif+json; charset=utf-8',
          'Content-Disposition': `attachment; filename="gitsentinel-review-${review.id}.sarif"`,
        },
      });
    }

    // 6. Otherwise generate dynamically from review issues
    const domainIssues: ReviewIssue[] = review.issues.map((i) => ({
      file_path: i.filePath,
      line_number: i.lineNumber || 1,
      severity: i.severity as any,
      category: i.category as any,
      message: i.message,
      suggested_fix: i.suggestedFix,
      current_code: i.currentCode || undefined,
      surrounding_code: i.surroundingCode || undefined,
      cwe: i.cwe,
      owasp: i.owasp as any,
      evidence: i.evidence || undefined,
      impact: i.impact || undefined,
      attack_scenario: i.attackScenario || undefined,
      remediation: i.remediation || undefined,
      supporting_evidence: i.supportingEvidence || undefined,
      confidence: i.confidence ?? 1.0,
      calibrated_confidence: i.calibratedConfidence ?? i.confidence ?? 1.0,
      risk_score: i.riskScore ?? 50,
      escalation_status: i.escalationStatus as any,
      source: i.source as any,
    }));

    const sarifLog = generateSarifReport(domainIssues);
    const validation = validateSarifLog(sarifLog);

    if (!validation.isValid) {
      console.warn(`[SARIF Export] Validation warnings for review ${reviewId}:`, validation.errors);
    }

    return new NextResponse(JSON.stringify(sarifLog, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/sarif+json; charset=utf-8',
        'Content-Disposition': `attachment; filename="gitsentinel-review-${review.id}.sarif"`,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Forbidden', message: error.message }, { status: 403 });
    }
    console.error('Failed to export SARIF report:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: 'Failed to export SARIF report' }, { status: 500 });
  }
}
