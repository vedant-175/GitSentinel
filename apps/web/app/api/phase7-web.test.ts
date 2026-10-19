import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, isDatabaseAvailable } from '@ai-reviewer/db';
import { NextRequest } from 'next/server';
import {
  setSessionOverride,
  setSessionInstallationIdsOverride,
  setRoleOverride,
} from '@/lib/auth-helpers';
import {
  updateRepoConfig,
  updateOrgPolicy,
  disconnectRepository,
} from '@/app/actions/repo-actions';
import { PATCH as updateIssueStatus } from './reviews/[id]/issues/[issueId]/route';
import { GET as getAuditLogs } from './audit-logs/route';
import { GET as getMembers, POST as updateMember } from './organization/members/route';
import { Role, AuditAction } from '@ai-reviewer/shared';

function itDb(name: string, fn: () => Promise<void> | void) {
  it(name, async (t) => {
    if (!(await isDatabaseAvailable())) {
      t.skip('PostgreSQL database not available');
      return;
    }
    await fn();
  });
}

describe('Phase 7 Web: Server-Side RBAC Enforcement', () => {
  itDb('enforces RBAC permissions across OWNER, ADMIN, REVIEWER, and VIEWER roles', async () => {
    const timestamp = Date.now();
    const instId = BigInt(timestamp) * 1000n + 61n;

    // 1. Create installation & repository in DB
    const inst = await prisma.installation.create({
      data: {
        githubInstallationId: instId,
        accountLogin: `owner-user-${timestamp}`,
        accountType: 'Organization',
      },
    });

    const repo = await prisma.repository.create({
      data: {
        installationId: inst.id,
        githubRepoId: BigInt(timestamp) * 1000n + 62n,
        fullName: `owner-user-${timestamp}/rbac-repo`,
        defaultBranch: 'main',
      },
    });

    const pr = await prisma.pullRequest.create({
      data: {
        repositoryId: repo.id,
        githubPrNumber: 801,
        title: 'RBAC Test PR',
        author: 'developer',
      },
    });

    const review = await prisma.review.create({
      data: {
        pullRequestId: pr.id,
        commitSha: `commit-rbac-${timestamp}`,
        status: 'completed',
        stage: 'COMPLETED',
      },
    });

    const issue = await prisma.reviewIssue.create({
      data: {
        reviewId: review.id,
        filePath: 'src/index.ts',
        lineNumber: 10,
        severity: 'warning',
        category: 'bug',
        message: 'Potential null pointer dereference',
        status: 'open',
      },
    });

    // Helper to mock session for a specific role
    const mockUserSession = (login: string, role: string) => {
      setSessionOverride(async () => ({
        user: { id: `id-${login}`, login },
      }));
      setSessionInstallationIdsOverride(async () => [instId]);
      setRoleOverride((userLogin, _targetInst) => {
        if (userLogin === login) return role as any;
        return Role.VIEWER;
      });
    };

    // --- TEST 1: VIEWER Role Permissions ---
    mockUserSession(`viewer-${timestamp}`, Role.VIEWER);

    // VIEWER cannot update repo config
    const viewerConfigRes = await updateRepoConfig(repo.id, {
      severity_threshold: 'critical',
    });
    assert.equal(viewerConfigRes.success, false);
    assert.ok(viewerConfigRes.error?.includes('config:update'));

    // VIEWER cannot update org policy
    const viewerPolicyRes = await updateOrgPolicy(repo.id, {
      blockCriticalSecurity: true,
      minConfidence: 0.9,
      maxComments: 10,
      requiredChecks: ['static_analysis'],
      ignoredPaths: [],
      requiredTesting: true,
      disabledCategories: [],
    });
    assert.equal(viewerPolicyRes.success, false);
    assert.ok(viewerPolicyRes.error?.includes('policy:update'));

    // VIEWER cannot disconnect repository
    const viewerDisconnectRes = await disconnectRepository(repo.id);
    assert.equal(viewerDisconnectRes.success, false);
    assert.ok(viewerDisconnectRes.error?.includes('repository:disconnect'));

    // VIEWER cannot dismiss an issue (returns 403 Forbidden)
    const viewerDismissReq = new NextRequest(
      `http://localhost:3000/api/reviews/${review.id}/issues/${issue.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      }
    );
    const viewerDismissRes = await updateIssueStatus(viewerDismissReq, {
      params: { id: String(review.id), issueId: String(issue.id) },
    });
    assert.equal(viewerDismissRes.status, 403);

    // VIEWER cannot view audit logs
    const viewerAuditReq = new NextRequest(
      `http://localhost:3000/api/audit-logs?installationId=${instId}`
    );
    const viewerAuditRes = await getAuditLogs(viewerAuditReq);
    assert.equal(viewerAuditRes.status, 403);

    // --- TEST 2: REVIEWER Role Permissions ---
    mockUserSession(`reviewer-${timestamp}`, Role.REVIEWER);

    // REVIEWER cannot update config
    const reviewerConfigRes = await updateRepoConfig(repo.id, {
      severity_threshold: 'warning',
    });
    assert.equal(reviewerConfigRes.success, false);
    assert.ok(reviewerConfigRes.error?.includes('config:update'));

    // REVIEWER CAN dismiss an issue
    const reviewerDismissReq = new NextRequest(
      `http://localhost:3000/api/reviews/${review.id}/issues/${issue.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      }
    );
    const reviewerDismissRes = await updateIssueStatus(reviewerDismissReq, {
      params: { id: String(review.id), issueId: String(issue.id) },
    });
    assert.equal(reviewerDismissRes.status, 200);

    // REVIEWER cannot view audit logs
    const reviewerAuditReq = new NextRequest(
      `http://localhost:3000/api/audit-logs?installationId=${instId}`
    );
    const reviewerAuditRes = await getAuditLogs(reviewerAuditReq);
    assert.equal(reviewerAuditRes.status, 403);

    // --- TEST 3: ADMIN Role Permissions ---
    mockUserSession(`admin-${timestamp}`, Role.ADMIN);

    // ADMIN CAN update repo config
    const adminConfigRes = await updateRepoConfig(repo.id, {
      severity_threshold: 'warning',
    });
    assert.equal(adminConfigRes.success, true);

    // ADMIN CAN update org policy
    const adminPolicyRes = await updateOrgPolicy(repo.id, {
      blockCriticalSecurity: true,
      minConfidence: 0.85,
      maxComments: 15,
      requiredChecks: ['static_analysis'],
      ignoredPaths: ['docs/**'],
      requiredTesting: true,
      disabledCategories: [],
    });
    assert.equal(adminPolicyRes.success, true);

    // ADMIN CAN view audit logs
    const adminAuditReq = new NextRequest(
      `http://localhost:3000/api/audit-logs?installationId=${instId}`
    );
    const adminAuditRes = await getAuditLogs(adminAuditReq);
    assert.equal(adminAuditRes.status, 200);
    const auditData = await adminAuditRes.json();
    assert.ok(Array.isArray(auditData.data));
    assert.ok(auditData.data.length > 0);

    // Verify audit logs contain configuration.updated and issue.dismissed
    const actionsLogged = auditData.data.map((l: any) => l.action);
    assert.ok(actionsLogged.includes('configuration.updated'));
    assert.ok(actionsLogged.includes('issue.dismissed'));

    // ADMIN CANNOT disconnect repository (strictly OWNER only)
    const adminDisconnectRes = await disconnectRepository(repo.id);
    assert.equal(adminDisconnectRes.success, false);
    assert.ok(adminDisconnectRes.error?.includes('repository:disconnect'));

    // --- TEST 4: OWNER Role Permissions ---
    mockUserSession(`owner-user-${timestamp}`, Role.OWNER);

    // OWNER CAN disconnect repository
    const ownerDisconnectRes = await disconnectRepository(repo.id);
    assert.equal(ownerDisconnectRes.success, true);

    // Verify repository disconnected audit log
    const finalAuditLogs = await prisma.auditLog.findMany({
      where: {
        installationId: inst.id,
        action: AuditAction.REPOSITORY_DISCONNECTED,
      },
    });
    assert.ok(finalAuditLogs.length > 0);

    // Reset overrides & cleanup
    setSessionOverride(null);
    setSessionInstallationIdsOverride(null);
    setRoleOverride(null);
    await prisma.installation.delete({ where: { id: inst.id } });
  });

  itDb('manages organization member roles via API with ADMIN role', async () => {
    const timestamp = Date.now();
    const instId = BigInt(timestamp) * 1000n + 63n;

    const inst = await prisma.installation.create({
      data: {
        githubInstallationId: instId,
        accountLogin: `org-owner-${timestamp}`,
        accountType: 'Organization',
      },
    });

    setSessionOverride(async () => ({
      user: { id: 'admin-id', login: 'org-admin' },
    }));
    setSessionInstallationIdsOverride(async () => [instId]);
    setRoleOverride(() => Role.ADMIN);

    // 1. Add / promote a member to REVIEWER
    const addMemberReq = new NextRequest('http://localhost:3000/api/organization/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userLogin: `alice-${timestamp}`,
        role: 'REVIEWER',
        installationId: Number(instId),
      }),
    });

    const addMemberRes = await updateMember(addMemberReq);
    assert.equal(addMemberRes.status, 200);
    const addedMemberData = await addMemberRes.json();
    assert.equal(addedMemberData.success, true);
    assert.equal(addedMemberData.member.role, 'REVIEWER');

    // 2. Fetch members list
    const getMembersReq = new NextRequest(
      `http://localhost:3000/api/organization/members?installationId=${instId}`
    );
    const getMembersRes = await getMembers(getMembersReq);
    assert.equal(getMembersRes.status, 200);
    const membersData = await getMembersRes.json();
    assert.equal(membersData.members.length, 1);
    assert.equal(membersData.members[0].userLogin, `alice-${timestamp}`.toLowerCase());

    // Reset overrides & cleanup
    setSessionOverride(null);
    setSessionInstallationIdsOverride(null);
    setRoleOverride(null);
    await prisma.installation.delete({ where: { id: inst.id } });
  });
});
