import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import type { AuditAction, AuditEntityType } from '@dxer/shared';

interface AuditParams {
  orgId: string;
  userId: string;
  action: AuditAction;
  entityType: AuditEntityType | string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Write an audit log entry.
 * This uses Prisma directly (service role level) so it bypasses RLS.
 */
export async function writeAuditLog(params: AuditParams): Promise<void> {
  try {
    await prisma.audit_log.create({
      data: {
        org_id: params.orgId,
        user_id: params.userId,
        action: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId,
        before_data: params.before ?? undefined,
        after_data: params.after ?? undefined,
        ip_address: params.ipAddress ?? null,
        user_agent: params.userAgent ?? null,
      },
    });
  } catch (err) {
    // Audit logging should never break the main flow
    logger.error({ err, params }, 'Failed to write audit log');
  }
}

/**
 * Extract client info from request for audit logging.
 */
export function getClientInfo(req: { ip?: string; headers?: Record<string, unknown> }) {
  return {
    ipAddress: (req.headers?.['x-forwarded-for'] as string) || req.ip || null,
    userAgent: (req.headers?.['user-agent'] as string) || null,
  };
}
