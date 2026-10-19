/**
 * Audit Logging Service - GitSentinel Phase 7
 * Centralized audit trail with mandatory secret redaction and error resilience.
 */

import { prisma } from '@ai-reviewer/db';
import {
  AuditActionType,
  sanitizeAuditMetadata,
} from '@ai-reviewer/shared';

export interface RecordAuditParams {
  installationId?: number | null;
  actor: string;
  actorRole?: string | null;
  action: AuditActionType | string;
  resourceType: 'repository' | 'review' | 'issue' | 'configuration' | string;
  resourceId: string;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

/**
 * Persists an auditable event with sanitized metadata.
 * Never throws to callers to prevent non-critical audit log failures
 * from crashing critical business operations.
 */
export async function recordAuditLog(params: RecordAuditParams): Promise<void> {
  try {
    const sanitizedMetadata = params.metadata
      ? (sanitizeAuditMetadata(params.metadata) as Record<string, unknown>)
      : null;

    await prisma.auditLog.create({
      data: {
        installationId: params.installationId ?? null,
        actor: params.actor || 'system',
        actorRole: params.actorRole ?? null,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: String(params.resourceId),
        metadata: sanitizedMetadata as any,
        ipAddress: params.ipAddress ?? null,
      },
    });
  } catch (error) {
    console.error('Failed to record audit log entry:', error);
  }
}
