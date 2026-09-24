import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@ai-reviewer/db';
import { enqueueReviewJob } from '@/lib/queue';

/**
 * Verifies GitHub webhook signature using HMAC-SHA256
 */
function verifySignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');
    const event = req.headers.get('x-github-event');
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

    // Verify webhook signature (enforced whenever secret is provided)
    if (webhookSecret) {
      const isValid = verifySignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        console.warn('⚠️ Webhook rejected: Invalid HMAC signature.');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else {
      console.warn('⚠️ GITHUB_WEBHOOK_SECRET not set. Skipping signature verification in dev mode.');
    }

    const payload = JSON.parse(rawBody);

    // Only process pull_request events
    if (event !== 'pull_request') {
      return NextResponse.json({ message: `Ignored event: ${event}` }, { status: 200 });
    }

    const { action, pull_request, repository, installation } = payload;
    const handledActions = ['opened', 'synchronize', 'reopened'];

    if (!handledActions.includes(action)) {
      return NextResponse.json(
        { message: `Ignored pull_request action: ${action}` },
        { status: 200 }
      );
    }

    const githubInstallationId = installation?.id ? BigInt(installation.id) : BigInt(1);
    const githubRepoId = BigInt(repository.id);
    const prNumber = pull_request.number;
    const commitSha = pull_request.head.sha;
    const repoFullName = repository.full_name;
    const title = pull_request.title;
    const author = pull_request.user?.login || 'unknown';

    // Fast DB upsert of installation and repo
    const dbInstallation = await prisma.installation.upsert({
      where: { githubInstallationId },
      update: {
        accountLogin: repository.owner?.login || 'unknown',
        accountType: repository.owner?.type || 'User',
      },
      create: {
        githubInstallationId,
        accountLogin: repository.owner?.login || 'unknown',
        accountType: repository.owner?.type || 'User',
      },
    });

    const dbRepo = await prisma.repository.upsert({
      where: { githubRepoId },
      update: {
        fullName: repoFullName,
        defaultBranch: repository.default_branch || 'main',
      },
      create: {
        installationId: dbInstallation.id,
        githubRepoId,
        fullName: repoFullName,
        defaultBranch: repository.default_branch || 'main',
      },
    });

    // Enqueue review job to Redis queue (fast, non-blocking)
    const jobId = await enqueueReviewJob({
      installationId: Number(githubInstallationId),
      repoId: dbRepo.id,
      prNumber,
      commitSha,
      repoFullName,
      headBranch: pull_request.head?.ref,
      baseBranch: pull_request.base?.ref,
      title,
      author,
    });

    console.log(
      `📥 Webhook received: PR #${prNumber} on ${repoFullName} [${action}]. Job enqueued with ID: ${jobId}`
    );

    return NextResponse.json(
      {
        ok: true,
        message: 'Review job enqueued successfully',
        jobId,
        repoId: dbRepo.id,
        prNumber,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    return NextResponse.json(
      { error: 'Internal webhook receiver error' },
      { status: 500 }
    );
  }
}
