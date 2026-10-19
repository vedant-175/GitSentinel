import { prisma } from '@ai-reviewer/db';
import { SecurityFindingsView, SecurityFindingItem } from './SecurityFindingsView';
import { formatTimeAgo } from '@/lib/date-format';

export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  let findings: SecurityFindingItem[] = [];

  try {
    const dbIssues = await prisma.reviewIssue.findMany({
      take: 50,
      orderBy: { id: 'desc' },
      include: {
        review: {
          include: {
            pullRequest: {
              include: {
                repository: true,
              },
            },
          },
        },
      },
    });

    findings = dbIssues.map((iss) => {
      const pr = iss.review?.pullRequest;
      const repo = pr?.repository;
      const sev = (iss.severity || 'medium').toLowerCase() as any;

      return {
        id: iss.id,
        title: iss.message || 'Security Vulnerability Detected',
        severity: ['critical', 'high', 'medium', 'low'].includes(sev) ? sev : 'medium',
        category: iss.category || 'security',
        cwe: iss.cwe || undefined,
        owasp: iss.owasp || undefined,
        filePath: iss.filePath,
        lineNumber: iss.lineNumber || 1,
        repoFullName: repo?.fullName || 'unknown/repository',
        prNumber: pr?.githubPrNumber,
        prTitle: pr?.title || undefined,
        status: (iss.status as any) || 'open',
        suggestedFix: iss.suggestedFix || undefined,
        impact: iss.impact || undefined,
        attackScenario: iss.attackScenario || undefined,
        remediation: iss.remediation || undefined,
        detectedAt: iss.createdAt ? formatTimeAgo(iss.createdAt) : 'Recently',
      };
    });
  } catch (err) {
    console.error('Failed to load security findings from DB:', err);
    findings = [];
  }

  return <SecurityFindingsView initialFindings={findings} />;
}
