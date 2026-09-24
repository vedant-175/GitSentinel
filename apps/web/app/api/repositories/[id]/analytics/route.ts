import { NextRequest, NextResponse } from 'next/server';
import { prisma, serializeWithBigInt } from '@ai-reviewer/db';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const repoId = parseInt(params.id, 10);
    if (isNaN(repoId)) {
      return NextResponse.json({ error: 'Invalid repository ID' }, { status: 400 });
    }

    const repo = await prisma.repository.findUnique({
      where: { id: repoId },
      include: {
        pullRequests: {
          include: {
            reviews: {
              include: {
                issues: true,
              },
              orderBy: { completedAt: 'desc' },
            },
          },
        },
      },
    });

    if (!repo) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    // Calculate aggregated metrics
    const allReviews = repo.pullRequests.flatMap((pr) => pr.reviews);
    const completedReviews = allReviews.filter((r) => r.status === 'completed');
    const allIssues = completedReviews.flatMap((r) => r.issues);

    const totalLatency = completedReviews.reduce((sum, r) => sum + (r.latencyMs || 0), 0);
    const avgLatencyMs = completedReviews.length > 0 ? Math.round(totalLatency / completedReviews.length) : 0;

    // Severity breakdown
    const severityCounts = {
      critical: allIssues.filter((i) => i.severity === 'critical').length,
      warning: allIssues.filter((i) => i.severity === 'warning').length,
      suggestion: allIssues.filter((i) => i.severity === 'suggestion').length,
    };

    // Category breakdown
    const categoryCounts: Record<string, number> = {};
    for (const issue of allIssues) {
      categoryCounts[issue.category] = (categoryCounts[issue.category] || 0) + 1;
    }

    // Top offending files
    const fileIssueCounts: Record<string, number> = {};
    for (const issue of allIssues) {
      fileIssueCounts[issue.filePath] = (fileIssueCounts[issue.filePath] || 0) + 1;
    }
    const topFiles = Object.entries(fileIssueCounts)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // PR Trends
    const prTrends = repo.pullRequests.map((pr) => {
      const latestReview = pr.reviews[0];
      return {
        prNumber: pr.githubPrNumber,
        title: pr.title,
        date: pr.openedAt,
        issuesCount: latestReview?.issues.length || 0,
        verdict: latestReview?.verdict || 'PENDING',
      };
    });

    return NextResponse.json(
      serializeWithBigInt({
        repository: {
          id: repo.id,
          fullName: repo.fullName,
          defaultBranch: repo.defaultBranch,
          config: repo.config,
        },
        metrics: {
          totalPRs: repo.pullRequests.length,
          totalReviews: completedReviews.length,
          totalIssues: allIssues.length,
          avgLatencyMs,
          severityCounts,
          categoryCounts,
          topFiles,
          prTrends,
        },
      })
    );
  } catch (error) {
    console.error('Failed to compute repo analytics:', error);
    return NextResponse.json({ error: 'Failed to compute repo analytics' }, { status: 500 });
  }
}
