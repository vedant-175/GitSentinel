import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  GitHubPullRequestWebhookSchema,
  GitHubInstallationWebhookSchema,
  GitHubInstallationRepositoriesWebhookSchema,
  isBot,
  createStageTimingRecord,
  classifyErrorCategory,
  StageTimingRecord,
} from '@ai-reviewer/shared';
import {
  acquireDeliveryLock,
  markDeliveryDone,
  releaseDeliveryLock,
  getCachedRepoConfig,
  enqueueReviewJob,
  enqueuePRClosedJob,
  enqueueInstallationSyncJob,
  enqueueInstallationReposSyncJob,
} from '@/lib/queue';
import { clearInstallationAccessCache } from '@/lib/auth-helpers';

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build' && !WEBHOOK_SECRET) {
  throw new Error('FATAL: GITHUB_WEBHOOK_SECRET is required in production.');
}

const MAX_WEBHOOK_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10MB limit
const DELIVERY_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Verifies GitHub webhook signature using timing-safe HMAC-SHA256
 */
function verifySignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature || typeof signature !== 'string') return false;
  if (!signature.startsWith('sha256=')) return false;
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  const digestBuffer = Buffer.from(digest, 'utf8');
  const signatureBuffer = Buffer.from(signature, 'utf8');
  if (digestBuffer.length !== signatureBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(digestBuffer, signatureBuffer);
}

export async function POST(req: NextRequest) {
  const receivedAt = Date.now();
  let deliveryId: string | null = null;

  try {
    // 0. Pre-flight payload size check
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_WEBHOOK_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: 'Payload too large: exceeds maximum webhook size of 10MB' },
        { status: 413 }
      );
    }

    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: 'Payload too large: exceeds maximum webhook size of 10MB' },
        { status: 413 }
      );
    }

    const signature = req.headers.get('x-hub-signature-256');
    const event = req.headers.get('x-github-event');
    deliveryId = req.headers.get('x-github-delivery');

    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

    // 1. Signature Verification (required - fail closed)
    if (!webhookSecret) {
      console.error('❌ GITHUB_WEBHOOK_SECRET is not configured on server.');
      return NextResponse.json(
        { error: 'Server misconfiguration: missing webhook secret' },
        { status: 500 }
      );
    }

    if (!signature || !verifySignature(rawBody, signature, webhookSecret)) {
      console.warn(
        JSON.stringify({
          event: 'webhook_rejected',
          stage: 'webhook_validation',
          correlation_id: deliveryId || 'unknown',
          error_category: 'auth_error',
          msg: 'Invalid or missing HMAC signature',
        })
      );
      return NextResponse.json(
        { error: 'Invalid or missing signature' },
        { status: 401 }
      );
    }

    // 2. Validate and deduplicate on X-GitHub-Delivery with processing/done states (Item 9)
    if (!deliveryId || !DELIVERY_ID_REGEX.test(deliveryId)) {
      console.warn(
        JSON.stringify({
          event: 'webhook_rejected',
          stage: 'webhook_validation',
          correlation_id: deliveryId || 'missing',
          error_category: 'validation_error',
          msg: 'Invalid or missing X-GitHub-Delivery header',
        })
      );
      return NextResponse.json(
        { error: 'Invalid or missing X-GitHub-Delivery header' },
        { status: 400 }
      );
    }

    // Stage 1: github_webhook (HTTP Ingress completed successfully)
    const stage1CompletedAt = Date.now();
    const stage1Record = createStageTimingRecord({
      stage: 'github_webhook',
      durationMs: stage1CompletedAt - receivedAt,
      status: 'success',
      retryCount: 0,
      jobId: 'pending',
      reviewId: null,
      repositoryId: null,
      commitSha: 'pending',
      correlationId: deliveryId,
      startedAt: receivedAt,
      completedAt: stage1CompletedAt,
    });

    const stage2StartedAt = Date.now();

    const lockStatus = await acquireDeliveryLock(deliveryId);
    if (lockStatus === 'already_done') {
      console.log(
        JSON.stringify({
          event: 'webhook_dedup_skipped',
          stage: 'webhook_validation',
          correlation_id: deliveryId,
          status: 'skipped',
          msg: 'Duplicate delivery skipped (already done)',
        })
      );
      return NextResponse.json(
        { message: 'Delivery already processed' },
        { status: 202 }
      );
    }
    if (lockStatus === 'in_flight') {
      console.log(
        JSON.stringify({
          event: 'webhook_in_flight_skipped',
          stage: 'webhook_validation',
          correlation_id: deliveryId,
          status: 'skipped',
          msg: 'Concurrent delivery in progress',
        })
      );
      return NextResponse.json(
        { message: 'Delivery currently being processed' },
        { status: 202 }
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseErr) {
      await releaseDeliveryLock(deliveryId);
      console.warn(
        JSON.stringify({
          event: 'webhook_rejected',
          stage: 'webhook_validation',
          correlation_id: deliveryId,
          error_category: 'syntax_error',
          msg: 'Malformed JSON payload',
        })
      );
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    // 3. Handle Events with Zod Validation and NO Database Work
    if (event === 'pull_request') {
      const parsed = GitHubPullRequestWebhookSchema.safeParse(payload);
      if (!parsed.success) {
        console.warn(
          JSON.stringify({
            event: 'webhook_schema_failed',
            stage: 'webhook_validation',
            correlation_id: deliveryId,
            error_category: 'validation_error',
            issues_count: parsed.error.issues.length,
            msg: 'Invalid pull_request payload schema',
          })
        );
        await releaseDeliveryLock(deliveryId);
        return NextResponse.json(
          { error: 'Invalid pull_request payload schema', issues: parsed.error.issues },
          { status: 400 }
        );
      }

      const prData = parsed.data;
      const { action, pull_request, repository, installation } = prData;

      // Stage 2: webhook_validation passed
      const stage2CompletedAt = Date.now();
      const stage2Record = createStageTimingRecord({
        stage: 'webhook_validation',
        durationMs: stage2CompletedAt - stage2StartedAt,
        status: 'success',
        retryCount: 0,
        jobId: 'pending',
        reviewId: null,
        repositoryId: repository.id,
        commitSha: pull_request.head.sha,
        correlationId: deliveryId,
        startedAt: stage2StartedAt,
        completedAt: stage2CompletedAt,
      });

      // Item 10: Handle converted_to_draft
      if (action === 'converted_to_draft') {
        console.log(
          JSON.stringify({
            event: 'webhook_draft_skipped',
            stage: 'webhook_validation',
            correlation_id: deliveryId,
            pr_number: pull_request.number,
            repo: repository.full_name,
            msg: 'PR converted to draft; review skipped.',
          })
        );
        await markDeliveryDone(deliveryId);
        return NextResponse.json(
          { ok: true, message: 'PR converted to draft; review skipped.', event: 'pull_request.converted_to_draft' },
          { status: 202 }
        );
      }

      // Handle pull_request.closed event
      if (action === 'closed') {
        const jobId = await enqueuePRClosedJob({
          type: 'pr-closed',
          githubRepoId: repository.id,
          prNumber: pull_request.number,
          merged: Boolean(pull_request.merged),
          mergedAt: pull_request.merged_at ?? null,
          closedAt: pull_request.closed_at ?? null,
          receivedAt,
        });

        await markDeliveryDone(deliveryId);
        console.log(
          JSON.stringify({
            event: 'pr_closed_enqueued',
            correlation_id: deliveryId,
            job_id: jobId,
            repo: repository.full_name,
            pr_number: pull_request.number,
          })
        );
        return NextResponse.json({ ok: true, jobId, event: 'pull_request.closed' }, { status: 202 });
      }

      // Item 10: Handle PR opened, synchronize, reopened, ready_for_review
      const reviewActions = ['opened', 'synchronize', 'reopened', 'ready_for_review'];
      if (reviewActions.includes(action)) {
        const isDraft = Boolean(pull_request.draft);
        // Item 10: One shared isBot() everywhere; match user type or trailing "[bot]", never substring "bot"
        const isBotAuthor = isBot(pull_request.user) || isBot(prData.sender);

        // Check cached repo configuration in Redis
        const cachedConfig = await getCachedRepoConfig(repository.id);
        const skipDrafts = cachedConfig?.skip_drafts ?? true;
        const skipBots = cachedConfig?.skip_bot_authors ?? true;

        if (isDraft && skipDrafts) {
          console.log(
            JSON.stringify({
              event: 'review_skipped',
              reason: 'skip_drafts',
              correlation_id: deliveryId,
              pr_number: pull_request.number,
              repo: repository.full_name,
            })
          );
          await markDeliveryDone(deliveryId);
          return NextResponse.json(
            { ok: true, message: 'Draft PR skipped per configuration' },
            { status: 202 }
          );
        }

        if (isBotAuthor && skipBots) {
          console.log(
            JSON.stringify({
              event: 'review_skipped',
              reason: 'skip_bots',
              correlation_id: deliveryId,
              pr_number: pull_request.number,
              author: pull_request.user.login,
              repo: repository.full_name,
            })
          );
          await markDeliveryDone(deliveryId);
          return NextResponse.json(
            { ok: true, message: 'Bot PR skipped per configuration' },
            { status: 202 }
          );
        }

        // Stage 3: queue_enqueue
        const stage3StartedAt = Date.now();
        const initialStageTimings: Record<string, StageTimingRecord> = {
          github_webhook: stage1Record,
          webhook_validation: stage2Record,
        };

        const jobId = await enqueueReviewJob({
          type: 'review-pr',
          installationId: installation?.id || 0,
          githubRepoId: repository.id,
          prNumber: pull_request.number,
          commitSha: pull_request.head.sha,
          repoFullName: repository.full_name,
          headBranch: pull_request.head.ref,
          baseBranch: pull_request.base.ref,
          title: pull_request.title || undefined,
          author: pull_request.user.login,
          authorType: pull_request.user.type,
          draft: isDraft,
          receivedAt,
          defaultBranch: repository.default_branch || undefined,
          ownerLogin: repository.owner?.login,
          ownerType: repository.owner?.type,
          correlationId: deliveryId,
          deliveryId,
          retryCount: 0,
          stageTimings: initialStageTimings,
        });

        const stage3CompletedAt = Date.now();
        const stage3Record = createStageTimingRecord({
          stage: 'queue_enqueue',
          durationMs: stage3CompletedAt - stage3StartedAt,
          status: 'success',
          retryCount: 0,
          jobId,
          reviewId: null,
          repositoryId: repository.id,
          commitSha: pull_request.head.sha,
          correlationId: deliveryId,
          startedAt: stage3StartedAt,
          completedAt: stage3CompletedAt,
        });

        initialStageTimings.queue_enqueue = stage3Record;

        // Item 9: set the delivery-dedupe key AFTER a successful enqueue
        await markDeliveryDone(deliveryId);
        console.log(
          JSON.stringify({
            event: 'review_enqueued',
            stage: 'queue_enqueue',
            correlation_id: deliveryId,
            job_id: jobId,
            repository_id: repository.id,
            repo: repository.full_name,
            pr_number: pull_request.number,
            commit_sha: pull_request.head.sha,
            duration_ms: stage3Record.durationMs,
            total_ingress_ms: stage3CompletedAt - receivedAt,
            status: 'success',
          })
        );
        return NextResponse.json({ ok: true, jobId, event: 'pull_request.review' }, { status: 202 });
      }

      await markDeliveryDone(deliveryId);
      return NextResponse.json({ message: `Ignored pull_request action: ${action}` }, { status: 202 });
    }

    if (event === 'installation') {
      const parsed = GitHubInstallationWebhookSchema.safeParse(payload);
      if (!parsed.success) {
        console.warn('⚠️ Webhook installation payload schema validation failed:', parsed.error.issues);
        await releaseDeliveryLock(deliveryId);
        return NextResponse.json(
          { error: 'Invalid installation payload schema', issues: parsed.error.issues },
          { status: 400 }
        );
      }

      const instData = parsed.data;
      const jobId = await enqueueInstallationSyncJob({
        type: 'installation-sync',
        action: instData.action,
        githubInstallationId: instData.installation.id,
        accountLogin: instData.installation.account.login,
        accountType: instData.installation.account.type,
        repositories: instData.repositories?.map((r) => ({
          id: r.id,
          fullName: r.full_name,
        })),
        receivedAt,
      });

      clearInstallationAccessCache();
      await markDeliveryDone(deliveryId);
      console.log(`📥 Installation ${instData.action}: ID ${instData.installation.id}. Enqueued job: ${jobId}`);
      return NextResponse.json({ ok: true, jobId, event: 'installation' }, { status: 202 });
    }

    if (event === 'installation_repositories') {
      const parsed = GitHubInstallationRepositoriesWebhookSchema.safeParse(payload);
      if (!parsed.success) {
        console.warn('⚠️ Webhook installation_repositories validation failed:', parsed.error.issues);
        await releaseDeliveryLock(deliveryId);
        return NextResponse.json(
          { error: 'Invalid installation_repositories payload schema', issues: parsed.error.issues },
          { status: 400 }
        );
      }

      const reposData = parsed.data;
      const jobId = await enqueueInstallationReposSyncJob({
        type: 'installation-repositories-sync',
        action: reposData.action,
        githubInstallationId: reposData.installation.id,
        added: reposData.repositories_added.map((r) => ({
          id: r.id,
          fullName: r.full_name,
        })),
        removed: reposData.repositories_removed.map((r) => ({
          id: r.id,
          fullName: r.full_name,
        })),
        receivedAt,
      });

      clearInstallationAccessCache();
      await markDeliveryDone(deliveryId);
      console.log(`📥 Installation repos ${reposData.action}: ID ${reposData.installation.id}. Enqueued job: ${jobId}`);
      return NextResponse.json({ ok: true, jobId, event: 'installation_repositories' }, { status: 202 });
    }

    // Any other GitHub event
    await markDeliveryDone(deliveryId);
    return NextResponse.json({ message: `Ignored event: ${event}` }, { status: 202 });
  } catch (error) {
    // Item 9: delete lock in catch so GitHub can redeliver
    if (deliveryId) {
      await releaseDeliveryLock(deliveryId);
    }
    console.error('❌ Webhook handler error (returning 500 so GitHub can redeliver):', error);
    return NextResponse.json(
      { error: 'Queue delivery or webhook processing failed' },
      { status: 500 }
    );
  }
}

